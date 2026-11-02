import type { PmTaskType } from '@/lib/pm-task';

export const PM_SCHEDULE_TASK_MODES = ['tbm', 'ubm', 'cbm'] as const;
export const PM_SCHEDULE_TASK_EQUIPMENT_STATES = ['running', 'stopped'] as const;
export const PM_SCHEDULE_TASK_FREQUENCY_TYPES = ['time_day', 'meter'] as const;
export const PM_SCHEDULE_TASK_RECURRENCE_BASES = ['fixed_schedule', 'after_completion'] as const;
export const PM_SCHEDULE_TASK_TIME_UNITS = ['minutes', 'hours', 'days', 'weeks', 'months', 'years'] as const;
export const PM_SCHEDULE_TASK_CONDITION_OPERATORS = ['>', '>=', '<', '<=', '=', '!=', 'outside_range'] as const;

export type PmScheduleTaskMode = (typeof PM_SCHEDULE_TASK_MODES)[number];
export type PmScheduleTaskEquipmentState = (typeof PM_SCHEDULE_TASK_EQUIPMENT_STATES)[number];
export type PmScheduleTaskFrequencyType = (typeof PM_SCHEDULE_TASK_FREQUENCY_TYPES)[number];
export type PmScheduleTaskRecurrenceBasis = (typeof PM_SCHEDULE_TASK_RECURRENCE_BASES)[number];
export type PmScheduleTaskTimeUnit = (typeof PM_SCHEDULE_TASK_TIME_UNITS)[number];
export type PmScheduleTaskConditionOperator = (typeof PM_SCHEDULE_TASK_CONDITION_OPERATORS)[number];
export type PmScheduleTaskConditionSourceType = 'component_condition' | 'iot_device' | '';

export interface PmScheduleTaskMaster {
  id: string;
  taskNumber: number;
  description: string;
  taskType: PmTaskType;
  isActive?: boolean;
}

export interface PmScheduleTaskDraft {
  clientId: string;
  id: string | null;
  pmTaskId: string;
  taskNumber: number;
  description: string;
  taskType: PmTaskType;
  maintenanceMode: PmScheduleTaskMode;
  equipmentState: PmScheduleTaskEquipmentState;
  frequencyType: PmScheduleTaskFrequencyType;
  recurrenceBasis: PmScheduleTaskRecurrenceBasis;
  estimatedMinutes: string;
  leadDays: string;
  frequencyInterval: string;
  frequencyUnit: string;
  meterName: string;
  nextDueReading: string;
  nextDueDate: string;
  conditionSourceType: PmScheduleTaskConditionSourceType;
  conditionSourceId: string;
  conditionMetric: string;
  conditionOperator: PmScheduleTaskConditionOperator;
  conditionThreshold: string;
  conditionThresholdMax: string;
  conditionUnit: string;
  evaluationCadenceMinutes: string;
  isActive: boolean;
}

export interface PmScheduleMeterOption {
  meterName: string;
  unit: string;
  value: number;
  readingDate?: string | null;
}

export interface PmScheduleConditionSourceOption {
  sourceType: 'component_condition' | 'iot_device';
  sourceId: string;
  label: string;
  metric: string;
  unit: string;
  currentValue: number | null;
}

function isSubDayTimeUnit(value: unknown): boolean {
  return value === 'minutes' || value === 'hours';
}

function text(value: unknown): string {
  return value === undefined || value === null ? '' : String(value);
}

function dateOnly(value: unknown): string {
  if (!value) return '';
  const raw = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function dateTimeLocal(value: unknown): string {
  if (!value) return '';
  const raw = String(value);
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(raw) && !raw.endsWith('Z')) return raw.slice(0, 16);
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 16);
}

function absoluteDateTimeForServer(value: string): string | null {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toISOString();
  }
  return value;
}

function numberOrNull(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function wholeNumberOrZero(value: string): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
}

