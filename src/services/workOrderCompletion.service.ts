import { db } from '@/lib/db';
import { executeTransition } from '@/lib/state-machine';
import { checkReadiness, type ReadinessCheckResult } from '@/services/workOrderReadiness.service';
import { calculateAuthoritativeCosts } from '@/services/workExecution.service';
import { calculateWorkOrderLaborCost } from '@/services/workOrderLaborCost.service';
import { normalizeWorkOrderTimeLogs } from '@/services/workOrderTimeLogNormalization.service';
import { sendRepairNotification } from '@/lib/repair-notifications';
import { buildAuditData } from '@/lib/audit-helpers';

export interface CompletionSessionContext {
  userId: string;
  fullName?: string;
  roles: string[];
  permissions: string[];
}

export interface CompletionAuditContext {
  ipAddress?: string;
  userAgent?: string;
  sessionId?: string;
  plantId?: string;
  departmentId?: string;
}

export interface SubmitRepairCompletionOptions {
  notes?: string;
  failureDescription?: string;
  causeDescription?: string;
  actionDescription?: string;
  auditCtx?: CompletionAuditContext;
}

export type SubmitRepairCompletionResult = {
  success: boolean;
  data?: {
    status: 'completed';
    actualEnd: Date;
    actualHours: number;
    totalCost: number;
    costWarnings?: string[];
  };
  error?: string;
  readiness?: ReadinessCheckResult;
};

type CompletionWorkOrder = {
  id: string;
  woNumber: string;
  status: string;
  actualHours: number | null;
  failureDescription: string | null;
  causeDescription: string | null;
  actionDescription: string | null;
  assignedTo: string | null;
  teamLeaderId: string | null;
  assignedSupervisorId: string | null;
  plannerId: string | null;
  teamMembers: Array<{ userId: string; role: string }>;
  workOrderDowntimes: Array<{ durationMinutes: number }>;
};

