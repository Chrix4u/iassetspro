import type { PmScheduleTask, Prisma } from '@prisma/client';
import type {
  PmConditionOperator,
  PmMaintenanceMode,
} from '@/services/pm/pmScheduleTask.service';

type ScheduledTaskDueClient = Pick<
  Prisma.TransactionClient,
  'meterReading' | 'componentConditionReading' | 'iotDevice' | 'pmScheduleTask'
>;

export interface ScheduledTaskDueInput {
  client: ScheduledTaskDueClient;
  task: PmScheduleTask;
  assetId: string;
  plantId: string;
  componentId: string | null;
  now?: Date;
}

export interface ScheduledTaskDueSource {
  type: 'meter' | 'component_condition' | 'iot_device';
  sourceId: string;
  metric: string;
  unit: string;
  value: number;
  observedAt: Date | null;
}

export interface ScheduledTaskDueResult {
  due: boolean;
  reason: string;
  maintenanceMode: PmMaintenanceMode;
  dueCycleKey: string | null;
  currentValue: number | null;
  source: ScheduledTaskDueSource | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function result(
  task: PmScheduleTask,
  due: boolean,
  reason: string,
  dueCycleKey: string | null,
  currentValue: number | null = null,
  source: ScheduledTaskDueSource | null = null,
): ScheduledTaskDueResult {
  return {
    due,
    reason,
    maintenanceMode: task.maintenanceMode as PmMaintenanceMode,
    dueCycleKey,
    currentValue,
    source,
  };
}

function finiteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function cbmCycleKey(task: PmScheduleTask): string {
  const anchor = task.lastCompletedAt?.toISOString() || 'initial';
  return `cbm:${task.id}:${anchor}`;
}

function conditionMatches(
  value: number,
  operator: PmConditionOperator,
  threshold: number,
  thresholdMax: number | null,
): boolean {
  switch (operator) {
    case '>': return value > threshold;
    case '>=': return value >= threshold;
    case '<': return value < threshold;
    case '<=': return value <= threshold;
    case '=': return value === threshold;
    case '!=': return value !== threshold;
    case 'outside_range': return thresholdMax !== null && (value < threshold || value > thresholdMax);
    default: return false;
  }
}

async function recordCbmEvaluation(
  input: ScheduledTaskDueInput,
  now: Date,
): Promise<void> {
  if (!input.task.evaluationCadenceMinutes || input.task.evaluationCadenceMinutes <= 0) return;
  await input.client.pmScheduleTask.update({
    where: { id: input.task.id },
    data: { lastEvaluatedAt: now },
  });
}

async function evaluateTbm(input: ScheduledTaskDueInput, now: Date): Promise<ScheduledTaskDueResult> {
  const { task } = input;
  if (!task.nextDueDate) return result(task, false, 'tbm_next_due_missing', null);

  const cycleKey = `tbm:${task.id}:${task.nextDueDate.toISOString()}`;
  const isSubDayTbm = task.frequencyUnit === 'minutes' || task.frequencyUnit === 'hours';
  const leadDays = isSubDayTbm ? 0 : Math.max(0, Number(task.leadDays) || 0);
  const dueAt = task.nextDueDate.getTime() - leadDays * DAY_MS;
  return result(task, now.getTime() >= dueAt, now.getTime() >= dueAt ? 'tbm_due' : 'tbm_not_due', cycleKey);
}

async function evaluateUbm(input: ScheduledTaskDueInput): Promise<ScheduledTaskDueResult> {
  const { task } = input;
  const threshold = finiteNumber(task.nextDueReading);
  if (!task.meterName || !task.frequencyUnit || threshold === null) {
    return result(task, false, 'ubm_plan_invalid', null);
  }

  const cycleKey = `ubm:${task.id}:${threshold}`;
  const reading = await input.client.meterReading.findFirst({
    where: { assetId: input.assetId, meterName: task.meterName, unit: task.frequencyUnit },
    orderBy: [{ readingDate: 'desc' }, { createdAt: 'desc' }],
    select: { id: true, value: true, meterName: true, unit: true, readingDate: true, createdAt: true },
  });
  const value = finiteNumber(reading?.value);
  if (!reading || value === null) return result(task, false, 'ubm_source_unavailable', cycleKey);

  const source: ScheduledTaskDueSource = {
    type: 'meter',
    sourceId: reading.id,
    metric: reading.meterName,
    unit: reading.unit,
    value,
    observedAt: reading.readingDate || reading.createdAt || null,
  };
  const due = value >= threshold;
  return result(task, due, due ? 'ubm_due' : 'ubm_not_due', cycleKey, value, source);
}

function cbmPlan(task: PmScheduleTask): {
  operator: PmConditionOperator;
  threshold: number;
  thresholdMax: number | null;
} | null {
  const threshold = finiteNumber(task.conditionThreshold);
  const thresholdMax = finiteNumber(task.conditionThresholdMax);
  const validOperators = new Set<PmConditionOperator>(['>', '>=', '<', '<=', '=', '!=', 'outside_range']);
  const operator = task.conditionOperator as PmConditionOperator | null;
  if (!operator || !validOperators.has(operator) || threshold === null) return null;
  if (operator === 'outside_range' && (thresholdMax === null || thresholdMax <= threshold)) return null;
  return { operator, threshold, thresholdMax };
}

async function evaluateCbm(input: ScheduledTaskDueInput, now: Date): Promise<ScheduledTaskDueResult> {
  const { task } = input;
  const cycleKey = cbmCycleKey(task);
  const cadenceMinutes = Number(task.evaluationCadenceMinutes || 0);
  if (
    cadenceMinutes > 0
    && task.lastEvaluatedAt
    && now.getTime() < task.lastEvaluatedAt.getTime() + cadenceMinutes * 60 * 1000
  ) {
    return result(task, false, 'cbm_cadence_pending', cycleKey);
  }

  const plan = cbmPlan(task);
  if (!plan || !task.conditionSourceType || !task.conditionSourceId || !task.conditionMetric || !task.conditionUnit) {
    return result(task, false, 'cbm_plan_invalid', cycleKey);
  }

  let source: ScheduledTaskDueSource | null = null;

  if (task.conditionSourceType === 'component_condition') {
    if (!input.componentId || task.conditionSourceId !== input.componentId) {
      return result(task, false, 'cbm_source_invalid', cycleKey);
    }
    const reading = await input.client.componentConditionReading.findFirst({
      where: { componentId: input.componentId, parameterKey: task.conditionMetric },
      orderBy: { recordedAt: 'desc' },
      select: { id: true, value: true, unit: true, recordedAt: true },
    });
    const value = finiteNumber(reading?.value);
    if (!reading || value === null) return result(task, false, 'cbm_source_unavailable', cycleKey);
    if (reading.unit !== task.conditionUnit) {
      return result(task, false, 'cbm_unit_mismatch', cycleKey, value);
    }
    source = {
      type: 'component_condition',
      sourceId: reading.id,
      metric: task.conditionMetric,
      unit: reading.unit,
      value,
      observedAt: reading.recordedAt,
    };
  } else if (task.conditionSourceType === 'iot_device') {
    if (input.componentId) return result(task, false, 'cbm_source_invalid', cycleKey);
    const device = await input.client.iotDevice.findUnique({
      where: { id: task.conditionSourceId },
      select: {
        id: true,
        assetId: true,
        plantId: true,
        parameter: true,
        unit: true,
        lastReading: true,
        lastSeen: true,
        isActive: true,
      },
    });
    const value = finiteNumber(device?.lastReading);
    if (
      !device
      || !device.isActive
      || device.assetId !== input.assetId
      || (device.plantId && device.plantId !== input.plantId)
      || device.parameter !== task.conditionMetric
    ) {
      return result(task, false, 'cbm_source_invalid', cycleKey);
    }
    if (device.unit !== task.conditionUnit) {
      return result(task, false, 'cbm_unit_mismatch', cycleKey, value);
    }
    if (value === null) return result(task, false, 'cbm_source_unavailable', cycleKey);
    source = {
      type: 'iot_device',
      sourceId: device.id,
      metric: device.parameter,
      unit: device.unit,
      value,
      observedAt: device.lastSeen,
    };
  } else {
    return result(task, false, 'cbm_source_invalid', cycleKey);
  }

  if (
    task.lastCompletedAt
    && (!source.observedAt || source.observedAt.getTime() <= task.lastCompletedAt.getTime())
  ) {
    return result(task, false, 'cbm_source_stale_since_completion', cycleKey, source.value, source);
  }

  await recordCbmEvaluation(input, now);
  const due = conditionMatches(source.value, plan.operator, plan.threshold, plan.thresholdMax);
  return result(task, due, due ? 'cbm_due' : 'cbm_condition_clear', cycleKey, source.value, source);
}

export async function evaluateScheduledTaskDue(input: ScheduledTaskDueInput): Promise<ScheduledTaskDueResult> {
  const now = input.now ? new Date(input.now) : new Date();
  if (!input.task.isActive) {
    return result(input.task, false, 'inactive', null);
  }

  switch (input.task.maintenanceMode) {
    case 'tbm': return evaluateTbm(input, now);
    case 'ubm': return evaluateUbm(input);
    case 'cbm': return evaluateCbm(input, now);
    default: return result(input.task, false, 'unsupported_mode', null);
  }
}
