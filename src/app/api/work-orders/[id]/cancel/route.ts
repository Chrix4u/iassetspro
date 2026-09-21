import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { notifyUser } from '@/lib/notifications';
import { executeTransition } from '@/lib/state-machine';
import { authorizeWorkOrderPlant } from '@/lib/plant-auth-helpers';
import { closeAllActiveWorkSessions } from '@/services/workOrderActiveSession.service';
import { canCancelWorkOrderForActor } from '@/services/workOrderAccess.service';
import { buildAuditData } from '@/lib/audit-helpers';

const CANCELLABLE_STATES = [
  'draft',
  'requested',
  'approved',
  'planned',
  'assigned',
  'in_progress',
  'on_hold',
  'waiting_parts',
  'waiting_tools',
  'waiting_shutdown',
  'waiting_permit',
  'pending_handover',
] as const;

class CancellationTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CancellationTransitionError';
  }
}

/**
 * POST /api/work-orders/[id]/cancel
 *
 * Cancels any non-terminal work order through the canonical state machine.
 * Cancellation always requires a reason. When active execution is being
 * cancelled, every live technician session is closed atomically before the
 * terminal transition. Waiting/hold/handover states deliberately do not close
 * legacy stale rows, because inventing an end time would inflate labor cost.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    const { id } = await params;
    const auth = await authorizeWorkOrderPlant(request, session, id);
    if (!auth.ok) return auth.response;

    if (!hasPermission(session, 'work_orders.cancel') && !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const body = await request.json();
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';

    if (!reason) {
      return NextResponse.json(
        { success: false, error: 'A reason is required to cancel a work order' },
        { status: 400 },
      );
    }

    const wo = await db.workOrder.findUnique({
      where: { id },
      select: {
        id: true,
        woNumber: true,
        status: true,
        assignedTo: true,
        assignedSupervisorId: true,
        plannerId: true,
        assignedBy: true,
        maintenanceRequestId: true,
      },
    });
    if (!wo) {
      return NextResponse.json({ success: false, error: 'Work order not found' }, { status: 404 });
    }

    if (!canCancelWorkOrderForActor(session, wo)) {
      return NextResponse.json(
        { success: false, error: 'You are not the accountable planner/supervisor for this work order' },
        { status: 403 },
      );
    }

    if (!CANCELLABLE_STATES.includes(wo.status as (typeof CANCELLABLE_STATES)[number])) {
      return NextResponse.json(
        {
          success: false,
          error: `Cannot cancel a work order in '${wo.status}' status. Terminal/reviewed work orders require the dedicated review or rework lifecycle.`,
        },
        { status: 400 },
      );
    }

    const cancelledAt = new Date();

    let outcome: {
      closedTimerIds: string[];
      closedTimerUsers: string[];
      actualHours: number | undefined;
    };

    try {
      outcome = await db.$transaction(async (tx) => {
        let closedTimerIds: string[] = [];
        let closedTimerUsers: string[] = [];
        let actualHours: number | undefined;

        if (wo.status === 'in_progress') {
          const closed = await closeAllActiveWorkSessions(
            tx,
            id,
            cancelledAt,
            `Work order cancelled: ${reason}`,
          );
          closedTimerIds = closed.closedTimerIds;
          closedTimerUsers = closed.closedUserIds;
          actualHours = closed.actualHours;
        }

        const result = await executeTransition(
          'work_order',
          id,
          'cancelled',
          session,
          {
            reason,
            extraData: { notes: `[Cancelled] ${reason}` },
            tx,
          },
        );

        if (!result.success) {
          throw new CancellationTransitionError(result.error || 'Failed to cancel work order');
        }

        // Cancellation is lifecycle/audit evidence, not technician labor. Do not
        // create a fake WorkOrderTimeLog row with action=cancel.
        await tx.auditLog.create({
          data: buildAuditData(
            'update',
            'work_order',
            id,
            session.userId,
            { status: wo.status },
            {
              status: 'cancelled',
              reason,
              cancelledAt: cancelledAt.toISOString(),
              closedTimerIds,
              closedTimerUsers,
              ...(actualHours !== undefined ? { actualHours } : {}),
            },
            {
              ipAddress: request.headers.get('x-forwarded-for') || undefined,
              userAgent: request.headers.get('user-agent') || undefined,
            },
          ),
        });

        return {
          closedTimerIds,
          closedTimerUsers,
          actualHours,
        };
      });
    } catch (error: unknown) {
      if (error instanceof CancellationTransitionError) {
        return NextResponse.json({ success: false, error: error.message }, { status: 400 });
      }
      throw error;
    }

    // Notify all team members and requester after the transaction commits.
    const notifyTargets = new Set<string>();

    const teamMembers = await db.workOrderTeamMember.findMany({
      where: { workOrderId: id },
      select: { userId: true },
    });
    for (const member of teamMembers) {
      if (member.userId !== session.userId) notifyTargets.add(member.userId);
    }

    if (wo.assignedTo && wo.assignedTo !== session.userId) {
      notifyTargets.add(wo.assignedTo);
    }

    if (wo.maintenanceRequestId) {
      const linkedMR = await db.maintenanceRequest.findUnique({
        where: { id: wo.maintenanceRequestId },
        select: { requestedBy: true },
      });
      if (linkedMR?.requestedBy && linkedMR.requestedBy !== session.userId) {
        notifyTargets.add(linkedMR.requestedBy);
      }
    }

    for (const targetId of notifyTargets) {
      await notifyUser(
        targetId,
        'wo_cancelled',
        'Work Order Cancelled',
        `${session.fullName} cancelled ${wo.woNumber}. Reason: ${reason}`,
        'work_order',
        id,
        `wo-detail?id=${id}`,
        { forceSms: true },
      );
    }

    const updated = await db.workOrder.findUnique({
      where: { id },
      include: {
        assignee: { select: { id: true, fullName: true, username: true } },
        teamLeader: { select: { id: true, fullName: true, username: true } },
        assignedSupervisor: { select: { id: true, fullName: true, username: true } },
        maintenanceRequest: { select: { id: true, requestNumber: true, title: true } },
      },
    });

    return NextResponse.json({
      success: true,
      data: updated,
      cancellation: {
        closedTimers: outcome.closedTimerIds.length,
        closedTimerUsers: outcome.closedTimerUsers,
        actualHours: outcome.actualHours,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to cancel work order';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