export function pmScheduleTaskDraftFromMaster(master: PmScheduleTaskMaster): PmScheduleTaskDraft {
  return {
    clientId: master.id,
    id: null,
    pmTaskId: master.id,
    taskNumber: master.taskNumber,
    description: master.description,
    taskType: master.taskType,
    maintenanceMode: 'tbm',
    equipmentState: 'stopped',
    frequencyType: 'time_day',
    recurrenceBasis: 'fixed_schedule',
    estimatedMinutes: '',
    leadDays: '0',
    frequencyInterval: '1',
    frequencyUnit: 'months',
    meterName: '',
    nextDueReading: '',
    nextDueDate: '',
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

export function pmScheduleTaskDraftFromApi(row: any): PmScheduleTaskDraft {
  const master = row?.pmTask || {};
  const frequencyUnit = text(row?.frequencyUnit);
  const usesSubDayTime = String(row?.maintenanceMode || 'tbm') === 'tbm' && ['minutes', 'hours'].includes(frequencyUnit);
  return {
    clientId: String(row?.id || row?.pmTaskId || master.id || ''),
    id: row?.id ? String(row.id) : null,
    pmTaskId: String(row?.pmTaskId || master.id || ''),
    taskNumber: Number(master.taskNumber || 0),
    description: String(master.description || ''),
    taskType: String(master.taskType || 'mechanical') as PmTaskType,
    maintenanceMode: String(row?.maintenanceMode || 'tbm') as PmScheduleTaskMode,
    equipmentState: String(row?.equipmentState || 'stopped') as PmScheduleTaskEquipmentState,
    frequencyType: String(row?.maintenanceMode || 'tbm') === 'ubm' ? 'meter' : 'time_day',
    recurrenceBasis: String(row?.maintenanceMode || 'tbm') === 'tbm' && row?.recurrenceBasis === 'fixed_schedule'
      ? 'fixed_schedule'
      : 'after_completion',
    estimatedMinutes: text(row?.estimatedMinutes),
    leadDays: usesSubDayTime ? '0' : text(row?.leadDays ?? 0),
    frequencyInterval: text(row?.frequencyInterval),
    frequencyUnit,
    meterName: text(row?.meterName),
    nextDueReading: text(row?.nextDueReading),
    nextDueDate: usesSubDayTime ? dateTimeLocal(row?.nextDueDate) : dateOnly(row?.nextDueDate),
    conditionSourceType: text(row?.conditionSourceType) as PmScheduleTaskConditionSourceType,
    conditionSourceId: text(row?.conditionSourceId),
    conditionMetric: text(row?.conditionMetric),
    conditionOperator: (text(row?.conditionOperator) || '>=') as PmScheduleTaskConditionOperator,
    conditionThreshold: text(row?.conditionThreshold),
    conditionThresholdMax: text(row?.conditionThresholdMax),
    conditionUnit: text(row?.conditionUnit),
    evaluationCadenceMinutes: text(row?.evaluationCadenceMinutes),
    isActive: row?.isActive !== false,
  };
}

export function pmScheduleTaskPayload(task: PmScheduleTaskDraft, sortOrder: number) {
  const common = {
    ...(task.id ? { id: task.id } : {}),
    pmTaskId: task.pmTaskId,
    sortOrder,
    maintenanceMode: task.maintenanceMode,
    equipmentState: task.equipmentState,
    estimatedMinutes: wholeNumberOrZero(task.estimatedMinutes),
    leadDays: task.maintenanceMode === 'tbm' && isSubDayTimeUnit(task.frequencyUnit) ? 0 : wholeNumberOrZero(task.leadDays),
    recurrenceBasis: task.maintenanceMode === 'tbm' ? task.recurrenceBasis : 'after_completion',
    frequencyInterval: task.maintenanceMode === 'cbm' ? null : numberOrNull(task.frequencyInterval),
    frequencyUnit: task.maintenanceMode === 'cbm' ? null : (task.frequencyUnit.trim() || null),
    meterName: task.maintenanceMode === 'ubm' ? (task.meterName.trim() || null) : null,
    // The server preserves the current threshold when source+interval are unchanged,
    // and recalculates it from the latest meter when planning changes.
    nextDueReading: null,
    nextDueDate: task.maintenanceMode === 'tbm' ? absoluteDateTimeForServer(task.nextDueDate) : null,
    conditionSourceType: task.maintenanceMode === 'cbm' ? (task.conditionSourceType || null) : null,
    conditionSourceId: task.maintenanceMode === 'cbm' ? (task.conditionSourceId || null) : null,
    conditionMetric: task.maintenanceMode === 'cbm' ? (task.conditionMetric || null) : null,
    conditionOperator: task.maintenanceMode === 'cbm' ? task.conditionOperator : null,
    conditionThreshold: task.maintenanceMode === 'cbm' ? numberOrNull(task.conditionThreshold) : null,
    conditionThresholdMax: task.maintenanceMode === 'cbm' && task.conditionOperator === 'outside_range'
      ? numberOrNull(task.conditionThresholdMax)
      : null,
    conditionUnit: task.maintenanceMode === 'cbm' ? (task.conditionUnit || null) : null,
    evaluationCadenceMinutes: task.maintenanceMode === 'cbm' ? numberOrNull(task.evaluationCadenceMinutes) : null,
    isActive: task.isActive,
  };
  return common;
}



export function totalPmScheduleEstimatedMinutes(tasks: ReadonlyArray<Pick<PmScheduleTaskDraft, 'estimatedMinutes'>>): number {
  return tasks.reduce((total, task) => {
    if (!task.estimatedMinutes.trim()) return total;
    const minutes = Number(task.estimatedMinutes);
    return Number.isInteger(minutes) && minutes >= 0 ? total + minutes : total;
  }, 0);
}

export function formatPmScheduleTaskPlanningSummary(task: PmScheduleTaskDraft): string {
  if (task.maintenanceMode === 'ubm') {
    const next = task.nextDueReading ? ` · next ${task.nextDueReading} ${task.frequencyUnit}` : '';
    return `Every ${task.frequencyInterval || '—'} ${task.frequencyUnit || 'units'} on ${task.meterName || 'selected meter'}${next}`;
  }
  if (task.maintenanceMode === 'cbm') {
    const metric = task.conditionMetric || 'condition';
    const unit = task.conditionUnit ? ` ${task.conditionUnit}` : '';
    if (task.conditionOperator === 'outside_range') {
      return `${metric} outside ${task.conditionThreshold || '—'}–${task.conditionThresholdMax || '—'}${unit}`;
    }
    return `${metric} ${task.conditionOperator} ${task.conditionThreshold || '—'}${unit}`;
  }
  const due = task.nextDueDate ? ` · due ${task.nextDueDate}` : '';
  return `Every ${task.frequencyInterval || '—'} ${task.frequencyUnit || 'days'}${due}`;
}
