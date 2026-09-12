import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasAnyPermission, isAdmin as isAdminCheck } from '@/lib/auth';
import { executeTransition } from '@/lib/state-machine';
import { notifyUser } from '@/lib/notifications';
import { authorizeWorkOrderPlant } from '@/lib/plant-auth-helpers';
import {
  buildDirectAssignmentPlan,
  type DirectAssignmentPlan,
  type WorkOrderTeamMemberInput,
} from '@/services/workOrderAssignment.service';
import type { Prisma } from '@prisma/client';

type AssignmentBody = {
  assignedTo?: string;
  teamLeaderId?: string;
  assignedSupervisorId?: string;
  assignmentType?: 'direct' | 'via_supervisor';
  teamMembers?: WorkOrderTeamMemberInput[];
};

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
    const body: AssignmentBody = await request.json();

    // Plant authorization for caller
    const plantAuth = await authorizeWorkOrderPlant(request, session, id);
    if (!plantAuth.ok) return plantAuth.response;

    const {
      assignedTo,
      teamLeaderId,
      assignedSupervisorId,
      assignmentType: rawAssignmentType,
      teamMembers,
    } = body;

    // Backward compatibility: missing assignmentType defaults to 'direct'
    const assignmentType = rawAssignmentType || 'direct';
    const isViaSupervisor = assignmentType === 'via_supervisor';
    const isDirect = assignmentType === 'direct';
    const isUserAdmin = isAdminCheck(session);
    const canAssignSupervisor = isUserAdmin || hasAnyPermission(session, ['work_orders.assign_supervisor']);
    const canAssignTechnician = isUserAdmin || hasAnyPermission(session, ['work_orders.assign_technician']);

    // Keep delegation and execution-assignment privileges distinct.
    if (isViaSupervisor && !canAssignSupervisor) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions to assign a supervisor' }, { status: 403 });
    }
    if (isDirect && !canAssignTechnician) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions to assign technicians' }, { status: 403 });
    }

    // ── Validation / canonical direct-roster planning ──────────────────────

    let directPlan: DirectAssignmentPlan | null = null;

    if (isViaSupervisor && !assignedSupervisorId) {
      return NextResponse.json(
        { success: false, error: 'assignedSupervisorId is required for via_supervisor assignment' },
        { status: 400 },
      );
    }

    if (isDirect) {
      const planResult = buildDirectAssignmentPlan(assignedTo, teamLeaderId, teamMembers);
      if (!planResult.ok) {
        return NextResponse.json(
          { success: false, error: planResult.error },
          { status: 400 },
        );
      }
      directPlan = planResult.plan;
    }

    // ── Fetch WO with plant info ───────────────────────────────────────────

    const wo = await db.workOrder.findUnique({
      where: { id },
      include: {
        assignee: { select: { id: true, fullName: true, username: true } },
        teamLeader: { select: { id: true, fullName: true, username: true } },
        assignedSupervisor: { select: { id: true, fullName: true, username: true } },
      },
    });

    if (!wo) {
      return NextResponse.json({ success: false, error: 'Work order not found' }, { status: 404 });
    }

    if (wo.isLocked || ['verified', 'closed', 'cancelled'].includes(wo.status)) {
      return NextResponse.json(
        { success: false, error: `Work order cannot be reassigned in status '${wo.status}'` },
        { status: 400 },
      );
    }

    const oldValues = {
      assignedTo: wo.assignedTo,
      teamLeaderId: wo.teamLeaderId,
      assignedSupervisorId: wo.assignedSupervisorId,
      assignmentType: wo.assignmentType,
    };

    // ── Plant-scope check ──────────────────────────────────────────────────

    const plantScopeUserIds: string[] = [];

    if (directPlan) {
      plantScopeUserIds.push(...directPlan.executionMemberIds);
    }
    if (assignedSupervisorId && !plantScopeUserIds.includes(assignedSupervisorId)) {
      plantScopeUserIds.push(assignedSupervisorId);
    }

    const uniqueUserIds = [...new Set(plantScopeUserIds)];

    if (wo.plantId && uniqueUserIds.length > 0) {
      const plantAccessRows = await db.userPlant.findMany({
        where: {
          userId: { in: uniqueUserIds },
          plantId: wo.plantId,
        },
        select: { userId: true },
      });
      const usersWithAccess = new Set(plantAccessRows.map((r) => r.userId));

      for (const uid of uniqueUserIds) {
        if (!usersWithAccess.has(uid) && !isUserAdmin) {
          return NextResponse.json(
            { success: false, error: `User ${uid} does not have access to plant ${wo.plantId}` },
            { status: 403 },
          );
        }
      }
    }

    // ── Verify users exist ─────────────────────────────────────────────────

    const allUserIdsToVerify = [...new Set([
      ...(directPlan?.executionMemberIds ?? []),
      ...(assignedSupervisorId ? [assignedSupervisorId] : []),
    ])];

    if (allUserIdsToVerify.length > 0) {
      const users = await db.user.findMany({
        where: { id: { in: allUserIdsToVerify } },
        select: { id: true, fullName: true },
      });
      const existingUserIds = new Set(users.map((u) => u.id));
      for (const uid of allUserIdsToVerify) {
        if (!existingUserIds.has(uid)) {
          return NextResponse.json(
            { success: false, error: `User ${uid} not found` },
            { status: 400 },
          );
        }
      }
    }

    // ── Determine effective assignment values ──────────────────────────────

    let effectiveAssignedTo: string | null = wo.assignedTo;
    let effectiveTeamLeaderId: string | null = wo.teamLeaderId;
    let effectiveAssignedSupervisorId: string | null = assignedSupervisorId ?? wo.assignedSupervisorId;

    if (isViaSupervisor) {
      // Delegation means the supervisor owns the next assignment decision.
      // Clear the previous execution team so stale technicians do not retain
      // assignment access while the WO waits for supervisor reassignment.
      effectiveAssignedTo = null;
      effectiveTeamLeaderId = null;
      effectiveAssignedSupervisorId = assignedSupervisorId!;
    } else if (directPlan) {
      effectiveAssignedTo = directPlan.effectiveAssignedTo;
      effectiveTeamLeaderId = directPlan.effectiveTeamLeaderId;
    }

    const now = new Date();

    // ── Execute everything inside a transaction ────────────────────────────

    const result = await db.$transaction(async (tx: Prisma.TransactionClient) => {
      const assignmentData = {
        assignedTo: effectiveAssignedTo,
        teamLeaderId: effectiveTeamLeaderId,
        assignedSupervisorId: effectiveAssignedSupervisorId,
        assignedBy: session.userId,
        assignmentType,
        assignmentResponseStatus: 'pending',
        assignmentRespondedBy: null,
        assignmentRespondedAt: null,
        assignmentResponseReason: null,
      };

      // A WO may already be `assigned` after MR conversion. Reassignment is a
      // resource-planning change, not a lifecycle status change, so never create
      // a fake assigned→assigned transition/history row. Use updatedAt as the
      // compare-and-set boundary so two planners/supervisors cannot silently
      // overwrite each other's concurrent reassignment.
      let transitionResult: { success: boolean; error?: string; data?: Record<string, unknown> };
      if (wo.status === 'assigned') {
        const claimed = await tx.workOrder.updateMany({
          where: {
            id,
            status: 'assigned',
            updatedAt: wo.updatedAt,
          },
          data: assignmentData,
        });
        if (claimed.count !== 1) {
          throw new Error(
            `Assignment conflict for work order "${id}": the assignment changed concurrently; reload and retry.`,
          );
        }
        transitionResult = { success: true, data: { status: 'assigned', reassigned: true } };
      } else {
        transitionResult = await executeTransition(
          'work_order',
          id,
          'assigned',
          session,
          { extraData: assignmentData, tx },
        );
        if (!transitionResult.success) {
          throw new Error(transitionResult.error);
        }
      }

      // Assignment is authoritative for execution membership. Replace the
      // roster atomically so former technicians cannot retain stale WO access.
      if (isDirect && directPlan) {
        await tx.workOrderTeamMember.deleteMany({
          where: {
            workOrderId: id,
            userId: { notIn: directPlan.executionMemberIds },
          },
        });

        for (const member of directPlan.members) {
          const accessLevel = member.isLeader ? 'full' : 'execution';
          await tx.workOrderTeamMember.upsert({
            where: {
              workOrderId_userId: { workOrderId: id, userId: member.userId },
            },
            update: {
              role: member.role,
              accessLevel,
              addedById: session.userId,
              addedVia: 'direct',
              assignedAt: now,
            },
            create: {
              workOrderId: id,
              userId: member.userId,
              role: member.role,
              accessLevel,
              addedById: session.userId,
              addedVia: 'direct',
              assignedAt: now,
            },
          });
        }
      } else if (isViaSupervisor) {
        await tx.workOrderTeamMember.deleteMany({ where: { workOrderId: id } });
      }

      const newValues: Record<string, unknown> = {
        assignmentType,
        reassignment: wo.status === 'assigned',
        assignedTo: effectiveAssignedTo,
        teamLeaderId: effectiveTeamLeaderId,
        assignedSupervisorId: effectiveAssignedSupervisorId,
        teamMembersCount: directPlan?.executionMemberIds.length ?? 0,
      };

      await tx.auditLog.create({
        data: {
          userId: session.userId,
          action: 'update',
          entityType: 'work_order',
          entityId: id,
          oldValues: JSON.stringify(oldValues),
          newValues: JSON.stringify(newValues),
        },
      });

      return transitionResult;
    });

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }

    if (isDirect && effectiveAssignedTo && effectiveAssignedTo !== session.userId) {
      notifyUser(
        effectiveAssignedTo,
        'wo_assigned',
        'Work Order Assigned',
        `${session.fullName} assigned ${wo.woNumber} to you: "${wo.title}"`,
        'work_order',
        id,
        `wo-detail?id=${id}`,
        { forceSms: true },
      ).catch(() => {});
    }

    if (isDirect && directPlan) {
      for (const member of directPlan.members) {
        if (member.userId !== session.userId && member.userId !== effectiveAssignedTo) {
          notifyUser(
            member.userId,
            'wo_assigned',
            'Work Order Team Assignment',
            `${session.fullName} assigned you to the team for ${wo.woNumber}: "${wo.title}"`,
            'work_order',
            id,
            `wo-detail?id=${id}`,
            { forceSms: true },
          ).catch(() => {});
        }
      }
    }

    if (effectiveAssignedSupervisorId && effectiveAssignedSupervisorId !== session.userId) {
      const supervisorMsg = isViaSupervisor
        ? `${session.fullName} delegated ${wo.woNumber} to you for assignment: "${wo.title}"`
        : `${session.fullName} assigned ${wo.woNumber} with you as supervisor: "${wo.title}"`;
      notifyUser(
        effectiveAssignedSupervisorId,
        'wo_assigned',
        isViaSupervisor ? 'Work Order Delegated' : 'Work Order Supervisor Assignment',
        supervisorMsg,
        'work_order',
        id,
        `wo-detail?id=${id}`,
        { forceSms: true },
      ).catch(() => {});
    }

    const updated = await db.workOrder.findUnique({
      where: { id },
      include: {
        assignee: { select: { id: true, fullName: true, username: true } },
        teamLeader: { select: { id: true, fullName: true, username: true } },
        assignedSupervisor: { select: { id: true, fullName: true, username: true } },
        assigner: { select: { id: true, fullName: true, username: true } },
        maintenanceRequest: { select: { id: true, requestNumber: true, title: true } },
      },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to assign work order';
    const status = message.startsWith('Assignment conflict for work order') || message.includes('Transition conflict')
      ? 409
      : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
