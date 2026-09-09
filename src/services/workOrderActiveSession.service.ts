import type { Prisma } from '@prisma/client';

export interface ClosedWorkSessionsResult {
  closedTimerIds: string[];
  closedUserIds: string[];
  closedHours: number;
  actualHours: number;
}

async function closeSessions(
  tx: Prisma.TransactionClient,
  workOrderId: string,
  userId: string | null,
  endedAt: Date,
  reason: string,
): Promise<ClosedWorkSessionsResult> {
  const activeLogs = await tx.workOrderTimeLog.findMany({
    where: {
      workOrderId,
      ...(userId ? { userId } : {}),
      action: { in: ['start', 'resume'] },
      endTime: null,
    },
    orderBy: { timestamp: 'asc' },
  });

  let closedHours = 0;
  const closedTimerIds: string[] = [];
  const closedUserIds: string[] = [];

  for (const log of activeLogs) {
    const startedAt = log.startTime ?? log.timestamp;
    const elapsedHours = Math.max(
      0,
      (endedAt.getTime() - startedAt.getTime()) / 3_600_000 - ((log.breakMinutes ?? 0) / 60),
    );
    const duration = Math.round(elapsedHours * 100) / 100;

    // Claim the still-open row conditionally. Hold/wait/handover/cancel can race
    // with an explicit timer stop or another control action; only one caller is
    // allowed to supply the terminal end time and duration.
    const claimed = await tx.workOrderTimeLog.updateMany({
      where: { id: log.id, endTime: null },
      data: {
        // Preserve original action (`start`/`resume`) so authoritative costing
        // still recognizes this row as labor effort.
        startTime: startedAt,
        endTime: endedAt,
        duration,
        pauseReason: reason,
        notes: log.notes ? `${log.notes} | ${reason}` : reason,
      },
    });

    if (claimed.count !== 1) continue;

    closedHours += duration;
    closedTimerIds.push(log.id);
    closedUserIds.push(log.userId);
  }

  const laborLogs = await tx.workOrderTimeLog.findMany({
    where: {
      workOrderId,
      action: { in: ['start', 'resume'] },
      duration: { not: null },
    },
    select: { duration: true },
  });
  const actualHours = Math.round(
    laborLogs.reduce((sum, log) => sum + (log.duration ?? 0), 0) * 100,
  ) / 100;

  if (closedTimerIds.length > 0) {
    await tx.workOrder.update({
      where: { id: workOrderId },
      data: { actualHours },
    });
  }

  return {
    closedTimerIds,
    closedUserIds: [...new Set(closedUserIds)],
    closedHours: Math.round(closedHours * 100) / 100,
    actualHours,
  };
}

/** Close one technician's genuinely active execution sessions on one WO. */
export function closeActiveWorkSessions(
  tx: Prisma.TransactionClient,
  workOrderId: string,
  userId: string,
  endedAt: Date,
  reason: string,
): Promise<ClosedWorkSessionsResult> {
  return closeSessions(tx, workOrderId, userId, endedAt, reason);
}

/**
 * Close every genuinely active execution session on a WO.
 * Use this when the Work Order itself leaves an executable state (hold,
 * waiting state, shift handover, cancellation) so no teammate timer survives
 * the global state. Each open row is claimed conditionally to make concurrent
 * control operations idempotent at the labor boundary.
 */
export function closeAllActiveWorkSessions(
  tx: Prisma.TransactionClient,
  workOrderId: string,
  endedAt: Date,
  reason: string,
): Promise<ClosedWorkSessionsResult> {
  return closeSessions(tx, workOrderId, null, endedAt, reason);
}
