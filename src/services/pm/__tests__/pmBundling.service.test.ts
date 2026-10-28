import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  liveLocation: vi.fn(),
  materialize: vi.fn(),
  blockers: vi.fn(),
}));

vi.mock('@/lib/functional-location/live-location', () => ({
  getAssetLiveLocationMap: mocks.liveLocation,
}));
vi.mock('@/services/pm/materializePmScheduledTasks.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/pm/materializePmScheduledTasks.service')>();
  return { ...actual, materializePmScheduledTasks: mocks.materialize };
});
vi.mock('@/services/pm/pmScheduledTaskCycleGuard.service', () => ({
  findBlockingPmScheduledTaskCycles: mocks.blockers,
}));

import { assertCompatiblePmBundle, buildPmBundleGroups, createPmAssignmentBundle } from '@/services/pm/pmBundling.service';

function item(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pm-1', assetId: 'asset-1', inspectionType: 'standstill',
    dueStatus: 'due', planningAt: '2026-10-28T00:00:00.000Z',
    technicalPathLabel: 'DRV › BRG', pmType: 'tbm', estimatedMinutes: 20,
    ...overrides,
  } as any;
}

function assignment(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pm-1', scheduleId: null, assetId: 'asset-1', componentId: 'bearing', assetMeterId: null,
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
    component: { id: 'bearing', assetId: 'asset-1', parentId: 'drive', name: 'Bearing', componentCode: 'BRG', componentType: 'part' },
    ...overrides,
  } as any;
}

describe('PM shutdown bundling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.liveLocation.mockResolvedValue(new Map());
    mocks.materialize.mockResolvedValue(1);
    mocks.blockers.mockResolvedValue([]);
  });

  it('bundles compatible Standstill work on one machine inside the planning window', () => {
    const groups = buildPmBundleGroups([
      item({ id: 'a', planningAt: '2026-10-28T00:00:00.000Z' }),
      item({ id: 'b', planningAt: '2026-11-02T00:00:00.000Z' }),
    ], 7);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toEqual(expect.objectContaining({
      assetId: 'asset-1', inspectionType: 'standstill', assignmentIds: ['a', 'b'], totalEstimatedMinutes: 40,
    }));
  });

  it('never mixes Running with Standstill and never crosses machine boundaries', () => {
    const groups = buildPmBundleGroups([
      item({ id: 'standstill-a' }),
      item({ id: 'running-a', inspectionType: 'running' }),
      item({ id: 'standstill-b', assetId: 'asset-2' }),
    ], 7);

    expect(groups).toHaveLength(3);
    expect(groups.map((group) => `${group.assetId}:${group.inspectionType}`).sort()).toEqual([
      'asset-1:running', 'asset-1:standstill', 'asset-2:standstill',
    ]);
  });

  it('splits otherwise-compatible work when planning windows are too far apart', () => {
    const groups = buildPmBundleGroups([
      item({ id: 'a', planningAt: '2026-10-28T00:00:00.000Z' }),
      item({ id: 'b', planningAt: '2026-11-20T00:00:00.000Z' }),
    ], 7);
    expect(groups).toHaveLength(2);
  });

  it('does not advertise an already-materialized due cycle as bundle-ready', () => {
    const groups = buildPmBundleGroups([
      item({ id: 'fresh', isBundleEligible: true }),
      item({ id: 'existing', isBundleEligible: false }),
    ], 7);
    expect(groups).toHaveLength(1);
    expect(groups[0].assignmentIds).toEqual(['fresh']);
  });

  it('rejects an explicit bundle that mixes machine or inspection state', () => {
    expect(() => assertCompatiblePmBundle([item({ id: 'a' }), item({ id: 'b', assetId: 'asset-2' })], 7)).toThrow(/same machine/i);
    expect(() => assertCompatiblePmBundle([item({ id: 'a' }), item({ id: 'b', inspectionType: 'running' })], 7)).toThrow(/Running.*Standstill|inspection/i);
  });

  it('creates a Standstill WO through canonical task materialization and exact component links', async () => {
    const row = assignment();
    const tx = {
      $executeRawUnsafe: vi.fn().mockResolvedValue(1),
      asset: { findUnique: vi.fn().mockResolvedValue({ id: 'asset-1', name: 'Crusher 01', assetTag: 'CR-01', plantId: 'plant-1', departmentId: 'dept-1' }) },
      componentRegistry: { findMany: vi.fn().mockResolvedValue([
        { id: 'drive', assetId: 'asset-1', parentId: null, name: 'Drive', componentCode: 'DRV', componentType: 'assembly' },
        { id: 'bearing', assetId: 'asset-1', parentId: 'drive', name: 'Bearing', componentCode: 'BRG', componentType: 'part' },
      ]) },
      pmScheduleTask: {
        findMany: vi.fn().mockResolvedValue([row]),
        update: vi.fn().mockResolvedValue({}),
      },
      assetMeter: { findUnique: vi.fn() }, meterReading: { findFirst: vi.fn() },
      componentConditionReading: { findFirst: vi.fn() }, iotDevice: { findUnique: vi.fn() },
      workOrderTaskExecution: { findMany: vi.fn().mockResolvedValue([]) },
      workOrder: {
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockImplementation(async ({ data }: any) => ({ id: 'wo-1', ...data })),
      },
      workOrderComponent: { upsert: vi.fn().mockResolvedValue({}) },
      workOrderComment: { create: vi.fn().mockResolvedValue({}) },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    };
    const client = { $transaction: vi.fn(async (fn: any) => fn(tx)) };

    const result = await createPmAssignmentBundle(client as never, {
      actorId: 'planner-1', assetId: 'asset-1', assignmentIds: ['pm-1'],
      now: new Date('2026-10-28T00:00:00.000Z'), planningWindowDays: 7,
    });

    expect(tx.workOrder.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      assetId: 'asset-1', type: 'preventive', status: 'waiting_shutdown', plannerId: 'planner-1',
    }) });
    expect(tx.workOrderComponent.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ workOrderId: 'wo-1', componentRegistryId: 'bearing' }),
    }));
    expect(mocks.materialize).toHaveBeenCalledWith(tx, 'wo-1', [expect.objectContaining({ task: expect.objectContaining({ id: 'pm-1' }) })]);
    expect(tx.pmScheduleTask.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'pm-1' }, data: expect.objectContaining({ lastGeneratedCycleKey: 'tbm:pm-1:2026-10-27T00:00:00.000Z' }),
    }));
    expect(result.workOrder).toEqual(expect.objectContaining({ id: 'wo-1' }));
  });
});
