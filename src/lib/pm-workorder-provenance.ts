export type PmWorkOrderSource = 'legacy_schedule' | 'direct_assignment';

export interface PmWorkOrderProvenance {
  pmScheduleId: string | null;
  schedule: { id: string } | null;
  taskExecutions: readonly { pmScheduleTaskId: string | null }[];
}

export type PmWorkOrderSourceResult =
  | { kind: 'valid'; source: PmWorkOrderSource }
  | { kind: 'broken_schedule'; message: string }
  | { kind: 'not_pm'; message: string };

/**
 * Direct PM assignments are intentionally schedule-container-free.
 * Their generated WO must still have task-level PM assignment provenance.
 *
 * Never infer PM solely from title, "preventive" free-text type, WO source
 * metadata or a generic checklist. This keeps non-PM Repairs records out.
 */
export function identifyPmWorkOrderSource(record: PmWorkOrderProvenance): PmWorkOrderSourceResult {
  if (record.pmScheduleId) {
    if (record.schedule?.id === record.pmScheduleId) {
      return { kind: 'valid', source: 'legacy_schedule' };
    }
    return {
      kind: 'broken_schedule',
      message: 'PM work order references a missing schedule. Planner must repair provenance before using the readiness report.',
    };
  }

  if (record.taskExecutions.some((task) => typeof task.pmScheduleTaskId === 'string'
    && task.pmScheduleTaskId.trim().length > 0)) {
    return { kind: 'valid', source: 'direct_assignment' };
  }

  return {
    kind: 'not_pm',
    message: 'Work order is not linked to a PM schedule or a direct PM task assignment',
  };
}
