import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, isAdmin } from '@/lib/auth';
import { authorizeWorkOrderPlant } from '@/lib/plant-auth-helpers';

/**
 * POST /api/work-orders/[id]/time-logs/stop
 *
 * Closes the current user's real live execution timer without changing WO
 * status. A timer is only live while its parent WO is in_progress. Historical
 * unclosed rows left behind by legacy hold/waiting/handover paths must never be
 * extended to the current time because that would inflate authoritative labor
 * costing.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    const { id } = await params;
    const plantAuth = await authorizeWorkOrderPlant(request, session, id);
    if (!plantAuth.ok) return plantAuth.response;

    const wo = await db.workOrder.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        isLocked: true,
        assignedTo: true,
        teamLeaderId: true,
        teamMembers: { select: { userId: true } },
      },
    });
    if (!wo) return NextResponse.json({ success: false, error: 'Work order not found' }, { status: 404 });

    if (wo.isLocked) {
      return NextResponse.json({ success: false, error: 'Time logging is locked for this work order' }, { status: 400 });
    }

    // Keep the stop boundary aligned with Start/Resume/active-session. An
    // unclosed row on any other WO state is stale historical data, not a live
    // session. Do not manufacture an end time for it here.
    if (wo.status !== 'in_progress') {
      return NextResponse.json(
        {
          success: false,
          error: `No live execution timer can be stopped while the work order is '${wo.status}'. Historical unclosed rows require reconciliation rather than extending labor time.`,
        },
        { status: 409 },
      );
    }

    const isExecutionUser =
      wo.assignedTo === session.userId ||
      wo.teamLeaderId === session.userId ||
      wo.teamMembers.some((member) => member.userId === session.userId);
    if (!isExecutionUser && !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'You do not have execution access to this work order' }, { status: 403 });
    }

    const now = new Date();

    const outcome = await db.$transaction(async (tx) => {
      const activeLogs = await tx.workOrderTimeLog.findMany({
        where: {
          workOrderId: id,
          userId: session.userId,
          action: { in: ['start', 'resume'] },
          endTime: null,
        },
        orderBy: { timestamp: 'asc' },
      });

      if (activeLogs.length === 0) {
        return {
          success: false as const,
          error: 'No active timer found for this work order',
        };
      }

      let closedHours = 0;
      const closedTimerIds: string[] = [];

      for (const log of activeLogs) {
        const startedAt = log.startTime || log.timestamp;
        const elapsedHours = Math.max(
          0,
          (now.getTime() - new Date(startedAt).getTime()) / (1000 * 60 * 60) - ((log.breakMinutes || 0) / 60),
        );
        const duration = Math.round(elapsedHours * 100) / 100;

        // Conditional update prevents concurrent stop requests from both
        // claiming the same open timer and overwriting its authoritative end.
        const closed = await tx.workOrderTimeLog.updateMany({
          where: { id: log.id, endTime: null },
          data: {
            // Canonicalize legacy execution-service rows that only populated timestamp.
            startTime: log.startTime || log.timestamp,
            endTime: now,
            duration,
            notes: log.notes ? `${log.notes} | Timer stopped` : 'Timer stopped',
          },
        });

        if (closed.count === 1) {
          closedTimerIds.push(log.id);
          closedHours += duration;
        }
      }

      if (closedTimerIds.length === 0) {
        return {
          success: false as const,
          error: 'The active timer was already stopped by another request',
        };
      }

      const aggregate = await tx.workOrderTimeLog.aggregate({
        where: { workOrderId: id },
        _sum: { duration: true },
      });
      const actualHours = Math.round((aggregate._sum.duration || 0) * 100) / 100;

      await tx.workOrder.update({
        where: { id },
        data: { actualHours },
      });

      await tx.auditLog.create({
        data: {
          userId: session.userId,
          action: 'wo_timer_stop',
          entityType: 'work_order',
          entityId: id,
          newValues: JSON.stringify({
            closedTimerIds,
            closedHours: Math.round(closedHours * 100) / 100,
            actualHours,
            stoppedAt: now.toISOString(),
          }),
        },
      });

      return {
        success: true as const,
        data: {
          stoppedAt: now,
          closedTimers: closedTimerIds.length,
          closedHours: Math.round(closedHours * 100) / 100,
          actualHours,
        },
      };
    });

    if (!outcome.success) {
      return NextResponse.json({ success: false, error: outcome.error }, { status: 409 });
    }

    return NextResponse.json({ success: true, data: outcome.data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to stop active timer';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
