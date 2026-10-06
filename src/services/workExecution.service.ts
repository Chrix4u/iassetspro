/**
 * Work Execution Domain Service — Canonical WO lifecycle orchestration
 *
 * This is the single authoritative service for work-order execution state
 * transitions. API routes must delegate lifecycle rules here rather than
 * duplicating readiness, team authority, timing, costing, or audit behavior.
 */

import { createHash } from 'crypto';
import { db } from '@/lib/db';
import { executeTransition } from '@/lib/state-machine';
import { checkReadiness, type ReadinessCheckResult } from '@/services/workOrderReadiness.service';
import { sendRepairNotification } from '@/lib/repair-notifications';
import { buildAuditData } from '@/lib/audit-helpers';
import {
  calculateAuthoritativeWorkOrderCost,
  type AuthoritativeWorkOrderCostResult,
} from '@/services/workOrderCost.service';
import type { Prisma } from '@prisma/client';

export interface SessionContext {
  userId: string;
  fullName?: string;
  roles: string[];
  permissions: string[];
  ipAddress?: string;
  userAgent?: string;
}

export interface AuditContext {
  ipAddress?: string;
  userAgent?: string;
  sessionId?: string;
  plantId?: string;
  departmentId?: string;
}

export type TransitionResult = {
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
  readiness?: ReadinessCheckResult;
  notifications?: Array<{
    userId: string;
    type: string;
    title: string;
    message: string;
    entityType?: string;
    entityId?: string;
    actionUrl?: string;
  }>;
};

export interface StartWorkOptions {
  reason?: string;
  notes?: string;
  auditCtx?: AuditContext;
  idempotencyKey?: string;
}

export interface WaitingStateOptions {
  reason?: string;
  auditCtx?: AuditContext;
  idempotencyKey?: string;
}

export interface HandoverOptions {
  reason?: string;
  auditCtx?: AuditContext;
  idempotencyKey?: string;
  shiftType?: string;
  shiftDate?: string;
  fromShift?: string;
  toShift?: string;
  receivedById?: string;
  tasksSummary?: unknown;
  pendingIssues?: unknown;
  safetyNotes?: string;
  equipmentStatus?: unknown;
  notes?: string;
}

export interface CompletionOptions {
  notes?: string;
  failureDescription?: string;
  causeDescription?: string;
  actionDescription?: string;
  auditCtx?: AuditContext;
  idempotencyKey?: string;
}

export interface VerifyOptions {
  notes?: string;
  qualityRating?: number;
  checklistPassed?: boolean;
  auditCtx?: AuditContext;
  idempotencyKey?: string;
}

export interface ReworkOptions {
  reason: string;
  category?: string;
  evidence?: string[];
  auditCtx?: AuditContext;
  idempotencyKey?: string;
}

export interface CloseOptions {
  notes?: string;
  failureMode?: string;
  failureCause?: string;
  correctiveAction?: string;
  pmRecommendation?: string;
  followUpRequired?: boolean;
  followUpNotes?: string;
  auditCtx?: AuditContext;
  idempotencyKey?: string;
}

export interface CancelOptions {
  reason: string;
  auditCtx?: AuditContext;
  idempotencyKey?: string;
}

export type AuthoritativeCostResult = AuthoritativeWorkOrderCostResult;

/**
 * Backward-compatible export used by Repairs lifecycle/reporting callers.
 * The implementation now lives in workOrderCost.service so every lifecycle
 * path consumes exactly the same server-authoritative accounting rules.
 */
export const calculateAuthoritativeCosts = calculateAuthoritativeWorkOrderCost;

type EnrichedWO = Awaited<ReturnType<typeof fetchEnrichedWO>>;

async function fetchEnrichedWO(workOrderId: string, tx?: Prisma.TransactionClient) {
  const client = tx ?? db;
  return client.workOrder.findUnique({
    where: { id: workOrderId },
    include: {
      assignee: { select: { id: true, fullName: true, username: true, primaryTrade: true } },
      teamLeader: { select: { id: true, fullName: true, username: true } },
      assignedSupervisor: { select: { id: true, fullName: true, username: true } },
      planner: { select: { id: true, fullName: true, username: true } },
      maintenanceRequest: { select: { id: true, requestNumber: true, title: true, requestedBy: true } },
      teamMembers: { select: { userId: true, role: true, addedVia: true } },
      repairCompletion: { select: { id: true, reworkCount: true } },
      repairToolRequests: {
        select: { id: true, status: true, items: { select: { id: true, pendingReturnQty: true } } },
      },
      repairMaterialRequests: {
        select: { id: true, status: true, quantityIssued: true, consumedQty: true, wastedQty: true },
      },
      timeLogs: { select: { id: true, action: true, endTime: true } },
      shiftHandovers: { select: { id: true, status: true } },
      workOrderDowntimes: { select: { durationMinutes: true } },
      workOrderComponents: { select: { componentRegistryId: true } },
    },
  });
}

