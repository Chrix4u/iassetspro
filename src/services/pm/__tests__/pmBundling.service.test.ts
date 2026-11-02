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

import { assertCompatiblePmBundle, buildPmBundleGroups, createPmAssignmentBundle, generateDueDirectPmAssignmentWorkOrders, normalizePmPlannedStart } from '@/services/pm/pmBundling.service';

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

  it('normalizes request-latency drift to now but still rejects genuinely past maintenance dates', () => {
    const now = new Date('2026-10-30T18:00:00.000Z');
    expect(normalizePmPlannedStart(now, new Date('2026-10-30T17:59:59.500Z'), 7)).toEqual(now);
    expect(() => normalizePmPlannedStart(now, new Date('2026-10-30T17:55:00.000Z'), 7)).toThrow(/past/i);
    expect(() => normalizePmPlannedStart(now, new Date('2026-11-07T18:00:01.000Z'), 7)).toThrow(/planning window/i);
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

  it('includes near-due TBM work as a planned-early bundle candidate inside the planning window', () => {
    const groups = buildPmBundleGroups([
      item({ id: 'due-now', dueStatus: 'due', planningAt: '2026-10-28T00:00:00.000Z', isBundleEligible: true }),
      item({ id: 'due-friday', dueStatus: 'near_due', planningAt: '2026-10-30T00:00:00.000Z', isBundleEligible: true }),
    ], 7);

    expect(groups).toHaveLength(1);
    expect(groups[0].assignmentIds).toEqual(['due-now', 'due-friday']);
  });

  it('accepts an explicit bundle containing due and planned-early work inside the planning window', () => {
    expect(() => assertCompatiblePmBundle([
      item({ id: 'due-now', dueStatus: 'due', planningAt: '2026-10-28T00:00:00.000Z' }),
      item({ id: 'due-friday', dueStatus: 'near_due', planningAt: '2026-10-30T00:00:00.000Z' }),
    ], 7)).not.toThrow();
  });

  it('rejects an explicit bundle that mixes machine or inspection state', () => {
    expect(() => assertCompatiblePmBundle([item({ id: 'a' }), item({ id: 'b', assetId: 'asset-2' })], 7)).toThrow(/same machine/i);
    expect(() => assertCompatiblePmBundle([item({ id: 'a' }), item({ id: 'b', inspectionType: 'running' })], 7)).toThrow(/Running.*Standstill|inspection/i);
  });

  it('creates one Standstill WO for due and planned-early TBM work with original due provenance', async () => {
    const row = assignment();
    const plannedEarlyRow = assignment({
      id: 'pm-2',
      pmTaskId: 'task-2',
      nextDueDate: new Date('2026-11-02T00:00:00.000Z'),
      pmTask: { id: 'task-2', taskNumber: 102, description: 'Lubricate bearing', taskType: 'lubrication' },
    });
    const tx = {
      $executeRawUnsafe: vi.fn().mockResolvedValue(1),
      asset: { findUnique: vi.fn().mockResolvedValue({ id: 'asset-1', name: 'Crusher 01', assetTag: 'CR-01', plantId: 'plant-1', departmentId: 'dept-1' }) },
      componentRegistry: { findMany: vi.fn().mockResolvedValue([
        { id: 'drive', assetId: 'asset-1', parentId: null, name: 'Drive', componentCode: 'DRV', componentType: 'assembly' },
        { id: 'bearing', assetId: 'asset-1', parentId: 'drive', name: 'Bearing', componentCode: 'BRG', componentType: 'part' },
      ]) },
      pmScheduleTask: {
        findMany: vi.fn().mockResolvedValue([row, plannedEarlyRow]),
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

    mocks.materialize.mockResolvedValue(2);
    const result = await createPmAssignmentBundle(client as never, {
      actorId: 'planner-1', assetId: 'asset-1', assignmentIds: ['pm-1', 'pm-2'],
      now: new Date('2026-10-28T00:00:00.000Z'), planningWindowDays: 7,
      plannedExecutionAt: new Date('2026-11-01T08:00:00.000Z'),
    });

    expect(tx.workOrder.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      assetId: 'asset-1', type: 'preventive', status: 'waiting_shutdown', plannerId: 'planner-1',
      plannedStart: new Date('2026-11-01T08:00:00.000Z'),
    }) });
    expect(tx.workOrderComponent.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ workOrderId: 'wo-1', componentRegistryId: 'bearing' }),
    }));
    expect(mocks.materialize).toHaveBeenCalledWith(tx, 'wo-1', expect.arrayContaining([
      expect.objectContaining({
        task: expect.objectContaining({ id: 'pm-1' }),
        planningDisposition: 'due',
        plannedExecutionAt: new Date('2026-11-01T08:00:00.000Z'),
      }),
      expect.objectContaining({
        task: expect.objectContaining({ id: 'pm-2' }),
        due: expect.objectContaining({ due: false, reason: 'tbm_not_due' }),
        planningDisposition: 'planned_early',
        plannedExecutionAt: new Date('2026-11-01T08:00:00.000Z'),
      }),
    ]));
    expect(tx.pmScheduleTask.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'pm-1' }, data: expect.objectContaining({ lastGeneratedCycleKey: 'tbm:pm-1:2026-10-27T00:00:00.000Z' }),
    }));
    expect(tx.pmScheduleTask.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'pm-2' }, data: expect.objectContaining({ lastGeneratedCycleKey: 'tbm:pm-2:2026-11-02T00:00:00.000Z' }),
    }));
    const auditPayload = JSON.parse(tx.auditLog.create.mock.calls[0][0].data.newValues);
    expect(auditPayload).toMatchObject({
      plannedExecutionAt: '2026-11-01T08:00:00.000Z',
      planningDispositionByAssignment: expect.arrayContaining([
        expect.objectContaining({ pmAssignmentId: 'pm-1', disposition: 'due', originalDueDate: '2026-10-27T00:00:00.000Z' }),
        expect.objectContaining({ pmAssignmentId: 'pm-2', disposition: 'planned_early', originalDueDate: '2026-11-02T00:00:00.000Z' }),
      ]),
    });
    expect(result.workOrder).toEqual(expect.objectContaining({ id: 'wo-1' }));
  });

  it('auto-generates due direct PM assignments by machine and inspection type without pulling future work', async () => {
    const standstill = assignment({
      id: 'pm-standstill',
      equipmentState: 'standstill',
      nextDueDate: new Date('2026-10-31T20:00:00.000Z'),
    });
    const olderStandstill = assignment({
      id: 'pm-standstill-old',
      pmTaskId: 'task-standstill-old',
      equipmentState: 'standstill',
      nextDueDate: new Date('2026-10-01T20:00:00.000Z'),
      pmTask: { id: 'task-standstill-old', taskNumber: 100, description: 'Older standstill inspection', taskType: 'mechanical' },
    });
    const running = assignment({
      id: 'pm-running',
      pmTaskId: 'task-running',
      equipmentState: 'running',
      nextDueDate: new Date('2026-10-31T20:00:00.000Z'),
      pmTask: { id: 'task-running', taskNumber: 102, description: 'Inspect while running', taskType: 'mechanical' },
    });
    const future = assignment({
      id: 'pm-future',
      pmTaskId: 'task-future',
      equipmentState: 'standstill',
      leadDays: 0,
      nextDueDate: new Date('2026-12-01T20:00:00.000Z'),
      pmTask: { id: 'task-future', taskNumber: 103, description: 'Future inspection', taskType: 'mechanical' },
    });
    const rows = [olderStandstill, standstill, running, future];
    const tx = {
      $executeRawUnsafe: vi.fn().mockResolvedValue(1),
      asset: { findUnique: vi.fn().mockResolvedValue({ id: 'asset-1', name: 'Crusher 01', assetTag: 'CR-01', plantId: 'plant-1', departmentId: 'dept-1' }) },
      componentRegistry: { findMany: vi.fn().mockResolvedValue([
        { id: 'drive', assetId: 'asset-1', parentId: null, name: 'Drive', componentCode: 'DRV', componentType: 'assembly' },
        { id: 'bearing', assetId: 'asset-1', parentId: 'drive', name: 'Bearing', componentCode: 'BRG', componentType: 'part' },
      ]) },
      pmScheduleTask: {
        findMany: vi.fn().mockImplementation(async ({ where }: any) => {
          const ids = where?.id?.in as string[] | undefined;
          return ids ? rows.filter((row) => ids.includes(row.id)) : rows;
        }),
        update: vi.fn().mockResolvedValue({}),
      },
      assetMeter: { findUnique: vi.fn() }, meterReading: { findFirst: vi.fn() },
      componentConditionReading: { findFirst: vi.fn() }, iotDevice: { findUnique: vi.fn() },
      workOrderTaskExecution: { findMany: vi.fn().mockResolvedValue([]) },
      workOrder: {
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockImplementation(async ({ data }: any) => ({ id: `wo-${data.status}`, ...data })),
      },
      workOrderComponent: { upsert: vi.fn().mockResolvedValue({}) },
      workOrderComment: { create: vi.fn().mockResolvedValue({}) },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    };
    const rootFindMany = vi.fn().mockResolvedValue([{ assetId: 'asset-1' }]);
    const client = {
      pmScheduleTask: { findMany: rootFindMany },
      $transaction: vi.fn(async (fn: any) => fn(tx)),
    };

    const result = await generateDueDirectPmAssignmentWorkOrders(client as never, {
      actorId: 'automation-1',
      plantIds: ['plant-1'],
      now: new Date('2026-11-02T01:00:00.000Z'),
    });

    expect(rootFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        scheduleId: null,
        isActive: true,
        asset: { plantId: { in: ['plant-1'] } },
      }),
    }));
    expect(result.checked).toBe(4);
    expect(result.generated).toBe(3);
    expect(tx.workOrder.create).toHaveBeenCalledTimes(3);
    expect(tx.workOrder.create.mock.calls.map((call: any[]) => call[0].data.status).sort()).toEqual(['draft', 'waiting_shutdown', 'waiting_shutdown']);
    const materializedIds = mocks.materialize.mock.calls.flatMap((call) => call[2].map((candidate: any) => candidate.task.id)).sort();
    expect(materializedIds).toEqual(['pm-running', 'pm-standstill', 'pm-standstill-old']);
    expect(materializedIds).not.toContain('pm-future');
  });


  it('evaluates a due direct CBM assignment once before materialization so cadence cannot suppress its own generation', async () => {
    const cbm = assignment({
      id: 'pm-cbm',
      pmTaskId: 'task-cbm',
      pmType: 'cbm',
      maintenanceMode: 'cbm',
      basis: 'condition',
      equipmentState: 'running',
      nextDueDate: null,
      conditionSourceType: 'component_condition',
      conditionSourceId: 'bearing',
      conditionMetric: 'temperature',
      conditionOperator: '>=',
      conditionThreshold: 80,
      conditionThresholdMax: null,
      conditionUnit: 'C',
      evaluationCadenceMinutes: 5,
      lastEvaluatedAt: null,
      pmTask: { id: 'task-cbm', taskNumber: 104, description: 'Inspect hot bearing', taskType: 'mechanical' },
    });
    const tx = {
      $executeRawUnsafe: vi.fn().mockResolvedValue(1),
      asset: { findUnique: vi.fn().mockResolvedValue({ id: 'asset-1', name: 'Crusher 01', assetTag: 'CR-01', plantId: 'plant-1', departmentId: 'dept-1' }) },
      componentRegistry: { findMany: vi.fn().mockResolvedValue([
        { id: 'drive', assetId: 'asset-1', parentId: null, name: 'Drive', componentCode: 'DRV', componentType: 'assembly' },
        { id: 'bearing', assetId: 'asset-1', parentId: 'drive', name: 'Bearing', componentCode: 'BRG', componentType: 'part' },
      ]) },
      pmScheduleTask: {
        findMany: vi.fn().mockResolvedValue([cbm]),
        update: vi.fn().mockResolvedValue({}),
      },
      assetMeter: { findUnique: vi.fn() }, meterReading: { findFirst: vi.fn() },
      componentConditionReading: { findFirst: vi.fn().mockResolvedValue({ id: 'reading-1', value: 92, unit: 'C', recordedAt: new Date('2026-11-02T00:59:00.000Z') }) },
      iotDevice: { findUnique: vi.fn() },
      workOrderTaskExecution: { findMany: vi.fn().mockResolvedValue([]) },
      workOrder: {
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockImplementation(async ({ data }: any) => ({ id: 'wo-cbm', ...data })),
      },
      workOrderComponent: { upsert: vi.fn().mockResolvedValue({}) },
      workOrderComment: { create: vi.fn().mockResolvedValue({}) },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    };
    const client = {
      pmScheduleTask: { findMany: vi.fn().mockResolvedValue([{ assetId: 'asset-1' }]) },
      $transaction: vi.fn(async (fn: any) => fn(tx)),
    };

    const result = await generateDueDirectPmAssignmentWorkOrders(client as never, {
      actorId: 'automation-1', now: new Date('2026-11-02T01:00:00.000Z'),
    });

    expect(result.generated).toBe(1);
    const evaluationUpdates = tx.pmScheduleTask.update.mock.calls.filter((call: any[]) => call[0]?.data?.lastEvaluatedAt);
    expect(evaluationUpdates).toHaveLength(1);
    expect(mocks.materialize).toHaveBeenCalledWith(tx, 'wo-cbm', [expect.objectContaining({
      task: expect.objectContaining({ id: 'pm-cbm' }),
      due: expect.objectContaining({
        due: true,
        reason: 'cbm_due',
        source: expect.objectContaining({ type: 'component_condition', sourceId: 'reading-1', value: 92 }),
      }),
    })]);
  });

});
