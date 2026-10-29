import { describe, expect, it, vi } from 'vitest';
import {
  getPmPortfolioCompliance,
  summarizePmPortfolioCompliance,
  type PmPortfolioComplianceExecutionRow,
} from '@/services/pm/pmPortfolioCompliance.service';

const NOW = new Date('2026-10-29T00:00:00.000Z');

function snapshot(nextDueDate = '2026-10-10T00:00:00.000Z') {
  return JSON.stringify({ version: 1, maintenanceMode: 'tbm', nextDueDate });
}

function row(overrides: Partial<PmPortfolioComplianceExecutionRow> = {}): PmPortfolioComplianceExecutionRow {
  return {
    id: 'exec-1',
    workOrderId: 'wo-1',
    pmScheduleTaskId: 'pm-1',
    pmDueCycleKey: 'cycle-1',
    pmPlanningSnapshot: snapshot(),
    taskNumber: 101,
    description: 'Inspect bearing',
    status: 'completed',
    completedAt: new Date('2026-10-11T00:00:00.000Z'),
    createdAt: new Date('2026-10-01T00:00:00.000Z'),
    updatedAt: new Date('2026-10-11T00:00:00.000Z'),
    workOrder: { id: 'wo-1', woNumber: 'WO-1', status: 'closed' },
    pmScheduleTask: {
      pmType: 'tbm',
      maintenanceMode: 'tbm',
      asset: {
        id: 'asset-1',
        name: 'Crusher A',
        assetTag: 'CR-A',
        plantId: 'plant-1',
        departmentId: 'dept-a',
        department: { id: 'dept-a', name: 'Crushing' },
      },
    },
    ...overrides,
  };
}

function openRow(input: {
  id: string;
  assetId: string;
  assetName: string;
  assetTag: string;
  departmentId: string | null;
  departmentName: string | null;
  dueAt: string;
  taskNumber?: number;
}) {
  return row({
    id: input.id,
    workOrderId: `wo-${input.id}`,
    pmScheduleTaskId: `pm-${input.id}`,
    pmDueCycleKey: `cycle-${input.id}`,
    pmPlanningSnapshot: snapshot(input.dueAt),
    taskNumber: input.taskNumber ?? 201,
    description: `Open task ${input.id}`,
    status: 'pending',
    completedAt: null,
    updatedAt: new Date(input.dueAt),
    workOrder: { id: `wo-${input.id}`, woNumber: `WO-${input.id}`, status: 'in_progress' },
    pmScheduleTask: {
      pmType: 'tbm',
      maintenanceMode: 'tbm',
      asset: {
        id: input.assetId,
        name: input.assetName,
        assetTag: input.assetTag,
        plantId: 'plant-1',
        departmentId: input.departmentId,
        department: input.departmentId ? { id: input.departmentId, name: input.departmentName || input.departmentId } : null,
      },
    },
  });
}