function checkTeamAuthority(
  wo: NonNullable<EnrichedWO>,
  session: SessionContext,
  operation: 'start' | 'complete' | 'handover' | 'pause',
): { allowed: boolean; error?: string; isAdminOverride?: boolean } {
  const isAssignee = wo.assignedTo === session.userId;
  const isTeamLeader =
    wo.teamLeaderId === session.userId ||
    wo.teamMembers?.some((member) => member.userId === session.userId && member.role === 'team_leader') ||
    false;
  const isAdminRole = session.roles.includes('admin') ||
    session.roles.includes('maintenance_manager') ||
    session.roles.includes('plant_manager');

  if (isAdminRole) return { allowed: true, isAdminOverride: true };

  const teamMemberIds = (wo.teamMembers || [])
    .map((member) => member.userId)
    .filter((userId) => userId !== wo.assignedTo);
  const distinctTeamCount = new Set(teamMemberIds).size;
  const isMultiTech = wo.assignedTo ? distinctTeamCount >= 1 : distinctTeamCount >= 2;

  switch (operation) {
    case 'start':
      return isAssignee || isTeamLeader
        ? { allowed: true }
        : { allowed: false, error: 'Only the assigned technician, team leader, or admin can perform this action' };
    case 'complete':
      if (isMultiTech) {
        return isTeamLeader
          ? { allowed: true }
          : { allowed: false, error: 'For multi-technician work orders, only the team leader can complete work' };
      }
      return isAssignee
        ? { allowed: true }
        : { allowed: false, error: 'Only the assigned technician can complete this work order' };
    case 'handover':
      return isAssignee || isTeamLeader
        ? { allowed: true }
        : { allowed: false, error: 'Only the assigned technician or team leader can initiate handover' };
    case 'pause':
      return isAssignee || isTeamLeader
        ? { allowed: true }
        : { allowed: false, error: 'Only the assigned technician or team leader can pause work' };
  }
}

async function createAuditEntry(
  action: string,
  entityType: string,
  entityId: string,
  userId: string,
  oldValues: Record<string, unknown> | undefined,
  newValues: Record<string, unknown>,
  auditCtx?: AuditContext,
  tx?: Prisma.TransactionClient,
): Promise<void> {
  const client = tx ?? db;
  await client.auditLog.create({
    data: {
      userId,
      action,
      entityType,
      entityId,
      oldValues: oldValues ? JSON.stringify(oldValues) : undefined,
      newValues: JSON.stringify(newValues),
      ipAddress: auditCtx?.ipAddress,
      userAgent: auditCtx?.userAgent,
      sessionId: auditCtx?.sessionId,
    },
  });
}

function notifyStakeholders(
  wo: NonNullable<EnrichedWO>,
  session: SessionContext,
  event: 'wo_started' | 'wo_on_hold' | 'wo_resumed' | 'completion_submitted' | 'rework_requested' | 'supervisor_verified' | 'planner_closed' | 'shift_handover_pending',
  messageOverride?: string,
  reason?: string,
): void {
  const targets = new Set<string>();
  const addIf = (userId: string | null | undefined) => {
    if (userId && userId !== session.userId) targets.add(userId);
  };

  addIf(wo.assignedSupervisorId);
  addIf(wo.teamLeaderId);
  addIf(wo.plannerId);
  addIf(wo.assignedTo);
  if (event === 'planner_closed' && wo.maintenanceRequest?.requestedBy) {
    addIf(wo.maintenanceRequest.requestedBy);
  }
  for (const member of wo.teamMembers || []) addIf(member.userId);

  for (const userId of targets) {
    sendRepairNotification({
      userId,
      event,
      woNumber: wo.woNumber,
      woId: wo.id,
      title: session.fullName || 'A team member',
      message: messageOverride,
      details: reason ? { reason } : undefined,
    });
  }
}

function sha256(data: string): string {
  return createHash('sha256').update(data).digest('hex');
}

async function checkIdempotency(
  key: string,
  tx?: Prisma.TransactionClient,
): Promise<{ found: boolean; responseData?: Record<string, unknown> }> {
  const client = tx ?? db;
  const record = await client.idempotencyRecord.findUnique({ where: { key } });
  if (!record) return { found: false };
  try {
    const data = record.responseData ? JSON.parse(record.responseData) : undefined;
    return { found: true, responseData: data as Record<string, unknown> };
  } catch {
    return { found: true, responseData: undefined };
  }
}

