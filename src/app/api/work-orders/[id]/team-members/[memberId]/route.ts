import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasAnyPermission, isAdmin } from '@/lib/auth';
import { authorizeWorkOrderPlant } from '@/lib/plant-auth-helpers';
import { canManageWorkOrder } from '@/services/workOrderAccess.service';

/**
 * DELETE /api/work-orders/[id]/team-members/[memberId]
 * Remove an assistant/specialist from a work order.
 * Primary assignment/team leadership changes must go through /assign.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; memberId: string }> }
) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    const { id, memberId } = await params;

    const plantAuth = await authorizeWorkOrderPlant(request, session, id);
    if (!plantAuth.ok) return plantAuth.response;

    const wo = await db.workOrder.findUnique({
      where: { id },
      select: {
        id: true,
        assignedBy: true,
        assignedTo: true,
        teamLeaderId: true,
        assignedSupervisorId: true,
        plannerId: true,
        isLocked: true,
      },
    });
    if (!wo) {
      return NextResponse.json({ success: false, error: 'Work order not found' }, { status: 404 });
    }

    if (wo.isLocked) {
      return NextResponse.json({ success: false, error: 'Work order is permanently locked. No modifications are allowed after planner closure.' }, { status: 400 });
    }

    const hasAssignmentPermission = isAdmin(session) ||
      hasAnyPermission(session, ['work_orders.assign_supervisor', 'work_orders.assign_technician']);
    const canDirectRemove = hasAssignmentPermission &&
      (canManageWorkOrder(session, wo) || wo.assignedBy === session.userId);

    if (!canDirectRemove) {
      return NextResponse.json(
        {
          success: false,
          error: 'You do not have accountable assignment authority to remove team members from this work order.',
          code: 'USE_REQUEST_FLOW',
        },
        { status: 403 }
      );
    }

    const member = await db.workOrderTeamMember.findUnique({
      where: { id: memberId },
      include: { user: { select: { id: true, fullName: true, username: true } } },
    });
    if (!member) {
      return NextResponse.json({ success: false, error: 'Team member not found' }, { status: 404 });
    }

    if (member.workOrderId !== id) {
      return NextResponse.json(
        { success: false, error: 'Team member does not belong to this work order' },
        { status: 400 }
      );
    }

    if (member.userId === wo.assignedTo || member.userId === wo.teamLeaderId || member.role === 'team_leader') {
      return NextResponse.json(
        {
          success: false,
          error: 'Primary assignee/team leader ownership cannot be removed through the team-member endpoint. Use the canonical assignment workflow.',
        },
        { status: 409 },
      );
    }

    await db.$transaction(async (tx) => {
      await tx.workOrderTeamMember.delete({ where: { id: memberId } });
      await tx.auditLog.create({
        data: {
          userId: session.userId,
          action: 'delete',
          entityType: 'wo_team_member',
          entityId: memberId,
          oldValues: JSON.stringify({
            workOrderId: id,
            userId: member.userId,
            userName: member.user.fullName,
            role: member.role,
          }),
        },
      });
    });

    return NextResponse.json({ success: true, data: { id: memberId } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to remove team member';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
