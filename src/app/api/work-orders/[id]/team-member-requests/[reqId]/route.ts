import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasAnyPermission, isAdmin } from '@/lib/auth';
import { notifyUser } from '@/lib/notifications';
import { authorizeWorkOrderPlant } from '@/lib/plant-auth-helpers';
import { canManageWorkOrder } from '@/services/workOrderAccess.service';

/**
 * PUT /api/work-orders/[id]/team-member-requests/[reqId]
 * Approve or reject a team member request.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; reqId: string }> }
) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    const { id, reqId } = await params;
    const auth = await authorizeWorkOrderPlant(request, session, id);
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const { action, reviewNotes, assignUserId } = body;

    if (!action || !['approve', 'reject'].includes(action)) {
      return NextResponse.json({ success: false, error: 'action must be "approve" or "reject"' }, { status: 400 });
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
        teamMembers: { select: { userId: true, role: true, accessLevel: true } },
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

    const hasAssignmentPermission = isAdmin(session) ||
      hasAnyPermission(session, ['work_orders.assign_supervisor', 'work_orders.assign_technician']);
    const canReview = hasAssignmentPermission &&
      (canManageWorkOrder(session, wo) || wo.assignedBy === session.userId);

    if (!canReview) {
      return NextResponse.json(
        { success: false, error: 'Only the accountable assigner, planner, supervisor, or maintenance management can review team member requests.' },
        { status: 403 },
      );
    }

    const teamRequest = await db.woTeamMemberRequest.findUnique({
      where: { id: reqId },
      include: {
        requestedByUser: { select: { id: true, fullName: true, username: true } },
        requestedUser: { select: { id: true, fullName: true, username: true, department: true, primaryTrade: true } },
      },
    });
    if (!teamRequest) {
      return NextResponse.json({ success: false, error: 'Team member request not found' }, { status: 404 });
    }
    if (teamRequest.workOrderId !== id) {
      return NextResponse.json({ success: false, error: 'Request does not belong to this work order' }, { status: 400 });
    }
    if (teamRequest.status !== 'pending') {
      return NextResponse.json(
        { success: false, error: `Request has already been ${teamRequest.status}` },
        { status: 409 },
      );
    }

    if (action === 'approve') {
      let userIdToAssign = teamRequest.requestedUserId;

      if (!userIdToAssign && teamRequest.requestedTrade) {
        if (!assignUserId) {
          return NextResponse.json(
            { success: false, error: 'Please select a technician to assign for this trade request.' },
            { status: 400 },
          );
        }
        userIdToAssign = assignUserId;
      }

      if (!userIdToAssign) {
        return NextResponse.json(
          { success: false, error: 'No user to assign. Either the request must specify a user, or you must select one.' },
          { status: 400 },
        );
      }

      const assignee = await db.user.findUnique({
        where: { id: userIdToAssign },
        select: {
          id: true,
          fullName: true,
          status: true,
          plantAccess: { where: { plantId: wo.plantId }, select: { id: true } },
        },
      });
      if (!assignee) {
        return NextResponse.json({ success: false, error: 'Selected technician not found.' }, { status: 400 });
      }
      if (assignee.status !== 'active') {
        return NextResponse.json({ success: false, error: 'Selected technician is not active.' }, { status: 400 });
      }
      if (assignee.plantAccess.length === 0) {
        return NextResponse.json(
          { success: false, error: 'Selected technician does not have access to the work order plant.' },
          { status: 403 },
        );
      }

      const effectiveLeaderId = wo.teamLeaderId || wo.assignedTo || userIdToAssign;
      const alreadyMember = wo.teamMembers.some((tm) => tm.userId === userIdToAssign);
      const now = new Date();

      await db.$transaction(async (tx) => {
        if (effectiveLeaderId && wo.teamLeaderId !== effectiveLeaderId) {
          await tx.workOrder.update({
            where: { id },
            data: { teamLeaderId: effectiveLeaderId },
          });
        }

        if (effectiveLeaderId) {
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
              assignedAt: now,
            },
          });
        }

        const isLeader = userIdToAssign === effectiveLeaderId;
        await tx.workOrderTeamMember.upsert({
          where: { workOrderId_userId: { workOrderId: id, userId: userIdToAssign } },
          update: {
            role: isLeader ? 'team_leader' : (teamRequest.role || 'assistant'),
            accessLevel: isLeader ? 'full' : 'execution',
            addedById: session.userId,
            addedVia: 'request',
          },
          create: {
            workOrderId: id,
            userId: userIdToAssign,
            role: isLeader ? 'team_leader' : (teamRequest.role || 'assistant'),
            accessLevel: isLeader ? 'full' : 'execution',
            addedById: session.userId,
            addedVia: 'request',
          },
        });

        await tx.woTeamMemberRequest.update({
          where: { id: reqId },
          data: {
            status: 'approved',
            requestedUserId: userIdToAssign,
            reviewedBy: session.userId,
            reviewedAt: now,
            reviewNotes: reviewNotes || (alreadyMember ? 'Already a team member; execution access confirmed' : null),
          },
        });

        await tx.auditLog.create({
          data: {
            userId: session.userId,
            action: 'approve',
            entityType: 'wo_team_member_request',
            entityId: reqId,
            newValues: JSON.stringify({
              workOrderId: id,
              requestedTrade: teamRequest.requestedTrade || null,
              assignedUser: assignee.fullName,
              assignedUserId: userIdToAssign,
              effectiveLeaderId,
              accessLevel: isLeader ? 'full' : 'execution',
              status: 'approved',
              reviewNotes: reviewNotes || null,
            }),
          },
        });
      });

      if (userIdToAssign !== session.userId) {
        await notifyUser(
          userIdToAssign,
          'wo_team_approved',
          'Team Assignment Approved',
          `You have been added to WO ${wo.woNumber || 'Work Order'}: ${wo.title}`,
          'work_order',
          id,
          `wo-detail?id=${id}`,
        );
      }

      if (teamRequest.requestedBy !== session.userId) {
        await notifyUser(
          teamRequest.requestedBy,
          'wo_team_request_approved',
          'Team Request Approved',
          `Your request for ${teamRequest.requestedTrade || 'a team member'} on WO ${wo.woNumber || 'Work Order'} has been approved. ${assignee.fullName} has been assigned.`,
          'work_order',
          id,
          `wo-detail?id=${id}`,
        );
      }

      const updated = await db.woTeamMemberRequest.findUnique({
        where: { id: reqId },
        include: {
          requestedByUser: { select: { id: true, fullName: true, username: true } },
          requestedUser: { select: { id: true, fullName: true, username: true, department: true, primaryTrade: true } },
          reviewedByUser: { select: { id: true, fullName: true, username: true } },
        },
      });

      return NextResponse.json({ success: true, data: updated });
    }

    await db.woTeamMemberRequest.update({
      where: { id: reqId },
      data: {
        status: 'rejected',
        reviewedBy: session.userId,
        reviewedAt: new Date(),
        reviewNotes: reviewNotes || null,
      },
    });

    if (teamRequest.requestedBy !== session.userId) {
      const targetDesc = teamRequest.requestedTrade || teamRequest.requestedUser?.fullName || 'a team member';
      await notifyUser(
        teamRequest.requestedBy,
        'wo_team_request_rejected',
        'Team Request Rejected',
        `Your request for ${targetDesc} on WO ${wo.woNumber || 'Work Order'} has been rejected.${reviewNotes ? ` Reason: ${reviewNotes}` : ''}`,
        'work_order',
        id,
        `wo-detail?id=${id}`,
      );
    }

    await db.auditLog.create({
      data: {
        userId: session.userId,
        action: 'reject',
        entityType: 'wo_team_member_request',
        entityId: reqId,
        newValues: JSON.stringify({
          workOrderId: id,
          requestedTrade: teamRequest.requestedTrade || null,
          requestedUser: teamRequest.requestedUser?.fullName || null,
          status: 'rejected',
          reviewNotes: reviewNotes || null,
        }),
      },
    });

    const updated = await db.woTeamMemberRequest.findUnique({
      where: { id: reqId },
      include: {
        requestedByUser: { select: { id: true, fullName: true, username: true } },
        requestedUser: { select: { id: true, fullName: true, username: true, department: true, primaryTrade: true } },
        reviewedByUser: { select: { id: true, fullName: true, username: true } },
      },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to review team member request';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

/**
 * PATCH /api/work-orders/[id]/team-member-requests/[reqId]
 * Requester may edit an unprocessed pending assistance request.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; reqId: string }> }
) {
  try {
    const session = getSession(request);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });

    const { id, reqId } = await params;
    const auth = await authorizeWorkOrderPlant(request, session, id);
    if (!auth.ok) return auth.response;

    const teamRequest = await db.woTeamMemberRequest.findUnique({ where: { id: reqId } });
    if (!teamRequest) return NextResponse.json({ success: false, error: 'Request not found' }, { status: 404 });
    if (teamRequest.workOrderId !== id) return NextResponse.json({ success: false, error: 'Request does not belong to this work order' }, { status: 400 });
    if (teamRequest.requestedBy !== session.userId) return NextResponse.json({ success: false, error: 'Only the requester can edit this assistance request' }, { status: 403 });
    if (teamRequest.status !== 'pending' || teamRequest.reviewedAt) {
      return NextResponse.json({ success: false, error: 'Only an unprocessed pending request can be edited' }, { status: 409 });
    }

    const body = await request.json();
    const requestedTrade = typeof body.requestedTrade === 'string' ? body.requestedTrade.trim() : '';
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    if (requestedTrade.length < 2) return NextResponse.json({ success: false, error: 'requestedTrade is required' }, { status: 400 });
    if (reason.length < 3) return NextResponse.json({ success: false, error: 'reason is required' }, { status: 400 });

    const updated = await db.$transaction(async (tx) => {
      const row = await tx.woTeamMemberRequest.update({
        where: { id: reqId },
        data: { requestedTrade, reason, role: 'assistant' },
        include: {
requestedByUser: { select: { id: true, fullName: true, username: true } },
requestedUser: { select: { id: true, fullName: true, username: true, department: true, primaryTrade: true } },
        },
      });
      await tx.auditLog.create({
        data: {
userId: session.userId,
action: 'update',
entityType: 'wo_team_member_request',
entityId: reqId,
newValues: JSON.stringify({ workOrderId: id, requestedTrade, reason, status: 'pending' }),
        },
      });
      return row;
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update team member request';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/work-orders/[id]/team-member-requests/[reqId]
 * Cancel a pending team member request.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; reqId: string }> }
) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    const { id, reqId } = await params;
    const auth = await authorizeWorkOrderPlant(request, session, id);
    if (!auth.ok) return auth.response;

    const teamRequest = await db.woTeamMemberRequest.findUnique({ where: { id: reqId } });
    if (!teamRequest) {
      return NextResponse.json({ success: false, error: 'Request not found' }, { status: 404 });
    }
    if (teamRequest.workOrderId !== id) {
      return NextResponse.json({ success: false, error: 'Request does not belong to this work order' }, { status: 400 });
    }

    const wo = await db.workOrder.findUnique({
      where: { id },
      select: {
        assignedSupervisorId: true,
        plannerId: true,
        assignedBy: true,
      },
    });
    if (!wo) {
      return NextResponse.json({ success: false, error: 'Work order not found' }, { status: 404 });
    }

    const hasAssignmentPermission = isAdmin(session) ||
      hasAnyPermission(session, ['work_orders.assign_supervisor', 'work_orders.assign_technician']);
    const canManageCancellation = hasAssignmentPermission &&
      (canManageWorkOrder(session, wo) || wo.assignedBy === session.userId);
    const canCancel = teamRequest.requestedBy === session.userId || canManageCancellation;

    if (!canCancel) {
      return NextResponse.json({ success: false, error: 'You can only cancel your own request unless you are accountable assignment management for this work order' }, { status: 403 });
    }
    if (teamRequest.status !== 'pending') {
      return NextResponse.json(
        { success: false, error: `Cannot cancel a ${teamRequest.status} request` },
        { status: 400 },
      );
    }

    await db.woTeamMemberRequest.update({
      where: { id: reqId },
      data: { status: 'cancelled' },
    });

    return NextResponse.json({ success: true, data: { id: reqId } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to cancel team member request';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
