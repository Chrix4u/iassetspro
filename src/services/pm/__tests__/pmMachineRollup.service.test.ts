import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getPmMachineRollup } from '@/services/pm/pmMachineRollup.service';

const client = {
  asset: { findUnique: vi.fn() },
  componentRegistry: { findMany: vi.fn() },
  pmScheduleTask: { findMany: vi.fn(), update: vi.fn() },
  assetMeter: { findUnique: vi.fn() },
  meterReading: { findFirst: vi.fn() },
  componentConditionReading: { findFirst: vi.fn() },
  iotDevice: { findUnique: vi.fn() },
  workOrderTaskExecution: { findMany: vi.fn() },
};

function assignment(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pm-1', scheduleId: null, assetId: 'asset-1', componentId: null, assetMeterId: null,
    pmTaskId: 'task-1', pmType: 'tbm', activityMode: 'inspection', basis: 'calendar', sortOrder: 0,
    maintenanceMode: 'tbm', equipmentState: 'standstill', estimatedMinutes: 20, leadDays: 0,
    frequencyInterval: 30, frequencyUnit: 'days', meterName: null, nextDueReading: null,
    conditionSourceType: null, conditionSourceId: null, conditionMetric: null, conditionOperator: null,
    conditionThreshold: null, conditionThresholdMax: null, conditionUnit: null, evaluationCadenceMinutes: null,
    lastCompletedAt: null, lastEvaluatedAt: null, lastGeneratedAt: null, lastGeneratedCycleKey: null,
    nextDueDate: new Date('2026-10-27T00:00:00.000Z'), isActive: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'), updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    pmTask: { id: 'task-1', taskNumber: 101, description: 'Inspect bearing', taskType: 'mechanical' },
    assetMeter: null,
    component: null,
    ...overrides,
  } as any;
}

describe('PM machine roll-up', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.asset.findUnique.mockResolvedValue({ id: 'asset-1', name: 'Crusher 01', assetTag: 'CR-01', plantId: 'plant-1' });
    client.componentRegistry.findMany.mockResolvedValue([
      { id: 'drive', assetId: 'asset-1', parentId: null, name: 'Drive', componentCode: 'DRV', componentType: 'assembly' },
      { id: 'bearing', assetId: 'asset-1', parentId: 'drive', name: 'Bearing', componentCode: 'BRG', componentType: 'part' },
    ]);
    client.pmScheduleTask.findMany.mockResolvedValue([]);
    client.workOrderTaskExecution.findMany.mockResolvedValue([]);
  });

  it('rolls whole-machine and descendant PM into one machine view with technical paths', async () => {
    client.pmScheduleTask.findMany.mockResolvedValue([
      assignment(),
      assignment({ id: 'pm-2', componentId: 'bearing', nextDueDate: new Date('2026-11-02T00:00:00.000Z'), pmTask: { id: 'task-2', taskNumber: 102, description: 'Grease bearing', taskType: 'lubrication' } }),
    ]);

    const result = await getPmMachineRollup({ client: client as never, assetId: 'asset-1', now: new Date('2026-10-28T00:00:00.000Z'), planningWindowDays: 7 });

    expect(client.pmScheduleTask.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ assetId: 'asset-1', scheduleId: null, isActive: true }),
    }));
    expect(result.assignments).toHaveLength(2);
    expect(result.assignments[0]).toEqual(expect.objectContaining({ targetKind: 'machine', technicalPath: [] }));
    expect(result.assignments[1]).toEqual(expect.objectContaining({
      targetKind: 'component',
      technicalPath: [
        expect.objectContaining({ id: 'drive', componentCode: 'DRV' }),
        expect.objectContaining({ id: 'bearing', componentCode: 'BRG' }),
      ],
      technicalPathLabel: 'DRV › BRG',
    }));
  });

  it('classifies due and near-due work inside the requested planning window', async () => {
    client.pmScheduleTask.findMany.mockResolvedValue([
      assignment({ id: 'due', nextDueDate: new Date('2026-10-27T00:00:00.000Z') }),
      assignment({ id: 'near', nextDueDate: new Date('2026-11-02T00:00:00.000Z') }),
      assignment({ id: 'later', nextDueDate: new Date('2026-12-01T00:00:00.000Z') }),
    ]);

    const result = await getPmMachineRollup({ client: client as never, assetId: 'asset-1', now: new Date('2026-10-28T00:00:00.000Z'), planningWindowDays: 7 });

    expect(result.summary).toMatchObject({ total: 3, due: 1, nearDue: 1, later: 1 });
    expect(result.assignments.find((item) => item.id === 'due')?.dueStatus).toBe('due');
    expect(result.assignments.find((item) => item.id === 'near')?.dueStatus).toBe('near_due');
    expect(result.assignments.find((item) => item.id === 'later')?.dueStatus).toBe('not_due');
  });

  it('normalizes legacy stopped to Standstill while preserving Running as a separate execution state', async () => {
    client.pmScheduleTask.findMany.mockResolvedValue([
      assignment({ id: 'legacy', equipmentState: 'stopped' }),
      assignment({ id: 'running', equipmentState: 'running' }),
    ]);

    const result = await getPmMachineRollup({ client: client as never, assetId: 'asset-1', now: new Date('2026-10-28T00:00:00.000Z') });
    expect(result.assignments.find((item) => item.id === 'legacy')?.inspectionType).toBe('standstill');
    expect(result.assignments.find((item) => item.id === 'running')?.inspectionType).toBe('running');
  });

  it('keeps an already-materialized due cycle visible but removes it from bundle eligibility', async () => {
    client.pmScheduleTask.findMany.mockResolvedValue([assignment({ id: 'already-generated' })]);
    client.workOrderTaskExecution.findMany.mockResolvedValue([{ id: 'exec-1', workOrderId: 'wo-1', pmScheduleTaskId: 'already-generated', pmDueCycleKey: 'tbm:already-generated:2026-10-27T00:00:00.000Z', status: 'pending', workOrder: { status: 'draft' } }]);

    const result = await getPmMachineRollup({ client: client as never, assetId: 'asset-1', now: new Date('2026-10-28T00:00:00.000Z') });
    expect(result.assignments[0]).toEqual(expect.objectContaining({ dueStatus: 'due', isBundleEligible: false, blockingWorkOrderId: 'wo-1' }));
  });
});
