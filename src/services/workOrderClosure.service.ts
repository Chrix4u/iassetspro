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
  conflict?: boolean;
  idempotent?: boolean;
};

function hasPlannerCloseAuthority(
  wo: { plannerId: string | null },
  session: ClosureSessionContext,
): { allowed: boolean; override: boolean } {
  const managerOverride = session.roles.some((role) =>
    ['admin', 'maintenance_manager', 'plant_manager'].includes(role),
  );
  if (managerOverride) return { allowed: true, override: true };
  return { allowed: wo.plannerId === session.userId, override: false };
}

function isConcurrentTransitionError(error: unknown): boolean {
  return error instanceof Error && error.message.includes('Transition conflict for work_order');
}

async function readCommittedClosureRetry(
  workOrderId: string,
): Promise<CloseRepairResult | null> {
  const current = await db.workOrder.findUnique({
    where: { id: workOrderId },
    select: {
      status: true,
      isLocked: true,
      actualHours: true,
      totalCost: true,
      repairCompletion: { select: { id: true, plannerStatus: true } },
    },
  });

  if (!current || current.status !== 'closed') return null;
  if (!current.isLocked || !current.repairCompletion || current.repairCompletion.plannerStatus !== 'closed') {
    return {
      success: false,
      conflict: true,
      error: 'Work order is marked closed but its canonical planner closure snapshot is incomplete',
    };
  }

  return {
    success: true,
    idempotent: true,
    data: {
      status: 'closed',
      isLocked: true,
      actualHours: current.actualHours ?? 0,
      totalCost: current.totalCost,
    },
  };
}

/**
 * Canonical planner close for a verified repair WO.
 *
 * The assigned planner is the accountable closeout owner. Admin,
 * maintenance-manager and plant-manager roles retain an auditable override;
 * merely holding the generic close permission is not sufficient to close
 * another planner's work order.
 *
 * Reliability history is component-based. A FailureRecord is therefore only
 * materialized when an actual failureMode is supplied and a concrete component
 * can be resolved from the WO. If legacy data already contains a FailureRecord
 * linked to this WO under a non-deterministic id, that row is reused rather than
 * creating a second reliability event for the same repair.
 *
 * Recurring PM schedules advance only here, after the verified WO crosses the
 * irreversible planner-close boundary. Technician completion and supervisor
 * verification remain reworkable and therefore cannot safely advance PM due
 * dates. The PM completion date is the WO actualEnd when available so review
 * delay does not shift the maintenance cadence.
 *
 * Same-state closure retries are idempotent. The PM advancement, reliability
 * event, comments, audits and notifications are therefore emitted at most once
 * for the canonical verified -> closed transition.
 */
export async function closeRepairWorkOrder(
  workOrderId: string,
  session: ClosureSessionContext,
  options: CloseRepairOptions,
): Promise<CloseRepairResult> {
  const closedAt = new Date();

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
          isLocked: true,
          assetId: true,
          actualStart: true,
          actualEnd: true,
          actualHours: true,
          totalCost: true,
          pmScheduleId: true,
          plannerId: true,
          assignedTo: true,
          teamLeaderId: true,
          repairCompletion: { select: { id: true, plannerStatus: true } },
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

      const authority = hasPlannerCloseAuthority(wo, session);
      if (!authority.allowed) {
        return {
          success: false as const,
          error: 'Only the assigned planner or an authorized maintenance/plant manager can close this work order',
        };
      }

      if (wo.status === 'closed') {
        if (!wo.isLocked || !wo.repairCompletion || wo.repairCompletion.plannerStatus !== 'closed') {
          return {
            success: false as const,
            conflict: true as const,
            error: 'Work order is marked closed but its canonical planner closure snapshot is incomplete',
          };
        }
        return {
          success: true as const,
          idempotent: true as const,
          data: {
            status: 'closed' as const,
            isLocked: true as const,
            actualHours: wo.actualHours ?? 0,
            totalCost: wo.totalCost,
          },
        };
      }

      if (wo.status !== 'verified') {
        return {
          success: false as const,
          error: `Work order cannot be closed from '${wo.status}' status`,
        };
      }

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
        const existingFailure = await tx.failureRecord.findFirst({
          where: { workOrderId },
          select: { id: true },
          orderBy: { detectedAt: 'asc' },
        });
        const failureRecordId = existingFailure?.id || `wo-${workOrderId}`;

        await tx.failureRecord.upsert({
          where: { id: failureRecordId },
          update: {
            componentId: failureComponentId,
            assetId: wo.assetId,
            workOrderId,
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
            id: failureRecordId,
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
            ...(authority.override ? { plannerCloseOverride: true, assignedPlannerId: wo.plannerId } : {}),
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
  } catch (error: unknown) {
    if (isConcurrentTransitionError(error)) {
      const committedRetry = await readCommittedClosureRetry(workOrderId);
      if (committedRetry) return committedRetry;
      return {
        success: false,
        conflict: true,
        error: 'Work order changed while planner closure was being applied; refresh and retry',
      };
    }
    throw error;
  }

  if (!outcome.success) return outcome;
  if ('idempotent' in outcome && outcome.idempotent) {
    return { success: true, idempotent: true, data: outcome.data };
  }

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
