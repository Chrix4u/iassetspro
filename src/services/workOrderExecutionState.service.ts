import { waitingStateReason } from '@/lib/technician-reason-defaults';
import { db } from '@/lib/db';
import { executeTransition } from '@/lib/state-machine';
import { closeAllActiveWorkSessions } from '@/services/workOrderActiveSession.service';
import { buildAuditData } from '@/lib/audit-helpers';
import { sendRepairNotification } from '@/lib/repair-notifications';

export interface ExecutionStateSessionContext {
  userId: string;
  fullName?: string;
  roles: string[];
  permissions: string[];
}

export interface ExecutionStateAuditContext {
  ipAddress?: string;
  userAgent?: string;
  sessionId?: string;
  plantId?: string;
  departmentId?: string;
}

export interface ExecutionStateConflict {
  workOrderId: string;
  woNumber?: string;
  title?: string;
  status: 'in_progress';
  startedAt: string;
}

export type ExecutionStateConflictReason =
  | 'ACTIVE_SESSION_CONFLICT'
  | 'ACTIVE_SESSION_ALREADY_RUNNING';

export type WaitingWorkOrderStatus =
  | 'on_hold'
  | 'waiting_parts'
  | 'waiting_tools'
  | 'waiting_shutdown'
  | 'waiting_permit';

type ExecutionAuthorityWorkOrder = {
  assignedTo: string | null;
  teamLeaderId: string | null;
  assignedSupervisorId: string | null;
  plannerId: string | null;
  teamMembers: Array<{ userId: string; role: string }>;
};

class ExecutionStateTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExecutionStateTransitionError';
  }
}

function hasExecutionManagementOverride(session: ExecutionStateSessionContext): boolean {
  // Keep this aligned with the canonical execution-state transitions. Plant
  // managers retain review/close authority elsewhere, but hold/waiting control
  // belongs to maintenance management.
  return session.roles.some((role) => ['admin', 'maintenance_manager'].includes(role));
}

function hasAssignedExecutionAuthority(
  wo: ExecutionAuthorityWorkOrder,
  session: ExecutionStateSessionContext,
): boolean {
  if (wo.assignedTo === session.userId || wo.teamLeaderId === session.userId) return true;
  return wo.teamMembers.some(
    (member) => member.userId === session.userId && member.role === 'team_leader',
  );
}

function hasHoldControlAuthority(
  wo: ExecutionAuthorityWorkOrder,
  session: ExecutionStateSessionContext,
): boolean {
  if (hasExecutionManagementOverride(session)) return true;
  return wo.assignedSupervisorId === session.userId;
}

function hasWaitingStateAuthority(
  wo: ExecutionAuthorityWorkOrder,
  targetStatus: WaitingWorkOrderStatus,
  session: ExecutionStateSessionContext,
): boolean {
  if (targetStatus === 'on_hold') {
    return hasHoldControlAuthority(wo, session);
  }

  if (hasExecutionManagementOverride(session)) return true;
  if (wo.plannerId === session.userId) return true;
  return hasAssignedExecutionAuthority(wo, session);
}

/**
 * Move a WO from active execution into a non-execution state.
 * All team timers close atomically because the state applies to the whole WO.
 *
 * Supervisor hold is intentionally distinct from technician/planner waiting
 * states. The assigned supervisor (or maintenance-management override) owns the
 * stop/release decision; technicians own execution timers.
 */
