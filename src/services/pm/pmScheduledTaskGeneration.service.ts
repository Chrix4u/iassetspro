import { db } from '@/lib/db';
import { notifyUser } from '@/lib/notifications';
import { getAssetLiveLocationMap } from '@/lib/functional-location/live-location';
import { buildMaintenanceLocationSnapshot } from '@/lib/functional-location/maintenance-snapshot';
import { calculatePmPlannedEnd } from '@/services/pm/plannedWindow.service';
import { lockPmScheduleLifecycle } from '@/services/pm/templateLifecycle.service';
import { evaluateScheduledTaskDue } from '@/services/pm/pmScheduledTaskDueEngine';
import {
  materializePmScheduledTasks,
  type MaterializablePmScheduledTask,
} from '@/services/pm/materializePmScheduledTasks.service';
import { findBlockingPmScheduledTaskCycles } from '@/services/pm/pmScheduledTaskCycleGuard.service';

export interface PmScheduledTaskGenerationOptions {
  actorId: string;
  plantIds?: string[];
  scheduleIds?: string[];
}

export interface PmScheduledTaskGenerationResultItem {
  scheduleId: string;
  scheduleTitle: string;
  workOrderId: string;
  woNumber: string;
  equipmentState?: string;
  scheduledTaskIds?: string[];
  skipped: boolean;
  reason?: string;
}

export interface PmScheduledTaskGenerationResult {
  checked: number;
  generated: number;
  skipped: number;
  results: PmScheduledTaskGenerationResultItem[];
}

function roundHours(minutes: number): number | null {
  if (!Number.isFinite(minutes) || minutes <= 0) return null;
  return Math.round((minutes / 60) * 100) / 100;
}

function generationPlannedStart(candidates: MaterializablePmScheduledTask[], now: Date): Date {
  if (candidates.some((candidate) => candidate.task.maintenanceMode !== 'tbm')) return now;
  const dates = candidates
    .map((candidate) => candidate.task.nextDueDate)
    .filter((date): date is Date => Boolean(date))
    .map((date) => date.getTime());
  if (dates.length === 0) return now;
  return new Date(Math.min(...dates));
}

function suggestedResources(component: any) {
  const suggestedParts = (component?.sparePartLinks || []).map((spare: any) => ({
    itemId: spare.inventoryItemId,
    itemName: spare.inventoryItem?.name || spare.sparePartName,
    itemCode: spare.inventoryItem?.itemCode || spare.sparePartCode,
    quantity: spare.quantityRequired,
    unit: spare.inventoryItem?.unitOfMeasure || 'each',
    notes: spare.notes || '',
    status: 'recommended',
  }));
  const suggestedTools = (component?.toolRequirements || []).map((tool: any) => ({
    toolId: tool.toolId,
    toolName: tool.tool?.name || tool.toolName,
    toolCode: tool.tool?.toolCode || tool.toolCode,
    quantity: tool.quantityRequired,
    notes: tool.notes || '',
    status: 'recommended',
  }));
  return { suggestedParts, suggestedTools };
}

function taskLine(candidate: MaterializablePmScheduledTask): string {
  return `Task #${candidate.task.pmTask.taskNumber}: ${candidate.task.pmTask.description} [${candidate.task.maintenanceMode.toUpperCase()} · ${candidate.task.equipmentState.toUpperCase()}]`;
}

