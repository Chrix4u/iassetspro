import { db } from '@/lib/db';
import { executeTransition } from '@/lib/state-machine';
import { notifyUser } from '@/lib/notifications';
import { buildAuditData } from '@/lib/audit-helpers';

export interface CancellationSessionContext {
  userId: string;
  fullName?: string;
  roles: string[];
  permissions: string[];
}

export interface CancellationAuditContext {
  ipAddress?: string;
  userAgent?: string;
  sessionId?: string;
  plantId?: string;
  departmentId?: string;
}

export interface CancelRepairOptions {
  reason: string;
  auditCtx?: CancellationAuditContext;
}

export type CancelRepairResult = {
  success: boolean;
  data?: { status: 'cancelled' };
  error?: string;
};

const CANCELLABLE_STATES = ['draft', 'requested', 'approved', 'planned', 'assigned', 'on_hold'];

/**
 * Canonical cancellation for a repair work order.
 *
 * The status transition, cancellation event row and audit record are committed
 * atomically. Notifications are sent only after the transaction succeeds.
 */
export async function cancelRepairWorkOrder(
  workOrderId: string,
  session: CancellationSessionContext,
  options: CancelRepairOptions,
): Promise<CancelRepairResult> {
  const reason = options.reason?.trim();
  if (!reason) return { success: false, error: 'A reason is required to cancel a work order' };

  const cancelledAt = new Date();

  const outcome = await db.$transaction(async (tx) => {
    const wo = await tx.workOrder.findUnique({
      where: { id: workOrderId },
      select: {
        id: true,
        woNumber: true,
        title: true,
        status: true,
        isLocked: true,
        assignedTo: true,
        maintenanceRequest: { select: { requestedBy: true } },
        teamMembers: { select: { userId: true } },
      },
    });

    if (!wo) return { success: false as const, error: 'Work order not found' };
    if (wo.isLocked) {
      return { success: false as const, error: 'Work order is permanently locked and cannot be cancelled' };
    }
    if (!CANCELLABLE_STATES.includes(wo.status)) {
      return {
        success: false as const,
        error: `Cannot cancel a work order in "${wo.status}" status. Only ${CANCELLABLE_STATES.join(', ')} can be cancelled.`,
      };
    }

    const transition = await executeTransition('work_order', workOrderId, 'cancelled', session, {
      reason,
      extraData: { notes: `[Cancelled] ${reason}` },
      tx,
    });
    if (!transition.success) throw new Error(transition.error);

    await tx.workOrderTimeLog.create({
      data: {
        workOrderId,
        userId: session.userId,
        action: 'cancel',
        notes: reason,
        timestamp: cancelledAt,
        startTime: cancelledAt,
        endTime: cancelledAt,
      },
    });

    await tx.auditLog.create({
      data: buildAuditData(
        'update',
        'work_order',
        workOrderId,
        session.userId,
        { status: wo.status },
        { status: 'cancelled', reason, cancelledAt: cancelledAt.toISOString() },
        options.auditCtx,
      ),
    });

    return {
      success: true as const,
      data: { status: 'cancelled' as const },
      notify: {
        woNumber: wo.woNumber,
        title: wo.title,
        recipients: Array.from(
          new Set(
            [
              ...wo.teamMembers.map((member) => member.userId),
              wo.assignedTo,
              wo.maintenanceRequest?.requestedBy,
            ].filter((userId): userId is string => Boolean(userId) && userId !== session.userId),
          ),
        ),
      },
    };
  });

  if (!outcome.success) return outcome;

  for (const userId of outcome.notify.recipients) {
    await notifyUser(
      userId,
      'wo_cancelled',
      'Work Order Cancelled',
      `${session.fullName || 'A maintenance user'} cancelled ${outcome.notify.woNumber}${outcome.notify.title ? ` (${outcome.notify.title})` : ''}. Reason: ${reason}`,
      'work_order',
      workOrderId,
      `wo-detail?id=${workOrderId}`,
      { forceSms: true },
    );
  }

  return { success: true, data: outcome.data };
}
