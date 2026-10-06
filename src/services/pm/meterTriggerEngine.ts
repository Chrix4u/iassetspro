import { db } from '@/lib/db';
import { notifyUser } from '@/lib/notifications';
import { materializePmTemplateTasks } from '@/services/pm/materializePmTemplateTasks.service';

export interface MeterThresholdResult {
  due: boolean;
  current: number;
  baseline: number;
  interval: number;
  crossedThreshold: number | null;
}

export function evaluateMeterThreshold(current: number, baseline: number, interval: number): MeterThresholdResult {
  const safeCurrent = Number.isFinite(current) ? current : 0;
  const safeBaseline = Number.isFinite(baseline) ? baseline : 0;
  const safeInterval = Number.isFinite(interval) && interval > 0 ? interval : 0;
  if (!safeInterval || safeCurrent < safeBaseline + safeInterval) {
    return { due: false, current: safeCurrent, baseline: safeBaseline, interval: safeInterval, crossedThreshold: null };
  }
  const cycles = Math.floor((safeCurrent - safeBaseline) / safeInterval);
  return {
    due: cycles >= 1,
    current: safeCurrent,
    baseline: safeBaseline,
    interval: safeInterval,
    crossedThreshold: safeBaseline + cycles * safeInterval,
  };
}

function parseConfig(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    const value = JSON.parse(raw);
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

export async function evaluateMeterPmTriggers(options: { plantIds?: string[]; actorId: string }) {
  // Discovery is intentionally lightweight. Every due decision is re-read under
  // an advisory transaction lock before any mutation is allowed.
  const candidates = await db.pmTrigger.findMany({
    where: {
      isActive: true,
      triggerType: 'meter',
      schedule: {
        isActive: true,
        autoGenerateWO: true,
        ...(options.plantIds
          ? { asset: { plantId: { in: options.plantIds } } }
          : {}),
      },
    },
    select: { id: true },
  });

  const results: Array<Record<string, unknown>> = [];

  for (const candidate of candidates) {
    const result = await db.$transaction(async (tx) => {
      // One trigger = one meter baseline. Serializing on trigger ID makes the
      // baseline itself the stable cycle identity and eliminates check/create races.
      await tx.$executeRawUnsafe(
        'SELECT pg_advisory_xact_lock(hashtext($1))',
        `iassetspro:pm-meter:${candidate.id}`,
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

      if (!trigger || !trigger.isActive || trigger.triggerType !== 'meter') {
        return { triggerId: candidate.id, scheduleId: '', skipped: true, reason: 'Trigger is no longer active' };
      }

      const schedule = trigger.schedule;
      if (!schedule.isActive || !schedule.autoGenerateWO) {
        return { triggerId: trigger.id, scheduleId: schedule.id, skipped: true, reason: 'Schedule is no longer active for automatic generation' };
      }

      if (options.plantIds && !options.plantIds.includes(schedule.asset.plantId || '')) {
        return { triggerId: trigger.id, scheduleId: schedule.id, skipped: true, reason: 'Schedule moved outside caller plant scope' };
      }

      const component = schedule.component;
      if (!component || !['meter_based', 'custom_hours'].includes(schedule.frequencyType)) {
        return { triggerId: trigger.id, scheduleId: schedule.id, skipped: true, reason: 'Schedule is not an active component usage-based PM' };
      }

      // Re-read baseline and component operating hours only after acquiring the
      // trigger lock. A concurrent worker that already generated will have
      // advanced baselineHours before this worker reaches this point.
      const config = parseConfig(trigger.triggerConfig);
      const current = Number(component.operatingHours ?? 0);
      const interval = Number(trigger.triggerValue || schedule.frequencyValue || 0);
      const configuredBaseline = config.baselineHours;
      if (configuredBaseline === undefined || configuredBaseline === null || !Number.isFinite(Number(configuredBaseline))) {
        const initializedConfig = {
          ...config,
          source: config.source || 'component_operating_hours',
          componentId: component.id,
          baselineHours: current,
          unit: config.unit || 'hours',
        };
        await tx.pmTrigger.update({
          where: { id: trigger.id },
          data: { triggerConfig: JSON.stringify(initializedConfig) },
        });
        return {
          triggerId: trigger.id,
          scheduleId: schedule.id,
          skipped: true,
          reason: 'Meter baseline initialized',
          current,
          nextThreshold: current + interval,
        };
      }
      const baseline = Number(configuredBaseline);
      const threshold = evaluateMeterThreshold(current, baseline, interval);

      if (!threshold.due || threshold.crossedThreshold == null) {
        return {
          triggerId: trigger.id,
          scheduleId: schedule.id,
          skipped: true,
          reason: 'Meter threshold not reached',
          current,
          nextThreshold: baseline + interval,
        };
      }

      const existingOpen = await tx.workOrder.findFirst({
        where: {
          pmScheduleId: schedule.id,
          status: { notIn: ['closed', 'cancelled'] },
        },
        select: { id: true, woNumber: true, status: true },
        orderBy: { createdAt: 'desc' },
      });
      if (existingOpen) {
        return {
          triggerId: trigger.id,
          scheduleId: schedule.id,
          skipped: true,
          reason: 'Existing PM work order still open',
          workOrder: existingOpen,
        };
      }

      const tasks = schedule.template?.tasks || [];
      const taskText = tasks.length
        ? '\n\nTask Checklist:\n' + tasks.map((task) => `${task.taskNumber}. [${task.taskType}] ${task.description}`).join('\n')
        : '';

      const suggestedParts = (component.sparePartLinks || []).map((spare) => ({
        itemId: spare.inventoryItemId,
        itemName: spare.inventoryItem?.name || spare.sparePartName,
        itemCode: spare.inventoryItem?.itemCode || spare.sparePartCode,
        quantity: spare.quantityRequired,
        unit: spare.inventoryItem?.unitOfMeasure || 'each',
        notes: spare.notes || '',
        status: 'recommended',
      }));
      const suggestedTools = (component.toolRequirements || []).map((tool) => ({
        toolId: tool.toolId,
        toolName: tool.tool?.name || tool.toolName,
        toolCode: tool.tool?.toolCode || tool.toolCode,
        quantity: tool.quantityRequired,
        notes: tool.notes || '',
        status: 'recommended',
      }));

      const woDate = new Date();
      const prefix = `WO-${woDate.getFullYear()}${String(woDate.getMonth() + 1).padStart(2, '0')}`;

      // Share the exact monthly allocation lock with time-based PM generation so
      // meter and calendar workers can never select the same work-order number.
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

      const wo = await tx.workOrder.create({
        data: {
          woNumber,
          title: `PM: ${schedule.title}`,
          description: `Meter-triggered preventive maintenance for ${component.componentCode} - ${component.name}. Current operating hours: ${current}. Trigger threshold reached: ${threshold.crossedThreshold}.${taskText}`,
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
          notes: `Auto-generated by meter trigger ${trigger.id}; baseline ${baseline}, interval ${interval}, current ${current}`,
          suggestedParts: JSON.stringify(suggestedParts),
          suggestedTools: JSON.stringify(suggestedTools),
        },
      });

      await tx.workOrderComponent.upsert({
        where: {
          workOrderId_componentRegistryId: {
            workOrderId: wo.id,
            componentRegistryId: component.id,
          },
        },
        create: {
          workOrderId: wo.id,
          componentRegistryId: component.id,
          notes: 'Inherited from meter-triggered component PM schedule',
        },
        update: {},
      });

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

      const nextConfig = {
        ...config,
        source: config.source || 'component_operating_hours',
        componentId: component.id,
        baselineHours: threshold.crossedThreshold,
        unit: config.unit || 'hours',
        lastGeneratedWorkOrderId: wo.id,
        lastGeneratedPreviousBaselineHours: baseline,
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
            componentId: component.id,
            meterTriggerId: trigger.id,
            previousBaselineHours: baseline,
            crossedThreshold: threshold.crossedThreshold,
            currentOperatingHours: current,
            autoGenerated: true,
          }),
        },
      });

      return {
        triggerId: trigger.id,
        scheduleId: schedule.id,
        scheduleTitle: schedule.title,
        assetName: schedule.asset.name,
        assignedToId: schedule.assignedToId,
        skipped: false,
        workOrderId: wo.id,
        woNumber: wo.woNumber,
        current,
        crossedThreshold: threshold.crossedThreshold,
        nextThreshold: threshold.crossedThreshold + interval,
      };
    });

    results.push(result);

    if (result.skipped === false && typeof result.assignedToId === 'string' && result.assignedToId) {
      try {
        await notifyUser(
          result.assignedToId,
          'wo_assigned',
          'Meter PM Work Order Generated',
          `A meter-triggered preventive maintenance WO (${result.woNumber}) has been generated for "${result.scheduleTitle}" on ${result.assetName}.`,
          'work_order',
          String(result.workOrderId),
          `wo-detail?id=${result.workOrderId}`,
        );
      } catch (notificationError) {
        // Generation is already committed. Notification outages must not create
        // retry behavior that could look like a failed meter generation.
        console.error('[PM Meter Notification Error]', notificationError);
      }
    }
  }

  return {
    evaluated: candidates.length,
    generated: results.filter((result) => result.skipped === false).length,
    results,
  };
}
