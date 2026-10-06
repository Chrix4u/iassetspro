import { db } from '@/lib/db';

export const VALID_PM_TRIGGER_TYPES = ['time', 'meter', 'condition', 'production_count'] as const;
export type PmTriggerType = (typeof VALID_PM_TRIGGER_TYPES)[number];

export interface TriggerScheduleTarget {
  id: string;
  assetId: string;
  componentId: string | null;
  frequencyType: string;
  asset: { plantId: string };
}

export interface OpenRuntimeGeneratedWorkOrder {
  id: string;
  woNumber: string;
  status: string;
}

export function parsePmTriggerConfig(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export async function findOpenRuntimeGeneratedWorkOrder(
  triggerConfig: Record<string, unknown>,
  scheduleId: string,
): Promise<OpenRuntimeGeneratedWorkOrder | null> {
  const workOrderId = text(triggerConfig.lastGeneratedWorkOrderId);
  if (!workOrderId) return null;

  const workOrder = await db.workOrder.findUnique({
    where: { id: workOrderId },
    select: { id: true, woNumber: true, status: true, pmScheduleId: true },
  });
  if (!workOrder || workOrder.pmScheduleId !== scheduleId || ['closed', 'cancelled'].includes(workOrder.status)) {
    return null;
  }
  return { id: workOrder.id, woNumber: workOrder.woNumber, status: workOrder.status };
}

export function validatePmTriggerConfigShape(triggerType: string, triggerConfig: unknown): string | null {
  const config = asObject(triggerConfig);
  if (!config) return `triggerConfig is required and must be an object for ${triggerType}`;

  if (triggerType === 'time') {
    return 'Time-based PM is controlled by the PM schedule cadence; use the schedule frequency instead of a second time trigger';
  }

  if (triggerType === 'meter') return null;

  if (triggerType === 'condition') {
    const validOperators = ['>', '<', '>=', '<=', '=', '==', '!='];
    if (!['component_condition', 'iot_device'].includes(text(config.sourceType))) {
      return 'condition trigger requires a valid condition source';
    }
    if (!validOperators.includes(text(config.operator))) {
      return `condition trigger requires a valid operator: one of ${validOperators.join(', ')}`;
    }
    if (typeof config.value !== 'number' || !Number.isFinite(config.value)) {
      return 'condition trigger requires a finite numeric value';
    }
    if (text(config.sourceType) === 'component_condition' && !text(config.metric)) {
      return 'component condition trigger requires a metric';
    }
    if (text(config.sourceType) === 'iot_device' && !text(config.deviceId)) {
      return 'IoT condition trigger requires a deviceId';
    }
    return null;
  }

  if (triggerType === 'production_count') {
    if (!['component_counter', 'work_center_output'].includes(text(config.sourceType))) {
      return 'production_count trigger requires a valid production source';
    }
    if (text(config.sourceType) === 'component_counter' && !text(config.counterId)) {
      return 'component production trigger requires a counterId';
    }
    if (text(config.sourceType) === 'work_center_output' && !text(config.workCenterId)) {
      return 'work-center production trigger requires a workCenterId';
    }
    return null;
  }

  return `Unknown triggerType: ${triggerType}`;
}

export async function normalizePmTriggerConfig(options: {
  triggerType: string;
  triggerValue: number;
  triggerConfig: unknown;
  schedule: TriggerScheduleTarget;
  existingConfig?: Record<string, unknown>;
}): Promise<{ config?: Record<string, unknown>; error?: string }> {
  const { triggerType, triggerValue, schedule } = options;
  const config = asObject(options.triggerConfig);
  const shapeError = validatePmTriggerConfigShape(triggerType, config);
  if (shapeError) return { error: shapeError };
  const input = config || {};
  const existing = options.existingConfig || {};

  if (triggerType === 'meter') {
    if (!schedule.componentId || !['meter_based', 'custom_hours'].includes(schedule.frequencyType)) {
      return { error: 'meter triggers require a component-targeted usage-based PM schedule' };
    }
    const component = await db.componentRegistry.findUnique({
      where: { id: schedule.componentId },
      select: { id: true, componentCode: true, name: true, operatingHours: true, assetId: true },
    });
    if (!component || component.assetId !== schedule.assetId) {
      return { error: 'PM component source is no longer valid for this schedule' };
    }
    const sameSource = existing.componentId === component.id && existing.source === 'component_operating_hours';
    const existingBaseline = Number(existing.baselineHours);
    return {
      config: {
        source: 'component_operating_hours',
        componentId: component.id,
        meterName: `${component.componentCode} operating hours`,
        threshold: triggerValue,
        baselineHours: sameSource && Number.isFinite(existingBaseline)
          ? existingBaseline
          : Number(component.operatingHours || 0),
        unit: 'hours',
      },
    };
  }

  if (triggerType === 'condition') {
    const operator = text(input.operator);
    const thresholdValue = Number(input.value);
    const sourceType = text(input.sourceType);

    if (sourceType === 'component_condition') {
      if (!schedule.componentId) return { error: 'This PM schedule has no component condition source' };
      const metric = text(input.metric);
      if (text(input.componentId) && text(input.componentId) !== schedule.componentId) {
        return { error: 'Component-targeted PM must use a condition reading from that component' };
      }
      const latest = await db.componentConditionReading.findFirst({
        where: { componentId: schedule.componentId, parameterKey: metric },
        orderBy: { recordedAt: 'desc' },
        select: { id: true, unit: true },
      });
      if (!latest) return { error: `No ${metric} condition reading exists for this component` };
      const sameSource = existing.sourceType === sourceType
        && existing.componentId === schedule.componentId
        && existing.metric === metric
        && existing.operator === operator
        && Number(existing.value) === thresholdValue;
      return {
        config: {
          sourceType,
          componentId: schedule.componentId,
          metric,
          unit: latest.unit,
          operator,
          value: thresholdValue,
          lastReadingId: sameSource ? (existing.lastReadingId ?? null) : null,
          lastConditionMatched: sameSource ? existing.lastConditionMatched === true : false,
        },
      };
    }

    if (schedule.componentId) {
      return { error: 'Component-targeted PM must use a condition reading from that component' };
    }
    const deviceId = text(input.deviceId);
    const device = await db.iotDevice.findUnique({
      where: { id: deviceId },
      select: { id: true, name: true, deviceCode: true, parameter: true, unit: true, assetId: true, plantId: true, isActive: true },
    });
    if (!device || !device.isActive || device.assetId !== schedule.assetId) {
      return { error: 'Selected IoT device is not active on the PM schedule asset' };
    }
    if (device.plantId && device.plantId !== schedule.asset.plantId) {
      return { error: 'Selected IoT device belongs to another plant' };
    }
    const sameSource = existing.sourceType === sourceType
      && existing.deviceId === device.id
      && existing.operator === operator
      && Number(existing.value) === thresholdValue;
    return {
      config: {
        sourceType,
        deviceId: device.id,
        sourceLabel: `${device.name} (${device.deviceCode})`,
        metric: device.parameter,
        unit: device.unit,
        operator,
        value: thresholdValue,
        lastReadingId: sameSource ? (existing.lastReadingId ?? null) : null,
        lastConditionMatched: sameSource ? existing.lastConditionMatched === true : false,
      },
    };
  }

  if (triggerType === 'production_count') {
    const sourceType = text(input.sourceType);
    if (sourceType === 'component_counter') {
      if (!schedule.componentId) return { error: 'This PM schedule has no component production counter source' };
      const counter = await db.componentRuntimeCounter.findUnique({
        where: { id: text(input.counterId) },
        select: { id: true, componentId: true, counterType: true, value: true, unit: true },
      });
      if (!counter || counter.componentId !== schedule.componentId || !['cycles', 'starts'].includes(counter.counterType)) {
        return { error: 'Selected component counter is not a valid production-count source for this schedule' };
      }
      if (text(input.componentId) && text(input.componentId) !== schedule.componentId) {
        return { error: 'Component-targeted PM must use a production counter from that component' };
      }
      const sameSource = existing.sourceType === sourceType && existing.counterId === counter.id;
      const existingBaseline = Number(existing.baselineCount);
      return {
        config: {
          sourceType,
          counterId: counter.id,
          componentId: counter.componentId,
          counterType: counter.counterType,
          sourceLabel: counter.counterType.replace(/_/g, ' '),
          unit: counter.unit,
          threshold: triggerValue,
          baselineCount: sameSource && Number.isFinite(existingBaseline)
            ? existingBaseline
            : Number(counter.value || 0),
        },
      };
    }

    if (schedule.componentId) {
      return { error: 'Component-targeted PM must use a production counter from that component' };
    }
    const workCenterId = text(input.workCenterId);
    const workCenter = await db.workCenter.findFirst({
      where: { id: workCenterId, isActive: true },
      select: { id: true, name: true, code: true },
    });
    if (!workCenter) return { error: 'Selected work center is not active' };
    const aggregate = await db.productionOrder.aggregate({
      where: {
        workCenterId,
        plantId: schedule.asset.plantId,
        status: { not: 'cancelled' },
      },
      _sum: { completedQty: true },
    });
    const total = Number(aggregate._sum.completedQty || 0);
    if (total <= 0) {
      return { error: 'Selected work center has no production history in the PM schedule plant' };
    }
    const sameSource = existing.sourceType === sourceType && existing.workCenterId === workCenter.id;
    const existingBaseline = Number(existing.baselineCount);
    return {
      config: {
        sourceType,
        workCenterId: workCenter.id,
        sourceLabel: `${workCenter.name} (${workCenter.code})`,
        unit: 'completed units',
        threshold: triggerValue,
        baselineCount: sameSource && Number.isFinite(existingBaseline)
          ? existingBaseline
          : total,
      },
    };
  }

  return { error: `Unknown triggerType: ${triggerType}` };
}