export async function placeWorkOrderInWaitingState(
  workOrderId: string,
  targetStatus: WaitingWorkOrderStatus,
  session: ExecutionStateSessionContext,
  options: {
    reason?: string;
    requireExecutionAuthority?: boolean;
    auditCtx?: ExecutionStateAuditContext;
    /** Additional trusted WO fields to update atomically with the state change. */
    extraData?: Record<string, unknown>;
  },
): Promise<{
  success: boolean;
  data?: { status: WaitingWorkOrderStatus; closedTimers: number; actualHours: number };
  error?: string;
}> {
  const requestedReason = options.reason?.trim();
  const changedAt = new Date();

  const outcome = await db.$transaction(async (tx) => {
    const wo = await tx.workOrder.findUnique({
      where: { id: workOrderId },
      select: {
        id: true,
        woNumber: true,
        status: true,
        assignedTo: true,
        teamLeaderId: true,
        assignedSupervisorId: true,
        plannerId: true,
        teamMembers: { select: { userId: true, role: true } },
      },
    });
    if (!wo) return { success: false as const, error: 'Work order not found' };
    const reason = requestedReason || waitingStateReason({
      woNumber: wo.woNumber,
      targetStatus,
    });

    if (options.requireExecutionAuthority && !hasWaitingStateAuthority(wo, targetStatus, session)) {
      return {
        success: false as const,
        error: targetStatus === 'on_hold'
          ? 'Only the assigned supervisor or authorized maintenance manager can place this work order on hold'
          : 'Only the assigned technician, team leader, planner, or authorized maintenance manager can change this execution state',
      };
    }

    const closed = await closeAllActiveWorkSessions(
      tx,
      workOrderId,
      changedAt,
      `Work order entered ${targetStatus}: ${reason}`,
    );

    const transition = await executeTransition('work_order', workOrderId, targetStatus, session, {
      reason,
      extraData: options.extraData,
      tx,
    });
    if (!transition.success) {
      throw new ExecutionStateTransitionError(transition.error || 'State transition failed');
    }

    await tx.auditLog.create({
      data: buildAuditData(
        'update',
        'work_order',
        workOrderId,
        session.userId,
        { status: wo.status },
        {
          status: targetStatus,
          reason,
          closedTimerIds: closed.closedTimerIds,
          closedTimerUsers: closed.closedUserIds,
          actualHours: closed.actualHours,
          ...(options.extraData ? { extraData: options.extraData } : {}),
        },
        options.auditCtx,
      ),
    });

    return {
      success: true as const,
      data: {
        status: targetStatus,
        closedTimers: closed.closedTimerIds.length,
        actualHours: closed.actualHours,
      },
      notify: {
        woNumber: wo.woNumber,
        assignedTo: wo.assignedTo,
        teamLeaderId: wo.teamLeaderId,
        supervisorId: wo.assignedSupervisorId,
        plannerId: wo.plannerId,
        teamMemberIds: wo.teamMembers.map((member) => member.userId),
        reason,
      },
    };
  }).catch((error: unknown) => {
    if (error instanceof ExecutionStateTransitionError) {
      return { success: false as const, error: error.message };
    }
    throw error;
  });

  if (!outcome.success) return outcome;

  const recipients = new Set<string>();
  for (const userId of [
    outcome.notify.assignedTo,
    outcome.notify.teamLeaderId,
    outcome.notify.supervisorId,
    outcome.notify.plannerId,
    ...outcome.notify.teamMemberIds,
  ]) {
    if (userId && userId !== session.userId) recipients.add(userId);
  }

  for (const userId of recipients) {
    sendRepairNotification({
      userId,
      event: targetStatus === 'on_hold' ? 'wo_on_hold' : 'wo_waiting',
      woNumber: outcome.notify.woNumber,
      woId: workOrderId,
      title: session.fullName || 'Maintenance team',
      details: {
        reason: targetStatus === 'on_hold'
          ? outcome.notify.reason
          : `${targetStatus.replaceAll('_', ' ')} — ${outcome.notify.reason}`,
        status: targetStatus,
      },
    });
  }

  return { success: true, data: outcome.data };
}

/**
 * Resume an on-hold/waiting WO.
 *
 * - A technician/team leader resuming a normal waiting state opens a canonical
 *   live `resume` timer.
 * - A planner/maintenance manager clearing a normal waiting state transitions
 *   the WO only; the assigned technician must explicitly start execution.
 * - An assigned supervisor/maintenance manager releasing `on_hold` transitions
 *   the WO only; a supervisor action must never create technician labor time.
 */
