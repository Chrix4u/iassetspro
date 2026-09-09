import { db } from '@/lib/db';
import { executeTransition } from '@/lib/state-machine';
import { checkReadiness, type ReadinessCheckResult } from '@/services/workOrderReadiness.service';
import { calculateAuthoritativeCosts } from '@/services/workExecution.service';
import { normalizeWorkOrderTimeLogs } from '@/services/workOrderTimeLogNormalization.service';
import { calculateNextDueDate, isAutoCalculableFrequency } from '@/lib/pm-utils';
import { sendRepairNotification } from '@/lib/repair-notifications';
import { buildAuditData } from '@/lib/audit-helpers';

export interface ClosureSessionContext {
  userId: string;
  fullName?: string;
  roles: string[];
  permissions: string[];
}

export interface ClosureAuditContext {
  ipAddress?: string;
  userAgent?: string;
  sessionId?: string;
  plantId?: string;
  departmentId?: string;
}

export interface CloseRepairOptions {
  notes?: string;
  componentId?: string;
  failureMode?: string;
  failureCause?: string;
  correctiveAction?: string;
  pmRecommendation?: string;
  followUpRequired?: boolean;
  followUpNotes?: string;
  auditCtx?: ClosureAuditContext;
}

export type CloseRepairResult = {
  success: boolean;
  data?: {
    status: 'closed';
    isLocked: true;
    actualHours: number;
    totalCost: number;
  };
  error?: string;
  readiness?: ReadinessCheckResult;
};

/**
 * Canonical planner close for a verified repair WO.
 *
 * Reliability history is component-based. A FailureRecord is therefore only
 * materialized when an actual failureMode is supplied and a concrete component
 * can be resolved from the WO. Merely having an asset does not justify creating
 * a synthetic failure classification.
 *
 * Recurring PM schedules advance only here, after the verified WO crosses the
 * irreversible planner-close boundary. Technician completion and supervisor
 * verification remain reworkable and therefore cannot safely advance PM due
 * dates. The PM completion date is the WO actualEnd when available so review
 * delay does not shift the maintenance cadence.
 */
