import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasAnyPermission, isAdmin } from '@/lib/auth';
import { authorizeWorkOrderPlant } from '@/lib/plant-auth-helpers';
import { closeActiveWorkSessions } from '@/services/workOrderActiveSession.service';
import { buildAuditData, extractAuditContext } from '@/lib/audit-helpers';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = getSession(request);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    if (!hasAnyPermission(session, ['work_orders.start', 'work_orders.update']) && !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const { id } = await params;
    const auth = await authorizeWorkOrderPlant(request, session, id);
    if (!auth.ok) return auth.response;

    const body = await request.json() as Record<string, unknown>;
    const reason = typeof body.reason === 'string' && body.reason.trim() ? body.reason.trim() : 'Technician paused execution';
    const endedAt = new Date();
    const auditCtx = extractAuditContext(request);

    const result = await db.$transaction(async (tx) => {
      const wo = await tx.workOrder.findUnique({
        where: { id },
        select: {
          status: true,
          assignedTo: true,
          teamLeaderId: true,
          teamMembers: { select: { userId: true, role: true } },
        },
      });
      if (!wo) return { success: false as const, statusCode: 404, error: 'Work order not found' };
      if (wo.status !== 'in_progress') {
        return { success: false as const, statusCode: 409, error: `Execution timer can only be paused while the work order is in progress (current: ${wo.status})` };
      }

      const isExecutionActor =
        wo.assignedTo === session.userId ||
        wo.teamLeaderId === session.userId ||
        wo.teamMembers.some((m) => m.userId === session.userId && m.role === 'team_leader');
      if (!isExecutionActor && !isAdmin(session)) {
        return { success: false as const, statusCode: 403, error: 'Only the assigned technician or team leader can pause this execution session' };
      }

      const closed = await closeActiveWorkSessions(tx, id, session.userId, endedAt, reason);
      if (closed.closedTimerIds.length === 0) {
        return { success: false as const, statusCode: 409, error: 'You do not have an active execution timer on this work order' };
      }

      await tx.auditLog.create({
        data: buildAuditData(
          'update',
          'work_order',
          id,
          session.userId,
          { status: 'in_progress', activeExecutionSession: true },
          { status: 'in_progress', activeExecutionSession: false, pausedAt: endedAt.toISOString(), reason, actualHours: closed.actualHours },
          auditCtx,
        ),
      });

      return { success: true as const, data: { status: 'in_progress' as const, pausedAt: endedAt, actualHours: closed.actualHours } };
    });

    if (!result.success) return NextResponse.json({ success: false, error: result.error }, { status: result.statusCode });
    return NextResponse.json({ success: true, data: result.data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to pause execution session';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
