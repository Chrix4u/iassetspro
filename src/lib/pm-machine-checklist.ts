import { parseInspectionLimits } from '@/lib/pm-inspection';

export type MachineInspectionState = 'running' | 'standstill';
export type MachineInspectionOutcome = 'pass' | 'fail' | 'needs_attention';
export type MachineInspectionDueState = 'overdue' | 'due_today' | 'upcoming' | 'unscheduled';

export interface MachineChecklistTask {
  id: string;
  componentId: string | null;
  component: { id: string; name: string; componentCode: string; componentType: string } | null;
  pmTask: { id: string; taskNumber: number; description: string; taskType: string };
  pmType: string;
  basis: string | null;
  nextDueDate: string | Date | null;
  nextDueReading: number | null;
  equipmentState: string;
}

export interface MachineChecklistPoint {
  id: string;
  componentId: string;
  name: string;
  description: string | null;
  inspectionType: string;
  parameterKey: string | null;
  normalRange: string | null;
  frequency: string;
  nextInspection: string | Date | null;
  dueState: MachineInspectionDueState;
  latestRecord: {
    id: string; result: string; value: string | null;
    findings: string | null; inspectedAt: string | Date;
  } | null;
  openCorrectiveWorkOrder: { id: string; woNumber: string; status: string } | null;
}

export interface MachineChecklistGroup {
  component: NonNullable<MachineChecklistTask['component']>;
  tasks: MachineChecklistTask[];
  points: MachineChecklistPoint[];
}

/**
 * Match active assignments with checkpoints on their exact registered part.
 * Points are kept ONCE per part even if more than one task targets that part.
 * Asset-wide tasks remain separate: no invented part or inspection method.
 */
export function groupMachineInspectionChecklist(
  assignments: MachineChecklistTask[],
  inspectionPoints: MachineChecklistPoint[],
): { groups: MachineChecklistGroup[]; generalTasks: MachineChecklistTask[]; unconfiguredTasks: number } {
  const byPart = new Map<string, MachineChecklistGroup>();
  const generalTasks: MachineChecklistTask[] = [];
  for (const task of assignments) {
    if (!task.component || !task.componentId || task.component.id !== task.componentId) {
      generalTasks.push(task);
      continue;
    }
    const group = byPart.get(task.componentId);
    if (group) group.tasks.push(task);
    else byPart.set(task.componentId, { component: task.component, tasks: [task], points: [] });
  }

  for (const point of inspectionPoints) {
    const group = byPart.get(point.componentId);
    if (group && !group.points.some((existing) => existing.id === point.id)) {
      group.points.push(point);
    }
  }

  const sortTasks = (a: MachineChecklistTask, b: MachineChecklistTask) =>
    a.pmTask.taskNumber - b.pmTask.taskNumber || a.pmTask.description.localeCompare(b.pmTask.description);
  const groups = Array.from(byPart.values()).sort((a, b) =>
    a.component.componentCode.localeCompare(b.component.componentCode));
  for (const group of groups) {
    group.tasks.sort(sortTasks);
    group.points.sort((a, b) => a.name.localeCompare(b.name));
  }
  generalTasks.sort(sortTasks);
  return {
    groups,
    generalTasks,
    unconfiguredTasks: generalTasks.length + groups.reduce((n, group) => n + (group.points.length === 0 ? group.tasks.length : 0), 0),
  };
}

export interface MachineChecklistDraft {
  value: string;
  outcome: MachineInspectionOutcome;
  findings: string;
  recommendation: string;
  requestKey: string;
}

/** Require actual observations or measured values: a bare Good/Bad tick is not a checklist entry. */
export function validateMachineChecklistEntry(
  point: MachineChecklistPoint,
  draft: MachineChecklistDraft,
): string | null {
  if (!['visual', 'measurement'].includes(point.inspectionType)) {
    return 'Configure a sight or instrument inspection point before recording.';
  }
  if (!['pass', 'fail', 'needs_attention'].includes(draft.outcome)) return 'Select an inspection outcome.';
  if (point.inspectionType === 'measurement') {
    if (!draft.value.trim() || !Number.isFinite(Number(draft.value))) {
      return 'Enter the actual numeric instrument reading.';
    }
    if (!point.parameterKey) return 'Planner must configure the measurement parameter.';
  }
  if (point.inspectionType === 'visual' && !draft.findings.trim()) {
    return 'Describe what you actually observed, including normal conditions.';
  }
  if (draft.outcome !== 'pass' && !draft.findings.trim()) {
    return 'Describe the defect or abnormal finding before submitting.';
  }
  if (draft.findings.length > 3000 || draft.recommendation.length > 3000) {
    return 'Observation and recommended action must each be at most 3,000 characters.';
  }
  return null;
}

export function machineChecklistOutOfRange(point: MachineChecklistPoint, value: string): boolean {
  if (point.inspectionType !== 'measurement' || value.trim() === '' || !Number.isFinite(Number(value))) return false;
  const { min, max } = parseInspectionLimits(point.normalRange);
  return (min !== null && Number(value) < min) || (max !== null && Number(value) > max);
}