export async function closeRepairWorkOrder(
  workOrderId: string,
  session: ClosureSessionContext,
  options: CloseRepairOptions,
): Promise<CloseRepairResult> {
  const closedAt = new Date();

  const outcome = await db.$transaction(async (tx) => {
    const wo = await tx.workOrder.findUnique({
      where: { id: workOrderId },
      select: {
        id: true,
        woNumber: true,
        title: true,
        status: true,
        isLocked: true,
        assetId: true,
        actualStart: true,
        actualEnd: true,
        pmScheduleId: true,
        plannerId: true,
        assignedTo: true,
        teamLeaderId: true,
        maintenanceRequest: { select: { requestedBy: true } },
        workOrderDowntimes: { select: { durationMinutes: true } },
        workOrderComponents: {
          select: {
            componentRegistryId: true,
            componentRegistry: { select: { assetId: true } },
          },
        },
      },
    });
    if (!wo) return { success: false as const, error: 'Work order not found' };

    // Normalize legacy rows in the same transaction as readiness, costing and
    // final closure. Active sessions are never auto-closed by normalization.
    await normalizeWorkOrderTimeLogs(workOrderId, tx);

    const readiness = await checkReadiness(workOrderId, 'close', tx);
    if (!readiness.ready) {
      return {
        success: false as const,
        error: 'Work order is not ready for closure',
        readiness,
      };
    }

    const costs = await calculateAuthoritativeCosts(workOrderId, tx);
    if (!costs) throw new Error('Failed to calculate authoritative costs during planner close');

    const failureMode = options.failureMode?.trim() || null;
    let failureComponentId: string | null = null;

    if (failureMode) {
      if (options.componentId) {
        const linked = wo.workOrderComponents.find(
          (component) => component.componentRegistryId === options.componentId,
        );
        if (!linked) {
          return {
            success: false as const,
            error: 'Failure component must be linked to this work order before closure',
          };
        }
        failureComponentId = linked.componentRegistryId;
      } else if (wo.workOrderComponents.length === 1) {
        failureComponentId = wo.workOrderComponents[0].componentRegistryId;
      } else {
        return {
          success: false as const,
          error: 'A componentId is required when recording failure history for a work order with zero or multiple linked components',
        };
      }

      const component = wo.workOrderComponents.find(
        (candidate) => candidate.componentRegistryId === failureComponentId,
      );
      if (wo.assetId && component?.componentRegistry.assetId && component.componentRegistry.assetId !== wo.assetId) {
        return {
          success: false as const,
          error: 'Failure component does not belong to the work order asset',
        };
      }
    }

    const downtimeMinutes = Math.round(
      wo.workOrderDowntimes.reduce((sum, downtime) => sum + (downtime.durationMinutes || 0), 0),
    );

    const transition = await executeTransition('work_order', workOrderId, 'closed', session, {
      extraData: {
        actualHours: costs.laborHours,
        laborCost: costs.actualLaborCost,
        partsCost: costs.actualMaterialCost,
        contractorCost: costs.actualContractorCost,
        totalCost: costs.totalActualCost,
        laborRateApplied: costs.appliedLaborRate ?? undefined,
        laborCurrency: costs.appliedLaborCurrency ?? undefined,
        isLocked: true,
        lockedBy: session.userId,
        lockedAt: closedAt,
        lockReason: 'Planner closeout',
      },
      tx,
    });
    if (!transition.success) throw new Error(transition.error);

    await tx.repairCompletion.update({
      where: { workOrderId },
      data: {
        plannerStatus: 'closed',
        plannerClosedById: session.userId,
        plannerClosedAt: closedAt,
        closureNotes: options.notes?.trim() || null,
      },
    });

    if (options.notes?.trim()) {
      await tx.workOrderComment.create({
        data: {
          workOrderId,
          userId: session.userId,
          content: `[Closed] ${options.notes.trim()}`,
        },
      });
    }

    let pmScheduleAdvanced = false;
    if (wo.pmScheduleId) {
      const pmSchedule = await tx.pmSchedule.findUnique({ where: { id: wo.pmScheduleId } });
      if (pmSchedule && pmSchedule.isActive && isAutoCalculableFrequency(pmSchedule.frequencyType)) {
        const pmCompletedAt = wo.actualEnd || closedAt;
        const nextDueDate = calculateNextDueDate(
          pmCompletedAt,
          pmSchedule.frequencyType,
          pmSchedule.frequencyValue,
        );
        await tx.pmSchedule.update({
          where: { id: pmSchedule.id },
          data: { lastCompletedDate: pmCompletedAt, nextDueDate },
        });
        await tx.auditLog.create({
          data: buildAuditData(
            'update',
            'pm_schedule',
            pmSchedule.id,
            session.userId,
            {
              lastCompletedDate: pmSchedule.lastCompletedDate,
              nextDueDate: pmSchedule.nextDueDate,
            },
            {
              lastCompletedDate: pmCompletedAt.toISOString(),
              nextDueDate: nextDueDate?.toISOString() ?? null,
              reason: `PM WO ${wo.woNumber} planner-closed after verification`,
              workOrderId,
            },
            options.auditCtx,
          ),
        });
        pmScheduleAdvanced = true;
      }
    }

    if (failureMode && failureComponentId) {
      await tx.failureRecord.upsert({
        where: { id: `wo-${workOrderId}` },
        update: {
          componentId: failureComponentId,
          assetId: wo.assetId,
          failureMode,
          failureCause: options.failureCause?.trim() || null,
          correctiveAction: options.correctiveAction?.trim() || null,
          resolvedAt: closedAt,
          repairCost: costs.totalActualCost,
          downtimeMinutes,
          rootCause: options.failureCause?.trim() || null,
          preventiveAction: options.pmRecommendation?.trim() || null,
          reportedById: session.userId,
        },
        create: {
          id: `wo-${workOrderId}`,
          componentId: failureComponentId,
          assetId: wo.assetId,
          workOrderId,
          failureMode,
          failureCause: options.failureCause?.trim() || null,
          correctiveAction: options.correctiveAction?.trim() || null,
          detectedAt: wo.actualStart || closedAt,
          resolvedAt: closedAt,
          repairCost: costs.totalActualCost,
          downtimeMinutes,
          reportedById: session.userId,
          rootCause: options.failureCause?.trim() || null,
          preventiveAction: options.pmRecommendation?.trim() || null,
        },
      });
    }

    await tx.auditLog.create({
      data: buildAuditData(
        'update',
        'work_order',
        workOrderId,
        session.userId,
        { status: wo.status, isLocked: wo.isLocked },
        {
          status: 'closed',
          isLocked: true,
          plannerClosedById: session.userId,
          plannerClosedAt: closedAt.toISOString(),
          actualHours: costs.laborHours,
          totalCost: costs.totalActualCost,
          failureRecordCreated: Boolean(failureMode && failureComponentId),
          pmScheduleAdvanced,
          followUpRequired: options.followUpRequired ?? false,
          followUpNotes: options.followUpNotes ?? null,
        },
        options.auditCtx,
      ),
    });

    return {
      success: true as const,
      data: {
        status: 'closed' as const,
        isLocked: true as const,
        actualHours: costs.laborHours,
        totalCost: costs.totalActualCost,
      },
      notify: {
        woNumber: wo.woNumber,
        assignedTo: wo.assignedTo,
        teamLeaderId: wo.teamLeaderId,
        requesterId: wo.maintenanceRequest?.requestedBy,
      },
    };
  });

  if (!outcome.success) return outcome;

  const recipients = new Set(
    [outcome.notify.assignedTo, outcome.notify.teamLeaderId, outcome.notify.requesterId]
      .filter((userId): userId is string => Boolean(userId) && userId !== session.userId),
  );
  for (const userId of recipients) {
    sendRepairNotification({
      userId,
      event: 'planner_closed',
      woNumber: outcome.notify.woNumber,
      woId: workOrderId,
      title: session.fullName || 'Maintenance planner',
    });
  }

  return { success: true, data: outcome.data };
}
