export const WORK_ORDER_TASK_STATUSES = [
  'pending',
  'in_progress',
  'completed',
  'skipped',
  'failed',
] as const;

export type WorkOrderTaskStatus = typeof WORK_ORDER_TASK_STATUSES[number];

export const WORK_ORDER_TASK_TRANSITIONS: Record<string, readonly WorkOrderTaskStatus[]> = {
  pending: ['in_progress', 'skipped', 'completed'],
  in_progress: ['completed', 'skipped', 'failed', 'pending'],
  completed: ['pending', 'in_progress'],
  skipped: ['pending', 'in_progress'],
  failed: ['pending', 'in_progress'],
};

export const WORK_ORDER_TASK_STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  in_progress: 'In Progress',
  completed: 'Completed',
  skipped: 'Skipped',
  failed: 'Failed',
};

export function isWorkOrderTaskStatus(value: unknown): value is WorkOrderTaskStatus {
  return typeof value === 'string' &&
    (WORK_ORDER_TASK_STATUSES as readonly string[]).includes(value);
}

export function canTransitionWorkOrderTask(
  currentStatus: string,
  targetStatus: WorkOrderTaskStatus,
): boolean {
  return WORK_ORDER_TASK_TRANSITIONS[currentStatus]?.includes(targetStatus) ?? false;
}

export function taskTransitionError(
  currentStatus: string,
  targetStatus: WorkOrderTaskStatus,
): string {
  const currentLabel = WORK_ORDER_TASK_STATUS_LABELS[currentStatus] || currentStatus;
  const targetLabel = WORK_ORDER_TASK_STATUS_LABELS[targetStatus] || targetStatus;
  return `Cannot transition from '${currentLabel}' to '${targetLabel}'`;
}
