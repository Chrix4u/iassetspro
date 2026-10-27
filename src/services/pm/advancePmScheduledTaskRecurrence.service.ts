import type { Prisma } from '@prisma/client';
import { buildAuditData, type AuditContext } from '@/lib/audit-helpers';
import { calculateFixedScheduleNextDueDate, calculateTimeDayNextDueDate } from '@/lib/pm-frequency';
import { PM_SCHEDULE_TASK_TIME_UNITS } from '@/services/pm/pmScheduleTask.service';

type RecurrenceTx = Pick<
  Prisma.TransactionClient,
  'workOrderTaskExecution' | 'pmSchedule' | 'pmScheduleTask' | 'meterReading' | 'auditLog'
>;

export interface AdvanceClosedPmScheduledTaskRecurrenceInput {
  tx: RecurrenceTx;
  workOrderId: string;
  pmScheduleId: string;
  assetId: string | null;
  woNumber: string;
  woActualEnd: Date | null;
  closedAt: Date;
  actorId: string;
  auditCtx?: AuditContext;
}

export interface AdvanceClosedPmScheduledTaskRecurrenceResult {
  taskLevel: boolean;
  advancedTaskIds: string[];
  skippedTaskIds: string[];
}

function taskCompletionAt(
  executionCompletedAt: Date | null,
  woActualEnd: Date | null,
  closedAt: Date,
): Date {
  return executionCompletedAt || woActualEnd || closedAt;
}

function recurrenceError(message: string): Error {
  return new Error(`PM Scheduled Task recurrence cannot advance: ${message}`);
}

