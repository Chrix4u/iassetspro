import { beforeEach, describe, expect, it, vi } from 'vitest';
import { advanceClosedPmScheduledTaskRecurrence } from '@/services/pm/advancePmScheduledTaskRecurrence.service';

const tx = {
  pmSchedule: { findUnique: vi.fn() },
  workOrderTaskExecution: { findMany: vi.fn() },
  pmScheduleTask: { update: vi.fn() },
  meterReading: { findFirst: vi.fn() },
  auditLog: { create: vi.fn() },
};

const closedAt = new Date('2026-10-26T12:00:00.000Z');
const woActualEnd = new Date('2026-10-26T11:00:00.000Z');
const taskCompletedAt = new Date('2026-10-26T10:30:00.000Z');

function task(overrides: Record<string, unknown> = {}) {
  return {
    id: 'scheduled-1',
    scheduleId: 'schedule-1',
    pmTaskId: 'master-1',
    maintenanceMode: 'tbm',
    frequencyInterval: 1,
    frequencyUnit: 'months',
    meterName: null,
    nextDueReading: null,
    nextDueDate: new Date('2026-10-01T00:00:00.000Z'),
    lastCompletedAt: null,
    isActive: true,
    ...overrides,
  };
}

function execution(overrides: Record<string, unknown> = {}) {
  return {
    id: 'execution-1',
    workOrderId: 'wo-1',
    status: 'completed',
    completedAt: taskCompletedAt,
    pmScheduleTaskId: 'scheduled-1',
    pmDueCycleKey: 'tbm:scheduled-1:2026-10-01T00:00:00.000Z',
    pmPlanningSnapshot: '{"version":1}',
    pmScheduleTask: task(),
    ...overrides,
  };
}

function input(overrides: Record<string, unknown> = {}) {
  return {
    tx: tx as never,
    workOrderId: 'wo-1',
    pmScheduleId: 'schedule-1',
    assetId: 'asset-1',
    woNumber: 'WO-202610-0001',
    woActualEnd,
    closedAt,
    actorId: 'planner-1',
    ...overrides,
  };
}