async function recordIdempotency(
  key: string,
  entityType: string,
  entityId: string,
  action: string,
  userId: string,
  responseData: Record<string, unknown>,
  tx?: Prisma.TransactionClient,
): Promise<void> {
  const client = tx ?? db;
  const responseJson = JSON.stringify(responseData);
  await client.idempotencyRecord.create({
    data: {
      key,
      entityType,
      entityId,
      action,
      userId,
      responseHash: sha256(responseJson),
      responseData: responseJson,
    },
  });
}

export async function startWork(
  workOrderId: string,
  session: SessionContext,
  options?: StartWorkOptions,
): Promise<TransitionResult> {
  const idempotencyKey = options?.idempotencyKey;
  if (idempotencyKey) {
    const existing = await checkIdempotency(idempotencyKey);
    if (existing.found && existing.responseData) return existing.responseData as TransitionResult;
  }

  const wo = await fetchEnrichedWO(workOrderId);
  if (!wo) return { success: false, error: 'Work order not found' };

  const auth = checkTeamAuthority(wo, session, 'start');
  if (!auth.allowed) return { success: false, error: auth.error };

  const readiness = await checkReadiness(workOrderId, 'start');
  if (!readiness.ready) {
    return { success: false, error: 'Work order is not ready to start', readiness };
  }

  const now = new Date();
  await db.$transaction(async (tx) => {
    const transitionResult = await executeTransition('work_order', workOrderId, 'in_progress', session, {
      reason: options?.reason,
      extraData: { actualStart: now },
      tx,
    });
    if (!transitionResult.success) throw new Error(transitionResult.error);

    await tx.workOrderTimeLog.create({
      data: {
        workOrderId,
        userId: session.userId,
        action: 'start',
        notes: options?.notes || 'Work started',
        timestamp: now,
      },
    });

    await createAuditEntry(
      'update', 'work_order', workOrderId, session.userId,
      { status: wo.status },
      { status: 'in_progress', actualStart: now.toISOString() },
      options?.auditCtx,
      tx,
    );
  });

  notifyStakeholders(wo, session, 'wo_started');
  const result: TransitionResult = {
    success: true,
    data: { status: 'in_progress', actualStart: now },
  };
  if (idempotencyKey) {
    await recordIdempotency(idempotencyKey, 'work_order', workOrderId, 'start', session.userId, result);
  }
  return result;
}

export async function pauseWork(
  workOrderId: string,
  session: SessionContext,
  options?: WaitingStateOptions,
): Promise<TransitionResult> {
  const idempotencyKey = options?.idempotencyKey;
  if (idempotencyKey) {
    const existing = await checkIdempotency(idempotencyKey);
    if (existing.found && existing.responseData) return existing.responseData as TransitionResult;
  }

  const wo = await fetchEnrichedWO(workOrderId);
  if (!wo) return { success: false, error: 'Work order not found' };
  const auth = checkTeamAuthority(wo, session, 'pause');
  if (!auth.allowed) return { success: false, error: auth.error };

  const now = new Date();
  await db.$transaction(async (tx) => {
    await tx.workOrderTimeLog.updateMany({
      where: { workOrderId, action: { in: ['start', 'resume'] }, endTime: null },
      data: { endTime: now, pauseReason: options?.reason || 'Work paused' },
    });

    const result = await executeTransition('work_order', workOrderId, 'on_hold', session, {
      reason: options?.reason,
      tx,
    });
    if (!result.success) throw new Error(result.error);

    await createAuditEntry(
      'update', 'work_order', workOrderId, session.userId,
      { status: wo.status },
      { status: 'on_hold', pauseReason: options?.reason },
      options?.auditCtx,
      tx,
    );
  });

  sendRepairNotification({
    userId: wo.assignedSupervisorId || wo.plannerId || session.userId,
    event: 'wo_on_hold',
    woNumber: wo.woNumber,
    woId: wo.id,
    title: session.fullName,
    details: { reason: options?.reason },
  });

  const result: TransitionResult = { success: true, data: { status: 'on_hold' } };
  if (idempotencyKey) {
    await recordIdempotency(idempotencyKey, 'work_order', workOrderId, 'pause', session.userId, result);
  }
  return result;
}