export async function advanceClosedPmScheduledTaskRecurrence(
  input: AdvanceClosedPmScheduledTaskRecurrenceInput,
): Promise<AdvanceClosedPmScheduledTaskRecurrenceResult> {
  const schedule = await input.tx.pmSchedule.findUnique({
    where: { id: input.pmScheduleId },
    select: { recurrenceAuthority: true },
  });
  if (!schedule || schedule.recurrenceAuthority !== 'task') {
    return { taskLevel: false, advancedTaskIds: [], skippedTaskIds: [] };
  }

  const executions = await input.tx.workOrderTaskExecution.findMany({
    where: {
      workOrderId: input.workOrderId,
      OR: [
        { pmScheduleTaskId: { not: null } },
        { pmDueCycleKey: { not: null } },
        { pmPlanningSnapshot: { not: null } },
      ],
    },
    select: {
      id: true,
      status: true,
      completedAt: true,
      pmScheduleTaskId: true,
      pmDueCycleKey: true,
      pmPlanningSnapshot: true,
      pmScheduleTask: {
        select: {
          id: true,
          scheduleId: true,
          maintenanceMode: true,
          recurrenceBasis: true,
          recurrenceAnchorDate: true,
          frequencyInterval: true,
          frequencyUnit: true,
          meterName: true,
          lastCompletedAt: true,
          nextDueDate: true,
          nextDueReading: true,
          isActive: true,
        },
      },
    },
    orderBy: [{ taskNumber: 'asc' }, { id: 'asc' }],
  });

  if (executions.length === 0) {
    throw recurrenceError(`task-authority PM schedule ${input.pmScheduleId} has no task-level execution provenance`);
  }

  const advancedTaskIds: string[] = [];
  const skippedTaskIds: string[] = [];

  for (const execution of executions) {
    if (execution.status !== 'completed') {
      if (execution.pmScheduleTaskId) skippedTaskIds.push(execution.pmScheduleTaskId);
      continue;
    }

    const scheduledTask = execution.pmScheduleTask;
    if (!execution.pmScheduleTaskId || !scheduledTask) {
      throw recurrenceError(
        `completed execution ${execution.id} has task-level provenance but its live Scheduled Task is missing`,
      );
    }
    if (scheduledTask.scheduleId !== input.pmScheduleId) {
      throw recurrenceError(
        `completed execution ${execution.id} points to Scheduled Task ${scheduledTask.id} from a different PM schedule`,
      );
    }

    const completedAt = taskCompletionAt(execution.completedAt, input.woActualEnd, input.closedAt);
    const oldValues = {
      lastCompletedAt: scheduledTask.lastCompletedAt?.toISOString() ?? null,
      nextDueDate: scheduledTask.nextDueDate?.toISOString() ?? null,
      nextDueReading: scheduledTask.nextDueReading ?? null,
    };
    let updateData: Prisma.PmScheduleTaskUpdateInput;
    let auditDetails: Record<string, unknown> = {};

    if (scheduledTask.maintenanceMode === 'tbm') {
      const interval = Number(scheduledTask.frequencyInterval);
      const unit = scheduledTask.frequencyUnit;
      if (!Number.isInteger(interval) || interval <= 0) {
        throw recurrenceError(`TBM Scheduled Task ${scheduledTask.id} has an invalid whole-number interval`);
      }
      if (!unit || !(PM_SCHEDULE_TASK_TIME_UNITS as readonly string[]).includes(unit)) {
        throw recurrenceError(`TBM Scheduled Task ${scheduledTask.id} has an invalid calendar unit`);
      }
      const typedUnit = unit as (typeof PM_SCHEDULE_TASK_TIME_UNITS)[number];
      const recurrenceBasis = scheduledTask.recurrenceBasis === 'fixed_schedule'
        ? 'fixed_schedule'
        : 'after_completion';
      let nextDueDate: Date;
      if (recurrenceBasis === 'fixed_schedule') {
        const anchor = scheduledTask.recurrenceAnchorDate || scheduledTask.nextDueDate;
        if (!anchor) {
          throw recurrenceError(`TBM Scheduled Task ${scheduledTask.id} has fixed recurrence without a calendar anchor`);
        }
        nextDueDate = calculateFixedScheduleNextDueDate(anchor, completedAt, interval, typedUnit);
      } else {
        nextDueDate = calculateTimeDayNextDueDate(completedAt, interval, typedUnit);
      }
      updateData = { lastCompletedAt: completedAt, nextDueDate };
      auditDetails = { recurrenceBasis, nextDueDate: nextDueDate.toISOString() };
    } else if (scheduledTask.maintenanceMode === 'ubm') {
      const interval = Number(scheduledTask.frequencyInterval);
      if (!input.assetId) {
        throw recurrenceError(`UBM Scheduled Task ${scheduledTask.id} has no work-order asset for meter recurrence`);
      }
      if (!Number.isFinite(interval) || interval <= 0 || !scheduledTask.meterName || !scheduledTask.frequencyUnit) {
        throw recurrenceError(`UBM Scheduled Task ${scheduledTask.id} has invalid meter recurrence configuration`);
      }
      const baseline = await input.tx.meterReading.findFirst({
        where: {
          assetId: input.assetId,
          meterName: scheduledTask.meterName,
          unit: scheduledTask.frequencyUnit,
          readingDate: { lte: completedAt },
        },
        orderBy: [{ readingDate: 'desc' }, { createdAt: 'desc' }],
        select: { id: true, value: true, meterName: true, unit: true, readingDate: true },
      });
      if (!baseline || !Number.isFinite(Number(baseline.value))) {
        throw recurrenceError(
          `UBM Scheduled Task ${scheduledTask.id} has no authoritative meter reading at or before completion`,
        );
      }
      const nextDueReading = Number(baseline.value) + interval;
      updateData = { lastCompletedAt: completedAt, nextDueReading };
      auditDetails = {
        nextDueReading,
        meterBaseline: {
          readingId: baseline.id,
          value: baseline.value,
          meterName: baseline.meterName,
          unit: baseline.unit,
          readingDate: baseline.readingDate.toISOString(),
        },
      };
    } else if (scheduledTask.maintenanceMode === 'cbm') {
      updateData = { lastCompletedAt: completedAt };
    } else {
      throw recurrenceError(
        `Scheduled Task ${scheduledTask.id} has unsupported maintenance mode '${scheduledTask.maintenanceMode}'`,
      );
    }

    await input.tx.pmScheduleTask.update({
      where: { id: scheduledTask.id },
      data: updateData,
    });
    await input.tx.auditLog.create({
      data: buildAuditData(
        'update',
        'pm_schedule_task',
        scheduledTask.id,
        input.actorId,
        oldValues,
        {
          lastCompletedAt: completedAt.toISOString(),
          ...auditDetails,
          maintenanceMode: scheduledTask.maintenanceMode,
          pmDueCycleKey: execution.pmDueCycleKey,
          workOrderId: input.workOrderId,
          woNumber: input.woNumber,
          reason: 'Scheduled Task recurrence advanced by verified Repairs planner closeout',
        },
        input.auditCtx,
      ),
    });
    advancedTaskIds.push(scheduledTask.id);
  }

  return { taskLevel: true, advancedTaskIds, skippedTaskIds };
}
