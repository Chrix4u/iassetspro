import { describe, expect, it, vi } from 'vitest';
import {
  getPmCompliance,
  summarizePmComplianceExecutions,
  type PmComplianceExecutionRow,
} from '@/services/pm/pmCompliance.service';

const NOW = new Date('2026-10-29T00:00:00.000Z');

function snapshot(input: {
  maintenanceMode?: string;
  nextDueDate?: string | null;
} = {}) {
  return JSON.stringify({
    version: 1,
    maintenanceMode: input.maintenanceMode ?? 'tbm',
    nextDueDate: input.nextDueDate ?? null,
    due: { cycleKey: 'cycle', reason: 'due', currentValue: null, source: null },
  });
}

function row(overrides: Partial<PmComplianceExecutionRow> = {}): PmComplianceExecutionRow {
  return {
    id: 'exec-1',
    workOrderId: 'wo-1',
    pmScheduleTaskId: 'pm-1',
    pmDueCycleKey: 'cycle-1',
    pmPlanningSnapshot: snapshot({ nextDueDate: '2026-10-01T00:00:00.000Z' }),
    taskNumber: 101,
    description: 'Inspect bearing',
    status: 'completed',
    completedAt: new Date('2026-10-02T00:00:00.000Z'),
    createdAt: new Date('2026-09-25T00:00:00.000Z'),
    updatedAt: new Date('2026-10-02T00:00:00.000Z'),
    workOrder: { id: 'wo-1', woNumber: 'WO-202610-0001', status: 'closed' },
    pmScheduleTask: { pmType: 'tbm', maintenanceMode: 'tbm' },
    ...overrides,
  };
}