function checkCompletionAuthority(
  wo: CompletionWorkOrder,
  session: CompletionSessionContext,
): { allowed: boolean; error?: string; isAdminOverride?: boolean } {
  const isAdminRole = session.roles.some((role) =>
    ['admin', 'maintenance_manager', 'plant_manager'].includes(role),
  );
  if (isAdminRole) return { allowed: true, isAdminOverride: true };

  const isAssignee = wo.assignedTo === session.userId;
  const isTeamLeader =
    wo.teamLeaderId === session.userId ||
    wo.teamMembers.some((member) => member.userId === session.userId && member.role === 'team_leader');

  const extraTeamMembers = new Set(
    wo.teamMembers
      .map((member) => member.userId)
      .filter((userId) => userId !== wo.assignedTo),
  );
  const isMultiTech = wo.assignedTo ? extraTeamMembers.size >= 1 : extraTeamMembers.size >= 2;

  if (isMultiTech) {
    return isTeamLeader
      ? { allowed: true }
      : { allowed: false, error: 'For multi-technician work orders, only the team leader can complete work' };
  }

  return isAssignee
    ? { allowed: true }
    : { allowed: false, error: 'Only the assigned technician can complete this work order' };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Canonical technician/team-leader completion.
 *
 * Time-log normalization, readiness, authoritative cost calculation, status
 * transition and RepairCompletion snapshot are committed in one transaction.
 * A completed WorkOrder can therefore never be persisted without the completion
 * report required by supervisor verification. Recurring PM advancement is
 * deliberately deferred until planner closure because completed/verified work
 * can still be returned to in_progress for rework.
 */
export async function submitRepairCompletion(
  workOrderId: string,
  session: CompletionSessionContext,
  options: SubmitRepairCompletionOptions,
): Promise<SubmitRepairCompletionResult> {
  const completedAt = new Date();

  const outcome = await db.$transaction(async (tx) => {
    const wo = await tx.workOrder.findUnique({
      where: { id: workOrderId },
      select: {
        id: true,
        woNumber: true,
        status: true,
        actualHours: true,
        failureDescription: true,
        causeDescription: true,
        actionDescription: true,
        assignedTo: true,
        teamLeaderId: true,
        assignedSupervisorId: true,
        plannerId: true,
        teamMembers: { select: { userId: true, role: true } },
        workOrderDowntimes: { select: { durationMinutes: true } },
      },
    });
    if (!wo) return { success: false as const, error: 'Work order not found' };

    const authority = checkCompletionAuthority(wo, session);
    if (!authority.allowed) {
      return { success: false as const, error: authority.error };
    }

    // Normalize legacy timestamp-only rows inside this transaction. This never
    // closes a genuinely active session; readiness below still blocks it.
    await normalizeWorkOrderTimeLogs(workOrderId, tx);

    const readiness = await checkReadiness(workOrderId, 'complete', tx);
    if (!readiness.ready) {
      return {
        success: false as const,
        error: 'Work order is not ready for completion',
        readiness,
      };
    }

    // Materials/tools/contractors remain server authoritative in the existing
    // cost engine. Labor is calculated separately per technician because a
    // multi-tech WO must never price every person's hours at the assignee's rate.
    const costs = await calculateAuthoritativeCosts(workOrderId, tx);
    if (!costs) throw new Error('Failed to calculate authoritative costs during completion');

    const labor = await calculateWorkOrderLaborCost(workOrderId, tx);
    if (!labor) throw new Error('Failed to calculate authoritative labor cost during completion');

    const totalActualCost = round2(
      labor.actualLaborCost +
      costs.actualMaterialCost +
      costs.actualToolCost +
      costs.actualContractorCost,
    );
    const costWarnings = [...labor.warnings];

    const transition = await executeTransition('work_order', workOrderId, 'completed', session, {
      extraData: {
        actualEnd: completedAt,
        actualHours: labor.laborHours,
        failureDescription: options.failureDescription || wo.failureDescription,
        causeDescription: options.causeDescription || wo.causeDescription,
        actionDescription: options.actionDescription || wo.actionDescription,
        laborCost: labor.actualLaborCost,
        partsCost: costs.actualMaterialCost,
        contractorCost: costs.actualContractorCost,
        totalCost: totalActualCost,
        laborRateApplied: labor.appliedLaborRate ?? undefined,
        laborCurrency: labor.appliedLaborCurrency ?? undefined,
      },
      tx,
    });
    if (!transition.success) throw new Error(transition.error);

    // Completion is a closed event row, not a live execution session.
    await tx.workOrderTimeLog.create({
      data: {
        workOrderId,
        userId: session.userId,
        action: 'complete',
        notes: options.notes || 'Work completed',
        timestamp: completedAt,
        startTime: completedAt,
        endTime: completedAt,
      },
    });

    if (options.notes?.trim()) {
      await tx.workOrderComment.create({
        data: {
          workOrderId,
          userId: session.userId,
          content: options.notes.trim(),
        },
      });
    }

    const totalDowntimeMinutes = Math.round(
      wo.workOrderDowntimes.reduce(
        (sum, downtime) => sum + (downtime.durationMinutes ?? 0),
        0,
      ),
    );

    await tx.repairCompletion.upsert({
      where: { workOrderId },
      create: {
        workOrderId,
        completionNotes: options.notes?.trim() || null,
        findings: options.failureDescription || wo.failureDescription || null,
        rootCause: options.causeDescription || wo.causeDescription || null,
        correctiveAction: options.actionDescription || wo.actionDescription || null,
        totalLaborHours: labor.laborHours,
        totalMaterialCost: costs.actualMaterialCost,
        totalToolCost: costs.actualToolCost,
        totalDowntimeMinutes,
        supervisorStatus: 'pending_review',
        plannerStatus: 'pending_closure',
      },
      update: {
        completionNotes: options.notes?.trim() || undefined,
        findings: options.failureDescription || wo.failureDescription || undefined,
        rootCause: options.causeDescription || wo.causeDescription || undefined,
        correctiveAction: options.actionDescription || wo.actionDescription || undefined,
        totalLaborHours: labor.laborHours,
        totalMaterialCost: costs.actualMaterialCost,
        totalToolCost: costs.actualToolCost,
        totalDowntimeMinutes,
        supervisorStatus: 'pending_review',
        supervisorApprovedById: null,
        supervisorApprovedAt: null,
        supervisorReviewNotes: null,
        plannerStatus: 'pending_closure',
        plannerClosedById: null,
        plannerClosedAt: null,
        closureNotes: null,
      },
    });

    await tx.auditLog.create({
      data: buildAuditData(
        'update',
        'work_order',
        workOrderId,
        session.userId,
        { status: wo.status, actualHours: wo.actualHours },
        {
          status: 'completed',
          actualEnd: completedAt.toISOString(),
          actualHours: labor.laborHours,
          laborCost: labor.actualLaborCost,
          partsCost: costs.actualMaterialCost,
          contractorCost: costs.actualContractorCost,
          totalCost: totalActualCost,
          laborCurrency: labor.appliedLaborCurrency,
          laborRateApplied: labor.appliedLaborRate,
          laborRateComplete: !labor.incompleteLaborRate,
          pmAdvancementDeferredUntilClosure: true,
          ...(costWarnings.length > 0 ? { costWarnings } : {}),
          ...(authority.isAdminOverride ? { adminOverride: true } : {}),
        },
        options.auditCtx,
      ),
    });

    return {
      success: true as const,
      data: {
        status: 'completed' as const,
        actualEnd: completedAt,
        actualHours: labor.laborHours,
        totalCost: totalActualCost,
        ...(costWarnings.length > 0 ? { costWarnings } : {}),
      },
      notify: {
        woNumber: wo.woNumber,
        assignedSupervisorId: wo.assignedSupervisorId,
        plannerId: wo.plannerId,
        teamLeaderId: wo.teamLeaderId,
      },
    };
  });

  if (!outcome.success) return outcome;

  const recipients = new Set(
    [outcome.notify.assignedSupervisorId, outcome.notify.plannerId, outcome.notify.teamLeaderId]
      .filter((userId): userId is string => Boolean(userId) && userId !== session.userId),
  );
  for (const userId of recipients) {
    sendRepairNotification({
      userId,
      event: 'completion_submitted',
      woNumber: outcome.notify.woNumber,
      woId: workOrderId,
      title: session.fullName || 'Maintenance technician',
    });
  }

  return { success: true, data: outcome.data };
}
