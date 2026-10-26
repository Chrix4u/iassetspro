import type { PmScheduleTask, Prisma } from '@prisma/client';
import type { ScheduledTaskDueResult } from '@/services/pm/pmScheduledTaskDueEngine';
import { findBlockingPmScheduledTaskCycles } from '@/services/pm/pmScheduledTaskCycleGuard.service';

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
  return JSON.stringify({
    version: 1,
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
  const dueCandidates = candidates.filter((candidate) => candidate.due.due);
  if (dueCandidates.length === 0) return 0;

  const missingCycle = dueCandidates.find((candidate) => !candidate.due.dueCycleKey);
  if (missingCycle) {
    throw new PmScheduledTaskMaterializationError(
      `Due Scheduled Task ${missingCycle.task.id} has no stable due-cycle identity`,
    );
  }

  dueCandidates.sort((left, right) =>
    left.task.sortOrder - right.task.sortOrder
    || left.task.pmTask.taskNumber - right.task.pmTask.taskNumber
    || left.task.id.localeCompare(right.task.id));

  const identities = dueCandidates.map((candidate) => ({
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
    data: dueCandidates.map((candidate, index) => ({
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

  return dueCandidates.length;
}
