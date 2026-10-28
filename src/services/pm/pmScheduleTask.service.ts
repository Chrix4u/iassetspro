import type { Prisma } from '@prisma/client';

export const PM_MAINTENANCE_MODES = ['tbm', 'ubm', 'cbm'] as const;
export const PM_EQUIPMENT_STATES = ['running', 'stopped'] as const;
export const PM_SCHEDULE_TASK_TIME_UNITS = ['minutes', 'hours', 'days', 'weeks', 'months', 'years'] as const;
export const PM_CONDITION_OPERATORS = ['>', '>=', '<', '<=', '=', '!=', 'outside_range'] as const;
export const PM_CONDITION_SOURCE_TYPES = ['component_condition', 'iot_device'] as const;

export type PmMaintenanceMode = (typeof PM_MAINTENANCE_MODES)[number];
export type PmEquipmentState = (typeof PM_EQUIPMENT_STATES)[number];
export type PmScheduleTaskTimeUnit = (typeof PM_SCHEDULE_TASK_TIME_UNITS)[number];
export type PmConditionOperator = (typeof PM_CONDITION_OPERATORS)[number];
export type PmConditionSourceType = (typeof PM_CONDITION_SOURCE_TYPES)[number];

export class PmScheduleTaskValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PmScheduleTaskValidationError';
  }
}

export interface PmScheduledTaskInput {
  id?: unknown;
  pmTaskId?: unknown;
  sortOrder?: unknown;
  maintenanceMode?: unknown;
  equipmentState?: unknown;
  estimatedMinutes?: unknown;
  leadDays?: unknown;
  frequencyInterval?: unknown;
  frequencyUnit?: unknown;
  meterName?: unknown;
  nextDueReading?: unknown;
  conditionSourceType?: unknown;
  conditionSourceId?: unknown;
  conditionMetric?: unknown;
  conditionOperator?: unknown;
  conditionThreshold?: unknown;
  conditionThresholdMax?: unknown;
  conditionUnit?: unknown;
  evaluationCadenceMinutes?: unknown;
  nextDueDate?: unknown;
  isActive?: unknown;
}

export interface NormalizedPmScheduledTask {
  id: string | null;
  pmTaskId: string;
  sortOrder: number;
  maintenanceMode: PmMaintenanceMode;
  equipmentState: PmEquipmentState;
  estimatedMinutes: number;
  leadDays: number;
  frequencyInterval: number | null;
  frequencyUnit: string | null;
  meterName: string | null;
  nextDueReading: number | null;
  conditionSourceType: PmConditionSourceType | null;
  conditionSourceId: string | null;
  conditionMetric: string | null;
  conditionOperator: PmConditionOperator | null;
  conditionThreshold: number | null;
  conditionThresholdMax: number | null;
  conditionUnit: string | null;
  evaluationCadenceMinutes: number | null;
  nextDueDate: Date | null;
  isActive: boolean;
}

export type NormalizePmScheduledTasksResult =
  | { ok: true; tasks: NormalizedPmScheduledTask[] }
  | { ok: false; error: string };

type PmScheduleTaskClient = Pick<
  Prisma.TransactionClient,
  'pmTask' | 'meterReading' | 'componentConditionReading' | 'iotDevice' | 'pmScheduleTask'
>;

function optionalText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function normalizedInteger(value: unknown, fallback: number): number | null {
  if (value === undefined || value === null || value === '') return fallback;
  const numeric = Number(value);
  return Number.isInteger(numeric) ? numeric : null;
}

