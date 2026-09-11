import { db } from '@/lib/db';
import { executeTransition } from '@/lib/state-machine';
import { checkReadiness, type ReadinessCheckResult } from '@/services/workOrderReadiness.service';
import { buildAuditData } from '@/lib/audit-helpers';
import { sendRepairNotification } from '@/lib/repair-notifications';

export interface StartExecutionSessionContext {
  userId: string;
  fullName?: string;
  roles: string[];
  permissions: string[];
}

export interface StartExecutionAuditContext {
  ipAddress?: string;
  userAgent?: string;
  sessionId?: string;
  plantId?: string;
  departmentId?: string;
}

export interface StartExecutionOptions {
  reason?: string;
  notes?: string;
  auditCtx?: StartExecutionAuditContext;
}

export interface StartExecutionConflict {
  workOrderId: string;
  woNumber?: string;
  title?: string;
  status: 'in_progress';
  startedAt: string;
}

export type StartExecutionConflictReason =
  | 'ACTIVE_SESSION_CONFLICT'
  | 'ACTIVE_SESSION_ALREADY_RUNNING';

export type StartExecutionResult = {
  success: boolean;
  data?: { status: 'in_progress'; actualStart: Date };
  error?: string;
  readiness?: ReadinessCheckResult;
  conflict?: StartExecutionConflict;
  reason?: StartExecutionConflictReason;
};

class StartExecutionTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StartExecutionTransitionError';
  }
}

function hasStartAuthority(
  wo: {
    assignedTo: string | null;
    teamLeaderId: string | null;
    teamMembers: Array<{ userId: string; role: string }>;
  },
  session: StartExecutionSessionContext,
): boolean {
  // Starting execution opens a real labor timer for the caller, so generic
  // management/admin authority is deliberately not enough. A manager who is
  // genuinely performing the work must first be assigned as the technician or
  // team leader, preserving labor attribution and the assignment audit chain.
  if (wo.assignedTo === session.userId || wo.teamLeaderId === session.userId) return true;
  return wo.teamMembers.some(
    (member) => member.userId === session.userId && member.role === 'team_leader',
  );
}

/**
 * Canonical execution-session boundary.
 *
 * Normal first execution performs the assigned -> in_progress state transition
 * and opens a `start` timer. A WO may also already be in_progress without a live
 * timer after an explicit supervisor rework/control-release decision. In that
 * case the assigned technician/team leader must explicitly begin work: we open
 * a `resume` timer without attempting an invalid in_progress -> in_progress
 * transition and without resetting an existing original actualStart.
 *
 * Authority, readiness, live-session conflict detection, state transition (when
 * required), timer creation and audit remain in one transaction. The route may
 * perform a fast pre-check for UX, but this service is authoritative.
 */
