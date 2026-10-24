import type { Prisma } from '@prisma/client';
import type { ResolvedPmTemplateTask } from '@/services/pm/resolvePmTemplateTasks.service';

export async function materializePmTemplateTasks(
  tx: Prisma.TransactionClient,
  workOrderId: string,
  tasks: ResolvedPmTemplateTask[],
): Promise<number> {
  if (tasks.length === 0) return 0;

  await tx.workOrderTaskExecution.createMany({
    data: tasks.map((task) => ({
      workOrderId,
      templateTaskId: task.associationId,
      taskNumber: task.sequence,
      description: task.description,
      taskType: task.compatibilityActionType,
      requiredParts: task.requiredParts,
      estimatedMinutes: task.estimatedMinutes,
      status: 'pending',
    })),
  });

  return tasks.length;
}
