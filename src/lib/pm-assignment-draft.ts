import type { PmTaskType } from '@/lib/pm-task';
import { normalizePmInspectionType, type PmActivityMode, type PmAssignmentType, type PmInspectionType } from '@/lib/pm-assignment';

export const PM_ASSIGNMENT_TIME_UNITS = ['minutes', 'hours', 'days', 'weeks', 'months', 'years'] as const;
export const PM_ASSIGNMENT_FREQUENCY_TYPES = ['time_day', 'meter'] as const;
export const PM_ASSIGNMENT_CONDITION_OPERATORS = ['>', '>=', '<', '<=', '=', '!=', 'outside_range'] as const;

export type PmAssignmentFrequencyType = (typeof PM_ASSIGNMENT_FREQUENCY_TYPES)[number];
export type PmAssignmentConditionOperator = (typeof PM_ASSIGNMENT_CONDITION_OPERATORS)[number];

export interface PmAssignmentTaskMaster {
  id: string;
  taskNumber: number;
  description: string;
  taskType: PmTaskType;
  isActive?: boolean;
}

export interface PmAssignmentAssetMeterOption {
  id: string;
  name: string;
  unit: string;
  currentValue: number;
  lastReadingAt?: string | null;
  isActive?: boolean;
}

export interface PmAssignmentConditionSourceOption {
  sourceType: 'component_condition' | 'iot_device';
  sourceId: string;
  label: string;
  metric: string;
  unit: string;
  currentValue: number | null;
}

export interface PmAssignmentTaskDraft {
  clientId: string;
  assignmentId?: string;
  assignmentId?: string;
  assignmentId?: string;
  pmTaskId: string;
  taskNumber: number;
  description: string;
  taskType: PmTaskType;
  frequencyType: PmAssignmentFrequencyType;
  frequencyUnit: string;
  value: string;
  pmType: PmAssignmentType;
  activityMode: PmActivityMode;
  inspectionType: PmInspectionType;
  assetMeterId: string;
  nextDueDate: string;
  estimatedMinutes: string;
  leadDays: string;
  conditionSourceType: '' | 'component_condition' | 'iot_device';
  conditionSourceId: string;
  conditionMetric: string;
  conditionOperator: PmAssignmentConditionOperator;
  conditionThreshold: string;
  conditionThresholdMax: string;
  conditionUnit: string;
  evaluationCadenceMinutes: string;
  isActive: boolean;
}

