import { beforeEach, describe, expect, it, vi } from 'vitest';
import { materializePmScheduledTasks } from '@/services/pm/materializePmScheduledTasks.service';

const tx = {
  workOrderTaskExecution: {
    findMany: vi.fn(),
    createMany: vi.fn(),
  },
};

const scheduledTask = (overrides: Record<string, unknown> = {}) => ({
  id: 'scheduled-1',
  scheduleId: 'schedule-1',
  pmTaskId: 'master-1',
  sortOrder: 0,
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
  nextDueDate: new Date('2026-11-01T00:00:00Z'),
  isActive: true,
  createdAt: new Date('2026-10-01T00:00:00Z'),
  updatedAt: new Date('2026-10-01T00:00:00Z'),
  pmTask: {
    id: 'master-1',
    taskNumber: 700,
    description: 'Inspect drive-end bearing',
    taskType: 'mechanical',
  },
  ...overrides,
});

const due = (overrides: Record<string, unknown> = {}) => ({
  due: true,
  reason: 'tbm_due',
  maintenanceMode: 'tbm',
  dueCycleKey: 'tbm:scheduled-1:2026-11-01T00:00:00.000Z',
  currentValue: null,
  source: null,
  ...overrides,
});

describe('materializePmScheduledTasks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tx.workOrderTaskExecution.findMany.mockResolvedValue([]);
    tx.workOrderTaskExecution.createMany.mockResolvedValue({ count: 2 });
  });

  it('materializes only due tasks in schedule order with immutable provenance snapshots', async () => {
    const candidates = [
      {
        task: scheduledTask({
          id: 'scheduled-3', pmTaskId: 'master-3', sortOrder: 20,
          pmTask: { id: 'master-3', taskNumber: 900, description: 'Record bearing readings', taskType: 'lubrication' },
        }),
        due: due({ dueCycleKey: 'tbm:scheduled-3:2026-11-01T00:00:00.000Z' }),
      },
      {
        task: scheduledTask({
          id: 'scheduled-2', pmTaskId: 'master-2', sortOrder: 5,
          pmTask: { id: 'master-2', taskNumber: 800, description: 'Future lubrication', taskType: 'electrical' },
        }),
        due: due({ due: false, reason: 'tbm_not_due', dueCycleKey: 'tbm:scheduled-2:2026-12-01T00:00:00.000Z' }),
      },
      {
        task: scheduledTask({
          id: 'scheduled-1', pmTaskId: 'master-1', sortOrder: 1,
          pmTask: { id: 'master-1', taskNumber: 700, description: 'Inspect drive-end bearing', taskType: 'mechanical' },
        }),
        due: due(),
      },
    ];

    const count = await materializePmScheduledTasks(tx as never, 'wo-1', candidates as never);
    expect(count).toBe(2);
    expect(tx.workOrderTaskExecution.findMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { pmScheduleTaskId: 'scheduled-1', pmDueCycleKey: 'tbm:scheduled-1:2026-11-01T00:00:00.000Z' },
          { pmScheduleTaskId: 'scheduled-3', pmDueCycleKey: 'tbm:scheduled-3:2026-11-01T00:00:00.000Z' },
        ],
      },
      select: {
        id: true, workOrderId: true, pmScheduleTaskId: true, pmDueCycleKey: true, status: true,
        workOrder: { select: { status: true } },
      },
    });

    const create = tx.workOrderTaskExecution.createMany.mock.calls[0][0];
    expect(create.data).toHaveLength(2);
    expect(create.data[0]).toMatchObject({
      workOrderId: 'wo-1', pmScheduleTaskId: 'scheduled-1',
      pmDueCycleKey: 'tbm:scheduled-1:2026-11-01T00:00:00.000Z',
      taskNumber: 1, description: 'Inspect drive-end bearing', taskType: 'check',
      estimatedMinutes: 30, status: 'pending',
    });
    expect(create.data[1]).toMatchObject({
      workOrderId: 'wo-1', pmScheduleTaskId: 'scheduled-3', taskNumber: 2,
      description: 'Record bearing readings', taskType: 'lubricate', status: 'pending',
    });

    const snapshot = JSON.parse(create.data[0].pmPlanningSnapshot);
    expect(snapshot).toMatchObject({
      version: 1,
      pmScheduleTaskId: 'scheduled-1',
      pmTaskId: 'master-1',
      taskMasterNumber: 700,
      taskMasterType: 'mechanical',
      scheduleSortOrder: 1,
      maintenanceMode: 'tbm',
      equipmentState: 'stopped',
      due: {
        cycleKey: 'tbm:scheduled-1:2026-11-01T00:00:00.000Z',
        reason: 'tbm_due',
      },
    });
  });

  it('materializes an explicitly planned-early TBM candidate without falsifying due state', async () => {
    tx.workOrderTaskExecution.createMany.mockResolvedValue({ count: 1 });
    const count = await materializePmScheduledTasks(tx as never, 'wo-early', [{
      task: scheduledTask(),
      due: due({ due: false, reason: 'tbm_not_due' }),
      planningDisposition: 'planned_early',
      plannedExecutionAt: new Date('2026-10-30T00:00:00.000Z'),
    }] as never);

    expect(count).toBe(1);
    const create = tx.workOrderTaskExecution.createMany.mock.calls[0][0];
    expect(create.data).toHaveLength(1);
    const snapshot = JSON.parse(create.data[0].pmPlanningSnapshot);
    expect(snapshot).toMatchObject({
      executionBasis: 'planned_early',
      originalDueDate: '2026-11-01T00:00:00.000Z',
      plannedExecutionAt: '2026-10-30T00:00:00.000Z',
      due: { reason: 'tbm_not_due' },
    });
  });

  it('rejects planned-early materialization without an explicit maintenance execution date', async () => {
    await expect(materializePmScheduledTasks(tx as never, 'wo-early', [{
      task: scheduledTask(),
      due: due({ due: false, reason: 'tbm_not_due' }),
      planningDisposition: 'planned_early',
    }] as never)).rejects.toThrow(/execution date/i);
    expect(tx.workOrderTaskExecution.createMany).not.toHaveBeenCalled();
  });

  it('returns zero without touching persistence when no task is due or explicitly planned early', async () => {
    const count = await materializePmScheduledTasks(tx as never, 'wo-1', [{
      task: scheduledTask(),
      due: due({ due: false, reason: 'tbm_not_due' }),
    }] as never);

    expect(count).toBe(0);
    expect(tx.workOrderTaskExecution.findMany).not.toHaveBeenCalled();
    expect(tx.workOrderTaskExecution.createMany).not.toHaveBeenCalled();
  });

  it('rejects an already materialized non-cancelled task cycle before writing', async () => {
    tx.workOrderTaskExecution.findMany.mockResolvedValue([{
      id: 'execution-1', workOrderId: 'wo-existing', pmScheduleTaskId: 'scheduled-1',
      pmDueCycleKey: 'tbm:scheduled-1:2026-11-01T00:00:00.000Z', status: 'completed',
      workOrder: { status: 'closed' },
    }]);

    await expect(materializePmScheduledTasks(tx as never, 'wo-2', [{ task: scheduledTask(), due: due() }] as never))
      .rejects.toThrow(/already materialized/i);
    expect(tx.workOrderTaskExecution.createMany).not.toHaveBeenCalled();
  });

  it('allows a closed skipped execution to materialize the same due cycle again', async () => {
    tx.workOrderTaskExecution.findMany.mockResolvedValue([{
      id: 'execution-skipped', workOrderId: 'wo-closed', pmScheduleTaskId: 'scheduled-1',
      pmDueCycleKey: 'tbm:scheduled-1:2026-11-01T00:00:00.000Z', status: 'skipped',
      workOrder: { status: 'closed' },
    }]);

    await expect(materializePmScheduledTasks(tx as never, 'wo-new', [{ task: scheduledTask(), due: due() }] as never))
      .resolves.toBe(1);
    expect(tx.workOrderTaskExecution.createMany).toHaveBeenCalledTimes(1);
  });

  it('snapshots UBM/CBM planning and observed due evidence instead of mutable live references', async () => {
    tx.workOrderTaskExecution.createMany.mockResolvedValue({ count: 1 });
    const task = scheduledTask({
      maintenanceMode: 'ubm', equipmentState: 'running', frequencyInterval: 500,
      frequencyUnit: 'hours', meterName: 'Operating Hours', nextDueReading: 1500, nextDueDate: null,
    });
    const evidence = due({
      maintenanceMode: 'ubm', dueCycleKey: 'ubm:scheduled-1:1500', currentValue: 1512,
      source: { type: 'meter', sourceId: 'reading-9', metric: 'Operating Hours', unit: 'hours', value: 1512, observedAt: new Date('2026-10-26T12:00:00Z') },
    });

    await materializePmScheduledTasks(tx as never, 'wo-1', [{ task, due: evidence }] as never);
    const snapshot = JSON.parse(tx.workOrderTaskExecution.createMany.mock.calls[0][0].data[0].pmPlanningSnapshot);
    expect(snapshot).toMatchObject({
      maintenanceMode: 'ubm', equipmentState: 'running',
      frequencyInterval: 500, frequencyUnit: 'hours', meterName: 'Operating Hours', nextDueReading: 1500,
      due: { cycleKey: 'ubm:scheduled-1:1500', currentValue: 1512, source: { sourceId: 'reading-9', value: 1512 } },
    });
  });
});
