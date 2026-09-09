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

class ExecutionStateTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExecutionStateTransitionError';
  }
}

function hasExecutionAuthority(
  wo: {
    assignedTo: string | null;
    teamLeaderId: string | null;
    teamMembers: Array<{ userId: string; role: string }>;
  },
  session: ExecutionStateSessionContext,
): boolean {
  if (session.roles.some((role) => ['admin', 'maintenance_manager', 'plant_manager'].includes(role))) {
    return true;
  }
  if (wo.assignedTo === session.userId || wo.teamLeaderId === session.userId) return true;
  return wo.teamMembers.some(
    (member) => member.userId === session.userId && member.role === 'team_leader',
  );
}

/**
 * Move a WO from active execution into a non-execution state.
 * All team timers close atomically because the state applies to the whole WO.
 */
export async function placeWorkOrderInWaitingState(
  workOrderId: string,
  targetStatus: WaitingWorkOrderStatus,
  session: ExecutionStateSessionContext,
  options: {
    reason: string;
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
  const reason = options.reason?.trim();
  if (!reason) return { success: false, error: 'A reason is required' };
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

    if (options.requireExecutionAuthority && !hasExecutionAuthority(wo, session)) {
      return {
        success: false as const,
        error: 'Only the assigned technician, team leader, or maintenance manager can change this execution state',
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
        supervisorId: wo.assignedSupervisorId,
        plannerId: wo.plannerId,
      },
    };
  }).catch((error: unknown) => {
    if (error instanceof ExecutionStateTransitionError) {
      return { success: false as const, error: error.message };
    }
    throw error;
  });

  if (!outcome.success) return outcome;

  const recipient = outcome.notify.supervisorId || outcome.notify.plannerId;
  if (recipient && recipient !== session.userId) {
    sendRepairNotification({
      userId: recipient,
      event: 'wo_on_hold',
      woNumber: outcome.notify.woNumber,
      woId: workOrderId,
      title: session.fullName || 'Maintenance team',
      details: { reason, status: targetStatus },
    });
  }

  return { success: true, data: outcome.data };
}

/** Resume an on-hold/waiting WO and open one canonical live resume session. */
export async function resumeWaitingWorkOrder(
  workOrderId: string,
  session: ExecutionStateSessionContext,
  options: { reason?: string; auditCtx?: ExecutionStateAuditContext } = {},
): Promise<{
  success: boolean;
  data?: { status: 'in_progress'; resumedAt: Date };
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

    if (!hasExecutionAuthority(wo, session)) {
      return {
        success: false as const,
        error: 'Only the assigned technician, team leader, or maintenance manager can resume this work order',
      };
    }

    // Match the canonical start boundary: an unclosed timer is only a real
    // conflict while its parent WO is still actively in progress. Historical
    // rows left behind by legacy hold/handover/rework paths must not strand a
    // technician and block legitimate resume work.
    if (!session.roles.includes('admin')) {
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
            : `You already have active work on WO #${existingLiveSession.workOrder?.woNumber || 'unknown'}${existingLiveSession.workOrder?.title ? ` (${existingLiveSession.workOrder.title})` : ''}. Open that work order and pause, hand over, or complete it before resuming another.`,
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

    await tx.auditLog.create({
      data: buildAuditData(
        'update',
        'work_order',
        workOrderId,
        session.userId,
        { status: wo.status },
        { status: 'in_progress', resumedAt: resumedAt.toISOString() },
        options.auditCtx,
      ),
    });

    return {
      success: true as const,
      data: { status: 'in_progress' as const, resumedAt },
      notify: {
        woNumber: wo.woNumber,
        supervisorId: wo.assignedSupervisorId,
        plannerId: wo.plannerId,
      },
    };
  }).catch((error: unknown) => {
    if (error instanceof ExecutionStateTransitionError) {
      return { success: false as const, error: error.message };
    }
    throw error;
  });

  if (!outcome.success) return outcome;

  const recipient = outcome.notify.supervisorId || outcome.notify.plannerId;
  if (recipient && recipient !== session.userId) {
    sendRepairNotification({
      userId: recipient,
      event: 'wo_resumed',
      woNumber: outcome.notify.woNumber,
      woId: workOrderId,
      title: session.fullName || 'Maintenance team',
    });
  }

  return { success: true, data: outcome.data };
}
