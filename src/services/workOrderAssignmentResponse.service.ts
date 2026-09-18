import { assignmentDeclineReason } from '@/lib/technician-reason-defaults';
import { db } from '@/lib/db';
import { buildAuditData } from '@/lib/audit-helpers';
import { notifyUser } from '@/lib/notifications';

export type AssignmentResponseDecision = 'accepted' | 'declined';

export interface AssignmentResponseSession {
  userId: string;
  fullName?: string;
}

export interface AssignmentResponseAuditContext {
  ipAddress?: string;
  userAgent?: string;
  sessionId?: string;
  plantId?: string;
  departmentId?: string;
}

type AssignmentTarget = {
  assignedTo: string | null;
  teamLeaderId: string | null;
  teamMembers: Array<{ userId: string; role: string }>;
};

export function canRespondToWorkOrderAssignment(wo: AssignmentTarget, userId: string): boolean {
  const actorIds = new Set<string>();
  if (wo.assignedTo) actorIds.add(wo.assignedTo);
  for (const member of wo.teamMembers) actorIds.add(member.userId);

  const isTeamLeader =
    wo.teamLeaderId === userId ||
    wo.teamMembers.some((member) => member.userId === userId && member.role === 'team_leader');

  if (actorIds.size > 1) return isTeamLeader;
  return wo.assignedTo === userId || isTeamLeader;
}

export async function respondToWorkOrderAssignment(
  workOrderId: string,
  decision: AssignmentResponseDecision,
  session: AssignmentResponseSession,
  options: { reason?: string; auditCtx?: AssignmentResponseAuditContext } = {},
) {
  const requestedReason = options.reason?.trim() || null;

  const respondedAt = new Date();
  const outcome = await db.$transaction(async (tx) => {
    const wo = await tx.workOrder.findUnique({
      where: { id: workOrderId },
      select: {
        id: true,
        woNumber: true,
        title: true,
        status: true,
        updatedAt: true,
        isLocked: true,
        assignedTo: true,
        teamLeaderId: true,
        assignedSupervisorId: true,
        plannerId: true,
        assignedBy: true,
        assignmentResponseStatus: true,
        assignmentRespondedAt: true,
        assignmentResponseReason: true,
        teamMembers: { select: { userId: true, role: true } },
      },
    });

    if (!wo) return { success: false as const, statusCode: 404, error: 'Work order not found' };
    const reason = decision === 'declined'
      ? requestedReason || assignmentDeclineReason({ woNumber: wo.woNumber, title: wo.title })
      : null;
    if (wo.isLocked) return { success: false as const, statusCode: 409, error: 'Work order is locked' };
    if (wo.status !== 'assigned') {
      return { success: false as const, statusCode: 409, error: `Assignment response is only allowed while status is assigned (current: ${wo.status})` };
    }
    if (!canRespondToWorkOrderAssignment(wo, session.userId)) {
      return { success: false as const, statusCode: 403, error: 'Only the assigned technician or accountable team leader can accept or decline this work order' };
    }

    // Even an idempotent retry must prove that it still refers to the same
    // assignment snapshot. Reassignment resets response state, so returning a
    // stale success after the WO has moved to another technician would be unsafe.
    if (wo.assignmentResponseStatus === decision) {
      const claimed = await tx.workOrder.updateMany({
        where: {
          id: workOrderId,
          status: 'assigned',
          updatedAt: wo.updatedAt,
          assignmentResponseStatus: decision,
        },
        data: { assignmentResponseStatus: decision },
      });
      if (claimed.count !== 1) {
        return {
          success: false as const,
          statusCode: 409,
          error: 'Assignment changed concurrently; reload the work order before responding again',
        };
      }

      return {
        success: true as const,
        data: {
          assignmentResponseStatus: decision,
          assignmentRespondedAt: wo.assignmentRespondedAt,
          assignmentResponseReason: wo.assignmentResponseReason,
          idempotent: true,
        },
        notify: null,
      };
    }

    const claimed = await tx.workOrder.updateMany({
      where: {
        id: workOrderId,
        status: 'assigned',
        updatedAt: wo.updatedAt,
      },
      data: {
        assignmentResponseStatus: decision,
        assignmentRespondedBy: session.userId,
        assignmentRespondedAt: respondedAt,
        assignmentResponseReason: decision === 'declined' ? reason : null,
      },
    });

    if (claimed.count !== 1) {
      return {
        success: false as const,
        statusCode: 409,
        error: 'Assignment changed concurrently; reload the work order before responding again',
      };
    }

    await tx.auditLog.create({
      data: buildAuditData(
        'update',
        'work_order',
        workOrderId,
        session.userId,
        { assignmentResponseStatus: wo.assignmentResponseStatus },
        {
          assignmentResponseStatus: decision,
          assignmentRespondedAt: respondedAt.toISOString(),
          assignmentResponseReason: decision === 'declined' ? reason : null,
        },
        options.auditCtx,
      ),
    });

    return {
      success: true as const,
      data: {
        assignmentResponseStatus: decision,
        assignmentRespondedAt: respondedAt,
        assignmentResponseReason: decision === 'declined' ? reason : null,
        idempotent: false,
      },
      notify: {
        woNumber: wo.woNumber,
        title: wo.title,
        recipients: [wo.plannerId, wo.assignedSupervisorId, wo.assignedBy].filter((id): id is string => Boolean(id)),
      },
    };
  });

  if (!outcome.success || !outcome.notify) return outcome;

  for (const userId of new Set(outcome.notify.recipients)) {
    if (userId === session.userId) continue;
    notifyUser(
      userId,
      decision === 'accepted' ? 'wo_assignment_accepted' : 'wo_assignment_declined',
      decision === 'accepted' ? 'Work Order Accepted' : 'Work Order Declined',
      decision === 'accepted'
        ? `${session.fullName || 'Technician'} accepted ${outcome.notify.woNumber}: "${outcome.notify.title}"`
        : `${session.fullName || 'Technician'} declined ${outcome.notify.woNumber}: ${outcome.data.assignmentResponseReason || requestedReason || 'Assignment declined'}`,
      'work_order',
      workOrderId,
      `wo-detail?id=${workOrderId}`,
      { forceSms: decision === 'declined' },
    ).catch(() => {});
  }

  return { success: true as const, data: outcome.data };
}
