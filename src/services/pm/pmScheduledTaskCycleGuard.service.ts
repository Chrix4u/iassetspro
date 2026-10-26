import type { Prisma } from '@prisma/client';

type CycleGuardTx = Pick<Prisma.TransactionClient, 'workOrderTaskExecution'>;

export interface PmScheduledTaskCycleIdentity {
  pmScheduleTaskId: string;
  pmDueCycleKey: string;
}

export interface BlockingPmScheduledTaskCycle {
  id: string;
  workOrderId: string;
  pmScheduleTaskId: string | null;
  pmDueCycleKey: string | null;
  status: string;
  workOrder: { status: string };
}

/**
 * Return persisted task-cycle executions that still block a new WO.
 *
 * A cancelled WO never owns the cycle. A formally skipped task also releases
 * the cycle once its WO is planner-closed, because recurrence was deliberately
 * not advanced for that task. Every other non-cancelled execution stays a
 * blocker, including closed+completed as a safety net if recurrence state is
 * ever unexpectedly stale.
 */
export async function findBlockingPmScheduledTaskCycles(
  tx: CycleGuardTx,
  identities: PmScheduledTaskCycleIdentity[],
): Promise<BlockingPmScheduledTaskCycle[]> {
  if (identities.length === 0) return [];

  const rows = await tx.workOrderTaskExecution.findMany({
    where: { OR: identities },
    select: {
      id: true,
      workOrderId: true,
      pmScheduleTaskId: true,
      pmDueCycleKey: true,
      status: true,
      workOrder: { select: { status: true } },
    },
  });

  return rows.filter((row) => {
    if (row.workOrder.status === 'cancelled') return false;
    if (row.workOrder.status === 'closed' && row.status === 'skipped') return false;
    return true;
  });
}
