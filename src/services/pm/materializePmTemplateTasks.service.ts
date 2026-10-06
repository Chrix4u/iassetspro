import type { Prisma } from '@prisma/client';

export interface PmTemplateTaskSnapshotInput {
  id: string;
  taskNumber: number;
  description: string;
  taskType: string;
  requiredParts: string | null;
  estimatedMinutes: number | null;
}

export async function materializePmTemplateTasks(
  tx: Prisma.TransactionClient,
  workOrderId: string,
  tasks: PmTemplateTaskSnapshotInput[],
): Promise<number> {
  if (tasks.length === 0) return 0;

  await tx.workOrderTaskExecution.createMany({
    data: tasks.map((task) => ({
      workOrderId,
      templateTaskId: task.id,
      taskNumber: task.taskNumber,
      description: task.description,
      taskType: task.taskType,
      requiredParts: task.requiredParts,
      estimatedMinutes: task.estimatedMinutes,
      status: 'pending',
    })),
  });

  return tasks.length;
}
