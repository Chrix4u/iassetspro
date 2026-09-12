import { db } from '@/lib/db';
import { executeTransition } from '@/lib/state-machine';
import { checkReadiness, type ReadinessCheckResult } from '@/services/workOrderReadiness.service';
import { sendRepairNotification } from '@/lib/repair-notifications';
import { buildAuditData } from '@/lib/audit-helpers';

export interface VerificationSessionContext {
  userId: string;
  fullName?: string;
  roles: string[];
  permissions: string[];
}

export interface VerificationAuditContext {
  ipAddress?: string;
  userAgent?: string;
  sessionId?: string;
  plantId?: string;
  departmentId?: string;
}

export interface VerifyRepairOptions {
  notes?: string;
  qualityRating?: number;
  checklistPassed?: boolean;
  auditCtx?: VerificationAuditContext;
}

export type VerifyRepairResult = {
  success: boolean;
  data?: { status: 'verified' };
  error?: string;
  readiness?: ReadinessCheckResult;
  conflict?: boolean;
  idempotent?: boolean;
};

function hasSupervisorReviewAuthority(
  wo: { assignedSupervisorId: string | null },
  session: VerificationSessionContext,
): { allowed: boolean; override: boolean } {
  const managerOverride = session.roles.some((role) =>
    ['admin', 'maintenance_manager', 'plant_manager'].includes(role),
  );
  if (managerOverride) return { allowed: true, override: true };
  return { allowed: wo.assignedSupervisorId === session.userId, override: false };
}

function isConcurrentTransitionError(error: unknown): boolean {
  return error instanceof Error && error.message.startsWith('Concurrent transition detected:');
}

async function readCommittedVerificationRetry(
  workOrderId: string,
): Promise<VerifyRepairResult | null> {
  const current = await db.workOrder.findUnique({
    where: { id: workOrderId },
    select: {
      status: true,
      repairCompletion: { select: { id: true, supervisorStatus: true } },
    },
  });

  if (!current || current.status !== 'verified') return null;
  if (!current.repairCompletion || current.repairCompletion.supervisorStatus !== 'approved') {
    return {
      success: false,
      conflict: true,
      error: 'Work order is marked verified but its canonical supervisor approval snapshot is missing',
    };
  }

  return { success: true, idempotent: true, data: { status: 'verified' } };
}

/**
 * Canonical supervisor verification for a completed repair WO.
 *
 * The assigned supervisor owns the quality review. Admin, maintenance-manager
 * and plant-manager roles retain an auditable override; a generic verify
 * permission alone cannot approve another supervisor's work order.
 *
 * WorkOrder deliberately has no verifiedBy/qualityRating columns. Verification
 * evidence belongs to RepairCompletion + comments/audit history, while the WO
 * state machine owns only the status transition to `verified`.
 *
 * Same-state retries are idempotent and do not duplicate review comments,
 * audit rows or notifications. The state machine remains the single CAS owner
 * of the completed -> verified transition; true races are returned as conflicts.
 */
