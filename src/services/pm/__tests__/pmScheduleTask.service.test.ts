import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  normalizePmScheduledTasks,
  syncPmScheduledTasks,
} from '@/services/pm/pmScheduleTask.service';

const stamp = new Date('2026-10-25T00:00:00Z');
const tx = {
  pmTask: { findMany: vi.fn() },
  meterReading: { findFirst: vi.fn() },
  componentConditionReading: { findFirst: vi.fn() },
  iotDevice: { findUnique: vi.fn() },
  pmScheduleTask: {
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
};

const master = (id: string, plantId = 'plant-1') => ({
  id,
  plantId,
  taskNumber: id === 'task-1' ? 1 : 2,
  description: `Master ${id}`,
  taskType: 'mechanical',
  isActive: true,
  createdById: 'user-1',
  createdAt: stamp,
  updatedAt: stamp,
});

const existingRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'scheduled-1',
  scheduleId: 'schedule-1',
  pmTaskId: 'task-1',
  sortOrder: 0,
  maintenanceMode: 'tbm',
  equipmentState: 'stopped',
  estimatedMinutes: 20,
  leadDays: 2,
  frequencyInterval: 30,
  frequencyUnit: 'days',
  meterName: null,
  nextDueReading: null,
  conditionSourceType: null,
  conditionSourceId: null,
  conditionMetric: null,
  conditionOperator: null,
  conditionThreshold: null,
  conditionThresholdMax: null,
  conditionUnit: null,
  evaluationCadenceMinutes: null,
  lastCompletedAt: new Date('2026-10-01T00:00:00Z'),
  nextDueDate: new Date('2026-10-31T00:00:00Z'),
  isActive: true,
  createdAt: stamp,
  updatedAt: stamp,
  ...overrides,
});

const baseTbm = (overrides: Record<string, unknown> = {}) => ({
  pmTaskId: 'task-1',
  maintenanceMode: 'tbm',
  equipmentState: 'stopped',
  estimatedMinutes: 20,
  leadDays: 2,
  frequencyInterval: 30,
  frequencyUnit: 'days',
  nextDueDate: '2026-10-31T00:00:00.000Z',
  ...overrides,
});