export async function resumeWork(
  workOrderId: string,
  session: SessionContext,
  options?: WaitingStateOptions,
): Promise<TransitionResult> {
  const idempotencyKey = options?.idempotencyKey;
  if (idempotencyKey) {
    const existing = await checkIdempotency(idempotencyKey);
    if (existing.found && existing.responseData) return existing.responseData as TransitionResult;
  }

  const wo = await fetchEnrichedWO(workOrderId);
  if (!wo) return { success: false, error: 'Work order not found' };
  const auth = checkTeamAuthority(wo, session, 'start');
  if (!auth.allowed) return { success: false, error: auth.error };

  const now = new Date();
  await db.$transaction(async (tx) => {
    const result = await executeTransition('work_order', workOrderId, 'in_progress', session, { tx });
    if (!result.success) throw new Error(result.error);

    await tx.workOrderTimeLog.create({
      data: {
        workOrderId,
        userId: session.userId,
        action: 'resume',
        notes: options?.reason || 'Work resumed',
        timestamp: now,
      },
    });

    await createAuditEntry(
      'update', 'work_order', workOrderId, session.userId,
      { status: wo.status },
      { status: 'in_progress' },
      options?.auditCtx,
      tx,
    );
  });

  const result: TransitionResult = { success: true, data: { status: 'in_progress' } };
  if (idempotencyKey) {
    await recordIdempotency(idempotencyKey, 'work_order', workOrderId, 'resume', session.userId, result);
  }
  return result;
}

export async function enterWaitingState(
  workOrderId: string,
  session: SessionContext,
  waitingType: 'waiting_parts' | 'waiting_tools' | 'waiting_shutdown' | 'waiting_permit',
  options?: WaitingStateOptions,
): Promise<TransitionResult> {
  const idempotencyKey = options?.idempotencyKey;
  if (idempotencyKey) {
    const existing = await checkIdempotency(idempotencyKey);
    if (existing.found && existing.responseData) return existing.responseData as TransitionResult;
  }

  const wo = await fetchEnrichedWO(workOrderId);
  if (!wo) return { success: false, error: 'Work order not found' };
  const auth = checkTeamAuthority(wo, session, 'pause');
  if (!auth.allowed) return { success: false, error: auth.error };

  const now = new Date();
  await db.$transaction(async (tx) => {
    await tx.workOrderTimeLog.updateMany({
      where: { workOrderId, action: { in: ['start', 'resume'] }, endTime: null },
      data: { endTime: now, pauseReason: `Entered ${waitingType}` },
    });

    const result = await executeTransition('work_order', workOrderId, waitingType, session, {
      reason: options?.reason,
      tx,
    });
    if (!result.success) throw new Error(result.error);

    await createAuditEntry(
      'update', 'work_order', workOrderId, session.userId,
      { status: wo.status },
      { status: waitingType, reason: options?.reason },
      options?.auditCtx,
      tx,
    );
  });

  const result: TransitionResult = { success: true, data: { status: waitingType } };
  if (idempotencyKey) {
    await recordIdempotency(idempotencyKey, 'work_order', workOrderId, `waiting:${waitingType}`, session.userId, result);
  }
  return result;
}

export async function initiateHandover(
  workOrderId: string,
  session: SessionContext,
  options?: HandoverOptions,
): Promise<TransitionResult> {
  const idempotencyKey = options?.idempotencyKey;
  if (idempotencyKey) {
    const existing = await checkIdempotency(idempotencyKey);
    if (existing.found && existing.responseData) return existing.responseData as TransitionResult;
  }

  const wo = await fetchEnrichedWO(workOrderId);
  if (!wo) return { success: false, error: 'Work order not found' };
  const auth = checkTeamAuthority(wo, session, 'handover');
  if (!auth.allowed) return { success: false, error: auth.error };

  const now = new Date();
  let handoverId: string | undefined;

  await db.$transaction(async (tx) => {
    await tx.workOrderTimeLog.updateMany({
      where: { workOrderId, action: { in: ['start', 'resume'] }, endTime: null },
      data: { endTime: now, pauseReason: 'Shift handover' },
    });

    const result = await executeTransition('work_order', workOrderId, 'pending_handover', session, {
      reason: options?.reason,
      tx,
    });
    if (!result.success) throw new Error(result.error);

    const parsedTasks = options?.tasksSummary
      ? JSON.stringify(typeof options.tasksSummary === 'string' ? [{ task: options.tasksSummary }] : options.tasksSummary)
      : JSON.stringify([]);
    const parsedIssues = options?.pendingIssues
      ? JSON.stringify(typeof options.pendingIssues === 'string' ? [{ issue: options.pendingIssues }] : options.pendingIssues)
      : JSON.stringify([]);
    const parsedEquipment = options?.equipmentStatus
      ? JSON.stringify(typeof options.equipmentStatus === 'string' ? [{ status: options.equipmentStatus }] : options.equipmentStatus)
      : null;

    const handover = await tx.shiftHandover.create({
      data: {
        shiftDate: options?.shiftDate ? new Date(options.shiftDate) : now,
        shiftType: (options?.shiftType || 'morning').toLowerCase(),
        fromShift: options?.fromShift || null,
        toShift: options?.toShift || null,
        handedOverById: session.userId,
        receivedById: options?.receivedById || null,
        tasksSummary: parsedTasks,
        pendingIssues: parsedIssues,
        safetyNotes: options?.safetyNotes || null,
        equipmentStatus: parsedEquipment,
        notes: options?.notes || options?.reason || null,
        workOrderId,
      },
    });
    handoverId = handover.id;

    await createAuditEntry(
      'update', 'work_order', workOrderId, session.userId,
      { status: wo.status },
      { status: 'pending_handover', handoverId: handover.id },
      options?.auditCtx,
      tx,
    );
  });

  notifyStakeholders(wo, session, 'shift_handover_pending', undefined, options?.reason);
  const result: TransitionResult = {
    success: true,
    data: { status: 'pending_handover', handoverId },
  };
  if (idempotencyKey) {
    await recordIdempotency(idempotencyKey, 'work_order', workOrderId, 'handover', session.userId, result);
  }
  return result;
}

