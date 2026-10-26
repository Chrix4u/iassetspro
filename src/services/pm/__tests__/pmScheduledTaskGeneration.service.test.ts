import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const tx = {
    $executeRawUnsafe: vi.fn(),
    pmSchedule: { findUnique: vi.fn() },
    workOrderTaskExecution: { findMany: vi.fn() },
    workOrder: { findMany: vi.fn(), create: vi.fn() },
    workOrderComponent: { upsert: vi.fn() },
    workOrderComment: { create: vi.fn() },
    pmScheduleTask: { update: vi.fn() },
    auditLog: { create: vi.fn() },
  };
  const db = {
    pmSchedule: { findMany: vi.fn() },
    $transaction: vi.fn(),
  };
  return {
    tx, db,
    evaluate: vi.fn(),
    materialize: vi.fn(),
    lock: vi.fn(),
    locationMap: vi.fn(),
    locationSnapshot: vi.fn(),
    notify: vi.fn(),
  };
});

vi.mock('@/lib/db', () => ({ db: mocks.db }));
vi.mock('@/services/pm/pmScheduledTaskDueEngine', () => ({ evaluateScheduledTaskDue: mocks.evaluate }));
vi.mock('@/services/pm/materializePmScheduledTasks.service', () => ({ materializePmScheduledTasks: mocks.materialize }));
vi.mock('@/services/pm/templateLifecycle.service', () => ({ lockPmScheduleLifecycle: mocks.lock }));
vi.mock('@/lib/functional-location/live-location', () => ({ getAssetLiveLocationMap: mocks.locationMap }));
vi.mock('@/lib/functional-location/maintenance-snapshot', () => ({ buildMaintenanceLocationSnapshot: mocks.locationSnapshot }));
vi.mock('@/lib/notifications', () => ({ notifyUser: mocks.notify }));

const scheduledTask = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  scheduleId: 'schedule-1',
  pmTaskId: `master-${id}`,
  sortOrder: Number(id.replace(/\D/g, '')) || 0,
  maintenanceMode: 'tbm',
  equipmentState: 'stopped',
  estimatedMinutes: 30,
  leadDays: 3,
  frequencyInterval: 1,
  frequencyUnit: 'months',
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
  lastCompletedAt: null,
  lastEvaluatedAt: null,
  lastGeneratedAt: null,
  lastGeneratedCycleKey: null,
  nextDueDate: new Date('2026-11-01T00:00:00.000Z'),
  isActive: true,
  createdAt: new Date('2026-10-01T00:00:00.000Z'),
  updatedAt: new Date('2026-10-01T00:00:00.000Z'),
  pmTask: {
    id: `master-${id}`,
    taskNumber: 100 + (Number(id.replace(/\D/g, '')) || 0),
    description: `Task ${id}`,
    taskType: 'mechanical',
  },
  ...overrides,
});

const schedule = (tasks: any[], overrides: Record<string, unknown> = {}) => ({
  id: 'schedule-1',
  title: 'Bearing PM',
  description: null,
  assetId: 'asset-1',
  componentId: null,
  priority: 'high',
  assignedToId: 'tech-1',
  departmentId: null,
  estimatedDuration: 1,
  autoGenerateWO: false,
  isActive: true,
  createdById: 'planner-1',
  asset: { id: 'asset-1', name: 'Pump 1', assetTag: 'P-001', plantId: 'plant-1', departmentId: 'dept-1' },
  component: null,
  tasks,
  ...overrides,
});

const due = (taskId: string, overrides: Record<string, unknown> = {}) => ({
  due: true,
  reason: 'tbm_due',
  maintenanceMode: 'tbm',
  dueCycleKey: `tbm:${taskId}:2026-11-01T00:00:00.000Z`,
  currentValue: null,
  source: null,
  ...overrides,
});

async function run(options: Record<string, unknown>) {
  const { generateDueScheduledTaskWorkOrders } = await import('@/services/pm/pmScheduledTaskGeneration.service');
  return generateDueScheduledTaskWorkOrders(options as never);
}

