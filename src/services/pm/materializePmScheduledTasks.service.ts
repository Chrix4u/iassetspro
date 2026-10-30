import type { PmScheduleTask, Prisma } from '@prisma/client';
import type { ScheduledTaskDueResult } from '@/services/pm/pmScheduledTaskDueEngine';
import { findBlockingPmScheduledTaskCycles } from '@/services/pm/pmScheduledTaskCycleGuard.service';

export type PmTaskPlanningDisposition = 'due' | 'planned_early';

export interface MaterializablePmScheduledTask {
  task: PmScheduleTask & {
    pmTask: {
      id: string;
      taskNumber: number;
      description: string;
      taskType: string;
    };
  };
  due: ScheduledTaskDueResult;
  planningDisposition?: PmTaskPlanningDisposition;
  plannedExecutionAt?: Date | null;
}

function compatibleWorkOrderTaskType(taskMasterType: string): string {
  return taskMasterType === 'lubrication' ? 'lubricate' : 'check';
}

export class PmScheduledTaskMaterializationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PmScheduledTaskMaterializationError';
  }
}

function planningSnapshot(candidate: MaterializablePmScheduledTask): string {
  const { task, due } = candidate;
  const executionBasis: PmTaskPlanningDisposition = candidate.planningDisposition === 'planned_early' && !due.due
    ? 'planned_early'
    : 'due';
  return JSON.stringify({
    version: 1,
    executionBasis,
    originalDueDate: task.nextDueDate?.toISOString() ?? null,
    plannedExecutionAt: candidate.plannedExecutionAt?.toISOString() ?? null,
    pmScheduleTaskId: task.id,
    pmTaskId: task.pmTaskId,
    taskMasterNumber: task.pmTask.taskNumber,
    taskMasterDescription: task.pmTask.description,
    taskMasterType: task.pmTask.taskType,
    scheduleSortOrder: task.sortOrder,
    maintenanceMode: task.maintenanceMode,
    equipmentState: task.equipmentState,
    estimatedMinutes: task.estimatedMinutes,
    leadDays: task.leadDays,
    frequencyInterval: task.frequencyInterval,
    frequencyUnit: task.frequencyUnit,
    meterName: task.meterName,
    nextDueReading: task.nextDueReading,
    nextDueDate: task.nextDueDate,
    conditionSourceType: task.conditionSourceType,
    conditionSourceId: task.conditionSourceId,
    conditionMetric: task.conditionMetric,
    conditionOperator: task.conditionOperator,
    conditionThreshold: task.conditionThreshold,
    conditionThresholdMax: task.conditionThresholdMax,
    conditionUnit: task.conditionUnit,
    evaluationCadenceMinutes: task.evaluationCadenceMinutes,
    due: {
      cycleKey: due.dueCycleKey,
      reason: due.reason,
      currentValue: due.currentValue,
      source: due.source,
    },
  });
}

export async function materializePmScheduledTasks(
  tx: Prisma.TransactionClient,
  workOrderId: string,
  candidates: MaterializablePmScheduledTask[],
): Promise<number> {
  const materializableCandidates = candidates.filter((candidate) =>
    candidate.due.due || candidate.planningDisposition === 'planned_early');
  if (materializableCandidates.length === 0) return 0;

  const invalidPlannedEarly = materializableCandidates.find((candidate) =>
    !candidate.due.due
    && candidate.planningDisposition === 'planned_early'
    && (candidate.task.maintenanceMode !== 'tbm' || !candidate.task.nextDueDate));
  if (invalidPlannedEarly) {
    throw new PmScheduledTaskMaterializationError(
      `Scheduled Task ${invalidPlannedEarly.task.id} cannot be planned early without a TBM due date`,
    );
  }

  const missingPlannedExecution = materializableCandidates.find((candidate) =>
    !candidate.due.due
    && candidate.planningDisposition === 'planned_early'
    && (!candidate.plannedExecutionAt || !Number.isFinite(candidate.plannedExecutionAt.getTime())));
  if (missingPlannedExecution) {
    throw new PmScheduledTaskMaterializationError(
      `Scheduled Task ${missingPlannedExecution.task.id} requires a valid maintenance execution date for planned-early materialization`,
    );
  }

  const missingCycle = materializableCandidates.find((candidate) => !candidate.due.dueCycleKey);
  if (missingCycle) {
    throw new PmScheduledTaskMaterializationError(
      `Scheduled Task ${missingCycle.task.id} has no stable due-cycle identity`,
    );
  }

  materializableCandidates.sort((left, right) =>
    left.task.sortOrder - right.task.sortOrder
    || left.task.pmTask.taskNumber - right.task.pmTask.taskNumber
    || left.task.id.localeCompare(right.task.id));

  const identities = materializableCandidates.map((candidate) => ({
    pmScheduleTaskId: candidate.task.id,
    pmDueCycleKey: candidate.due.dueCycleKey!,
  }));

  const duplicate = (await findBlockingPmScheduledTaskCycles(tx, identities))[0];
  if (duplicate) {
    throw new PmScheduledTaskMaterializationError(
      `Scheduled Task cycle already materialized in work order ${duplicate.workOrderId}`,
    );
  }

  await tx.workOrderTaskExecution.createMany({
    data: materializableCandidates.map((candidate, index) => ({
      workOrderId,
      pmScheduleTaskId: candidate.task.id,
      pmDueCycleKey: candidate.due.dueCycleKey!,
      pmPlanningSnapshot: planningSnapshot(candidate),
      taskNumber: index + 1,
      description: candidate.task.pmTask.description,
      taskType: compatibleWorkOrderTaskType(candidate.task.pmTask.taskType),
      estimatedMinutes: candidate.task.estimatedMinutes,
      status: 'pending',
    })),
  });

  return materializableCandidates.length;
}
