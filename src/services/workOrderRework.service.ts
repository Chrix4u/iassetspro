import { db } from '@/lib/db';
import { executeTransition } from '@/lib/state-machine';
import { sendRepairNotification } from '@/lib/repair-notifications';
import { buildAuditData } from '@/lib/audit-helpers';

export interface ReworkSessionContext {
  userId: string;
  fullName?: string;
  roles: string[];
  permissions: string[];
}

export interface ReworkAuditContext {
  ipAddress?: string;
  userAgent?: string;
  sessionId?: string;
  plantId?: string;
  departmentId?: string;
}

export interface RequestRepairReworkOptions {
  reason: string;
  category?: string;
  evidence?: string[];
  notes?: string;
  auditCtx?: ReworkAuditContext;
}

export type RequestRepairReworkResult = {
  success: boolean;
  data?: { status: 'in_progress'; reworkCount: number };
  error?: string;
};

function hasSupervisorReworkAuthority(
  wo: { assignedSupervisorId: string | null },
  session: ReworkSessionContext,
): { allowed: boolean; override: boolean } {
  const managerOverride = session.roles.some((role) =>
    ['admin', 'maintenance_manager', 'plant_manager'].includes(role),
  );
  if (managerOverride) return { allowed: true, override: true };
  return { allowed: wo.assignedSupervisorId === session.userId, override: false };
}

/**
 * Canonical supervisor rework operation.
 *
 * The assigned supervisor owns the rework decision. Admin, maintenance-manager
 * and plant-manager roles may override that assignment, and the override is
 * recorded in the audit trail.
 *
 * Rework metadata belongs to RepairCompletion and audit history. WorkOrder has
 * no reworkReason/reworkCategory columns, so the state transition carries only
 * the legitimate status change back to in_progress. No technician timer is
 * opened here: the assigned technician/team leader must explicitly restart
 * execution through the canonical Start boundary.
 */
export async function requestRepairRework(
  workOrderId: string,
  session: ReworkSessionContext,
  options: RequestRepairReworkOptions,
): Promise<RequestRepairReworkResult> {
  const reason = options.reason?.trim();
  if (!reason) return { success: false, error: 'Rework reason is required' };

  const requestedAt = new Date();

  const outcome = await db.$transaction(async (tx) => {
    const wo = await tx.workOrder.findUnique({
      where: { id: workOrderId },
      select: {
        id: true,
        woNumber: true,
        status: true,
        plannerId: true,
        assignedTo: true,
        teamLeaderId: true,
        assignedSupervisorId: true,
      },
    });
    if (!wo) return { success: false as const, error: 'Work order not found' };

    const authority = hasSupervisorReworkAuthority(wo, session);
    if (!authority.allowed) {
      return {
        success: false as const,
        error: 'Only the assigned supervisor or an authorized maintenance/plant manager can request rework on this work order',
      };
    }

    const completion = await tx.repairCompletion.findUnique({
      where: { workOrderId },
      select: { id: true, reworkCount: true },
    });
    if (!completion) {
      return {
        success: false as const,
        error: 'No completion report exists for this work order',
      };
    }

    const transition = await executeTransition('work_order', workOrderId, 'in_progress', session, {
      reason,
      tx,
    });
    if (!transition.success) throw new Error(transition.error);

    const updatedCompletion = await tx.repairCompletion.update({
      where: { workOrderId },
      data: {
        reworkCount: { increment: 1 },
        reworkReason: reason,
        supervisorStatus: 'rework_requested',
        supervisorReviewNotes: options.notes?.trim() || reason,
        supervisorApprovedById: null,
        supervisorApprovedAt: null,
        plannerStatus: 'pending_closure',
        plannerClosedById: null,
        plannerClosedAt: null,
        closureNotes: null,
      },
      select: { reworkCount: true },
    });

    await tx.workOrderComment.create({
      data: {
        workOrderId,
        userId: session.userId,
        content: `[Rework] ${reason}${options.category ? ` [${options.category}]` : ''}`,
      },
    });

    await tx.auditLog.create({
      data: buildAuditData(
        'update',
        'work_order',
        workOrderId,
        session.userId,
        { status: wo.status, reworkCount: completion.reworkCount },
        {
          status: 'in_progress',
          reworkReason: reason,
          reworkCategory: options.category ?? null,
          evidence: options.evidence ?? [],
          reworkCount: updatedCompletion.reworkCount,
          requestedAt: requestedAt.toISOString(),
          technicianExecutionRestartRequired: true,
          ...(authority.override
            ? { supervisorReworkOverride: true, assignedSupervisorId: wo.assignedSupervisorId }
            : {}),
        },
        options.auditCtx,
      ),
    });

    return {
      success: true as const,
      data: {
        status: 'in_progress' as const,
        reworkCount: updatedCompletion.reworkCount,
      },
      notify: {
        woNumber: wo.woNumber,
        plannerId: wo.plannerId,
        assignedTo: wo.assignedTo,
        teamLeaderId: wo.teamLeaderId,
      },
    };
  });

  if (!outcome.success) return outcome;

  const recipients = new Set(
    [outcome.notify.plannerId, outcome.notify.assignedTo, outcome.notify.teamLeaderId]
      .filter((userId): userId is string => Boolean(userId) && userId !== session.userId),
  );
  for (const userId of recipients) {
    sendRepairNotification({
      userId,
      event: 'rework_requested',
      woNumber: outcome.notify.woNumber,
      woId: workOrderId,
      title: session.fullName || 'Maintenance supervisor',
      details: { reason },
    });
  }

  return { success: true, data: outcome.data };
}