export async function resumeAfterHandover(
  workOrderId: string,
  session: SessionContext,
  options?: HandoverOptions,
): Promise<TransitionResult> {
  const idempotencyKey = options?.idempotencyKey;
  if (idempotencyKey) {
    const existing = await checkIdempotency(idempotencyKey);
    if (existing.found && existing.responseData) return existing.responseData as TransitionResult;
  }

  const wo = await fetchEnrichedWO(workOrderId);
  if (!wo) return { success: false, error: 'Work order not found' };
  const auth = checkTeamAuthority(wo, session, 'start');
  if (!auth.allowed) return { success: false, error: auth.error };

  const now = new Date();
  await db.$transaction(async (tx) => {
    const confirmedHandover = await tx.shiftHandover.findFirst({
      where: { workOrderId, status: 'confirmed' },
      orderBy: { createdAt: 'desc' },
    });
    if (!confirmedHandover) {
      throw new Error('Cannot resume work: no confirmed shift handover record exists for this work order.');
    }

    const isSupervisor = session.roles.some((role) =>
      ['maintenance_supervisor', 'maintenance_manager', 'plant_manager', 'admin'].includes(role),
    );
    if (session.userId !== confirmedHandover.receivedById && !isSupervisor) {
      throw new Error('Cannot resume work: only the designated receiver of the shift handover can resume work.');
    }
    if (session.userId !== confirmedHandover.receivedById && isSupervisor && !options?.reason) {
      throw new Error('Supervisor override for resume-after-handover requires a reason to be provided.');
    }

    if (session.userId !== confirmedHandover.receivedById && isSupervisor) {
      await tx.auditLog.create({
        data: {
          userId: session.userId,
          action: 'resume_after_handover_override',
          entityType: 'work_order',
          entityId: workOrderId,
          newValues: JSON.stringify({
            handoverId: confirmedHandover.id,
            receivedById: confirmedHandover.receivedById,
            overridingUserId: session.userId,
            reason: options?.reason,
          }),
        },
      });
    }

    const activeSession = await tx.workOrderTimeLog.findFirst({
      where: {
        userId: session.userId,
        action: { in: ['start', 'resume'] },
        endTime: null,
      },
      select: { workOrderId: true },
    });
    if (activeSession) {
      throw new Error('Cannot resume work: this technician already has an active work session.');
    }

    const transition = await executeTransition('work_order', workOrderId, 'in_progress', session, { tx });
    if (!transition.success) throw new Error(transition.error);

    await tx.workOrderTimeLog.create({
      data: {
        workOrderId,
        userId: session.userId,
        action: 'resume',
        notes: 'Resumed after shift handover',
        timestamp: now,
      },
    });

    await createAuditEntry(
      'update', 'work_order', workOrderId, session.userId,
      { status: wo.status },
      { status: 'in_progress', handoverId: confirmedHandover.id },
      options?.auditCtx,
      tx,
    );
  });

  const result: TransitionResult = { success: true, data: { status: 'in_progress' } };
  if (idempotencyKey) {
    await recordIdempotency(idempotencyKey, 'work_order', workOrderId, 'resume_after_handover', session.userId, result);
  }
  return result;
}