describe('pmScheduleTask.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tx.pmTask.findMany.mockResolvedValue([master('task-1')]);
    tx.pmScheduleTask.findMany.mockResolvedValue([]);
    tx.pmScheduleTask.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => existingRow({ id: `created-${data.pmTaskId}`, ...data }));
    tx.pmScheduleTask.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => existingRow(data));
    tx.pmScheduleTask.updateMany.mockResolvedValue({ count: 0 });
  });

  it('normalizes valid TBM planning with canonical calendar fields', () => {
    const result = normalizePmScheduledTasks([baseTbm()]);
    expect(result).toEqual({ ok: true, tasks: [expect.objectContaining({
      pmTaskId: 'task-1', maintenanceMode: 'tbm', equipmentState: 'stopped',
      estimatedMinutes: 20, leadDays: 2, frequencyInterval: 30, frequencyUnit: 'days',
      nextDueDate: new Date('2026-10-31T00:00:00.000Z'), isActive: true,
    })] });
  });

  it('rejects duplicate masters and invalid common planning values before database work', () => {
    expect(normalizePmScheduledTasks([baseTbm(), baseTbm()])).toEqual(expect.objectContaining({ ok: false }));
    expect(normalizePmScheduledTasks([baseTbm({ estimatedMinutes: -1 })])).toEqual(expect.objectContaining({ ok: false }));
    expect(normalizePmScheduledTasks([baseTbm({ leadDays: -1 })])).toEqual(expect.objectContaining({ ok: false }));
    expect(normalizePmScheduledTasks([baseTbm({ equipmentState: 'sometimes' })])).toEqual(expect.objectContaining({ ok: false }));
  });

  it('rejects a task-level plan with no active scheduled task', () => {
    expect(normalizePmScheduledTasks([baseTbm({ isActive: false })])).toEqual({
      ok: false,
      error: 'At least one active scheduled task is required',
    });
  });

  it('requires mode-specific UBM and CBM configuration', () => {
    expect(normalizePmScheduledTasks([baseTbm({ maintenanceMode: 'ubm', frequencyUnit: 'hours', nextDueDate: null })])).toEqual(expect.objectContaining({ ok: false }));
    expect(normalizePmScheduledTasks([baseTbm({
      maintenanceMode: 'cbm', frequencyInterval: null, frequencyUnit: null, nextDueDate: null,
      conditionSourceType: 'iot_device', conditionSourceId: 'iot-1', conditionMetric: 'Temperature',
      conditionOperator: 'outside_range', conditionThreshold: 60,
    })])).toEqual(expect.objectContaining({ ok: false }));
  });

  it('rejects Task Masters outside the selected schedule plant', async () => {
    tx.pmTask.findMany.mockResolvedValue([]);
    await expect(syncPmScheduledTasks(tx as never, {
      scheduleId: 'schedule-1', plantId: 'plant-1', assetId: 'asset-1', componentId: null,
      tasks: [baseTbm()],
    })).rejects.toThrow(/plant|active|unavailable/i);
    expect(tx.pmScheduleTask.create).not.toHaveBeenCalled();
  });

  it('resolves UBM from a real asset meter and derives next due reading when omitted', async () => {
    tx.meterReading.findFirst.mockResolvedValue({ id: 'reading-1', value: 1250, meterName: 'Operating Hours', unit: 'hours' });
    await syncPmScheduledTasks(tx as never, {
      scheduleId: 'schedule-1', plantId: 'plant-1', assetId: 'asset-1', componentId: null,
      tasks: [baseTbm({
        maintenanceMode: 'ubm', frequencyInterval: 500, frequencyUnit: 'hours', meterName: 'Operating Hours',
        nextDueDate: null, nextDueReading: null,
      })],
    });
    expect(tx.meterReading.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { assetId: 'asset-1', meterName: 'Operating Hours', unit: 'hours' },
    }));
    expect(tx.pmScheduleTask.create).toHaveBeenCalledWith({ data: expect.objectContaining({ nextDueReading: 1750 }) });
  });

  it('rejects UBM when the selected meter does not exist on the schedule asset', async () => {
    tx.meterReading.findFirst.mockResolvedValue(null);
    await expect(syncPmScheduledTasks(tx as never, {
      scheduleId: 'schedule-1', plantId: 'plant-1', assetId: 'asset-1', componentId: null,
      tasks: [baseTbm({ maintenanceMode: 'ubm', frequencyInterval: 500, frequencyUnit: 'hours', meterName: 'Operating Hours', nextDueDate: null })],
    })).rejects.toThrow(/meter.*asset/i);
  });

  it('validates component CBM against the selected target and canonicalizes the measurement unit', async () => {
    tx.componentConditionReading.findFirst.mockResolvedValue({ id: 'condition-1', value: 4.2, unit: 'mm/s' });
    await syncPmScheduledTasks(tx as never, {
      scheduleId: 'schedule-1', plantId: 'plant-1', assetId: 'asset-1', componentId: 'component-1',
      tasks: [baseTbm({
        maintenanceMode: 'cbm', frequencyInterval: null, frequencyUnit: null, nextDueDate: null,
        conditionSourceType: 'component_condition', conditionSourceId: 'component-1', conditionMetric: 'vibration',
        conditionOperator: '>=', conditionThreshold: 5,
      })],
    });
    expect(tx.componentConditionReading.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { componentId: 'component-1', parameterKey: 'vibration' },
    }));
    expect(tx.pmScheduleTask.create).toHaveBeenCalledWith({ data: expect.objectContaining({ conditionUnit: 'mm/s' }) });
  });

  it('validates whole-asset CBM IoT devices against asset and plant', async () => {
    tx.iotDevice.findUnique.mockResolvedValue({
      id: 'iot-1', assetId: 'asset-1', plantId: 'plant-1', parameter: 'Temperature', unit: '°C', isActive: true,
    });
    await syncPmScheduledTasks(tx as never, {
      scheduleId: 'schedule-1', plantId: 'plant-1', assetId: 'asset-1', componentId: null,
      tasks: [baseTbm({
        maintenanceMode: 'cbm', frequencyInterval: null, frequencyUnit: null, nextDueDate: null,
        conditionSourceType: 'iot_device', conditionSourceId: 'iot-1', conditionMetric: 'Temperature',
        conditionOperator: '>', conditionThreshold: 80,
      })],
    });
    expect(tx.pmScheduleTask.create).toHaveBeenCalledWith({ data: expect.objectContaining({ conditionUnit: '°C' }) });
  });

  it('updates an existing scheduled task in place and never resets lastCompletedAt', async () => {
    tx.pmScheduleTask.findMany.mockResolvedValue([existingRow()]);
    await syncPmScheduledTasks(tx as never, {
      scheduleId: 'schedule-1', plantId: 'plant-1', assetId: 'asset-1', componentId: null,
      tasks: [baseTbm({ id: 'scheduled-1', sortOrder: 4, estimatedMinutes: 35 })],
    });
    expect(tx.pmScheduleTask.update).toHaveBeenCalledWith({
      where: { id: 'scheduled-1' },
      data: expect.objectContaining({ sortOrder: 4, estimatedMinutes: 35 }),
    });
    expect(tx.pmScheduleTask.update.mock.calls[0][0].data).not.toHaveProperty('lastCompletedAt');
    expect(tx.pmScheduleTask.create).not.toHaveBeenCalled();
  });

  it('soft-deactivates omitted rows instead of deleting or replacing their identity', async () => {
    tx.pmScheduleTask.findMany.mockResolvedValue([existingRow(), existingRow({ id: 'scheduled-2', pmTaskId: 'task-2', sortOrder: 1 })]);
    await syncPmScheduledTasks(tx as never, {
      scheduleId: 'schedule-1', plantId: 'plant-1', assetId: 'asset-1', componentId: null,
      tasks: [baseTbm({ id: 'scheduled-1' })],
    });
    expect(tx.pmScheduleTask.updateMany).toHaveBeenCalledWith({
      where: { scheduleId: 'schedule-1', id: { in: ['scheduled-2'] } },
      data: { isActive: false },
    });
  });
});