export async function resumeWaitingWorkOrder(
  workOrderId: string,
  session: ExecutionStateSessionContext,
  options: { reason?: string; auditCtx?: ExecutionStateAuditContext } = {},
): Promise<{
  success: boolean;
  data?: {
    status: 'in_progress';
    resumedAt: Date;
    executionSessionOpened: boolean;
    technicianExecutionStartRequired: boolean;
  };
  error?: string;
  conflict?: ExecutionStateConflict;
  reason?: ExecutionStateConflictReason;
}> {
  const resumedAt = new Date();

  const outcome = await db.$transaction(async (tx) => {
    const wo = await tx.workOrder.findUnique({
      where: { id: workOrderId },
      select: {
        id: true,
        woNumber: true,
        status: true,
        assignedTo: true,
        teamLeaderId: true,
        assignedSupervisorId: true,
        plannerId: true,
        teamMembers: { select: { userId: true, role: true } },
      },
    });
    if (!wo) return { success: false as const, error: 'Work order not found' };

    const releasingSupervisorHold = wo.status === 'on_hold';
    const assignedExecutionActor = hasAssignedExecutionAuthority(wo, session);
    const maintenanceOverride = hasExecutionManagementOverride(session);
    const plannerControlRelease = !releasingSupervisorHold && wo.plannerId === session.userId;

    const authorized = releasingSupervisorHold
      ? hasHoldControlAuthority(wo, session)
      : assignedExecutionActor || plannerControlRelease || maintenanceOverride;

    if (!authorized) {
      return {
        success: false as const,
        error: releasingSupervisorHold
          ? 'Only the assigned supervisor or authorized maintenance manager can release this work order from hold'
          : 'Only the assigned technician, team leader, planner, or authorized maintenance manager can resume this work order',
      };
    }

    // Only a genuine execution actor opens a labor timer. Supervisor/planner/
    // manager control decisions merely release the WO back to in_progress so
    // the technician can explicitly begin/restart execution.
    const executionSessionOpened = !releasingSupervisorHold && assignedExecutionActor;
    const technicianExecutionStartRequired = !executionSessionOpened;

    // Match the canonical start boundary. Every actor who is about to create an
    // execution timer—including an admin who is genuinely assigned as an
    // execution worker—must obey the one-live-session invariant. Admin status is
    // not a license to create overlapping labor time.
    if (executionSessionOpened) {
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
        const sameWorkOrder = existingLiveSession.workOrderId === workOrderId;
        const startedAt = existingLiveSession.startTime || existingLiveSession.timestamp;
        const conflict: ExecutionStateConflict = {
          workOrderId: existingLiveSession.workOrderId,
          woNumber: existingLiveSession.workOrder?.woNumber || undefined,
          title: existingLiveSession.workOrder?.title || undefined,
          status: 'in_progress',
          startedAt: startedAt.toISOString(),
        };

        return {
          success: false as const,
          reason: sameWorkOrder
            ? 'ACTIVE_SESSION_ALREADY_RUNNING' as const
            : 'ACTIVE_SESSION_CONFLICT' as const,
          error: sameWorkOrder
            ? 'You already have an active work session on this work order'
            : `You already have active work on WO #${existingLiveSession.workOrder?.woNumber || 'unknown'}${existingLiveSession.workOrder?.title ? ` (${existingLiveSession.workOrder.title})` : ''}. Open that work order and hold, hand over, or complete it before resuming another.`,
          conflict,
        };
      }
    }

    const transition = await executeTransition('work_order', workOrderId, 'in_progress', session, {
      reason: options.reason,
      tx,
    });
    if (!transition.success) {
      throw new ExecutionStateTransitionError(transition.error || 'Failed to resume work order');
    }

    if (executionSessionOpened) {
      await tx.workOrderTimeLog.create({
        data: {
          workOrderId,
          userId: session.userId,
          action: 'resume',
          notes: options.reason?.trim() || 'Work resumed',
          timestamp: resumedAt,
          startTime: resumedAt,
        },
      });
    }

    await tx.auditLog.create({
      data: buildAuditData(
        'update',
        'work_order',
        workOrderId,
        session.userId,
        { status: wo.status },
        {
          status: 'in_progress',
          resumedAt: resumedAt.toISOString(),
          executionSessionOpened,
          technicianExecutionStartRequired,
        },
        options.auditCtx,
      ),
    });

    return {
      success: true as const,
      data: {
        status: 'in_progress' as const,
        resumedAt,
        executionSessionOpened,
        technicianExecutionStartRequired,
      },
      notify: {
        woNumber: wo.woNumber,
        assignedTo: wo.assignedTo,
        teamLeaderId: wo.teamLeaderId,
        supervisorId: wo.assignedSupervisorId,
        plannerId: wo.plannerId,
        teamMemberIds: wo.teamMembers.map((member) => member.userId),
      },
    };
  }).catch((error: unknown) => {
    if (error instanceof ExecutionStateTransitionError) {
      return { success: false as const, error: error.message };
    }
    throw error;
  });

  if (!outcome.success) return outcome;

  const recipients = new Set<string>();
  for (const userId of [
    outcome.notify.assignedTo,
    outcome.notify.teamLeaderId,
    outcome.notify.supervisorId,
    outcome.notify.plannerId,
    ...outcome.notify.teamMemberIds,
  ]) {
    if (userId && userId !== session.userId) recipients.add(userId);
  }

  for (const userId of recipients) {
    sendRepairNotification({
      userId,
      event: outcome.data.executionSessionOpened ? 'wo_resumed' : 'wo_released',
      woNumber: outcome.notify.woNumber,
      woId: workOrderId,
      title: session.fullName || 'Maintenance team',
      details: {
        executionSessionOpened: outcome.data.executionSessionOpened,
        technicianExecutionStartRequired: outcome.data.technicianExecutionStartRequired,
      },
    });
  }

  return { success: true, data: outcome.data };
}
