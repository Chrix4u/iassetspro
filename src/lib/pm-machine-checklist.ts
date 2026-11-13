import { automaticMeasurementOutcome, parseInspectionLimits } from '@/lib/pm-inspection';

export type MachineInspectionState = 'running' | 'standstill';
export type MachineInspectionOutcome = 'pass' | 'fail' | 'needs_attention' | 'not_measured';
export type MachineInspectionDueState = 'overdue' | 'due_today' | 'upcoming' | 'unscheduled';

export interface MachineChecklistTask {
  id: string;
  componentId: string | null;
  component: {
    id: string; name: string; componentCode: string; componentType: string;
    hierarchyPath?: Array<{ id: string; code: string; name: string; type: string }>;
    hierarchyComplete?: boolean;
  } | null;
  pmTask: { id: string; taskNumber: number; description: string; taskType: string };
  pmType: string;
  basis: string | null;
  nextDueDate: string | Date | null;
  nextDueReading: number | null;
  frequencyUnit?: string | null;
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
    equipmentState?: MachineInspectionState | null;
    captureSource?: string | null;
    fieldInspectedAt?: string | Date | null;
    fieldInspectorName?: string | null;
    paperReference?: string | null;
    inspectionPurpose?: string | null;
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

/** Only an actual measured value or explicit abnormal/N/A assessment queues an
 * instrument checkpoint. Shared part remarks alone must never submit empty
 * numeric readings; qualitative sight checks use their actual observation text.
 */
export function machineChecklistHasInput(
  point: Pick<MachineChecklistPoint, 'inspectionType'>,
  draft: Pick<MachineChecklistDraft, 'value' | 'outcome' | 'findings'>,
): boolean {
  if (point.inspectionType === 'visual') return Boolean(draft.findings.trim() || draft.outcome !== 'pass');
  return Boolean(draft.value.trim() || draft.outcome !== 'pass');
}

/** Require actual observations or measured values: a bare Good/Bad tick is not a checklist entry. */
export function validateMachineChecklistEntry(
  point: MachineChecklistPoint,
  draft: MachineChecklistDraft,
): string | null {
  if (!['visual', 'measurement'].includes(point.inspectionType)) {
    return 'Configure a sight or instrument inspection point before recording.';
  }
  if (!['pass', 'fail', 'needs_attention', 'not_measured'].includes(draft.outcome)) return 'Select an inspection outcome.';
  if (draft.findings.length > 3000 || draft.recommendation.length > 3000) {
    return 'Observation and recommended action must each be at most 3,000 characters.';
  }
  if (draft.outcome === 'not_measured') {
    if (point.inspectionType !== 'measurement') return 'Not measurable is only for instrument checks.';
    if (draft.value.trim()) return 'Do not enter a numeric value when the reading was not taken.';
    if (draft.findings.trim().length < 10) return 'Explain why measurement was not possible (at least 10 characters).';
    return null;
  }
  if (point.inspectionType === 'measurement') {
    if (!draft.value.trim() || !Number.isFinite(Number(draft.value))) {
      return 'Enter the actual numeric instrument reading.';
    }
    if (!point.parameterKey) return 'Planner must configure the measurement parameter.';
  }
  if (point.inspectionType === 'visual' && !draft.findings.trim()) {
    return 'Describe what you actually observed, including normal conditions.';
  }
  // A failed numeric reading is objective evidence in itself. The API adds
  // the actual value and configured limits to the failure finding if notes
  // were not typed; visual/subjective concerns still require an observation.
  const autoFailure = point.inspectionType === 'measurement'
    && automaticMeasurementOutcome(draft.value, point.normalRange) === 'fail';
  if (draft.outcome !== 'pass' && !draft.findings.trim() && !autoFailure) {
    return 'Describe the defect or abnormal finding before submitting.';
  }
  return null;
}

export function machineChecklistOutOfRange(point: MachineChecklistPoint, value: string): boolean {
  if (point.inspectionType !== 'measurement' || value.trim() === '' || !Number.isFinite(Number(value))) return false;
  const { min, max } = parseInspectionLimits(point.normalRange);
  return (min !== null && Number(value) < min) || (max !== null && Number(value) > max);
}