describe('PM compliance intelligence', () => {
  it('classifies completed, open overdue, and missed unique matured cycles and calculates completion compliance', () => {
    const rows: PmComplianceExecutionRow[] = [
      row(),
      row({
        id: 'exec-2',
        workOrderId: 'wo-2',
        pmScheduleTaskId: 'pm-2',
        pmDueCycleKey: 'cycle-2',
        pmPlanningSnapshot: snapshot({ maintenanceMode: 'ubm' }),
        taskNumber: 102,
        description: 'Inspect belt hours',
        status: 'pending',
        completedAt: null,
        createdAt: new Date('2026-10-10T00:00:00.000Z'),
        updatedAt: new Date('2026-10-10T00:00:00.000Z'),
        workOrder: { id: 'wo-2', woNumber: 'WO-202610-0002', status: 'in_progress' },
        pmScheduleTask: { pmType: 'ubm', maintenanceMode: 'ubm' },
      }),
      row({
        id: 'exec-3',
        workOrderId: 'wo-3',
        pmScheduleTaskId: 'pm-3',
        pmDueCycleKey: 'cycle-3',
        pmPlanningSnapshot: '{legacy-malformed-json',
        taskNumber: 103,
        description: 'Vibration inspection',
        status: 'skipped',
        completedAt: null,
        createdAt: new Date('2026-10-15T00:00:00.000Z'),
        updatedAt: new Date('2026-10-16T00:00:00.000Z'),
        workOrder: { id: 'wo-3', woNumber: 'WO-202610-0003', status: 'closed' },
        pmScheduleTask: { pmType: 'cbm', maintenanceMode: 'cbm' },
      }),
    ];

    const result = summarizePmComplianceExecutions(rows, NOW, 30);

    expect(result.summary).toEqual({
      maturedCycles: 3,
      completed: 1,
      openOverdue: 1,
      missed: 1,
      completionCompliancePct: 33.3,
    });
    expect(result.cycles.map((cycle) => cycle.outcome)).toEqual(['missed', 'overdue_open', 'completed']);
    expect(result.cycles[1]).toMatchObject({
      pmScheduleTaskId: 'pm-2',
      dueAt: '2026-10-10T00:00:00.000Z',
      delayMinutes: 27360,
    });
    expect(result.cycles[2]).toMatchObject({
      pmScheduleTaskId: 'pm-1',
      dueAt: '2026-10-01T00:00:00.000Z',
      completedAt: '2026-10-02T00:00:00.000Z',
      delayMinutes: 1440,
    });
  });

  it('deduplicates a cancelled attempt followed by a completed retry for the same PM cycle', () => {
    const rows = [
      row({
        id: 'cancelled-attempt',
        status: 'pending',
        completedAt: null,
        workOrder: { id: 'wo-cancelled', woNumber: 'WO-OLD', status: 'cancelled' },
        updatedAt: new Date('2026-10-01T12:00:00.000Z'),
      }),
      row({
        id: 'successful-retry',
        workOrderId: 'wo-retry',
        status: 'completed',
        completedAt: new Date('2026-10-03T00:00:00.000Z'),
        workOrder: { id: 'wo-retry', woNumber: 'WO-RETRY', status: 'closed' },
        updatedAt: new Date('2026-10-03T00:00:00.000Z'),
      }),
    ];

    const result = summarizePmComplianceExecutions(rows, NOW, 30);

    expect(result.summary).toEqual({
      maturedCycles: 1,
      completed: 1,
      openOverdue: 0,
      missed: 0,
      completionCompliancePct: 100,
    });
    expect(result.cycles).toHaveLength(1);
    expect(result.cycles[0]).toMatchObject({ workOrderId: 'wo-retry', workOrderNumber: 'WO-RETRY', outcome: 'completed' });
  });

  it('uses the immutable TBM next due date and excludes future-due cycles from the historical denominator', () => {
    const result = summarizePmComplianceExecutions([
      row({
        pmPlanningSnapshot: snapshot({ maintenanceMode: 'tbm', nextDueDate: '2026-11-05T00:00:00.000Z' }),
        createdAt: new Date('2026-10-20T00:00:00.000Z'),
        status: 'pending',
        completedAt: null,
        workOrder: { id: 'wo-future', woNumber: 'WO-FUTURE', status: 'draft' },
      }),
    ], NOW, 30);

    expect(result.summary).toEqual({
      maturedCycles: 0,
      completed: 0,
      openOverdue: 0,
      missed: 0,
      completionCompliancePct: null,
    });
    expect(result.cycles).toEqual([]);
  });

  it('falls back to execution creation time for triggered PM and malformed legacy snapshots', () => {
    const result = summarizePmComplianceExecutions([
      row({
        id: 'ubm-exec',
        pmScheduleTaskId: 'pm-ubm',
        pmDueCycleKey: 'ubm-cycle',
        pmPlanningSnapshot: snapshot({ maintenanceMode: 'ubm' }),
        createdAt: new Date('2026-10-20T10:15:00.000Z'),
        completedAt: new Date('2026-10-20T11:15:00.000Z'),
        pmScheduleTask: { pmType: 'ubm', maintenanceMode: 'ubm' },
      }),
      row({
        id: 'legacy-exec',
        pmScheduleTaskId: 'pm-legacy',
        pmDueCycleKey: 'legacy-cycle',
        pmPlanningSnapshot: 'not-json',
        createdAt: new Date('2026-10-21T09:00:00.000Z'),
        completedAt: new Date('2026-10-21T09:30:00.000Z'),
        pmScheduleTask: { pmType: 'cbm', maintenanceMode: 'cbm' },
      }),
    ], NOW, 30);

    expect(result.cycles.map((cycle) => ({ id: cycle.pmScheduleTaskId, dueAt: cycle.dueAt }))).toEqual([
      { id: 'pm-legacy', dueAt: '2026-10-21T09:00:00.000Z' },
      { id: 'pm-ubm', dueAt: '2026-10-20T10:15:00.000Z' },
    ]);
  });

  it('returns a null compliance percentage when no PM cycles matured in the reporting window', () => {
    const result = summarizePmComplianceExecutions([], NOW, 90);

    expect(result.summary).toEqual({
      maturedCycles: 0,
      completed: 0,
      openOverdue: 0,
      missed: 0,
      completionCompliancePct: null,
    });
    expect(result.window).toEqual({
      days: 90,
      start: '2026-07-31T00:00:00.000Z',
      end: '2026-10-29T00:00:00.000Z',
    });
  });

  it('queries execution history only through direct PM assignments for the requested machine', async () => {
    const client = {
      workOrderTaskExecution: {
        findMany: vi.fn().mockResolvedValue([row()]),
      },
    };

    const result = await getPmCompliance({ client: client as never, assetId: 'asset-1', now: NOW, windowDays: 30 });

    expect(client.workOrderTaskExecution.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        pmScheduleTask: {
          is: { assetId: 'asset-1', scheduleId: null },
        },
      },
    }));
    expect(result.summary).toMatchObject({ maturedCycles: 1, completed: 1, completionCompliancePct: 100 });
  });
});
