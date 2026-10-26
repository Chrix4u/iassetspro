import { beforeEach, describe, expect, it, vi } from 'vitest';
import { findBlockingPmScheduledTaskCycles } from '@/services/pm/pmScheduledTaskCycleGuard.service';

const tx = {
  workOrderTaskExecution: { findMany: vi.fn() },
};

const identity = {
  pmScheduleTaskId: 'scheduled-1',
  pmDueCycleKey: 'tbm:scheduled-1:2026-11-01T00:00:00.000Z',
};

function row(status: string, workOrderStatus: string) {
  return {
    id: `execution-${status}-${workOrderStatus}`,
    workOrderId: `wo-${workOrderStatus}`,
    ...identity,
    status,
    workOrder: { status: workOrderStatus },
  };
}

describe('findBlockingPmScheduledTaskCycles', () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    ['pending', 'draft'],
    ['skipped', 'in_progress'],
    ['completed', 'verified'],
    ['completed', 'closed'],
  ])('keeps %s execution in %s WO blocking', async (status, woStatus) => {
    const blocker = row(status, woStatus);
    tx.workOrderTaskExecution.findMany.mockResolvedValue([blocker]);
    await expect(findBlockingPmScheduledTaskCycles(tx as never, [identity]))
      .resolves.toEqual([blocker]);
  });

  it.each([
    ['completed', 'cancelled'],
    ['skipped', 'cancelled'],
    ['skipped', 'closed'],
  ])('treats %s execution in %s WO as non-blocking', async (status, woStatus) => {
    tx.workOrderTaskExecution.findMany.mockResolvedValue([row(status, woStatus)]);
    await expect(findBlockingPmScheduledTaskCycles(tx as never, [identity]))
      .resolves.toEqual([]);
  });

  it('returns no blockers without querying when there are no identities', async () => {
    await expect(findBlockingPmScheduledTaskCycles(tx as never, [])).resolves.toEqual([]);
    expect(tx.workOrderTaskExecution.findMany).not.toHaveBeenCalled();
  });
});