function wholeOrZero(value: string): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function finiteOrNull(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function pmAssignmentDraftFromMaster(master: PmAssignmentTaskMaster, clientId: string): PmAssignmentTaskDraft {
  return {
    clientId,
    pmTaskId: master.id,
    taskNumber: master.taskNumber,
    description: master.description,
    taskType: master.taskType,
    frequencyType: 'time_day',
    frequencyUnit: 'months',
    value: '1',
    pmType: 'tbm',
    activityMode: 'inspection',
    inspectionType: 'standstill',
    assetMeterId: '',
    nextDueDate: '',
    estimatedMinutes: '',
    leadDays: '0',
    conditionSourceType: '',
    conditionSourceId: '',
    conditionMetric: '',
    conditionOperator: '>=',
    conditionThreshold: '',
    conditionThresholdMax: '',
    conditionUnit: '',
    evaluationCadenceMinutes: '',
    isActive: true,
  };
}

export function pmAssignmentDraftFromApi(assignment: any, index = 0): PmAssignmentTaskDraft {
  const pmType = String(assignment.pmType || assignment.maintenanceMode || 'tbm') as PmAssignmentType;
  const subDay = pmType === 'tbm' && (assignment.frequencyUnit === 'minutes' || assignment.frequencyUnit === 'hours');
  const rawDue = assignment.nextDueDate ? String(assignment.nextDueDate) : '';
  const nextDueDate = rawDue ? rawDue.slice(0, subDay ? 16 : 10) : '';
  return {
    clientId: `${assignment.id || assignment.pmTaskId || 'assignment'}:edit:${index}`,
    assignmentId: assignment.id ? String(assignment.id) : undefined,
    pmTaskId: String(assignment.pmTaskId || assignment.pmTask?.id || ''),
    taskNumber: Number(assignment.pmTask?.taskNumber || 0),
    description: String(assignment.pmTask?.description || ''),
    taskType: String(assignment.pmTask?.taskType || 'mechanical') as PmTaskType,
    frequencyType: pmType === 'ubm' ? 'meter' : 'time_day',
    frequencyUnit: String(assignment.frequencyUnit || assignment.assetMeter?.unit || (pmType === 'tbm' ? 'months' : '')),
    value: assignment.frequencyInterval == null ? '' : String(assignment.frequencyInterval),
    pmType,
    activityMode: String(assignment.activityMode || 'inspection') as PmActivityMode,
    inspectionType: normalizePmInspectionType(assignment.equipmentState || assignment.inspectionType) || 'standstill',
    assetMeterId: String(assignment.assetMeterId || assignment.assetMeter?.id || ''),
    nextDueDate,
    estimatedMinutes: String(assignment.estimatedMinutes ?? 0),
    leadDays: String(assignment.leadDays ?? 0),
    conditionSourceType: (assignment.conditionSourceType || '') as PmAssignmentTaskDraft['conditionSourceType'],
    conditionSourceId: String(assignment.conditionSourceId || ''),
    conditionMetric: String(assignment.conditionMetric || ''),
    conditionOperator: (assignment.conditionOperator || '>=') as PmAssignmentConditionOperator,
    conditionThreshold: assignment.conditionThreshold == null ? '' : String(assignment.conditionThreshold),
    conditionThresholdMax: assignment.conditionThresholdMax == null ? '' : String(assignment.conditionThresholdMax),
    conditionUnit: String(assignment.conditionUnit || ''),
    evaluationCadenceMinutes: assignment.evaluationCadenceMinutes == null ? '' : String(assignment.evaluationCadenceMinutes),
    isActive: assignment.isActive !== false,
  };
}

export function clearPmAssignmentConditionBinding(task: PmAssignmentTaskDraft): PmAssignmentTaskDraft {
  if (task.pmType !== 'cbm') return task;
  return {
    ...task,
    conditionSourceType: '',
    conditionSourceId: '',
    conditionMetric: '',
    conditionThreshold: '',
    conditionThresholdMax: '',
    conditionUnit: '',
  };
}

export function totalPmAssignmentEstimatedMinutes(tasks: ReadonlyArray<Pick<PmAssignmentTaskDraft, 'estimatedMinutes'>>): number {
  return tasks.reduce((total, task) => {
    const parsed = Number(task.estimatedMinutes);
    return task.estimatedMinutes.trim() && Number.isInteger(parsed) && parsed >= 0 ? total + parsed : total;
  }, 0);
}

export function formatPmAssignmentEstimatedTime(minutes: number): string {
  if (minutes <= 0) return '0 min';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours} h ${remainder} min` : `${hours} h`;
}

export function validatePmAssignmentTaskDraft(task: PmAssignmentTaskDraft): string | null {
  const minutes = Number(task.estimatedMinutes || 0);
  const leads = Number(task.leadDays || 0);
  if (!Number.isInteger(minutes) || minutes < 0) return `Task #${task.taskNumber}: Est. Minutes must be a non-negative whole number`;
  if (!Number.isInteger(leads) || leads < 0) return `Task #${task.taskNumber}: Lead Days must be a non-negative whole number`;

  if (task.pmType === 'tbm') {
    const value = Number(task.value);
    if (!Number.isInteger(value) || value <= 0) return `Task #${task.taskNumber}: TBM Value must be a positive whole number`;
    if (!(PM_ASSIGNMENT_TIME_UNITS as readonly string[]).includes(task.frequencyUnit)) return `Task #${task.taskNumber}: TBM Frequency Unit is required`;
    if (!task.nextDueDate) return `Task #${task.taskNumber}: TBM Next Due Date is required`;
  }

  if (task.pmType === 'ubm') {
    const value = Number(task.value);
    if (!(value > 0)) return `Task #${task.taskNumber}: UBM Value must be greater than zero`;
    if (!task.assetMeterId) return `Task #${task.taskNumber}: UBM requires an asset meter`;
  }

  if (task.pmType === 'cbm') {
    const threshold = Number(task.conditionThreshold);
    if (!task.conditionSourceType || !task.conditionSourceId || !task.conditionMetric || !Number.isFinite(threshold)) {
      return `Task #${task.taskNumber}: CBM requires a condition source, metric and numeric threshold`;
    }
    if (task.conditionOperator === 'outside_range') {
      const upper = Number(task.conditionThresholdMax);
      if (!Number.isFinite(upper) || upper <= threshold) return `Task #${task.taskNumber}: CBM upper threshold must exceed the lower threshold`;
    }
  }

  return null;
}

export function pmAssignmentTaskPayload(task: PmAssignmentTaskDraft) {
  const subDay = task.pmType === 'tbm' && (task.frequencyUnit === 'minutes' || task.frequencyUnit === 'hours');
  return {
    pmTaskId: task.pmTaskId,
    pmType: task.pmType,
    activityMode: task.activityMode,
    inspectionType: task.inspectionType,
    frequencyType: task.frequencyType,
    value: task.pmType === 'tbm' || task.pmType === 'ubm' ? finiteOrNull(task.value) : null,
    unit: task.pmType === 'tbm' ? task.frequencyUnit : null,
    assetMeterId: task.pmType === 'ubm' ? (task.assetMeterId || null) : null,
    nextDueDate: task.pmType === 'tbm' ? (task.nextDueDate || null) : null,
    estimatedMinutes: wholeOrZero(task.estimatedMinutes),
    leadDays: subDay ? 0 : wholeOrZero(task.leadDays),
    conditionSourceType: task.pmType === 'cbm' ? (task.conditionSourceType || null) : null,
    conditionSourceId: task.pmType === 'cbm' ? (task.conditionSourceId || null) : null,
    conditionMetric: task.pmType === 'cbm' ? (task.conditionMetric || null) : null,
    conditionOperator: task.pmType === 'cbm' ? task.conditionOperator : null,
    conditionThreshold: task.pmType === 'cbm' ? finiteOrNull(task.conditionThreshold) : null,
    conditionThresholdMax: task.pmType === 'cbm' && task.conditionOperator === 'outside_range' ? finiteOrNull(task.conditionThresholdMax) : null,
    conditionUnit: task.pmType === 'cbm' ? (task.conditionUnit || null) : null,
    evaluationCadenceMinutes: task.pmType === 'cbm' ? finiteOrNull(task.evaluationCadenceMinutes) : null,
    isActive: task.isActive,
  };
}