function optionalFiniteNumber(value: unknown): number | null | undefined {
  if (value === undefined || value === null || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function normalizedDate(value: unknown): Date | null | undefined {
  if (value === undefined || value === null || value === '') return null;
  const date = value instanceof Date ? new Date(value) : new Date(String(value));
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function error(taskNumber: number, message: string): NormalizePmScheduledTasksResult {
  return { ok: false, error: `Scheduled task ${taskNumber} ${message}` };
}

export function normalizePmScheduledTasks(input: unknown): NormalizePmScheduledTasksResult {
  if (!Array.isArray(input)) return { ok: false, error: 'Scheduled tasks must be an array' };
  if (input.length === 0) return { ok: false, error: 'At least one scheduled task is required' };

  const seenTaskIds = new Set<string>();
  const tasks: NormalizedPmScheduledTask[] = [];

  for (const [index, raw] of input.entries()) {
    const number = index + 1;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return error(number, 'is invalid');
    const candidate = raw as PmScheduledTaskInput;
    const id = optionalText(candidate.id);
    const pmTaskId = optionalText(candidate.pmTaskId);
    if (!pmTaskId) return error(number, 'requires a Task Library record');
    if (seenTaskIds.has(pmTaskId)) return error(number, 'duplicates a Task Library record already in this schedule');
    seenTaskIds.add(pmTaskId);

    const mode = optionalText(candidate.maintenanceMode)?.toLowerCase();
    if (!PM_MAINTENANCE_MODES.includes(mode as PmMaintenanceMode)) return error(number, 'has an invalid maintenance mode');
    const equipmentState = optionalText(candidate.equipmentState)?.toLowerCase();
    if (!PM_EQUIPMENT_STATES.includes(equipmentState as PmEquipmentState)) return error(number, 'has an invalid equipment state');

    const estimatedMinutes = normalizedInteger(candidate.estimatedMinutes, 0);
    if (estimatedMinutes === null || estimatedMinutes < 0) return error(number, 'estimated minutes must be a non-negative whole number');
    const leadDays = normalizedInteger(candidate.leadDays, 0);
    if (leadDays === null || leadDays < 0) return error(number, 'lead days must be a non-negative whole number');
    const sortOrder = normalizedInteger(candidate.sortOrder, index);
    if (sortOrder === null || sortOrder < 0) return error(number, 'sort order must be a non-negative whole number');

    const isActive = candidate.isActive !== false;
    const rawInterval = optionalFiniteNumber(candidate.frequencyInterval);
    if (rawInterval === undefined) return error(number, 'frequency interval must be numeric');
    const frequencyInterval = rawInterval;
    const frequencyUnit = optionalText(candidate.frequencyUnit);
    const isSubDayTbm = mode === 'tbm' && (frequencyUnit === 'minutes' || frequencyUnit === 'hours');
    const effectiveLeadDays = isSubDayTbm ? 0 : leadDays;
    const meterName = optionalText(candidate.meterName);
    const rawNextDueReading = optionalFiniteNumber(candidate.nextDueReading);
    if (rawNextDueReading === undefined) return error(number, 'next due reading must be numeric');
    const nextDueReading = rawNextDueReading;
    const conditionSourceType = optionalText(candidate.conditionSourceType)?.toLowerCase() || null;
    const conditionSourceId = optionalText(candidate.conditionSourceId);
    const conditionMetric = optionalText(candidate.conditionMetric);
    const conditionOperator = optionalText(candidate.conditionOperator)?.toLowerCase() || null;
    const rawThreshold = optionalFiniteNumber(candidate.conditionThreshold);
    if (rawThreshold === undefined) return error(number, 'condition threshold must be numeric');
    const conditionThreshold = rawThreshold;
    const rawThresholdMax = optionalFiniteNumber(candidate.conditionThresholdMax);
    if (rawThresholdMax === undefined) return error(number, 'condition upper threshold must be numeric');
    const conditionThresholdMax = rawThresholdMax;
    const conditionUnit = optionalText(candidate.conditionUnit);
    const evaluationCadenceMinutes = normalizedInteger(candidate.evaluationCadenceMinutes, 0);
    if (evaluationCadenceMinutes === null || evaluationCadenceMinutes < 0) return error(number, 'evaluation cadence must be a non-negative whole number');
    const rawNextDueDate = normalizedDate(candidate.nextDueDate);
    if (rawNextDueDate === undefined) return error(number, 'next due date must be a valid date');
    const nextDueDate = rawNextDueDate;

    if (mode === 'tbm') {
      if (frequencyInterval === null || !Number.isInteger(frequencyInterval) || frequencyInterval <= 0) {
        return error(number, 'TBM interval must be a positive whole number');
      }
      if (!PM_SCHEDULE_TASK_TIME_UNITS.includes(frequencyUnit as PmScheduleTaskTimeUnit)) {
        return error(number, 'TBM unit must be minutes, hours, days, weeks, months, or years');
      }
      if (isActive && !nextDueDate) return error(number, 'TBM requires a next due date before activation');
    }

    if (mode === 'ubm') {
      if (frequencyInterval === null || frequencyInterval <= 0) return error(number, 'UBM interval must be greater than zero');
      if (!meterName || !frequencyUnit) return error(number, 'UBM requires a meter source and unit');
    }

    if (mode === 'cbm') {
      if (!PM_CONDITION_SOURCE_TYPES.includes(conditionSourceType as PmConditionSourceType)) {
        return error(number, 'CBM requires a valid condition source');
      }
      if (!conditionSourceId || !conditionMetric) return error(number, 'CBM requires a condition source and metric');
      if (!PM_CONDITION_OPERATORS.includes(conditionOperator as PmConditionOperator)) {
        return error(number, 'CBM requires a valid condition operator');
      }
      if (conditionThreshold === null) return error(number, 'CBM requires a condition threshold');
      if (conditionOperator === 'outside_range') {
        if (conditionThresholdMax === null || conditionThresholdMax <= conditionThreshold) {
          return error(number, 'outside-range CBM requires an upper threshold greater than the lower threshold');
        }
      }
    }

    tasks.push({
      id,
      pmTaskId,
      sortOrder,
      maintenanceMode: mode as PmMaintenanceMode,
      equipmentState: equipmentState as PmEquipmentState,
      estimatedMinutes,
      leadDays: effectiveLeadDays,
      frequencyInterval: mode === 'cbm' ? null : frequencyInterval,
      frequencyUnit: mode === 'cbm' ? null : frequencyUnit,
      meterName: mode === 'ubm' ? meterName : null,
      nextDueReading: mode === 'ubm' ? nextDueReading : null,
      conditionSourceType: mode === 'cbm' ? conditionSourceType as PmConditionSourceType : null,
      conditionSourceId: mode === 'cbm' ? conditionSourceId : null,
      conditionMetric: mode === 'cbm' ? conditionMetric : null,
      conditionOperator: mode === 'cbm' ? conditionOperator as PmConditionOperator : null,
      conditionThreshold: mode === 'cbm' ? conditionThreshold : null,
      conditionThresholdMax: mode === 'cbm' && conditionOperator === 'outside_range' ? conditionThresholdMax : null,
      conditionUnit: mode === 'cbm' ? conditionUnit : null,
      evaluationCadenceMinutes: mode === 'cbm' && evaluationCadenceMinutes > 0 ? evaluationCadenceMinutes : null,
      nextDueDate: mode === 'tbm' ? nextDueDate : null,
      isActive,
    });
  }

  if (!tasks.some((task) => task.isActive)) {
    return { ok: false, error: 'At least one active scheduled task is required' };
  }

  return { ok: true, tasks };
}

interface SyncPmScheduledTasksInput {
  scheduleId: string;
  plantId: string;
  assetId: string;
  componentId: string | null;
  tasks: unknown;
}

function persistedPlanningData(task: NormalizedPmScheduledTask) {
  return {
    pmTaskId: task.pmTaskId,
    sortOrder: task.sortOrder,
    maintenanceMode: task.maintenanceMode,
    equipmentState: task.equipmentState,
    estimatedMinutes: task.estimatedMinutes,
    leadDays: task.leadDays,
    frequencyInterval: task.frequencyInterval,
    frequencyUnit: task.frequencyUnit,
    meterName: task.meterName,
    nextDueReading: task.nextDueReading,
    conditionSourceType: task.conditionSourceType,
    conditionSourceId: task.conditionSourceId,
    conditionMetric: task.conditionMetric,
    conditionOperator: task.conditionOperator,
    conditionThreshold: task.conditionThreshold,
    conditionThresholdMax: task.conditionThresholdMax,
    conditionUnit: task.conditionUnit,
    evaluationCadenceMinutes: task.evaluationCadenceMinutes,
    nextDueDate: task.nextDueDate,
    isActive: task.isActive,
  };
}

export async function syncPmScheduledTasks(
  tx: PmScheduleTaskClient,
  input: SyncPmScheduledTasksInput,
) {
  const normalized = normalizePmScheduledTasks(input.tasks);
  if (!normalized.ok) throw new PmScheduleTaskValidationError(normalized.error);

  const taskIds = normalized.tasks.map((task) => task.pmTaskId);
  const masters = await tx.pmTask.findMany({
    where: { id: { in: taskIds }, plantId: input.plantId, isActive: true },
    select: { id: true, plantId: true, taskNumber: true, description: true, taskType: true, isActive: true },
  });
  const masterIds = new Set(masters.map((task) => task.id));
  if (masterIds.size !== taskIds.length || taskIds.some((id) => !masterIds.has(id))) {
    throw new PmScheduleTaskValidationError('Every scheduled Task Library record must be active and belong to the schedule plant');
  }

  const existingRows = await tx.pmScheduleTask.findMany({
    where: { scheduleId: input.scheduleId },
  });
  const byId = new Map(existingRows.map((row) => [row.id, row]));
  const byTaskId = new Map(existingRows.map((row) => [row.pmTaskId, row]));
  const keptIds = new Set<string>();

  for (const task of normalized.tasks) {
    const existingById = task.id ? byId.get(task.id) : undefined;
    if (task.id && (!existingById || existingById.pmTaskId !== task.pmTaskId)) {
      throw new PmScheduleTaskValidationError('Scheduled task identity does not belong to this schedule or Task Master');
    }
    const existing = existingById || byTaskId.get(task.pmTaskId);

    if (task.maintenanceMode === 'ubm') {
      const reading = await tx.meterReading.findFirst({
        where: { assetId: input.assetId, meterName: task.meterName!, unit: task.frequencyUnit! },
        orderBy: [{ readingDate: 'desc' }, { createdAt: 'desc' }],
        select: { id: true, value: true, meterName: true, unit: true },
      });
      if (!reading) throw new PmScheduleTaskValidationError('Selected UBM meter does not exist on the schedule asset');
      if (task.nextDueReading === null) {
        const preserved = existing?.maintenanceMode === 'ubm'
          && existing.meterName === task.meterName
          && existing.frequencyUnit === task.frequencyUnit
          && existing.frequencyInterval === task.frequencyInterval
          && existing.nextDueReading !== null
          ? Number(existing.nextDueReading)
          : null;
        task.nextDueReading = preserved ?? (Number(reading.value) + Number(task.frequencyInterval));
      }
    }

    if (task.maintenanceMode === 'cbm') {
      if (task.conditionSourceType === 'component_condition') {
        if (!input.componentId || task.conditionSourceId !== input.componentId) {
          throw new PmScheduleTaskValidationError('Component CBM source must belong to the selected schedule target');
        }
        const reading = await tx.componentConditionReading.findFirst({
          where: { componentId: input.componentId, parameterKey: task.conditionMetric! },
          orderBy: { recordedAt: 'desc' },
          select: { id: true, value: true, unit: true },
        });
        if (!reading) throw new PmScheduleTaskValidationError('Selected component condition source has no reading for this schedule target');
        task.conditionUnit = reading.unit;
      } else {
        if (input.componentId) {
          throw new PmScheduleTaskValidationError('Component-targeted CBM must use a condition reading from the selected component');
        }
        const device = await tx.iotDevice.findUnique({
          where: { id: task.conditionSourceId! },
          select: { id: true, assetId: true, plantId: true, parameter: true, unit: true, isActive: true },
        });
        if (!device || !device.isActive || device.assetId !== input.assetId || (device.plantId && device.plantId !== input.plantId)) {
          throw new PmScheduleTaskValidationError('Selected IoT condition source must be active on the schedule asset and plant');
        }
        task.conditionMetric = device.parameter;
        task.conditionUnit = device.unit;
      }
    }

    const data = {
      ...persistedPlanningData(task),
      assetId: input.assetId,
      componentId: input.componentId,
      pmType: task.maintenanceMode,
      activityMode: 'inspection',
      basis: task.maintenanceMode === 'ubm' ? 'meter' : task.maintenanceMode === 'tbm' ? 'calendar' : null,
    };
    if (existing) {
      keptIds.add(existing.id);
      await tx.pmScheduleTask.update({ where: { id: existing.id }, data });
    } else {
      const created = await tx.pmScheduleTask.create({
        data: { scheduleId: input.scheduleId, ...data },
      });
      keptIds.add(created.id);
    }
  }

  const omittedIds = existingRows.map((row) => row.id).filter((id) => !keptIds.has(id));
  if (omittedIds.length > 0) {
    await tx.pmScheduleTask.updateMany({
      where: { scheduleId: input.scheduleId, id: { in: omittedIds } },
      data: { isActive: false },
    });
  }

  return tx.pmScheduleTask.findMany({
    where: { scheduleId: input.scheduleId, isActive: true },
    include: { pmTask: true },
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
  });
}
