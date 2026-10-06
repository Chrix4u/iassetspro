import { db } from '@/lib/db';
import { notifyUser } from '@/lib/notifications';
import { evaluateMeterThreshold } from '@/services/pm/meterTriggerEngine';
import { parsePmTriggerConfig } from '@/services/pm/triggerConfig.service';
import { materializePmTemplateTasks } from '@/services/pm/materializePmTemplateTasks.service';
import { calculatePmPlannedEnd } from '@/services/pm/plannedWindow.service';

export function conditionMatches(current: number, operator: string, target: number): boolean {
  switch (operator) {
    case '>': return current > target;
    case '<': return current < target;
    case '>=': return current >= target;
    case '<=': return current <= target;
    case '=':
    case '==': return current === target;
    case '!=': return current !== target;
    default: return false;
  }
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export async function evaluateConditionProductionPmTriggers(options: { plantIds?: string[]; actorId: string }) {
  const candidates = await db.pmTrigger.findMany({
    where: {
      isActive: true,
      triggerType: { in: ['condition', 'production_count'] },
      schedule: {
        isActive: true,
        autoGenerateWO: true,
        ...(options.plantIds ? { asset: { plantId: { in: options.plantIds } } } : {}),
      },
    },
    select: { id: true },
  });

  const results: Array<Record<string, unknown>> = [];

  for (const candidate of candidates) {
    const result = await db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        'SELECT pg_advisory_xact_lock(hashtext($1))',
        `iassetspro:pm-signal:${candidate.id}`,
      );

      const trigger = await tx.pmTrigger.findUnique({
        where: { id: candidate.id },
        include: {
          schedule: {
            include: {
              asset: { select: { id: true, name: true, assetTag: true, plantId: true, departmentId: true } },
              component: {
                include: {
                  sparePartLinks: { include: { inventoryItem: true } },
                  toolRequirements: { include: { tool: true } },
                },
              },
              template: { include: { tasks: { where: { isActive: true }, orderBy: { taskNumber: 'asc' } } } },
            },
          },
        },
      });

      if (!trigger || !trigger.isActive || !['condition', 'production_count'].includes(trigger.triggerType)) {
        return { triggerId: candidate.id, scheduleId: '', skipped: true, reason: 'Trigger is no longer active' };
      }

      const schedule = trigger.schedule;
      if (!schedule.isActive || !schedule.autoGenerateWO) {
        return { triggerId: trigger.id, scheduleId: schedule.id, skipped: true, reason: 'Schedule is no longer active for automatic generation' };
      }
      if (options.plantIds && !options.plantIds.includes(schedule.asset.plantId)) {
        return { triggerId: trigger.id, scheduleId: schedule.id, skipped: true, reason: 'Schedule moved outside caller plant scope' };
      }

      const config = parsePmTriggerConfig(trigger.triggerConfig);
      const sourceType = stringValue(config.sourceType);
      let current = 0;
      let eventId = '';
      let nextConfig: Record<string, unknown> = { ...config };
      let description = '';
      let notes = '';
      let auditSignal: Record<string, unknown> = {};
      let notificationKind = 'Signal';

      if (trigger.triggerType === 'condition') {
        const operator = stringValue(config.operator);
        const target = Number(config.value);
        if (!Number.isFinite(target) || !['>', '<', '>=', '<=', '=', '==', '!='].includes(operator)) {
          return { triggerId: trigger.id, scheduleId: schedule.id, skipped: true, reason: 'Condition trigger configuration is invalid' };
        }

        let metric = stringValue(config.metric);
        let unit = stringValue(config.unit) || 'unit';

        if (sourceType === 'component_condition') {
          if (!schedule.component || stringValue(config.componentId) !== schedule.component.id || !metric) {
            return { triggerId: trigger.id, scheduleId: schedule.id, skipped: true, reason: 'Condition component source no longer matches schedule target' };
          }
          const reading = await tx.componentConditionReading.findFirst({
            where: { componentId: schedule.component.id, parameterKey: metric },
            orderBy: { recordedAt: 'desc' },
            select: { id: true, value: true, unit: true, recordedAt: true },
          });
          if (!reading) {
            return { triggerId: trigger.id, scheduleId: schedule.id, skipped: true, reason: 'No condition reading is available yet' };
          }
          current = reading.value;
          unit = reading.unit;
          eventId = reading.id;
        } else if (sourceType === 'iot_device') {
          const deviceId = stringValue(config.deviceId);
          const device = await tx.iotDevice.findUnique({
            where: { id: deviceId },
            select: {
              id: true,
              assetId: true,
              plantId: true,
              parameter: true,
              unit: true,
              lastReading: true,
              lastSeen: true,
              updatedAt: true,
              isActive: true,
            },
          });
          if (!device || !device.isActive || device.assetId !== schedule.assetId || (device.plantId && device.plantId !== schedule.asset.plantId)) {
            return { triggerId: trigger.id, scheduleId: schedule.id, skipped: true, reason: 'IoT condition source no longer matches schedule asset' };
          }
          const reading = await tx.iotReading.findFirst({
            where: { deviceId },
            orderBy: { timestamp: 'desc' },
            select: { id: true, value: true, unit: true, timestamp: true },
          });
          const fallback = device.lastReading;
          if (!reading && fallback == null) {
            return { triggerId: trigger.id, scheduleId: schedule.id, skipped: true, reason: 'No IoT condition reading is available yet' };
          }
          current = reading?.value ?? Number(fallback);
          metric = device.parameter;
          unit = reading?.unit || device.unit;
          eventId = reading?.id || `device:${device.lastSeen?.toISOString() || device.updatedAt.toISOString()}`;
        } else {
          return { triggerId: trigger.id, scheduleId: schedule.id, skipped: true, reason: 'Condition source is not configured' };
        }

        if (stringValue(config.lastReadingId) === eventId) {
          return { triggerId: trigger.id, scheduleId: schedule.id, skipped: true, reason: 'Condition reading already evaluated', current };
        }

        const matched = conditionMatches(current, operator, target);
        const wasMatched = config.lastConditionMatched === true;
        nextConfig = {
          ...config,
          metric,
          unit,
          lastReadingId: eventId,
          lastConditionMatched: matched,
        };

        if (!matched) {
          await tx.pmTrigger.update({ where: { id: trigger.id }, data: { triggerConfig: JSON.stringify(nextConfig) } });
          return {
            triggerId: trigger.id,
            scheduleId: schedule.id,
            skipped: true,
            reason: 'Condition is within configured boundary',
            current,
            operator,
            target,
          };
        }

        if (wasMatched) {
          await tx.pmTrigger.update({ where: { id: trigger.id }, data: { triggerConfig: JSON.stringify(nextConfig) } });
          return {
            triggerId: trigger.id,
            scheduleId: schedule.id,
            skipped: true,
            reason: 'Condition remains matched; waiting for recovery before another event',
            current,
            operator,
            target,
          };
        }

        notificationKind = 'Condition';
        const targetName = schedule.component
          ? `${schedule.component.componentCode} - ${schedule.component.name}`
          : `${schedule.asset.assetTag} - ${schedule.asset.name}`;
        description = `Condition-triggered preventive maintenance for ${targetName}. ${metric} is ${current} ${unit}, matching ${operator} ${target} ${unit}.`;
        notes = `Auto-generated by condition trigger ${trigger.id}; source ${sourceType}; reading ${eventId}`;
        auditSignal = { metric, current, unit, operator, target, sourceType, eventId };
      } else {
        const baseline = Number(config.baselineCount);
        const interval = Number(trigger.triggerValue);

        if (sourceType === 'component_counter') {
          const counterId = stringValue(config.counterId);
          const counter = await tx.componentRuntimeCounter.findUnique({
            where: { id: counterId },
            select: { id: true, componentId: true, counterType: true, value: true, unit: true },
          });
          if (!counter || !schedule.component || counter.componentId !== schedule.component.id || !['cycles', 'starts'].includes(counter.counterType)) {
            return { triggerId: trigger.id, scheduleId: schedule.id, skipped: true, reason: 'Component production counter no longer matches schedule target' };
          }
          current = Number(counter.value || 0);
          nextConfig = { ...config, counterType: counter.counterType, unit: counter.unit };
        } else if (sourceType === 'work_center_output') {
          const workCenterId = stringValue(config.workCenterId);
          const workCenter = await tx.workCenter.findFirst({
            where: { id: workCenterId, isActive: true },
            select: { id: true, name: true, code: true },
          });
          if (!workCenter) {
            return { triggerId: trigger.id, scheduleId: schedule.id, skipped: true, reason: 'Production work center is no longer active' };
          }
          const aggregate = await tx.productionOrder.aggregate({
            where: { workCenterId, plantId: schedule.asset.plantId, status: { not: 'cancelled' } },
            _sum: { completedQty: true },
          });
          current = Number(aggregate._sum.completedQty || 0);
          nextConfig = { ...config, sourceLabel: `${workCenter.name} (${workCenter.code})`, unit: 'completed units' };
        } else {
          return { triggerId: trigger.id, scheduleId: schedule.id, skipped: true, reason: 'Production source is not configured' };
        }

        if (!Number.isFinite(baseline)) {
          nextConfig = { ...nextConfig, baselineCount: current };
          await tx.pmTrigger.update({ where: { id: trigger.id }, data: { triggerConfig: JSON.stringify(nextConfig) } });
          return { triggerId: trigger.id, scheduleId: schedule.id, skipped: true, reason: 'Production baseline initialized', current };
        }

        const threshold = evaluateMeterThreshold(current, baseline, interval);
        if (!threshold.due || threshold.crossedThreshold == null) {
          return {
            triggerId: trigger.id,
            scheduleId: schedule.id,
            skipped: true,
            reason: 'Production threshold not reached',
            current,
            nextThreshold: baseline + interval,
          };
        }

        notificationKind = 'Production';
        description = `Production-count preventive maintenance for ${schedule.asset.assetTag} - ${schedule.asset.name}. Current count: ${current}; threshold crossed: ${threshold.crossedThreshold}.`;
        notes = `Auto-generated by production trigger ${trigger.id}; source ${sourceType}; baseline ${baseline}; interval ${interval}; current ${current}`;
        auditSignal = { sourceType, current, previousBaseline: baseline, crossedThreshold: threshold.crossedThreshold, interval };
        nextConfig = { ...nextConfig, baselineCount: threshold.crossedThreshold, threshold: interval };
      }

      const existingOpen = await tx.workOrder.findFirst({
        where: { pmScheduleId: schedule.id, status: { notIn: ['closed', 'cancelled'] } },
        select: { id: true, woNumber: true, status: true },
        orderBy: { createdAt: 'desc' },
      });
      if (existingOpen) {
        if (trigger.triggerType === 'condition') {
          await tx.pmTrigger.update({ where: { id: trigger.id }, data: { triggerConfig: JSON.stringify(nextConfig) } });
        }
        return {
          triggerId: trigger.id,
          scheduleId: schedule.id,
          skipped: true,
          reason: 'Existing PM work order still open',
          workOrder: existingOpen,
        };
      }

      const component = schedule.component;
      const tasks = schedule.template?.tasks || [];
      const taskText = tasks.length
        ? '\n\nTask Checklist:\n' + tasks.map((task) => `${task.taskNumber}. [${task.taskType}] ${task.description}`).join('\n')
        : '';
      const suggestedParts = (component?.sparePartLinks || []).map((spare) => ({
        itemId: spare.inventoryItemId,
        itemName: spare.inventoryItem?.name || spare.sparePartName,
        itemCode: spare.inventoryItem?.itemCode || spare.sparePartCode,
        quantity: spare.quantityRequired,
        unit: spare.inventoryItem?.unitOfMeasure || 'each',
        notes: spare.notes || '',
        status: 'recommended',
      }));
      const suggestedTools = (component?.toolRequirements || []).map((tool) => ({
        toolId: tool.toolId,
        toolName: tool.tool?.name || tool.toolName,
        toolCode: tool.tool?.toolCode || tool.toolCode,
        quantity: tool.quantityRequired,
        notes: tool.notes || '',
        status: 'recommended',
      }));

      const woDate = new Date();
      const prefix = `WO-${woDate.getFullYear()}${String(woDate.getMonth() + 1).padStart(2, '0')}`;
      await tx.$executeRawUnsafe(
        'SELECT pg_advisory_xact_lock(hashtext($1))',
        `iassetspro:pm-wo-number:${prefix}`,
      );
      const monthlyNumbers = await tx.workOrder.findMany({
        where: { woNumber: { startsWith: prefix } },
        select: { woNumber: true },
      });
      const highestNumber = monthlyNumbers.reduce((max, row) => {
        const suffix = Number.parseInt(row.woNumber.slice(prefix.length + 1), 10);
        return Number.isFinite(suffix) ? Math.max(max, suffix) : max;
      }, 0);
      const woNumber = `${prefix}-${String(highestNumber + 1).padStart(4, '0')}`;

      const plannedEnd = calculatePmPlannedEnd(woDate, schedule.estimatedDuration);
      const wo = await tx.workOrder.create({
        data: {
          woNumber,
          title: `PM: ${schedule.title}`,
          description: `${description}${taskText}`,
          type: 'preventive',
          priority: schedule.priority,
          status: 'draft',
          assetId: schedule.assetId,
          assetName: schedule.asset.name,
          departmentId: schedule.asset.departmentId || schedule.departmentId || null,
          assignedTo: schedule.assignedToId,
          plantId: schedule.asset.plantId,
          estimatedHours: schedule.estimatedDuration,
          pmScheduleId: schedule.id,
          plannedStart: woDate,
          plannedEnd,
          notes,
          suggestedParts: JSON.stringify(suggestedParts),
          suggestedTools: JSON.stringify(suggestedTools),
        },
      });

      if (component) {
        await tx.workOrderComponent.upsert({
          where: { workOrderId_componentRegistryId: { workOrderId: wo.id, componentRegistryId: component.id } },
          create: {
            workOrderId: wo.id,
            componentRegistryId: component.id,
            notes: `Inherited from ${trigger.triggerType} PM schedule`,
          },
          update: {},
        });
      }

      await materializePmTemplateTasks(tx, wo.id, tasks);

      for (const task of tasks) {
        await tx.workOrderComment.create({
          data: {
            workOrderId: wo.id,
            userId: options.actorId,
            content: `[PM Task #${task.taskNumber}] [${task.taskType.toUpperCase()}] ${task.description}`,
          },
        });
      }

      nextConfig = trigger.triggerType === 'condition'
        ? {
            ...nextConfig,
            lastGeneratedWorkOrderId: wo.id,
            lastGeneratedPreviousReadingId: config.lastReadingId ?? null,
            lastGeneratedPreviousConditionMatched: config.lastConditionMatched === true,
          }
        : {
            ...nextConfig,
            lastGeneratedWorkOrderId: wo.id,
            lastGeneratedPreviousBaselineCount: Number(config.baselineCount),
          };

      await tx.pmTrigger.update({
        where: { id: trigger.id },
        data: { lastTriggeredAt: woDate, triggerConfig: JSON.stringify(nextConfig) },
      });
      await tx.auditLog.create({
        data: {
          userId: options.actorId,
          action: 'create',
          entityType: 'work_order',
          entityId: wo.id,
          newValues: JSON.stringify({
            woNumber: wo.woNumber,
            type: 'preventive',
            pmScheduleId: schedule.id,
            componentId: component?.id || null,
            pmTriggerId: trigger.id,
            triggerType: trigger.triggerType,
            ...auditSignal,
            autoGenerated: true,
          }),
        },
      });

      return {
        triggerId: trigger.id,
        triggerType: trigger.triggerType,
        scheduleId: schedule.id,
        scheduleTitle: schedule.title,
        assetName: schedule.asset.name,
        assignedToId: schedule.assignedToId,
        skipped: false,
        workOrderId: wo.id,
        woNumber: wo.woNumber,
        current,
        notificationKind,
      };
    });

    results.push(result);

    if (result.skipped === false && typeof result.assignedToId === 'string' && result.assignedToId) {
      try {
        await notifyUser(
          result.assignedToId,
          'wo_assigned',
          `${result.notificationKind} PM Work Order Generated`,
          `A ${String(result.triggerType).replace('_', ' ')} PM work order (${result.woNumber}) has been generated for "${result.scheduleTitle}" on ${result.assetName}.`,
          'work_order',
          String(result.workOrderId),
          `wo-detail?id=${result.workOrderId}`,
        );
      } catch (notificationError) {
        console.error('[PM Signal Notification Error]', notificationError);
      }
    }
  }

  return {
    evaluated: candidates.length,
    generated: results.filter((result) => result.skipped === false).length,
    results,
  };
}