export async function submitCompletion(
  workOrderId: string,
  session: SessionContext,
  completionData: CompletionOptions,
): Promise<TransitionResult> {
  const idempotencyKey = completionData.idempotencyKey;
  if (idempotencyKey) {
    const existing = await checkIdempotency(idempotencyKey);
    if (existing.found && existing.responseData) return existing.responseData as TransitionResult;
  }

  const wo = await fetchEnrichedWO(workOrderId);
  if (!wo) return { success: false, error: 'Work order not found' };
  const auth = checkTeamAuthority(wo, session, 'complete');
  if (!auth.allowed) return { success: false, error: auth.error };

  const readiness = await checkReadiness(workOrderId, 'complete');
  if (!readiness.ready) {
    return { success: false, error: 'Work order is not ready for completion', readiness };
  }

  const now = new Date();
  const txResult = await db.$transaction(async (tx) => {
    const costs = await calculateAuthoritativeCosts(workOrderId, tx);
    if (!costs) {
      throw new Error('Failed to calculate authoritative costs: work order not found in transaction');
    }

    const transition = await executeTransition('work_order', workOrderId, 'completed', session, {
      extraData: {
        actualEnd: now,
        actualHours: costs.laborHours,
        failureDescription: completionData.failureDescription || wo.failureDescription,
        causeDescription: completionData.causeDescription || wo.causeDescription,
        actionDescription: completionData.actionDescription || wo.actionDescription,
        laborCost: costs.actualLaborCost,
        partsCost: costs.actualMaterialCost,
        contractorCost: costs.actualContractorCost,
        totalCost: costs.totalActualCost,
        laborRateApplied: costs.appliedLaborRate,
        laborCurrency: costs.appliedLaborCurrency,
      },
      tx,
    });
    if (!transition.success) throw new Error(transition.error);

    await tx.workOrderTimeLog.create({
      data: {
        workOrderId,
        userId: session.userId,
        action: 'complete',
        notes: completionData.notes || 'Work completed',
        timestamp: now,
      },
    });

    if (completionData.notes) {
      await tx.workOrderComment.create({
        data: { workOrderId, userId: session.userId, content: completionData.notes },
      });
    }

    await tx.auditLog.create({
      data: buildAuditData(
        'update',
        'work_order',
        workOrderId,
        session.userId,
        { actualEnd: null, actualHours: wo.actualHours },
        {
          actualEnd: now.toISOString(),
          actualHours: costs.laborHours,
          laborCost: costs.actualLaborCost,
          partsCost: costs.actualMaterialCost,
          contractorCost: costs.actualContractorCost,
          totalCost: costs.totalActualCost,
          costWarnings: costs.warnings,
          ...(auth.isAdminOverride ? { adminOverride: true } : {}),
        },
        completionData.auditCtx,
      ),
    });

    // PM cadence intentionally does not advance at technician completion.
    // Planner closure is the single recurrence authority after supervisor
    // verification, closeout evidence and final costing are accepted.

    return { costs };
  });

  notifyStakeholders(wo, session, 'completion_submitted');
  const result: TransitionResult = {
    success: true,
    data: {
      status: 'completed',
      actualEnd: now,
      actualHours: txResult.costs.laborHours,
      totalCost: txResult.costs.totalActualCost,
      ...(txResult.costs.incompleteLaborRate ? { costWarnings: txResult.costs.warnings } : {}),
    },
  };

  if (idempotencyKey) {
    await recordIdempotency(idempotencyKey, 'work_order', workOrderId, 'complete', session.userId, result);
  }
  return result;
}

export async function supervisorVerify(
  workOrderId: string,
  session: SessionContext,
  options: VerifyOptions,
): Promise<TransitionResult> {
  const idempotencyKey = options.idempotencyKey;
  if (idempotencyKey) {
    const existing = await checkIdempotency(idempotencyKey);
    if (existing.found && existing.responseData) return existing.responseData as TransitionResult;
  }

  const wo = await fetchEnrichedWO(workOrderId);
  if (!wo) return { success: false, error: 'Work order not found' };

  const readiness = await checkReadiness(workOrderId, 'verify');
  if (!readiness.ready) {
    return { success: false, error: 'Work order is not ready for verification', readiness };
  }

  await db.$transaction(async (tx) => {
    const result = await executeTransition('work_order', workOrderId, 'verified', session, {
      extraData: { verifiedBy: session.userId, qualityRating: options.qualityRating },
      tx,
    });
    if (!result.success) throw new Error(result.error);

    const commentContent = options.notes
      ? `[Verification] ${options.notes}${options.qualityRating ? ` | Quality Rating: ${options.qualityRating}/5` : ''}`
      : `[Verification] Verified by ${session.fullName}`;
    await tx.workOrderComment.create({
      data: { workOrderId, userId: session.userId, content: commentContent },
    });

    await tx.auditLog.create({
      data: {
        userId: session.userId,
        action: 'update',
        entityType: 'work_order',
        entityId: workOrderId,
        newValues: JSON.stringify({
          status: 'verified',
          verifiedBy: session.userId,
          qualityRating: options.qualityRating ?? null,
        }),
        ...(options.auditCtx?.ipAddress ? { ipAddress: options.auditCtx.ipAddress } : {}),
      },
    });
  });

  notifyStakeholders(wo, session, 'supervisor_verified');
  const result: TransitionResult = { success: true, data: { status: 'verified' } };
  if (idempotencyKey) {
    await recordIdempotency(idempotencyKey, 'work_order', workOrderId, 'verify', session.userId, result);
  }
  return result;
}

