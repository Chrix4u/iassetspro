import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasAnyPermission, isAdmin } from '@/lib/auth';
import { notifyUser } from '@/lib/notifications';
import { assistanceRequestReason } from '@/lib/technician-reason-defaults';
import { authorizeWorkOrderPlant } from '@/lib/plant-auth-helpers';
import { canManageWorkOrder, canViewWorkOrder } from '@/services/workOrderAccess.service';

/**
 * GET /api/work-orders/[id]/team-member-requests
 * List team member requests for a WO.
 * - Accountable management actors see all requests
 * - Execution actors see requests they submitted
 */
export async function GET(
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

    const wo = await db.workOrder.findUnique({
      where: { id },
      select: {
        id: true,
        assignedBy: true,
        plannerId: true,
        assignedSupervisorId: true,
        teamLeaderId: true,
        assignedTo: true,
        teamMembers: { select: { userId: true } },
        maintenanceRequest: { select: { requestedBy: true } },
      },
    });
    if (!wo) {
      return NextResponse.json({ success: false, error: 'Work order not found' }, { status: 404 });
    }

    if (!canViewWorkOrder(session, wo)) {
      return NextResponse.json(
        { success: false, error: 'Access denied — you are not part of this work order workflow' },
        { status: 403 },
      );
    }

    const canManageTeam =
      (isAdmin(session) || hasAnyPermission(session, ['work_orders.assign_supervisor', 'work_orders.assign_technician'])) &&
      (canManageWorkOrder(session, wo) || wo.assignedBy === session.userId);

    const where: Record<string, unknown> = { workOrderId: id };
    if (!canManageTeam) where.requestedBy = session.userId;

    const requests = await db.woTeamMemberRequest.findMany({
      where,
      include: {
        requestedByUser: { select: { id: true, fullName: true, username: true, primaryTrade: true } },
        requestedUser: { select: { id: true, fullName: true, username: true, department: true, primaryTrade: true } },
        reviewedByUser: { select: { id: true, fullName: true, username: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ success: true, data: requests });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch team member requests';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

/**
 * POST /api/work-orders/[id]/team-member-requests
 * Create a team member request.
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

    const body = await request.json();
    const requestedTrade = typeof body.requestedTrade === 'string' && body.requestedTrade.trim()
      ? body.requestedTrade.trim()
      : typeof body.tradeSkill === 'string' && body.tradeSkill.trim()
        ? body.tradeSkill.trim()
        : null;
    const requestedUserId = typeof body.requestedUserId === 'string' && body.requestedUserId.trim()
      ? body.requestedUserId.trim()
      : null;
    const role = typeof body.role === 'string' && body.role.trim() ? body.role.trim() : 'assistant';
    const reason = typeof body.reason === 'string' && body.reason.trim() ? body.reason.trim() : null;

    if (!['assistant', 'technician'].includes(role)) {
      return NextResponse.json(
        { success: false, error: 'role must be assistant or technician' },
        { status: 400 },
      );
    }

    if (!requestedTrade && !requestedUserId) {
      return NextResponse.json({ success: false, error: 'requestedTrade or requestedUserId is required' }, { status: 400 });
    }

    const wo = await db.workOrder.findUnique({
      where: { id },
      select: {
        id: true,
        woNumber: true,
        title: true,
        plantId: true,
        assignedTo: true,
        teamLeaderId: true,
        assignedSupervisorId: true,
        assignedBy: true,
        plannerId: true,
        isLocked: true,
        assigner: { select: { id: true, fullName: true } },
        teamMembers: { select: { userId: true, accessLevel: true } },
      },
    });
    if (!wo) {
      return NextResponse.json({ success: false, error: 'Work order not found' }, { status: 404 });
    }
    if (!wo.plantId) {
      return NextResponse.json({ success: false, error: 'Operational work order must have a plant' }, { status: 400 });
    }
    if (wo.isLocked) {
      return NextResponse.json({ success: false, error: 'Work order is permanently locked.' }, { status: 400 });
    }

    const isWritableTeamMember = wo.teamMembers.some(
      tm => tm.userId === session.userId && tm.accessLevel !== 'read_only',
    );
    const isExecutionActor =
      wo.assignedTo === session.userId ||
      wo.teamLeaderId === session.userId ||
      isWritableTeamMember;
    const canManageTeam =
      (isAdmin(session) || hasAnyPermission(session, ['work_orders.assign_supervisor', 'work_orders.assign_technician'])) &&
      (canManageWorkOrder(session, wo) || wo.assignedBy === session.userId);

    if (!isExecutionActor && !canManageTeam) {
      return NextResponse.json(
        { success: false, error: 'Only assigned execution staff or accountable assignment management can request additional members.' },
        { status: 403 }
      );
    }

    let targetUser: { id: string; fullName: string } | null = null;
    if (requestedUserId) {
      const user = await db.user.findUnique({
        where: { id: requestedUserId },
        select: {
          id: true,
          fullName: true,
          status: true,
          primaryTrade: true,
          userRoles: { select: { role: { select: { slug: true } } } },
          userSkills: {
            select: {
              trade: { select: { name: true, code: true } },
              proficiencyLevel: true,
            },
          },
          plantAccess: { where: { plantId: wo.plantId }, select: { id: true } },
        },
      });
      if (!user) {
        return NextResponse.json({ success: false, error: 'Requested user not found' }, { status: 400 });
      }
      if (user.status !== 'active') {
        return NextResponse.json({ success: false, error: 'Requested user is not active' }, { status: 400 });
      }
      if (user.plantAccess.length === 0) {
        return NextResponse.json({ success: false, error: 'Requested user does not have access to the work order plant' }, { status: 403 });
      }
      const isMaintenanceTechnician = user.userRoles.some(
        (row) => row.role.slug === 'maintenance_technician',
      );
      if (!isMaintenanceTechnician) {
        return NextResponse.json(
          { success: false, error: 'Requested user must be an active maintenance technician' },
          { status: 422 },
        );
      }
      if (requestedTrade) {
        const requestedSkill = requestedTrade.toLowerCase();
        const skillLabels = [
          user.primaryTrade,
          ...user.userSkills.flatMap((row) => [row.trade.name, row.trade.code]),
        ]
          .filter(Boolean)
          .map((value) => String(value).trim().toLowerCase());
        if (!skillLabels.includes(requestedSkill)) {
          return NextResponse.json(
            { success: false, error: `Requested user does not have the requested trade/skill: ${requestedTrade}` },
            { status: 422 },
          );
        }
      }
      targetUser = user;

      const alreadyMember = wo.teamMembers.some(tm => tm.userId === requestedUserId);
      if (alreadyMember || wo.assignedTo === requestedUserId || wo.teamLeaderId === requestedUserId) {
        return NextResponse.json(
          { success: false, error: 'User is already assigned to this work order' },
          { status: 409 }
        );
      }
    }

    const existingWhere: Record<string, unknown> = { workOrderId: id, status: 'pending' };
    if (requestedUserId) {
      existingWhere.requestedUserId = requestedUserId;
    } else if (requestedTrade) {
      existingWhere.requestedTrade = requestedTrade;
    }

    const existingPending = await db.woTeamMemberRequest.findFirst({ where: existingWhere });
    if (existingPending) {
      return NextResponse.json(
        { success: false, error: 'A pending request already exists for this work order' },
        { status: 409 }
      );
    }

    const resolvedReason = reason || assistanceRequestReason({
      woNumber: wo.woNumber,
      title: wo.title,
      trade: requestedTrade || targetUser?.fullName,
    });

    const teamRequest = await db.woTeamMemberRequest.create({
      data: {
        workOrderId: id,
        requestedBy: session.userId,
        requestedUserId,
        requestedTrade,
        role,
        reason: resolvedReason,
      },
      include: {
        requestedByUser: { select: { id: true, fullName: true, username: true } },
        requestedUser: { select: { id: true, fullName: true, username: true, department: true } },
      },
    });

    await db.auditLog.create({
      data: {
        userId: session.userId,
        action: 'create',
        entityType: 'wo_team_member_request',
        entityId: teamRequest.id,
        newValues: JSON.stringify({
          workOrderId: id,
          requestedTrade,
          requestedUser: targetUser?.fullName || null,
          role,
          reason: resolvedReason,
        }),
      },
    });

    const approverId = wo.plannerId || wo.assignedSupervisorId || wo.assignedBy;
    if (approverId && approverId !== session.userId) {
      const description = requestedTrade
        ? `${session.fullName} requested a ${requestedTrade} for WO ${wo.woNumber || 'Work Order'}`
        : `${session.fullName} requested ${targetUser?.fullName || 'a team member'} for WO ${wo.woNumber || 'Work Order'}`;
      await notifyUser(
        approverId,
        'wo_team_request',
        'Team Member Request',
        description,
        'work_order',
        id,
        `wo-detail?id=${id}`,
      );
    }

    return NextResponse.json({ success: true, data: teamRequest }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create team member request';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