export async function generateDueScheduledTaskWorkOrders(
  options: PmScheduledTaskGenerationOptions,
): Promise<PmScheduledTaskGenerationResult> {
  const explicitSchedules = Array.isArray(options.scheduleIds) && options.scheduleIds.length > 0;
  const where: any = {
    isActive: true,
    recurrenceAuthority: 'task',
    tasks: { some: { isActive: true } },
  };
  if (explicitSchedules) where.id = { in: options.scheduleIds };
  else where.autoGenerateWO = true;
  if (options.plantIds?.length) where.asset = { plantId: { in: options.plantIds } };

  const candidates = await db.pmSchedule.findMany({
    where,
    select: { id: true, assetId: true },
  });
  const locationMap = await getAssetLiveLocationMap(candidates.map((candidate) => candidate.assetId));
  const now = new Date();
  const results: PmScheduledTaskGenerationResultItem[] = [];

  for (const candidate of candidates) {
    const locationSnapshot = buildMaintenanceLocationSnapshot(locationMap.get(candidate.assetId) ?? null);
    const scheduleResults = await db.$transaction(async (tx) => {
      await lockPmScheduleLifecycle(tx, candidate.id);
      await tx.$executeRawUnsafe(
        'SELECT pg_advisory_xact_lock(hashtext($1))',
        `iassetspro:pm-task-generation:${candidate.id}`,
      );

      const schedule = await tx.pmSchedule.findUnique({
        where: { id: candidate.id },
        include: {
          asset: { select: { id: true, name: true, assetTag: true, plantId: true, departmentId: true } },
          component: {
            select: {
              id: true,
              name: true,
              componentCode: true,
              componentType: true,
              assetId: true,
              sparePartLinks: {
                select: {
                  inventoryItemId: true, sparePartName: true, sparePartCode: true,
                  quantityRequired: true, notes: true,
                  inventoryItem: { select: { name: true, itemCode: true, unitOfMeasure: true } },
                },
              },
              toolRequirements: {
                select: {
                  toolId: true, toolName: true, toolCode: true, quantityRequired: true, notes: true,
                  tool: { select: { name: true, toolCode: true } },
                },
              },
            },
          },
          tasks: {
            where: { isActive: true },
            orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
            include: { pmTask: { select: { id: true, taskNumber: true, description: true, taskType: true } } },
          },
        },
      });

      if (!schedule) {
        return [{ scheduleId: candidate.id, scheduleTitle: 'Unknown PM schedule', workOrderId: '', woNumber: '', skipped: true, reason: 'PM schedule no longer exists' }];
      }
      if (schedule.recurrenceAuthority !== 'task' || !schedule.isActive || (!explicitSchedules && !schedule.autoGenerateWO)) {
        return [{ scheduleId: schedule.id, scheduleTitle: schedule.title, workOrderId: '', woNumber: '', skipped: true, reason: 'PM schedule is not eligible for task-level generation' }];
      }
      if (options.plantIds?.length && (!schedule.asset.plantId || !options.plantIds.includes(schedule.asset.plantId))) {
        return [{ scheduleId: schedule.id, scheduleTitle: schedule.title, workOrderId: '', woNumber: '', skipped: true, reason: 'PM schedule is outside the requested plant scope' }];
      }

      const evaluated: MaterializablePmScheduledTask[] = [];
      for (const task of schedule.tasks) {
        const due = await evaluateScheduledTaskDue({
          client: tx,
          task,
          assetId: schedule.assetId,
          plantId: schedule.asset.plantId || '',
          componentId: schedule.componentId,
          now,
        });
        if (due.due && due.dueCycleKey) evaluated.push({ task, due });
      }

      if (evaluated.length === 0) {
        return [{ scheduleId: schedule.id, scheduleTitle: schedule.title, workOrderId: '', woNumber: '', skipped: true, reason: 'No Scheduled Tasks are due' }];
      }

      const existing = await findBlockingPmScheduledTaskCycles(
        tx,
        evaluated.map((entry) => ({
          pmScheduleTaskId: entry.task.id,
          pmDueCycleKey: entry.due.dueCycleKey!,
        })),
      );
      const existingKeys = new Set(existing.map((row) => `${row.pmScheduleTaskId}:${row.pmDueCycleKey}`));
      const pending = evaluated.filter((entry) => !existingKeys.has(`${entry.task.id}:${entry.due.dueCycleKey}`));
      if (pending.length === 0) {
        return [{ scheduleId: schedule.id, scheduleTitle: schedule.title, workOrderId: '', woNumber: '', skipped: true, reason: 'All due Scheduled Task cycles are already generated' }];
      }

      const groups = new Map<string, MaterializablePmScheduledTask[]>();
      for (const entry of pending) {
        const key = entry.task.equipmentState;
        const group = groups.get(key) || [];
        group.push(entry);
        groups.set(key, group);
      }

      const generated: any[] = [];
      const resources = suggestedResources(schedule.component);
      for (const [equipmentState, group] of groups) {
        group.sort((left, right) => left.task.sortOrder - right.task.sortOrder || left.task.id.localeCompare(right.task.id));
        const totalMinutes = group.reduce((sum, entry) => sum + Math.max(0, entry.task.estimatedMinutes || 0), 0);
        const estimatedHours = roundHours(totalMinutes);
        const plannedStart = generationPlannedStart(group, now);
        const plannedEnd = calculatePmPlannedEnd(plannedStart, estimatedHours);
        const prefix = `WO-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;

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
        const taskLines = group.map(taskLine);
        const wo = await tx.workOrder.create({
          data: {
            woNumber,
            title: `PM: ${schedule.title} · ${equipmentState.toUpperCase()}`,
            description: `Task-level preventive maintenance for ${schedule.asset.name || schedule.asset.assetTag}${schedule.component ? ` | Component: ${schedule.component.componentCode} - ${schedule.component.name}` : ''}\n\nDue Scheduled Tasks:\n${taskLines.join('\n')}`,
            type: 'preventive',
            priority: schedule.priority,
            status: 'draft',
            assetId: schedule.assetId,
            assetName: schedule.asset.name,
            ...locationSnapshot,
            assignedTo: schedule.assignedToId,
            plannerId: schedule.createdById,
            departmentId: schedule.asset.departmentId || schedule.departmentId || null,
            plantId: schedule.asset.plantId || null,
            estimatedHours,
            pmScheduleId: schedule.id,
            plannedStart,
            plannedEnd,
            notes: `Auto-generated from task-level PM schedule "${schedule.title}" · equipment state ${equipmentState.toUpperCase()} · ${group.length} due task(s)`,
            suggestedParts: JSON.stringify(resources.suggestedParts),
            suggestedTools: JSON.stringify(resources.suggestedTools),
          },
        });

        if (schedule.componentId) {
          await tx.workOrderComponent.upsert({
            where: { workOrderId_componentRegistryId: { workOrderId: wo.id, componentRegistryId: schedule.componentId } },
            create: { workOrderId: wo.id, componentRegistryId: schedule.componentId, notes: 'Inherited from task-level PM schedule' },
            update: {},
          });
        }

        await materializePmScheduledTasks(tx, wo.id, group);
        for (const entry of group) {
          await tx.workOrderComment.create({
            data: {
              workOrderId: wo.id,
              userId: options.actorId,
              content: `${taskLine(entry)} · cycle ${entry.due.dueCycleKey}`,
            },
          });
          await tx.pmScheduleTask.update({
            where: { id: entry.task.id },
            data: { lastGeneratedAt: now, lastGeneratedCycleKey: entry.due.dueCycleKey },
          });
        }

        await tx.auditLog.create({
          data: {
            userId: options.actorId,
            action: 'create',
            entityType: 'work_order',
            entityId: wo.id,
            newValues: JSON.stringify({
              woNumber,
              title: wo.title,
              type: 'preventive',
              pmScheduleId: schedule.id,
              componentId: schedule.componentId || null,
              equipmentState,
              scheduledTaskIds: group.map((entry) => entry.task.id),
              dueCycles: group.map((entry) => entry.due.dueCycleKey),
              taskLevelGeneration: true,
              autoGenerated: true,
            }),
          },
        });

        generated.push({
          scheduleId: schedule.id,
          scheduleTitle: schedule.title,
          workOrderId: wo.id,
          woNumber,
          equipmentState,
          scheduledTaskIds: group.map((entry) => entry.task.id),
          skipped: false,
          assignedToId: schedule.assignedToId,
          assetName: schedule.asset.name,
          plannedStart,
        });
      }
      return generated;
    });

    for (const generation of scheduleResults as any[]) {
      results.push({
        scheduleId: generation.scheduleId,
        scheduleTitle: generation.scheduleTitle,
        workOrderId: generation.workOrderId,
        woNumber: generation.woNumber,
        equipmentState: generation.equipmentState,
        scheduledTaskIds: generation.scheduledTaskIds,
        skipped: generation.skipped,
        reason: generation.reason,
      });
      if (!generation.skipped && generation.assignedToId) {
        try {
          await notifyUser(
            generation.assignedToId,
            'wo_assigned',
            'PM Work Order Generated',
            `A preventive maintenance WO (${generation.woNumber}) has been generated for "${generation.scheduleTitle}" on ${generation.assetName}.`,
            'work_order',
            generation.workOrderId,
            `wo-detail?id=${generation.workOrderId}`,
          );
        } catch (error) {
          console.error('[PM Scheduled Task Notification Error]', error);
        }
      }
    }
  }

  return {
    checked: candidates.length,
    generated: results.filter((item) => !item.skipped).length,
    skipped: results.filter((item) => item.skipped).length,
    results,
  };
}
