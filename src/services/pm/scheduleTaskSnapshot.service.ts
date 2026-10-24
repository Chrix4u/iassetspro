import type { Prisma } from '@prisma/client';

export const PM_SCHEDULE_SNAPSHOT_CATEGORY = 'schedule_snapshot';
export const PM_SCHEDULE_TASK_TYPES = ['check', 'measure', 'inspect', 'lubricate', 'replace', 'record'] as const;

export type PmScheduleTaskType = (typeof PM_SCHEDULE_TASK_TYPES)[number];

export interface NormalizedPmScheduleTask {
  taskNumber: number;
  description: string;
  taskType: PmScheduleTaskType;
  estimatedMinutes: number | null;
  requiredParts: string[];
}

type NormalizeResult =
  | { ok: true; tasks: NormalizedPmScheduleTask[] }
  | { ok: false; error: string };

export function normalizePmScheduleTasks(input: unknown): NormalizeResult {
  if (!Array.isArray(input)) {
    return { ok: false, error: 'Task list must be an array' };
  }

  const tasks: NormalizedPmScheduleTask[] = [];
  for (const [index, raw] of input.entries()) {
    const taskNumber = index + 1;
    if (!raw || typeof raw !== 'object') {
      return { ok: false, error: `Task ${taskNumber} is invalid` };
    }

    const candidate = raw as Record<string, unknown>;
    const description = typeof candidate.description === 'string' ? candidate.description.trim() : '';
    if (!description) {
      return { ok: false, error: `Task ${taskNumber} description is required` };
    }

    const taskType = typeof candidate.taskType === 'string' ? candidate.taskType.trim() : '';
    if (!PM_SCHEDULE_TASK_TYPES.includes(taskType as PmScheduleTaskType)) {
      return { ok: false, error: `Task ${taskNumber} has an invalid task type` };
    }

    let estimatedMinutes: number | null = null;
    if (candidate.estimatedMinutes !== undefined && candidate.estimatedMinutes !== null && candidate.estimatedMinutes !== '') {
      const normalizedMinutes = Number(candidate.estimatedMinutes);
      if (!Number.isInteger(normalizedMinutes) || normalizedMinutes <= 0) {
        return { ok: false, error: `Task ${taskNumber} estimated minutes must be a positive whole number` };
      }
      estimatedMinutes = normalizedMinutes;
    }

    let requiredParts: string[] = [];
    if (candidate.requiredParts !== undefined && candidate.requiredParts !== null) {
      if (!Array.isArray(candidate.requiredParts)
        || !candidate.requiredParts.every((part) => typeof part === 'string' && part.trim().length > 0)) {
        return { ok: false, error: `Task ${taskNumber} required parts must be non-empty strings` };
      }
      requiredParts = candidate.requiredParts.map((part) => String(part).trim());
    }

    tasks.push({
      taskNumber,
      description,
      taskType: taskType as PmScheduleTaskType,
      estimatedMinutes,
      requiredParts,
    });
  }

  return { ok: true, tasks };
}

export async function createPmScheduleTaskSnapshot(
  tx: Prisma.TransactionClient,
  input: {
    scheduleTitle: string;
    scheduleDescription?: string | null;
    estimatedDurationHours?: number | null;
    priority?: string | null;
    createdById: string;
    plantId: string;
    tasks: NormalizedPmScheduleTask[];
  },
): Promise<string> {
  if (input.tasks.length === 0) {
    throw new Error('Cannot create a PM schedule task snapshot without tasks');
  }

  const taskMinutes = input.tasks.reduce((sum, task) => sum + (task.estimatedMinutes || 0), 0);
  const estimatedDuration = input.estimatedDurationHours && input.estimatedDurationHours > 0
    ? input.estimatedDurationHours
    : Math.max(0.25, taskMinutes / 60 || 0.25);

  const template = await tx.pmTemplate.create({
    data: {
      title: `${input.scheduleTitle} · Schedule Tasks`,
      description: input.scheduleDescription || 'Schedule-owned PM checklist snapshot',
      type: 'preventive',
      category: PM_SCHEDULE_SNAPSHOT_CATEGORY,
      estimatedDuration,
      priority: input.priority || 'medium',
      createdById: input.createdById,
      plantId: input.plantId,
    },
    select: { id: true },
  });

  await tx.pmTemplateTask.createMany({
    data: input.tasks.map((task) => ({
      templateId: template.id,
      taskNumber: task.taskNumber,
      description: task.description,
      taskType: task.taskType,
      requiredParts: task.requiredParts.length > 0 ? JSON.stringify(task.requiredParts) : null,
      estimatedMinutes: task.estimatedMinutes,
      sortOrder: task.taskNumber,
      isActive: true,
    })),
  });

  return template.id;
}
