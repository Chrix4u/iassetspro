import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasAnyPermission, isAdmin } from '@/lib/auth';
import { authorizeWorkOrderPlant } from '@/lib/plant-auth-helpers';
import { canManageWorkOrder } from '@/services/workOrderAccess.service';

const VALID_TEAM_ROLES = ['assistant', 'technician', 'team_leader'];

/**
 * POST /api/work-orders/[id]/team-members
 * Directly add a team member to a work order.
 *
 * Technicians cannot self-expand a team through this route; they must use the
 * assistance-request workflow. Direct assignment remains available only to an
 * accountable WO assignment actor who also holds assignment permission.
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
    const plantAuth = await authorizeWorkOrderPlant(request, session, id);
    if (!plantAuth.ok) return plantAuth.response;

    const woPlantId = plantAuth.entity.plantId;
    if (!woPlantId) {
      return NextResponse.json({ success: false, error: 'Operational work order must have a plant' }, { status: 400 });
    }

    const body = await request.json();
    const userId = typeof body.userId === 'string' ? body.userId.trim() : '';
    const role = typeof body.role === 'string' && body.role ? body.role : 'assistant';

    if (!userId) {
      return NextResponse.json({ success: false, error: 'userId is required' }, { status: 400 });
    }
    if (!VALID_TEAM_ROLES.includes(role)) {
      return NextResponse.json({ success: false, error: `Invalid team role: ${role}` }, { status: 400 });
    }

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
        plantId: true,
      },
    });
    if (!wo) {
      return NextResponse.json({ success: false, error: 'Work order not found' }, { status: 404 });
    }
    if (wo.isLocked) {
      return NextResponse.json({ success: false, error: 'Work order is permanently locked. No modifications are allowed after planner closure.' }, { status: 400 });
    }

    const hasAssignmentPermission = isAdmin(session) ||
      hasAnyPermission(session, ['work_orders.assign_technician', 'work_orders.assign_supervisor']);
    const canDirectAdd = hasAssignmentPermission &&
      (canManageWorkOrder(session, wo) || wo.assignedBy === session.userId);

    if (!canDirectAdd) {
      return NextResponse.json({
        success: false,
        error: 'You do not have accountable assignment authority to directly add team members. Please submit a team member request instead.',
        code: 'USE_REQUEST_FLOW',
      }, { status: 403 });
    }

    const user = await db.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        fullName: true,
        username: true,
        status: true,
        plantAccess: { where: { plantId: woPlantId }, select: { id: true } },
      },
    });
    if (!user || user.status !== 'active') {
      return NextResponse.json({ success: false, error: 'Selected user is not active' }, { status: 400 });
    }
    if (user.plantAccess.length === 0) {
      return NextResponse.json({ success: false, error: 'Selected user does not have access to the work order plant' }, { status: 400 });
    }

    if (wo.assignedTo === userId || wo.teamLeaderId === userId) {
      return NextResponse.json({ success: false, error: 'User is already assigned to this work order' }, { status: 409 });
    }

    const existingMember = await db.workOrderTeamMember.findFirst({
      where: { workOrderId: id, userId },
      select: { id: true },
    });
    if (existingMember) {
      return NextResponse.json({ success: false, error: 'User is already a team member of this work order' }, { status: 409 });
    }

    if (role === 'team_leader' && wo.teamLeaderId && wo.teamLeaderId !== userId) {
      return NextResponse.json({
        success: false,
        error: 'This work order already has a team leader. Use the assignment workflow to change team leadership.',
      }, { status: 409 });
    }

    const member = await db.$transaction(async (tx) => {
      let effectiveLeaderId = wo.teamLeaderId;

      if (!effectiveLeaderId && role !== 'team_leader' && wo.assignedTo) {
        effectiveLeaderId = wo.assignedTo;
        await tx.workOrder.update({ where: { id }, data: { teamLeaderId: effectiveLeaderId } });
        await tx.workOrderTeamMember.upsert({
          where: { workOrderId_userId: { workOrderId: id, userId: effectiveLeaderId } },
          update: { role: 'team_leader', accessLevel: 'full' },
          create: {
            workOrderId: id,
            userId: effectiveLeaderId,
            role: 'team_leader',
            accessLevel: 'full',
            addedById: session.userId,
            addedVia: 'direct',
          },
        });
      }

      if (role === 'team_leader' && !effectiveLeaderId) {
        effectiveLeaderId = userId;
        await tx.workOrder.update({ where: { id }, data: { teamLeaderId: userId } });
      }

      const created = await tx.workOrderTeamMember.create({
        data: {
          workOrderId: id,
          userId,
          role,
          accessLevel: role === 'team_leader' ? 'full' : 'execution',
          addedById: session.userId,
          addedVia: 'direct',
        },
        include: {
          user: { select: { id: true, fullName: true, username: true, department: true } },
        },
      });

      await tx.auditLog.create({
        data: {
          userId: session.userId,
          action: 'create',
          entityType: 'wo_team_member',
          entityId: created.id,
          newValues: JSON.stringify({
            workOrderId: id,
            userId,
            userName: user.fullName,
            role,
            accessLevel: role === 'team_leader' ? 'full' : 'execution',
            teamLeaderId: effectiveLeaderId,
            addedVia: 'direct',
            plantId: woPlantId,
          }),
        },
      });

      return created;
    });

    return NextResponse.json({ success: true, data: member }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to add team member';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
