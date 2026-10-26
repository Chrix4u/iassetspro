import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  calculateNextTbmDueDate,
  evaluateDueTbmScheduleTasks,
  evaluateTbmDueState,
} from '@/services/pm/tbmScheduleTaskEngine';

const iso = (value: string) => new Date(value);

describe('task-level TBM calendar math', () => {
  it('keeps a task outside the generation lead window', () => {
    expect(evaluateTbmDueState({
      now: iso('2026-10-01T00:00:00.000Z'),
      nextDueDate: iso('2026-10-10T00:00:00.000Z'),
      leadDays: 3,
    })).toEqual({
      dueForGeneration: false,
      overdue: false,
      nextDueDate: iso('2026-10-10T00:00:00.000Z'),
      leadWindowEnd: iso('2026-10-04T00:00:00.000Z'),
    });
  });

  it('marks a task due inside the lead window', () => {
    expect(evaluateTbmDueState({
      now: iso('2026-10-08T00:00:00.000Z'),
      nextDueDate: iso('2026-10-10T00:00:00.000Z'),
      leadDays: 3,
    }).dueForGeneration).toBe(true);
  });

  it('treats exactly due as due but not overdue', () => {
    expect(evaluateTbmDueState({
      now: iso('2026-10-10T00:00:00.000Z'),
      nextDueDate: iso('2026-10-10T00:00:00.000Z'),
      leadDays: 0,
    })).toMatchObject({ dueForGeneration: true, overdue: false });
  });

  it('marks a past due date overdue', () => {
    expect(evaluateTbmDueState({
      now: iso('2026-10-11T00:00:00.000Z'),
      nextDueDate: iso('2026-10-10T00:00:00.000Z'),
      leadDays: 0,
    })).toMatchObject({ dueForGeneration: true, overdue: true });
  });

  it('clamps end-of-month recurrence in UTC', () => {
    expect(calculateNextTbmDueDate(iso('2027-01-31T12:30:00.000Z'), 1, 'months'))
      .toEqual(iso('2027-02-28T12:30:00.000Z'));
  });

  it('clamps leap-day annual recurrence in UTC', () => {
    expect(calculateNextTbmDueDate(iso('2024-02-29T08:15:00.000Z'), 1, 'years'))
      .toEqual(iso('2025-02-28T08:15:00.000Z'));
  });
});

describe('task-level TBM database evaluation', () => {
  const findMany = vi.fn();
  const client = {
    pmScheduleTask: { findMany, updateMany: vi.fn(), update: vi.fn(), create: vi.fn() },
    workOrder: { create: vi.fn() },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    findMany.mockResolvedValue([
      {
        id: 'scheduled-1', scheduleId: 'schedule-1', pmTaskId: 'task-1', sortOrder: 0,
        leadDays: 2, frequencyInterval: 30, frequencyUnit: 'days',
        lastCompletedAt: iso('2026-09-01T00:00:00.000Z'), nextDueDate: iso('2026-10-27T00:00:00.000Z'),
        pmTask: { taskNumber: 10, description: 'Inspect bearing' },
        schedule: {
          title: 'Pump PM', assetId: 'asset-1', componentId: null,
          asset: { plantId: 'plant-1', name: 'Pump A', assetTag: 'P-001' },
        },
      },
      {
        id: 'scheduled-2', scheduleId: 'schedule-1', pmTaskId: 'task-2', sortOrder: 1,
        leadDays: 0, frequencyInterval: 90, frequencyUnit: 'days',
        lastCompletedAt: null, nextDueDate: iso('2027-01-24T00:00:00.000Z'),
        pmTask: { taskNumber: 20, description: 'Replace seal' },
        schedule: {
          title: 'Pump PM', assetId: 'asset-1', componentId: null,
          asset: { plantId: 'plant-1', name: 'Pump A', assetTag: 'P-001' },
        },
      },
    ]);
  });

  it('queries only active authoritative TBM tasks and evaluates each task independently', async () => {
    const result = await evaluateDueTbmScheduleTasks(client as never, {
      now: iso('2026-10-26T00:00:00.000Z'),
    });

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        isActive: true,
        maintenanceMode: 'tbm',
        nextDueDate: { not: null },
        schedule: { isActive: true, recurrenceAuthority: 'task' },
      },
    }));
    expect(result).toMatchObject({ evaluated: 2, due: 1, overdue: 0 });
    expect(result.results.map((row) => [row.scheduleTaskId, row.dueForGeneration])).toEqual([
      ['scheduled-1', true],
      ['scheduled-2', false],
    ]);
    expect(client.pmScheduleTask.updateMany).not.toHaveBeenCalled();
    expect(client.pmScheduleTask.update).not.toHaveBeenCalled();
    expect(client.pmScheduleTask.create).not.toHaveBeenCalled();
    expect(client.workOrder.create).not.toHaveBeenCalled();
  });

  it('adds explicit plant scoping without changing task authority filters', async () => {
    await evaluateDueTbmScheduleTasks(client as never, {
      now: iso('2026-10-26T00:00:00.000Z'),
      plantIds: ['plant-1', 'plant-2'],
    });

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        isActive: true,
        maintenanceMode: 'tbm',
        nextDueDate: { not: null },
        schedule: {
          isActive: true,
          recurrenceAuthority: 'task',
          asset: { plantId: { in: ['plant-1', 'plant-2'] } },
        },
      },
    }));
  });
});
