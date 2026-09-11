import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, isAdmin } from '@/lib/auth';
import { authorizeWorkOrderPlant } from '@/lib/plant-auth-helpers';
import { buildAuditData, extractAuditContext } from '@/lib/audit-helpers';

const EDITABLE_EXECUTION_STATUSES = new Set([
  'assigned', 'in_progress', 'waiting_parts', 'waiting_tools', 'waiting_shutdown',
  'waiting_permit', 'on_hold', 'pending_handover',
]);

function normalize(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') return undefined;
  return value.trim() || null;
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = getSession(request);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    const { id } = await params;
    const auth = await authorizeWorkOrderPlant(request, session, id);
    if (!auth.ok) return auth.response;

    const wo = await db.workOrder.findUnique({
      where: { id },
      select: {
        status: true,
        isLocked: true,
        assignedTo: true,
        teamLeaderId: true,
        assignmentResponseStatus: true,
        failureDescription: true,
        causeDescription: true,
        actionDescription: true,
        teamMembers: { select: { userId: true, role: true } },
      },
    });
    if (!wo) return NextResponse.json({ success: false, error: 'Work order not found' }, { status: 404 });
    if (wo.isLocked || !EDITABLE_EXECUTION_STATUSES.has(wo.status)) {
      return NextResponse.json({ success: false, error: `Execution details cannot be edited in status ${wo.status}` }, { status: 409 });
    }

    const accountableActor =
      wo.assignedTo === session.userId ||
      wo.teamLeaderId === session.userId ||
      wo.teamMembers.some((m) => m.userId === session.userId && m.role === 'team_leader');
    if (!accountableActor && !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Only the assigned technician or team leader can update the authoritative execution report' }, { status: 403 });
    }
    if (wo.status === 'assigned' && wo.assignmentResponseStatus !== 'accepted') {
      return NextResponse.json({ success: false, error: 'Accept the assignment before entering execution details' }, { status: 409 });
    }

    const body = await request.json() as Record<string, unknown>;
    const failureDescription = normalize(body.failureDescription);
    const causeDescription = normalize(body.causeDescription);
    const actionDescription = normalize(body.actionDescription);
    const data: Record<string, string | null> = {};
    if (failureDescription !== undefined) data.failureDescription = failureDescription;
    if (causeDescription !== undefined) data.causeDescription = causeDescription;
    if (actionDescription !== undefined) data.actionDescription = actionDescription;
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ success: false, error: 'No supported execution fields supplied' }, { status: 400 });
    }

    const updated = await db.$transaction(async (tx) => {
      const result = await tx.workOrder.update({ where: { id }, data, select: { failureDescription: true, causeDescription: true, actionDescription: true, updatedAt: true } });
      await tx.auditLog.create({
        data: buildAuditData(
          'update', 'work_order', id, session.userId,
          { failureDescription: wo.failureDescription, causeDescription: wo.causeDescription, actionDescription: wo.actionDescription },
          data,
          extractAuditContext(request),
        ),
      });
      return result;
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to save execution details';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
