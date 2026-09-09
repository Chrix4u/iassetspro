import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  closeActiveWorkSessions,
  closeAllActiveWorkSessions,
} from '@/services/workOrderActiveSession.service';

function makeTx() {
  return {
    workOrderTimeLog: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
    workOrder: {
      update: vi.fn(),
    },
  } as any;
}

describe('workOrderActiveSession service', () => {
  const endedAt = new Date('2026-09-09T12:00:00.000Z');

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('closes only rows it successfully claims and reports only claimed labor', async () => {
    const tx = makeTx();
    tx.workOrderTimeLog.findMany
      .mockResolvedValueOnce([
        {
          id: 'timer-1',
          userId: 'tech-1',
          action: 'start',
          timestamp: new Date('2026-09-09T10:00:00.000Z'),
          startTime: new Date('2026-09-09T10:00:00.000Z'),
          breakMinutes: 0,
          notes: null,
        },
        {
          id: 'timer-2',
          userId: 'tech-2',
          action: 'resume',
          timestamp: new Date('2026-09-09T11:00:00.000Z'),
          startTime: new Date('2026-09-09T11:00:00.000Z'),
          breakMinutes: 0,
          notes: 'Rework execution',
        },
      ])
      .mockResolvedValueOnce([
        { duration: 2 },
        { duration: 0.75 },
      ]);

    // timer-1 is claimed by this control action; timer-2 was already stopped by
    // a concurrent request between discovery and update.
    tx.workOrderTimeLog.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    tx.workOrder.update.mockResolvedValue({ id: 'wo-1' });

    const result = await closeAllActiveWorkSessions(
      tx,
      'wo-1',
      endedAt,
      'Work order placed on hold',
    );

    expect(tx.workOrderTimeLog.updateMany).toHaveBeenNthCalledWith(1, {
      where: { id: 'timer-1', endTime: null },
      data: expect.objectContaining({
        startTime: new Date('2026-09-09T10:00:00.000Z'),
        endTime: endedAt,
        duration: 2,
        pauseReason: 'Work order placed on hold',
      }),
    });
    expect(tx.workOrderTimeLog.updateMany).toHaveBeenNthCalledWith(2, {
      where: { id: 'timer-2', endTime: null },
      data: expect.objectContaining({
        endTime: endedAt,
        duration: 1,
      }),
    });

    expect(result).toEqual({
      closedTimerIds: ['timer-1'],
      closedUserIds: ['tech-1'],
      closedHours: 2,
      actualHours: 2.75,
    });
    expect(tx.workOrder.update).toHaveBeenCalledWith({
      where: { id: 'wo-1' },
      data: { actualHours: 2.75 },
    });
  });

  it('does not rewrite actualHours when every discovered row loses the close race', async () => {
    const tx = makeTx();
    tx.workOrderTimeLog.findMany
      .mockResolvedValueOnce([
        {
          id: 'timer-1',
          userId: 'tech-1',
          action: 'start',
          timestamp: new Date('2026-09-09T10:00:00.000Z'),
          startTime: null,
          breakMinutes: 0,
          notes: null,
        },
      ])
      .mockResolvedValueOnce([{ duration: 1.5 }]);
    tx.workOrderTimeLog.updateMany.mockResolvedValue({ count: 0 });

    const result = await closeActiveWorkSessions(
      tx,
      'wo-1',
      'tech-1',
      endedAt,
      'Timer stop race',
    );

    expect(result).toEqual({
      closedTimerIds: [],
      closedUserIds: [],
      closedHours: 0,
      actualHours: 1.5,
    });
    expect(tx.workOrder.update).not.toHaveBeenCalled();
  });

  it('scopes personal session closure to the requested technician', async () => {
    const tx = makeTx();
    tx.workOrderTimeLog.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    await closeActiveWorkSessions(
      tx,
      'wo-1',
      'tech-1',
      endedAt,
      'Technician stopped work',
    );

    expect(tx.workOrderTimeLog.findMany).toHaveBeenNthCalledWith(1, {
      where: {
        workOrderId: 'wo-1',
        userId: 'tech-1',
        action: { in: ['start', 'resume'] },
        endTime: null,
      },
      orderBy: { timestamp: 'asc' },
    });
  });
});