describe('pmScheduledTaskGeneration.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.db.pmSchedule.findMany.mockResolvedValue([{ id: 'schedule-1', assetId: 'asset-1' }]);
    mocks.db.$transaction.mockImplementation(async (callback: (tx: any) => unknown) => callback(mocks.tx));
    mocks.tx.$executeRawUnsafe.mockResolvedValue(0);
    mocks.tx.pmSchedule.findUnique.mockResolvedValue(schedule([scheduledTask('task-1')]));
    mocks.tx.workOrderTaskExecution.findMany.mockResolvedValue([]);
    mocks.tx.workOrder.findMany.mockResolvedValue([]);
    mocks.tx.workOrder.create.mockImplementation(async ({ data }: any) => ({ id: `wo-${data.woNumber}`, ...data }));
    mocks.tx.workOrderComponent.upsert.mockResolvedValue({});
    mocks.tx.workOrderComment.create.mockResolvedValue({});
    mocks.tx.pmScheduleTask.update.mockResolvedValue({});
    mocks.tx.auditLog.create.mockResolvedValue({});
    mocks.materialize.mockImplementation(async (_tx: unknown, _woId: string, candidates: any[]) => candidates.length);
    mocks.locationMap.mockResolvedValue(new Map([['asset-1', { id: 'location-1' }]]));
    mocks.locationSnapshot.mockReturnValue({ functionalLocationNameSnapshot: 'Line 1' });
    mocks.notify.mockResolvedValue(undefined);
    mocks.evaluate.mockImplementation(async ({ task }: any) => due(task.id));
  });

  it('generates one canonical preventive WO for an explicitly eligible due TBM task without advancing recurrence', async () => {
    const result = await run({ actorId: 'actor-1', scheduleIds: ['schedule-1'] });

    expect(result.generated).toBe(1);
    expect(mocks.lock).toHaveBeenCalledWith(mocks.tx, 'schedule-1');
    expect(mocks.tx.$executeRawUnsafe).toHaveBeenCalledWith(
      'SELECT pg_advisory_xact_lock(hashtext($1))',
      'iassetspro:pm-task-generation:schedule-1',
    );
    expect(mocks.tx.workOrder.create).toHaveBeenCalledTimes(1);
    expect(mocks.tx.workOrder.create.mock.calls[0][0].data).toMatchObject({
      type: 'preventive', status: 'draft', pmScheduleId: 'schedule-1', assetId: 'asset-1',
      plannerId: 'planner-1', assignedTo: 'tech-1', plantId: 'plant-1',
      plannedStart: new Date('2026-11-01T00:00:00.000Z'),
      estimatedHours: 0.5,
    });
    expect(mocks.materialize).toHaveBeenCalledWith(
      mocks.tx,
      expect.any(String),
      [expect.objectContaining({ task: expect.objectContaining({ id: 'task-1' }), due: expect.objectContaining({ due: true }) })],
    );
    expect(mocks.tx.pmScheduleTask.update).toHaveBeenCalledWith({
      where: { id: 'task-1' },
      data: {
        lastGeneratedAt: expect.any(Date),
        lastGeneratedCycleKey: 'tbm:task-1:2026-11-01T00:00:00.000Z',
      },
    });
    expect(mocks.tx.pmScheduleTask.update.mock.calls[0][0].data).not.toHaveProperty('lastCompletedAt');
    expect(mocks.tx.pmScheduleTask.update.mock.calls[0][0].data).not.toHaveProperty('nextDueDate');
    expect(mocks.tx.pmScheduleTask.update.mock.calls[0][0].data).not.toHaveProperty('nextDueReading');
  });

  it('bundles due tasks by equipment state and excludes non-due tasks', async () => {
    const tasks = [
      scheduledTask('task-1', { equipmentState: 'stopped', sortOrder: 0 }),
      scheduledTask('task-2', { equipmentState: 'stopped', sortOrder: 1, maintenanceMode: 'ubm', nextDueDate: null }),
      scheduledTask('task-3', { equipmentState: 'running', sortOrder: 2, maintenanceMode: 'cbm', nextDueDate: null }),
      scheduledTask('task-4', { equipmentState: 'stopped', sortOrder: 3, nextDueDate: new Date('2027-02-01T00:00:00Z') }),
    ];
    mocks.tx.pmSchedule.findUnique.mockResolvedValue(schedule(tasks));
    mocks.evaluate.mockImplementation(async ({ task }: any) => {
      if (task.id === 'task-4') return due(task.id, { due: false, reason: 'tbm_not_due' });
      if (task.id === 'task-2') return due(task.id, { maintenanceMode: 'ubm', dueCycleKey: 'ubm:task-2:1500', currentValue: 1501 });
      if (task.id === 'task-3') return due(task.id, { maintenanceMode: 'cbm', dueCycleKey: 'cbm:task-3:initial', currentValue: 8 });
      return due(task.id);
    });

    const result = await run({ actorId: 'actor-1', scheduleIds: ['schedule-1'] });
    expect(result.generated).toBe(2);
    expect(mocks.tx.workOrder.create).toHaveBeenCalledTimes(2);
    expect(mocks.materialize).toHaveBeenCalledTimes(2);
    const groups = mocks.materialize.mock.calls.map((call) => call[2].map((candidate: any) => candidate.task.id).sort());
    expect(groups).toContainEqual(['task-1', 'task-2']);
    expect(groups).toContainEqual(['task-3']);
    expect(groups.flat()).not.toContain('task-4');
  });

  it('filters already-generated non-cancelled task cycles before creating a WO', async () => {
    mocks.tx.workOrderTaskExecution.findMany.mockResolvedValue([{
      id: 'execution-1', workOrderId: 'wo-existing', pmScheduleTaskId: 'task-1',
      pmDueCycleKey: 'tbm:task-1:2026-11-01T00:00:00.000Z', status: 'completed',
      workOrder: { status: 'closed' },
    }]);
    const result = await run({ actorId: 'actor-1', scheduleIds: ['schedule-1'] });
    expect(result.generated).toBe(0);
    expect(result.skipped).toBeGreaterThanOrEqual(1);
    expect(mocks.tx.workOrder.create).not.toHaveBeenCalled();
    expect(mocks.materialize).not.toHaveBeenCalled();
  });

  it('regenerates a due cycle when its only prior execution was skipped in a closed WO', async () => {
    mocks.tx.workOrderTaskExecution.findMany.mockResolvedValue([{
      id: 'execution-skipped', workOrderId: 'wo-closed', pmScheduleTaskId: 'task-1',
      pmDueCycleKey: 'tbm:task-1:2026-11-01T00:00:00.000Z', status: 'skipped',
      workOrder: { status: 'closed' },
    }]);

    const result = await run({ actorId: 'actor-1', scheduleIds: ['schedule-1'] });

    expect(result.generated).toBe(1);
    expect(mocks.tx.workOrder.create).toHaveBeenCalledTimes(1);
    expect(mocks.materialize).toHaveBeenCalledTimes(1);
  });

  it('requires autoGenerateWO for ordinary discovery but allows explicit scheduleIds for controlled UAT/internal eligibility', async () => {
    await run({ actorId: 'actor-1', plantIds: ['plant-1'] });
    expect(mocks.db.pmSchedule.findMany).toHaveBeenLastCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        isActive: true,
        autoGenerateWO: true,
        asset: { plantId: { in: ['plant-1'] } },
        tasks: { some: { isActive: true } },
      }),
    }));

    await run({ actorId: 'actor-1', scheduleIds: ['schedule-1'] });
    const explicitWhere = mocks.db.pmSchedule.findMany.mock.calls.at(-1)?.[0]?.where;
    expect(explicitWhere.id).toEqual({ in: ['schedule-1'] });
    expect(explicitWhere).not.toHaveProperty('autoGenerateWO');
  });

  it('serializes repeated evaluation so the same task cycle is materialized once', async () => {
    let serialized = Promise.resolve();
    let generated = false;
    mocks.db.$transaction.mockImplementation((callback: (tx: any) => Promise<unknown>) => {
      const current = serialized.then(() => callback(mocks.tx));
      serialized = current.then(() => undefined, () => undefined);
      return current;
    });
    mocks.tx.workOrderTaskExecution.findMany.mockImplementation(async () => generated
      ? [{
          id: 'execution-1', workOrderId: 'wo-existing', pmScheduleTaskId: 'task-1',
          pmDueCycleKey: 'tbm:task-1:2026-11-01T00:00:00.000Z', status: 'completed',
          workOrder: { status: 'in_progress' },
        }]
      : []);
    mocks.materialize.mockImplementation(async (_tx: unknown, _woId: string, candidates: any[]) => {
      generated = true;
      return candidates.length;
    });

    const [first, second] = await Promise.all([
      run({ actorId: 'actor-1', scheduleIds: ['schedule-1'] }),
      run({ actorId: 'actor-1', scheduleIds: ['schedule-1'] }),
    ]);
    expect(first.generated + second.generated).toBe(1);
    expect(mocks.materialize).toHaveBeenCalledTimes(1);
  });
});