export async function requestRework(
  workOrderId: string,
  session: SessionContext,
  reworkData: ReworkOptions,
): Promise<TransitionResult> {
  if (!reworkData.reason) return { success: false, error: 'Rework reason is required' };

  const idempotencyKey = reworkData.idempotencyKey;
  if (idempotencyKey) {
    const existing = await checkIdempotency(idempotencyKey);
    if (existing.found && existing.responseData) return existing.responseData as TransitionResult;
  }

  const wo = await fetchEnrichedWO(workOrderId);
  if (!wo) return { success: false, error: 'Work order not found' };

  await db.$transaction(async (tx) => {
    await tx.repairCompletion.upsert({
      where: { workOrderId },
      update: { reworkCount: { increment: 1 }, reworkReason: reworkData.reason },
      create: { workOrderId, reworkCount: 1, reworkReason: reworkData.reason },
    });

    const result = await executeTransition('work_order', workOrderId, 'in_progress', session, {
      reason: reworkData.reason,
      extraData: { reworkReason: reworkData.reason, reworkCategory: reworkData.category },
      tx,
    });
    if (!result.success) throw new Error(result.error);

    await tx.workOrderComment.create({
      data: {
        workOrderId,
        userId: session.userId,
        content: `[Rework] ${reworkData.reason}${reworkData.category ? ` [${reworkData.category}]` : ''}`,
      },
    });

    await tx.auditLog.create({
      data: {
        userId: session.userId,
        action: 'update',
        entityType: 'work_order',
        entityId: workOrderId,
        newValues: JSON.stringify({
          status: 'in_progress',
          reworkReason: reworkData.reason,
          reworkCategory: reworkData.category,
        }),
        ...(reworkData.auditCtx?.ipAddress ? { ipAddress: reworkData.auditCtx.ipAddress } : {}),
      },
    });
  });

  notifyStakeholders(wo, session, 'rework_requested', undefined, reworkData.reason);
  const result: TransitionResult = {
    success: true,
    data: { status: 'in_progress', reworkReason: reworkData.reason },
  };
  if (idempotencyKey) {
    await recordIdempotency(idempotencyKey, 'work_order', workOrderId, 'rework', session.userId, result);
  }
  return result;
}