export async function verifyRepairWorkOrder(
  workOrderId: string,
  session: VerificationSessionContext,
  options: VerifyRepairOptions,
): Promise<VerifyRepairResult> {
  const verifiedAt = new Date();

  let outcome;
  try {
    outcome = await db.$transaction(async (tx) => {
      const wo = await tx.workOrder.findUnique({
        where: { id: workOrderId },
        select: {
          id: true,
          woNumber: true,
          title: true,
          status: true,
          plannerId: true,
          assignedTo: true,
          teamLeaderId: true,
          assignedSupervisorId: true,
          repairCompletion: { select: { id: true, supervisorStatus: true } },
        },
      });
      if (!wo) return { success: false as const, error: 'Work order not found' };

      const authority = hasSupervisorReviewAuthority(wo, session);
      if (!authority.allowed) {
        return {
          success: false as const,
          error: 'Only the assigned supervisor or an authorized maintenance/plant manager can verify this work order',
        };
      }

      if (wo.status === 'verified') {
        if (!wo.repairCompletion || wo.repairCompletion.supervisorStatus !== 'approved') {
          return {
            success: false as const,
            conflict: true as const,
            error: 'Work order is marked verified but its canonical supervisor approval snapshot is missing',
          };
        }
        return {
          success: true as const,
          idempotent: true as const,
          data: { status: 'verified' as const },
        };
      }

      if (wo.status === 'closed') {
        return {
          success: false as const,
          conflict: true as const,
          error: "Work order has already progressed beyond verification to 'closed'",
        };
      }

      if (wo.status !== 'completed') {
        return {
          success: false as const,
          error: `Work order cannot be verified from '${wo.status}' status`,
        };
      }

      const readiness = await checkReadiness(workOrderId, 'verify', tx);
      if (!readiness.ready) {
        return {
          success: false as const,
          error: 'Work order is not ready for verification',
          readiness,
        };
      }

      if (!wo.repairCompletion) {
        return {
          success: false as const,
          error: 'No completion report has been submitted for this work order',
          readiness,
        };
      }

      const transition = await executeTransition('work_order', workOrderId, 'verified', session, { tx });
      if (!transition.success) throw new Error(transition.error);

      const ratingText = options.qualityRating != null
        ? `Quality Rating: ${options.qualityRating}/5`
        : null;
      const reviewNotes = [options.notes?.trim() || null, ratingText]
        .filter((value): value is string => Boolean(value))
        .join(' | ') || null;

      await tx.repairCompletion.update({
        where: { workOrderId },
        data: {
          supervisorStatus: 'approved',
          supervisorApprovedById: session.userId,
          supervisorApprovedAt: verifiedAt,
          supervisorReviewNotes: reviewNotes,
        },
      });

      const commentContent = reviewNotes
        ? `[Verification] ${reviewNotes}`
        : `[Verification] Verified by ${session.fullName || 'supervisor'}`;
      await tx.workOrderComment.create({
        data: { workOrderId, userId: session.userId, content: commentContent },
      });

      await tx.auditLog.create({
        data: buildAuditData(
          'update',
          'work_order',
          workOrderId,
          session.userId,
          { status: wo.status },
          {
            status: 'verified',
            supervisorApprovedById: session.userId,
            supervisorApprovedAt: verifiedAt.toISOString(),
            qualityRating: options.qualityRating ?? null,
            checklistPassed: options.checklistPassed ?? null,
            ...(authority.override
              ? { supervisorReviewOverride: true, assignedSupervisorId: wo.assignedSupervisorId }
              : {}),
          },
          options.auditCtx,
        ),
      });

      return {
        success: true as const,
        data: { status: 'verified' as const },
        notify: {
          woNumber: wo.woNumber,
          woId: wo.id,
          plannerId: wo.plannerId,
          assignedTo: wo.assignedTo,
          teamLeaderId: wo.teamLeaderId,
        },
      };
    });
  } catch (error: unknown) {
    if (isConcurrentTransitionError(error)) {
      const committedRetry = await readCommittedVerificationRetry(workOrderId);
      if (committedRetry) return committedRetry;
      return {
        success: false,
        conflict: true,
        error: 'Work order changed while supervisor verification was being applied; refresh and retry',
      };
    }
    throw error;
  }

  if (!outcome.success) return outcome;
  if ('idempotent' in outcome && outcome.idempotent) {
    return { success: true, idempotent: true, data: outcome.data };
  }

  const recipients = new Set(
    [outcome.notify.plannerId, outcome.notify.assignedTo, outcome.notify.teamLeaderId]
      .filter((userId): userId is string => Boolean(userId) && userId !== session.userId),
  );
  for (const userId of recipients) {
    sendRepairNotification({
      userId,
      event: 'supervisor_verified',
      woNumber: outcome.notify.woNumber,
      woId: outcome.notify.woId,
      title: session.fullName || 'Maintenance supervisor',
    });
  }

  return { success: true, data: outcome.data };
}