describe('advanceClosedPmScheduledTaskRecurrence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tx.pmSchedule.findUnique.mockResolvedValue({ recurrenceAuthority: 'task' });
    tx.workOrderTaskExecution.findMany.mockResolvedValue([execution()]);
    tx.pmScheduleTask.update.mockResolvedValue({ id: 'scheduled-1' });
    tx.auditLog.create.mockResolvedValue({ id: 'audit-1' });
  });

  it('advances a direct PM assignment even when there is no legacy PM schedule container', async () => {
    tx.workOrderTaskExecution.findMany.mockResolvedValue([
      execution({ pmScheduleTask: task({ scheduleId: null }) }),
    ]);

    const result = await advanceClosedPmScheduledTaskRecurrence(input({ pmScheduleId: null }));

    expect(result.taskLevel).toBe(true);
    expect(result.advancedTaskIds).toEqual(['scheduled-1']);
    expect(tx.pmSchedule.findUnique).not.toHaveBeenCalled();
    expect(tx.pmScheduleTask.update).toHaveBeenCalledTimes(1);
  });

  it('advances only the completed TBM task from its own completion timestamp using calendar-safe recurrence', async () => {
    const completedAt = new Date('2026-01-31T09:15:00.000Z');
    tx.workOrderTaskExecution.findMany.mockResolvedValue([
      execution({
        completedAt,
        pmScheduleTask: task({ nextDueDate: new Date('2026-01-31T00:00:00.000Z') }),
      }),
    ]);

    const result = await advanceClosedPmScheduledTaskRecurrence(input());

    expect(result).toEqual({
      taskLevel: true,
      advancedTaskIds: ['scheduled-1'],
      skippedTaskIds: [],
    });
    expect(tx.pmScheduleTask.update).toHaveBeenCalledWith({
      where: { id: 'scheduled-1' },
      data: {
        lastCompletedAt: completedAt,
        nextDueDate: new Date('2026-02-28T09:15:00.000Z'),
      },
    });
    expect(tx.auditLog.create).toHaveBeenCalledTimes(1);
  });

  it('advances sub-day TBM recurrence without losing the completion time', async () => {
    const completedAt = new Date('2026-10-26T10:30:00.000Z');
    tx.workOrderTaskExecution.findMany.mockResolvedValue([
      execution({ completedAt, pmScheduleTask: task({ frequencyInterval: 2, frequencyUnit: 'hours' }) }),
    ]);

    await advanceClosedPmScheduledTaskRecurrence(input());

    expect(tx.pmScheduleTask.update).toHaveBeenCalledWith({
      where: { id: 'scheduled-1' },
      data: { lastCompletedAt: completedAt, nextDueDate: new Date('2026-10-26T12:30:00.000Z') },
    });
  });

  it('advances minute TBM recurrence from the task completion timestamp', async () => {
    const completedAt = new Date('2026-10-26T10:30:00.000Z');
    tx.workOrderTaskExecution.findMany.mockResolvedValue([
      execution({ completedAt, pmScheduleTask: task({ frequencyInterval: 90, frequencyUnit: 'minutes' }) }),
    ]);

    await advanceClosedPmScheduledTaskRecurrence(input());

    expect(tx.pmScheduleTask.update).toHaveBeenCalledWith({
      where: { id: 'scheduled-1' },
      data: { lastCompletedAt: completedAt, nextDueDate: new Date('2026-10-26T12:00:00.000Z') },
    });
  });

  it('uses WO actualEnd when an old completed execution has no task completion timestamp', async () => {
    tx.workOrderTaskExecution.findMany.mockResolvedValue([
      execution({ completedAt: null, pmScheduleTask: task({ frequencyInterval: 7, frequencyUnit: 'days' }) }),
    ]);

    await advanceClosedPmScheduledTaskRecurrence(input());

    expect(tx.pmScheduleTask.update).toHaveBeenCalledWith({
      where: { id: 'scheduled-1' },
      data: {
        lastCompletedAt: woActualEnd,
        nextDueDate: new Date('2026-11-02T11:00:00.000Z'),
      },
    });
  });

  it('advances UBM from the latest matching meter reading at or before task completion', async () => {
    const ubm = task({
      maintenanceMode: 'ubm',
      frequencyInterval: 500,
      frequencyUnit: 'hours',
      meterName: 'Operating Hours',
      nextDueDate: null,
      nextDueReading: 1500,
    });
    tx.workOrderTaskExecution.findMany.mockResolvedValue([
      execution({ pmDueCycleKey: 'ubm:scheduled-1:1500', pmScheduleTask: ubm }),
    ]);
    tx.meterReading.findFirst.mockResolvedValue({
      id: 'reading-1512', value: 1512, meterName: 'Operating Hours', unit: 'hours',
      readingDate: new Date('2026-10-26T10:20:00.000Z'),
    });

    await advanceClosedPmScheduledTaskRecurrence(input());

    expect(tx.meterReading.findFirst).toHaveBeenCalledWith({
      where: {
        assetId: 'asset-1',
        meterName: 'Operating Hours',
        unit: 'hours',
        readingDate: { lte: taskCompletedAt },
      },
      orderBy: [{ readingDate: 'desc' }, { createdAt: 'desc' }],
      select: { id: true, value: true, meterName: true, unit: true, readingDate: true },
    });
    expect(tx.pmScheduleTask.update).toHaveBeenCalledWith({
      where: { id: 'scheduled-1' },
      data: { lastCompletedAt: taskCompletedAt, nextDueReading: 2012 },
    });
  });

  it('re-arms CBM by recording completion without inventing time or usage recurrence', async () => {
    tx.workOrderTaskExecution.findMany.mockResolvedValue([
      execution({
        pmDueCycleKey: 'cbm:scheduled-1:initial',
        pmScheduleTask: task({
          maintenanceMode: 'cbm', frequencyInterval: null, frequencyUnit: null,
          nextDueDate: null, nextDueReading: null,
        }),
      }),
    ]);

    await advanceClosedPmScheduledTaskRecurrence(input());

    expect(tx.pmScheduleTask.update).toHaveBeenCalledWith({
      where: { id: 'scheduled-1' },
      data: { lastCompletedAt: taskCompletedAt },
    });
    expect(tx.meterReading.findFirst).not.toHaveBeenCalled();
  });

  it('does not advance a formally skipped task but still identifies the WO as task-level', async () => {
    tx.workOrderTaskExecution.findMany.mockResolvedValue([execution({ status: 'skipped', completedAt: null })]);

    const result = await advanceClosedPmScheduledTaskRecurrence(input());

    expect(result).toEqual({ taskLevel: true, advancedTaskIds: [], skippedTaskIds: ['scheduled-1'] });
    expect(tx.pmScheduleTask.update).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it('records recurrence history even when the live Scheduled Task was deactivated after generation', async () => {
    tx.workOrderTaskExecution.findMany.mockResolvedValue([
      execution({ pmScheduleTask: task({ isActive: false, frequencyInterval: 7, frequencyUnit: 'days' }) }),
    ]);

    const result = await advanceClosedPmScheduledTaskRecurrence(input());

    expect(result.advancedTaskIds).toEqual(['scheduled-1']);
    expect(tx.pmScheduleTask.update).toHaveBeenCalledTimes(1);
  });

  it('returns legacy ownership from persisted authority even when compatibility task provenance exists', async () => {
    tx.pmSchedule.findUnique.mockResolvedValue({ recurrenceAuthority: 'legacy_header' });
    tx.workOrderTaskExecution.findMany.mockResolvedValue([execution()]);

    const result = await advanceClosedPmScheduledTaskRecurrence(input());

    expect(result).toEqual({ taskLevel: false, advancedTaskIds: [], skippedTaskIds: [] });
    expect(tx.workOrderTaskExecution.findMany).not.toHaveBeenCalled();
    expect(tx.pmScheduleTask.update).not.toHaveBeenCalled();
  });

  it('fails closed when a task-authority WO has lost all task-level execution provenance', async () => {
    tx.workOrderTaskExecution.findMany.mockResolvedValue([]);

    await expect(advanceClosedPmScheduledTaskRecurrence(input()))
      .rejects.toThrow(/task-authority|provenance/i);
    expect(tx.pmScheduleTask.update).not.toHaveBeenCalled();
  });

  it('fails closed when a completed provenanced execution lost its live Scheduled Task', async () => {
    tx.workOrderTaskExecution.findMany.mockResolvedValue([
      execution({ pmScheduleTaskId: null, pmScheduleTask: null, pmDueCycleKey: 'tbm:deleted:cycle' }),
    ]);

    await expect(advanceClosedPmScheduledTaskRecurrence(input()))
      .rejects.toThrow(/provenance|scheduled task|missing/i);
    expect(tx.pmScheduleTask.update).not.toHaveBeenCalled();
  });

  it('fails closed when completed provenance points outside the parent PM Schedule', async () => {
    tx.workOrderTaskExecution.findMany.mockResolvedValue([
      execution({ pmScheduleTask: task({ scheduleId: 'schedule-other' }) }),
    ]);

    await expect(advanceClosedPmScheduledTaskRecurrence(input()))
      .rejects.toThrow(/schedule|provenance|mismatch/i);
    expect(tx.pmScheduleTask.update).not.toHaveBeenCalled();
  });

  it('fails closed when a completed UBM task has no authoritative baseline at completion', async () => {
    tx.workOrderTaskExecution.findMany.mockResolvedValue([
      execution({
        pmDueCycleKey: 'ubm:scheduled-1:1500',
        pmScheduleTask: task({
          maintenanceMode: 'ubm', frequencyInterval: 500, frequencyUnit: 'hours',
          meterName: 'Operating Hours', nextDueDate: null, nextDueReading: 1500,
        }),
      }),
    ]);
    tx.meterReading.findFirst.mockResolvedValue(null);

    await expect(advanceClosedPmScheduledTaskRecurrence(input()))
      .rejects.toThrow(/meter|baseline|reading/i);
    expect(tx.pmScheduleTask.update).not.toHaveBeenCalled();
  });
});