export async function plannerClose(
  workOrderId: string,
  session: SessionContext,
  closeData: CloseOptions,
): Promise<TransitionResult> {
  const idempotencyKey = closeData.idempotencyKey;
  if (idempotencyKey) {
    const existing = await checkIdempotency(idempotencyKey);
    if (existing.found && existing.responseData) return existing.responseData as TransitionResult;
  }

  const wo = await fetchEnrichedWO(workOrderId);
  if (!wo) return { success: false, error: 'Work order not found' };

  const readiness = await checkReadiness(workOrderId, 'close');
  if (!readiness.ready) {
    return { success: false, error: 'Work order is not ready for closure', readiness };
  }

  const now = new Date();
  await db.$transaction(async (tx) => {
    const costs = await calculateAuthoritativeCosts(workOrderId, tx);
    if (costs) {
      await tx.workOrder.update({
        where: { id: workOrderId },
        data: {
          actualHours: costs.laborHours,
          laborCost: costs.actualLaborCost,
          partsCost: costs.actualMaterialCost,
          contractorCost: costs.actualContractorCost,
          totalCost: costs.totalActualCost,
          laborRateApplied: costs.appliedLaborRate ?? undefined,
          laborCurrency: costs.appliedLaborCurrency ?? undefined,
        },
      });
    }

    const result = await executeTransition('work_order', workOrderId, 'closed', session, {
      extraData: {
        isLocked: true,
        lockedBy: session.userId,
        lockedAt: now,
        lockReason: 'Work order closed',
      },
      tx,
    });
    if (!result.success) throw new Error(result.error);

    await tx.workOrder.update({
      where: { id: workOrderId },
      data: {
        isLocked: true,
        lockedBy: session.userId,
        lockedAt: now,
        lockReason: 'Planner closeout',
      },
    });

    if (closeData.notes) {
      await tx.workOrderComment.create({
        data: { workOrderId, userId: session.userId, content: `[Closed] ${closeData.notes}` },
      });
    }

    await tx.auditLog.create({
      data: {
        userId: session.userId,
        action: 'update',
        entityType: 'work_order',
        entityId: workOrderId,
        oldValues: JSON.stringify({ isLocked: wo.isLocked }),
        newValues: JSON.stringify({
          isLocked: true,
          costWarnings: costs?.warnings ?? [],
        }),
        ...(closeData.auditCtx?.ipAddress ? { ipAddress: closeData.auditCtx.ipAddress } : {}),
      },
    });

    const finalCost = costs?.totalActualCost ?? wo.totalCost;
    const totalDowntimeMinutes = Math.round(
      (wo.workOrderDowntimes ?? []).reduce(
        (sum, row) => sum + (row.durationMinutes ?? 0),
        0,
      ),
    );
    const componentId = wo.workOrderComponents?.[0]?.componentRegistryId;
    const failureMode = closeData.failureMode || wo.failureDescription || 'other';
    const hasFailureContext = Boolean(
      closeData.failureMode || wo.failureDescription || wo.causeDescription,
    );

    if (componentId && hasFailureContext) {
      await tx.failureRecord.upsert({
        where: { id: `wo-${workOrderId}` },
        update: {
          failureMode,
          failureCause: closeData.failureCause || wo.causeDescription,
          correctiveAction: closeData.correctiveAction || wo.actionDescription,
          resolvedAt: now,
          repairCost: finalCost ?? undefined,
          downtimeMinutes: totalDowntimeMinutes,
          rootCause: closeData.failureCause || undefined,
          preventiveAction: closeData.pmRecommendation || undefined,
        },
        create: {
          id: `wo-${workOrderId}`,
          componentId,
          assetId: wo.assetId || undefined,
          workOrderId,
          failureMode,
          failureCause: closeData.failureCause || wo.causeDescription || undefined,
          correctiveAction: closeData.correctiveAction || wo.actionDescription || undefined,
          detectedAt: wo.actualStart || now,
          resolvedAt: now,
          repairCost: finalCost ?? undefined,
          downtimeMinutes: totalDowntimeMinutes,
          reportedById: session.userId,
          rootCause: closeData.failureCause || undefined,
          preventiveAction: closeData.pmRecommendation || undefined,
        },
      });
    } else if (hasFailureContext && !componentId) {
      await tx.auditLog.create({
        data: {
          userId: session.userId,
          action: 'reliability_record_skipped',
          entityType: 'work_order',
          entityId: workOrderId,
          newValues: JSON.stringify({
            reason: 'No component is linked to the work order; failure record requires componentId',
            failureMode,
          }),
        },
      });
    }
  });

  notifyStakeholders(wo, session, 'planner_closed');
  const result: TransitionResult = {
    success: true,
    data: { status: 'closed', isLocked: true },
  };
  if (idempotencyKey) {
    await recordIdempotency(idempotencyKey, 'work_order', workOrderId, 'close', session.userId, result);
  }
  return result;
}

export async function cancelWorkOrder(
  workOrderId: string,
  session: SessionContext,
  options: CancelOptions,
): Promise<TransitionResult> {
  if (!options.reason) return { success: false, error: 'Cancellation reason is required' };

  const idempotencyKey = options.idempotencyKey;
  if (idempotencyKey) {
    const existing = await checkIdempotency(idempotencyKey);
    if (existing.found && existing.responseData) return existing.responseData as TransitionResult;
  }

  const wo = await fetchEnrichedWO(workOrderId);
  if (!wo) return { success: false, error: 'Work order not found' };

  await db.$transaction(async (tx) => {
    const result = await executeTransition('work_order', workOrderId, 'cancelled', session, {
      reason: options.reason,
      tx,
    });
    if (!result.success) throw new Error(result.error);

    await createAuditEntry(
      'update', 'work_order', workOrderId, session.userId,
      { status: wo.status },
      { status: 'cancelled', reason: options.reason },
      options.auditCtx,
      tx,
    );
  });

  const result: TransitionResult = { success: true, data: { status: 'cancelled' } };
  if (idempotencyKey) {
    await recordIdempotency(idempotencyKey, 'work_order', workOrderId, 'cancel', session.userId, result);
  }
  return result;
}
