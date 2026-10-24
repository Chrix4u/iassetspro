import type { PmTaskType } from '@/lib/pm-task';

export interface PmTemplateTaskWithMaster {
  id: string;
  templateId: string;
  pmTaskId: string | null;
  taskNumber: number;
  description: string;
  taskType: string;
  requiredParts: string | null;
  estimatedMinutes: number | null;
  sortOrder: number;
  isActive: boolean;
  pmTask?: {
    id: string;
    taskNumber: number;
    description: string;
    taskType: string;
    isActive: boolean;
  } | null;
}

export interface ResolvedPmTemplateTask {
  associationId: string;
  templateId: string;
  pmTaskId: string | null;
  sequence: number;
  masterTaskNumber: number | null;
  description: string;
  discipline: PmTaskType | null;
  compatibilityActionType: string;
  requiredParts: string | null;
  estimatedMinutes: number | null;
  isLegacy: boolean;
  masterIsActive: boolean | null;
}

export function resolvePmTemplateTasks(tasks: readonly PmTemplateTaskWithMaster[]): ResolvedPmTemplateTask[] {
  return [...tasks]
    .sort((left, right) => left.sortOrder - right.sortOrder
      || left.taskNumber - right.taskNumber
      || left.id.localeCompare(right.id))
    .map((association, index) => {
      const master = association.pmTask ?? null;
      return {
        associationId: association.id,
        templateId: association.templateId,
        pmTaskId: association.pmTaskId,
        sequence: index + 1,
        masterTaskNumber: master?.taskNumber ?? null,
        description: master?.description ?? association.description,
        discipline: master ? master.taskType as PmTaskType : null,
        compatibilityActionType: association.taskType,
        requiredParts: association.requiredParts,
        estimatedMinutes: association.estimatedMinutes,
        isLegacy: association.pmTaskId === null,
        masterIsActive: master?.isActive ?? null,
      };
    });
}

export function formatResolvedPmTemplateTaskComment(task: ResolvedPmTemplateTask): string {
  const identity = task.masterTaskNumber !== null
    ? `[Task Master #${task.masterTaskNumber}]`
    : `[Legacy PM Task #${task.sequence}]`;
  const discipline = task.discipline ? ` [${task.discipline.toUpperCase()}]` : '';
  const action = task.compatibilityActionType ? ` [${task.compatibilityActionType.toUpperCase()}]` : '';
  const duration = task.estimatedMinutes ? ` — Est: ${task.estimatedMinutes} min` : '';
  const parts = task.requiredParts ? ` — Parts: ${task.requiredParts}` : '';
  return `${identity}${discipline}${action} ${task.description}${duration}${parts}`;
}
