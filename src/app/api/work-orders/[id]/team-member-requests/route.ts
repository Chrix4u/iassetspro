import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasAnyPermission, isAdmin } from '@/lib/auth';
import { notifyUser } from '@/lib/notifications';
import { authorizeWorkOrderPlant } from '@/lib/plant-auth-helpers';

/**
 * GET /api/work-orders/[id]/team-member-requests
 * List team member requests for a WO.
 * - Admins/planners/assigner see all requests
 * - Technicians/team members see their own requests
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

    // Plant authorization
    const plantAuth = await authorizeWorkOrderPlant(request, session, id);
    if (!plantAuth.ok) return plantAuth.response;

    // Fetch WO with planner info
    const wo = await db.workOrder.findUnique({
      where: { id },
      select: {
        id: true,
        assignedBy: true,
        plannerId: true,
        teamLeaderId: true,
        assignedTo: true,
        teamMembers: { select: { userId: true } },
      },
    });
    if (!wo) {
      return NextResponse.json({ success: false, error: 'Work order not found' }, { status: 404 });
    }

    // Determine if user can see all requests (admin/planner/assigner)
    const canManageTeam = isAdmin(session) ||
      hasAnyPermission(session, ['work_orders.assign_supervisor']) ||
      wo.plannerId === session.userId ||
      wo.assignedBy === session.userId;

    // Build where clause: admins see all, others see their own
    const where: Record<string, unknown> = { workOrderId: id };
    if (!canManageTeam) {
      (where as Record<string, unknown>).requestedBy = session.userId;
    }

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
 * - Technicians and team members can request a TRADE (e.g. "Electrician", "Mechanical Fitter")
 * - The request is sent to the assigner/planner for approval
 * - On approval, the approver picks the actual technician to assign
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

    // POST must enforce the same plant boundary as GET and other Repairs mutations.
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

    // `tradeSkill` is accepted as a compatibility alias for the Technician Workspace,
    // but the canonical persisted/API field is requestedTrade.
    if (!requestedTrade && !requestedUserId) {
      return NextResponse.json({ success: false, error: 'requestedTrade or requestedUserId is required' }, { status: 400 });
    }

    // Fetch WO
    const wo = await db.workOrder.findUnique({
      where: { id },
      select: {
        id: true,
        woNumber: true,
        assignedTo: true,
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

    if (wo.isLocked) {
      return NextResponse.json({ success: false, error: 'Work order is permanently locked.' }, { status: 400 });
    }

    // Only writable team members, assignee, or admin/planner can request assistance.
    const isWritableTeamMember = wo.teamMembers?.some(
      tm => tm.userId === session.userId && tm.accessLevel !== 'read_only',
    );
    const isAssignee = wo.assignedTo === session.userId;
    const isAdminUser = isAdmin(session) || session.roles.some(roleName =>
      ['maintenance_manager', 'plant_manager'].includes(roleName),
    );
    const canManageTeam = hasAnyPermission(session, ['work_orders.assign_supervisor']) || isAdminUser;

    if (!isWritableTeamMember && !isAssignee && !canManageTeam) {
      return NextResponse.json(
        { success: false, error: 'Only writable team members or the assigned technician can request additional members.' },
        { status: 403 }
      );
    }

    // If a specific user was requested, verify they exist and are active
    let targetUser: { id: string; fullName: string } | null = null;
    if (requestedUserId) {
      const user = await db.user.findUnique({
        where: { id: requestedUserId },
        select: { id: true, fullName: true, status: true },
      });
      if (!user) {
        return NextResponse.json({ success: false, error: 'Requested user not found' }, { status: 400 });
      }
      if (user.status !== 'active') {
        return NextResponse.json({ success: false, error: 'Requested user is not active' }, { status: 400 });
      }
      targetUser = user;

      // Check not already a team member
      const alreadyMember = wo.teamMembers?.some(tm => tm.userId === requestedUserId);
      if (alreadyMember) {
        return NextResponse.json(
          { success: false, error: 'User is already a team member of this work order' },
          { status: 409 }
        );
      }
    }

    // Check for duplicate pending request (same trade or same user)
    const existingWhere: Record<string, unknown> = { workOrderId: id, status: 'pending' };
    if (requestedUserId) {
      existingWhere.requestedUserId = requestedUserId;
    } else if (requestedTrade) {
      existingWhere.requestedTrade = requestedTrade;
    }

    const existingPending = await db.woTeamMemberRequest.findFirst({ where: existingWhere });
    if (existingPending) {
      return NextResponse.json(
        { success: false, error: 'A pending request already exists for this on this work order' },
        { status: 409 }
      );
    }

    // Create the request
    const teamRequest = await db.woTeamMemberRequest.create({
      data: {
        workOrderId: id,
        requestedBy: session.userId,
        requestedUserId,
        requestedTrade,
        role,
        reason,
      },
      include: {
        requestedByUser: { select: { id: true, fullName: true, username: true } },
        requestedUser: { select: { id: true, fullName: true, username: true, department: true } },
      },
    });

    // Audit log
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
          reason,
        }),
      },
    });

    // Notify the planner (or assigner as fallback) about the new request
    const approverId = wo.plannerId || wo.assignedBy;
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
