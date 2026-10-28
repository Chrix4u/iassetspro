import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPmAssignment, normalizePmAssignmentInput } from '@/services/pm/pmAssignment.service';

const tx = {
  asset: { findUnique: vi.fn() },
  componentRegistry: { findUnique: vi.fn() },
  pmTask: { findUnique: vi.fn() },
  assetMeter: { findUnique: vi.fn() },
  pmScheduleTask: { create: vi.fn() },
};

const base = {
  assetId: 'asset-1', pmTaskId: 'task-1', pmType: 'tbm', activityMode: 'inspection',
  inspectionType: 'standstill', basis: 'calendar', value: 30, unit: 'days',
  nextDueDate: '2026-11-26', estimatedMinutes: 20, leadDays: 2,
};

describe('direct PM assignment service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tx.asset.findUnique.mockResolvedValue({ id: 'asset-1', plantId: 'plant-1' });
    tx.componentRegistry.findUnique.mockResolvedValue({ id: 'component-1', assetId: 'asset-1' });
    tx.pmTask.findUnique.mockResolvedValue({ id: 'task-1', plantId: 'plant-1', isActive: true });
    tx.assetMeter.findUnique.mockResolvedValue({ id: 'meter-1', assetId: 'asset-1', name: 'Running Hours', unit: 'h', currentValue: 3240, isActive: true });
    tx.pmScheduleTask.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'assignment-1', ...data }));
  });

  it('normalizes legacy stopped as Standstill and accepts all meeting PM types', () => {
    expect(normalizePmAssignmentInput({ ...base, inspectionType: 'stopped' })).toEqual(expect.objectContaining({ ok: true, value: expect.objectContaining({ inspectionType: 'standstill' }) }));
    for (const pmType of ['tbm', 'ubm', 'cbm', 'fbm']) {
      const candidate = pmType === 'ubm'
        ? { ...base, pmType, basis: 'meter', assetMeterId: 'meter-1', nextDueDate: null }
        : pmType === 'tbm'
          ? { ...base, pmType }
          : { ...base, pmType, basis: null, value: null, unit: null, nextDueDate: null };
      expect(normalizePmAssignmentInput(candidate).ok, pmType).toBe(true);
    }
  });

  it('creates a whole-machine TBM assignment without a schedule container', async () => {
    await createPmAssignment(tx as never, { plantId: 'plant-1', actorId: 'planner-1', input: base });
    expect(tx.pmScheduleTask.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      scheduleId: null, assetId: 'asset-1', componentId: null, pmTaskId: 'task-1',
      pmType: 'tbm', maintenanceMode: 'tbm', activityMode: 'inspection', equipmentState: 'standstill',
      basis: 'calendar', frequencyInterval: 30, frequencyUnit: 'days',
    }) });
  });

  it('creates an exact component-targeted assignment only when component belongs to machine', async () => {
    await createPmAssignment(tx as never, { plantId: 'plant-1', actorId: 'planner-1', input: { ...base, componentId: 'component-1' } });
    expect(tx.pmScheduleTask.create).toHaveBeenCalledWith({ data: expect.objectContaining({ componentId: 'component-1' }) });

    tx.componentRegistry.findUnique.mockResolvedValueOnce({ id: 'component-x', assetId: 'asset-other' });
    await expect(createPmAssignment(tx as never, { plantId: 'plant-1', actorId: 'planner-1', input: { ...base, componentId: 'component-x' } }))
      .rejects.toThrow(/component.*asset|machine/i);
  });

  it('derives UBM meter name, unit and next threshold from the assigned asset meter', async () => {
    await createPmAssignment(tx as never, {
      plantId: 'plant-1', actorId: 'planner-1',
      input: { ...base, pmType: 'ubm', basis: 'meter', assetMeterId: 'meter-1', value: 500, unit: null, nextDueDate: null },
    });
    expect(tx.pmScheduleTask.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      assetMeterId: 'meter-1', maintenanceMode: 'ubm', basis: 'meter', meterName: 'Running Hours',
      frequencyUnit: 'h', frequencyInterval: 500, nextDueReading: 3740,
    }) });
  });

  it('rejects a meter assigned to another machine', async () => {
    tx.assetMeter.findUnique.mockResolvedValueOnce({ id: 'meter-x', assetId: 'asset-other', name: 'Hours', unit: 'h', currentValue: 100, isActive: true });
    await expect(createPmAssignment(tx as never, {
      plantId: 'plant-1', actorId: 'planner-1',
      input: { ...base, pmType: 'ubm', basis: 'meter', assetMeterId: 'meter-x', value: 100, unit: null, nextDueDate: null },
    })).rejects.toThrow(/meter.*asset|machine/i);
  });
});