describe('PM portfolio compliance', () => {
  it('aggregates exact machine-cycle semantics into portfolio, department, and machine summaries', () => {
    const rows: PmPortfolioComplianceExecutionRow[] = [
      row(),
      openRow({ id: 'open-a', assetId: 'asset-1', assetName: 'Crusher A', assetTag: 'CR-A', departmentId: 'dept-a', departmentName: 'Crushing', dueAt: '2026-10-05T00:00:00.000Z' }),
      row({
        id: 'missed-a',
        workOrderId: 'wo-missed-a',
        pmScheduleTaskId: 'pm-missed-a',
        pmDueCycleKey: 'cycle-missed-a',
        pmPlanningSnapshot: snapshot('2026-10-06T00:00:00.000Z'),
        taskNumber: 103,
        description: 'Missed crusher inspection',
        status: 'skipped',
        completedAt: null,
        updatedAt: new Date('2026-10-07T00:00:00.000Z'),
        workOrder: { id: 'wo-missed-a', woNumber: 'WO-MA', status: 'closed' },
      }),
      row({
        id: 'completed-b',
        workOrderId: 'wo-completed-b',
        pmScheduleTaskId: 'pm-completed-b',
        pmDueCycleKey: 'cycle-completed-b',
        pmPlanningSnapshot: snapshot('2026-10-08T00:00:00.000Z'),
        taskNumber: 104,
        description: 'Completed mill PM',
        completedAt: new Date('2026-10-09T00:00:00.000Z'),
        updatedAt: new Date('2026-10-09T00:00:00.000Z'),
        workOrder: { id: 'wo-completed-b', woNumber: 'WO-CB', status: 'closed' },
        pmScheduleTask: {
          pmType: 'tbm',
          maintenanceMode: 'tbm',
          asset: {
            id: 'asset-2',
            name: 'Mill B',
            assetTag: 'ML-B',
            plantId: 'plant-1',
            departmentId: 'dept-b',
            department: { id: 'dept-b', name: 'Milling' },
          },
        },
      }),
    ];

    const result = summarizePmPortfolioCompliance(rows, NOW, 30);

    expect(result.summary).toEqual({
      maturedCycles: 4,
      completed: 2,
      openOverdue: 1,
      missed: 1,
      completionCompliancePct: 50,
      machinesWithMaturedCycles: 2,
      machinesWithOpenOverdue: 1,
    });
    expect(result.departments.map((department) => ({
      name: department.departmentName,
      matured: department.maturedCycles,
      completed: department.completed,
      overdue: department.openOverdue,
      missed: department.missed,
      compliance: department.completionCompliancePct,
    }))).toEqual([
      { name: 'Crushing', matured: 3, completed: 1, overdue: 1, missed: 1, compliance: 33.3 },
      { name: 'Milling', matured: 1, completed: 1, overdue: 0, missed: 0, compliance: 100 },
    ]);
    expect(result.machines.map((machine) => machine.assetName)).toEqual(['Crusher A', 'Mill B']);
    expect(result.oldestOpenOverdue[0]).toMatchObject({ assetId: 'asset-1', workOrderNumber: 'WO-open-a', outcome: 'overdue_open' });
  });

  it('deduplicates retry attempts for a stable cycle before portfolio aggregation', () => {
    const rows = [
      row({
        id: 'cancelled',
        status: 'pending',
        completedAt: null,
        workOrder: { id: 'wo-old', woNumber: 'WO-OLD', status: 'cancelled' },
        updatedAt: new Date('2026-10-10T12:00:00.000Z'),
      }),
      row({
        id: 'retry',
        workOrderId: 'wo-retry',
        completedAt: new Date('2026-10-12T00:00:00.000Z'),
        workOrder: { id: 'wo-retry', woNumber: 'WO-RETRY', status: 'closed' },
        updatedAt: new Date('2026-10-12T00:00:00.000Z'),
      }),
    ];

    const result = summarizePmPortfolioCompliance(rows, NOW, 30);

    expect(result.summary).toMatchObject({ maturedCycles: 1, completed: 1, openOverdue: 0, missed: 0, completionCompliancePct: 100 });
    expect(result.machines[0]).toMatchObject({ maturedCycles: 1, completed: 1 });
  });

  it('groups assets without a department under Unassigned instead of dropping them', () => {
    const result = summarizePmPortfolioCompliance([
      openRow({ id: 'unassigned', assetId: 'asset-u', assetName: 'Pump U', assetTag: 'P-U', departmentId: null, departmentName: null, dueAt: '2026-10-20T00:00:00.000Z' }),
    ], NOW, 30);

    expect(result.departments).toHaveLength(1);
    expect(result.departments[0]).toMatchObject({ departmentId: null, departmentName: 'Unassigned', machineCount: 1, openOverdue: 1 });
    expect(result.machines[0]).toMatchObject({ departmentId: null, departmentName: 'Unassigned' });
  });

  it('sorts department and machine exposure deterministically by risk then name', () => {
    const rows = [
      openRow({ id: 'a2', assetId: 'asset-a2', assetName: 'Alpha 2', assetTag: 'A2', departmentId: 'dept-a', departmentName: 'Alpha', dueAt: '2026-10-21T00:00:00.000Z' }),
      openRow({ id: 'a1', assetId: 'asset-a1', assetName: 'Alpha 1', assetTag: 'A1', departmentId: 'dept-a', departmentName: 'Alpha', dueAt: '2026-10-22T00:00:00.000Z' }),
      openRow({ id: 'b1', assetId: 'asset-b1', assetName: 'Beta 1', assetTag: 'B1', departmentId: 'dept-b', departmentName: 'Beta', dueAt: '2026-10-23T00:00:00.000Z' }),
      openRow({ id: 'c1', assetId: 'asset-c1', assetName: 'Charlie 1', assetTag: 'C1', departmentId: 'dept-c', departmentName: 'Charlie', dueAt: '2026-10-23T00:00:00.000Z' }),
    ];

    const result = summarizePmPortfolioCompliance(rows, NOW, 30);

    expect(result.departments.map((department) => department.departmentName)).toEqual(['Alpha', 'Beta', 'Charlie']);
    expect(result.machines.map((machine) => machine.assetName)).toEqual(['Alpha 1', 'Alpha 2', 'Beta 1', 'Charlie 1']);
  });

  it('returns only the ten oldest open-overdue cycles ordered by delay descending', () => {
    const rows = Array.from({ length: 12 }, (_, index) => openRow({
      id: `old-${index}`,
      assetId: `asset-${index}`,
      assetName: `Asset ${index}`,
      assetTag: `AS-${index}`,
      departmentId: 'dept-a',
      departmentName: 'Crushing',
      dueAt: `2026-10-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`,
      taskNumber: 300 + index,
    }));

    const result = summarizePmPortfolioCompliance(rows, NOW, 30);

    expect(result.oldestOpenOverdue).toHaveLength(10);
    expect(result.oldestOpenOverdue.map((cycle) => cycle.pmScheduleTaskId)).toEqual(
      Array.from({ length: 10 }, (_, index) => `pm-old-${index}`),
    );
    expect(result.oldestOpenOverdue[0].delayMinutes).toBeGreaterThan(result.oldestOpenOverdue[9].delayMinutes ?? 0);
  });

  it('returns empty rankings and null compliance when no cycles matured', () => {
    const result = summarizePmPortfolioCompliance([], NOW, 90);

    expect(result.summary).toEqual({
      maturedCycles: 0,
      completed: 0,
      openOverdue: 0,
      missed: 0,
      completionCompliancePct: null,
      machinesWithMaturedCycles: 0,
      machinesWithOpenOverdue: 0,
    });
    expect(result.departments).toEqual([]);
    expect(result.machines).toEqual([]);
    expect(result.oldestOpenOverdue).toEqual([]);
  });

  it('uses one direct-PM execution query scoped to plant and optional department', async () => {
    const client = {
      workOrderTaskExecution: {
        findMany: vi.fn().mockResolvedValue([row()]),
      },
    };

    const result = await getPmPortfolioCompliance({
      client: client as never,
      plantId: 'plant-1',
      departmentId: 'dept-a',
      windowDays: 30,
      now: NOW,
    });

    expect(client.workOrderTaskExecution.findMany).toHaveBeenCalledTimes(1);
    expect(client.workOrderTaskExecution.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        pmScheduleTask: {
          is: {
            scheduleId: null,
            asset: { is: { plantId: 'plant-1', departmentId: 'dept-a' } },
          },
        },
      },
    }));
    expect(result.summary).toMatchObject({ maturedCycles: 1, completed: 1, completionCompliancePct: 100 });
  });
});