export async function startWorkOrderExecution(
  workOrderId: string,
  session: StartExecutionSessionContext,
  options: StartExecutionOptions = {},
): Promise<StartExecutionResult> {
  const startedAt = new Date();

  const outcome = await db.$transaction(async (tx) => {
    const wo = await tx.workOrder.findUnique({
      where: { id: workOrderId },
      select: {
        id: true,
        woNumber: true,
        status: true,
        actualStart: true,
        assignedTo: true,
        teamLeaderId: true,
        assignmentResponseStatus: true,
        assignedSupervisorId: true,
        plannerId: true,
        teamMembers: { select: { userId: true, role: true } },
      },
    });
    if (!wo) return { success: false as const, error: 'Work order not found' };

    if (!hasStartAuthority(wo, session)) {
      return {
        success: false as const,
        error: 'Only the assigned technician or team leader can start execution on this work order',
      };
    }

    if (wo.status === 'assigned' && wo.assignmentResponseStatus !== 'accepted') {
      return {
        success: false as const,
        error: wo.assignmentResponseStatus === 'declined'
          ? 'This assignment was declined and must be reassigned before work can start'
          : 'Accept the work order assignment before starting execution',
      };
    }

    const readiness = await checkReadiness(workOrderId, 'start', tx);
    if (!readiness.ready) {
      return {
        success: false as const,
        error: 'Work order is not ready to start',
        readiness,
      };
    }

    // A timer row by itself is not enough to prove that work is still live.
    // Legacy/aborted flows can leave an unclosed start/resume row behind after
    // the WO has moved to hold, waiting, handover, completion, verification or
    // closure. Only a timer whose parent WO is truly in_progress is allowed to
    // block another start. We deliberately do not auto-close stale rows here,
    // because inventing an end time would corrupt authoritative labor costing.
    // This applies to every execution actor, including an admin/manager who has
    // explicitly been assigned as technician/team leader.
    const existingLiveSession = await tx.workOrderTimeLog.findFirst({
      where: {
        userId: session.userId,
        action: { in: ['start', 'resume'] },
        endTime: null,
        workOrder: { status: 'in_progress' },
      },
      orderBy: { timestamp: 'desc' },
      select: {
        workOrderId: true,
        startTime: true,
        timestamp: true,
        workOrder: {
          select: {
            woNumber: true,
            title: true,
            status: true,
          },
        },
      },
    });

    if (existingLiveSession) {
      const existingStartedAt = existingLiveSession.startTime || existingLiveSession.timestamp;
      const sameWorkOrder = existingLiveSession.workOrderId === workOrderId;
      return {
        success: false as const,
        reason: sameWorkOrder
          ? 'ACTIVE_SESSION_ALREADY_RUNNING' as const
          : 'ACTIVE_SESSION_CONFLICT' as const,
        error: sameWorkOrder
          ? 'You already have an active work session on this work order'
          : `You already have active work on WO #${existingLiveSession.workOrder?.woNumber || 'unknown'}${existingLiveSession.workOrder?.title ? ` (${existingLiveSession.workOrder.title})` : ''}. Open that work order and put it on hold, hand it over, or complete it before starting another.`,
        conflict: {
          workOrderId: existingLiveSession.workOrderId,
          woNumber: existingLiveSession.workOrder?.woNumber || undefined,
          title: existingLiveSession.workOrder?.title || undefined,
          status: 'in_progress' as const,
          startedAt: existingStartedAt.toISOString(),
        },
      };
    }

    const restartingExecution = wo.status === 'in_progress';

    if (!restartingExecution) {
      const transition = await executeTransition('work_order', workOrderId, 'in_progress', session, {
        reason: options.reason,
        extraData: { actualStart: startedAt },
        tx,
      });
      if (!transition.success) {
        throw new StartExecutionTransitionError(transition.error || 'Failed to start work order');
      }
    } else if (!wo.actualStart) {
      // Defensive repair for a legacy/control-transitioned in_progress WO that
      // has never recorded a genuine execution start. The first real labor
      // session becomes the authoritative actualStart.
      await tx.workOrder.update({
        where: { id: workOrderId },
        data: { actualStart: startedAt },
      });
    }

    await tx.workOrderTimeLog.create({
      data: {
        workOrderId,
        userId: session.userId,
        action: restartingExecution ? 'resume' : 'start',
        notes: options.notes?.trim() || (restartingExecution ? 'Work execution restarted' : 'Work started'),
        timestamp: startedAt,
        startTime: startedAt,
      },
    });

    await tx.auditLog.create({
      data: buildAuditData(
        'update',
        'work_order',
        workOrderId,
        session.userId,
        { status: wo.status },
        restartingExecution
          ? {
              status: 'in_progress',
              executionSessionRestarted: true,
              resumedAt: startedAt.toISOString(),
              actualStartInitialized: !wo.actualStart,
              reason: options.reason?.trim() || null,
            }
          : { status: 'in_progress', actualStart: startedAt.toISOString() },
        options.auditCtx,
      ),
    });

    return {
      success: true as const,
      data: {
        status: 'in_progress' as const,
        actualStart: restartingExecution && wo.actualStart ? wo.actualStart : startedAt,
      },
      restarted: restartingExecution,
      notify: {
        woNumber: wo.woNumber,
        assignedTo: wo.assignedTo,
        teamLeaderId: wo.teamLeaderId,
        assignedSupervisorId: wo.assignedSupervisorId,
        plannerId: wo.plannerId,
        teamMemberIds: wo.teamMembers.map((member) => member.userId),
      },
    };
  }).catch((error: unknown) => {
    if (error instanceof StartExecutionTransitionError) {
      return { success: false as const, error: error.message };
    }
    throw error;
  });

  if (!outcome.success) return outcome;

  const recipients = new Set<string>();
  for (const userId of [
    outcome.notify.assignedTo,
    outcome.notify.teamLeaderId,
    outcome.notify.assignedSupervisorId,
    outcome.notify.plannerId,
    ...outcome.notify.teamMemberIds,
  ]) {
    if (userId && userId !== session.userId) recipients.add(userId);
  }

  for (const userId of recipients) {
    sendRepairNotification({
      userId,
      event: outcome.restarted ? 'wo_resumed' : 'wo_started',
      woNumber: outcome.notify.woNumber,
      woId: workOrderId,
      title: session.fullName || 'Maintenance technician',
    });
  }

  return { success: true, data: outcome.data };
}
