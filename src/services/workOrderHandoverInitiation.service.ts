import { createHash } from 'crypto';
import { db } from '@/lib/db';
import { executeTransition } from '@/lib/state-machine';
import { closeAllActiveWorkSessions } from '@/services/workOrderActiveSession.service';
import { buildAuditData } from '@/lib/audit-helpers';
import { sendRepairNotification } from '@/lib/repair-notifications';
import { handoverReason } from '@/lib/technician-reason-defaults';
import type {
  HandoverOptions,
  SessionContext,
  TransitionResult,
} from '@/services/workExecution.service';

class HandoverTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HandoverTransitionError';
  }
}

function hasHandoverAuthority(
  wo: {
    assignedTo: string | null;
    teamLeaderId: string | null;
    assignedSupervisorId: string | null;
    teamMembers: Array<{ userId: string; role: string }>;
  },
  session: SessionContext,
): boolean {
  // Plant management retains review/close authority elsewhere. Execution and
  // handover control stays with the accountable maintenance chain.
  if (session.roles.some((role) => ['admin', 'maintenance_manager'].includes(role))) {
    return true;
  }
  if (
    wo.assignedTo === session.userId ||
    wo.teamLeaderId === session.userId ||
    wo.assignedSupervisorId === session.userId
  ) {
    return true;
  }
  return wo.teamMembers.some(
    (member) => member.userId === session.userId && member.role === 'team_leader',
  );
}

export function handoverUserHasEffectivePermission(
  user: {
    userRoles?: Array<{
      role: {
        slug: string;
        rolePermissions?: Array<{ permission: { slug: string } }>;
      };
    }>;
    directPerms?: Array<{
      isGranted: boolean;
      expiresAt: Date | null;
      permission: { slug: string };
    }>;
  },
  permissionSlug: string,
): boolean {
  const userRoles = user.userRoles ?? [];
  const directPerms = user.directPerms ?? [];

  if (userRoles.some((userRole) => userRole.role.slug === 'admin')) return true;

  const permissions = new Set<string>();
  for (const userRole of userRoles) {
    for (const rolePermission of userRole.role.rolePermissions ?? []) {
      permissions.add(rolePermission.permission.slug);
    }
  }

  const now = new Date();
  for (const directPermission of directPerms) {
    if (directPermission.permission.slug !== permissionSlug) continue;
    if (directPermission.expiresAt && directPermission.expiresAt < now) {
      permissions.delete(permissionSlug);
      continue;
    }
    if (directPermission.isGranted) permissions.add(permissionSlug);
    else permissions.delete(permissionSlug);
  }

  return permissions.has(permissionSlug);
}

function parseStructuredArray(value: unknown, key: 'task' | 'issue'): string {
  if (!value) return JSON.stringify([]);
  return JSON.stringify(typeof value === 'string' ? [{ [key]: value }] : value);
}

function idempotencyBindingMatches(
  record: {
    entityType: string;
    entityId: string;
    action: string;
    userId: string;
  },
  workOrderId: string,
  userId: string,
): boolean {
  return record.entityType === 'work_order' &&
    record.entityId === workOrderId &&
    record.action === 'handover' &&
    record.userId === userId;
}

async function readIdempotentResult(
  key: string,
  workOrderId: string,
  userId: string,
): Promise<TransitionResult | null> {
  const existing = await db.idempotencyRecord.findUnique({
    where: { key },
    select: {
      entityType: true,
      entityId: true,
      action: true,
      userId: true,
      responseData: true,
    },
  });
  if (!existing) return null;

  if (!idempotencyBindingMatches(existing, workOrderId, userId)) {
    return {
      success: false,
      error: 'Idempotency key is already bound to a different work order, action, or user',
    };
  }

  if (!existing.responseData) {
    return {
      success: false,
      error: 'Idempotency key exists without a completed stored response; use a new key or investigate the prior request',
    };
  }

  try {
    return JSON.parse(existing.responseData) as TransitionResult;
  } catch {
    return {
      success: false,
      error: 'Stored idempotent handover response is invalid',
    };
  }
}

async function recordIdempotentResult(
  key: string,
  workOrderId: string,
  userId: string,
  result: TransitionResult,
): Promise<void> {
  const responseData = JSON.stringify(result);
  const responseHash = createHash('sha256').update(responseData).digest('hex');
  try {
    await db.idempotencyRecord.create({
      data: {
        key,
        entityType: 'work_order',
        entityId: workOrderId,
        action: 'handover',
        userId,
        responseHash,
        responseData,
      },
    });
  } catch (error: unknown) {
    // A concurrent retry may have committed the same key after our initial read.
    // Accept only an identical binding. A cross-operation key collision must
    // never be mistaken for a successful retry.
    const concurrent = await db.idempotencyRecord.findUnique({
      where: { key },
      select: {
        entityType: true,
        entityId: true,
        action: true,
        userId: true,
        responseData: true,
      },
    });
    if (!concurrent) throw error;
    if (!idempotencyBindingMatches(concurrent, workOrderId, userId)) {
      throw new Error('Idempotency key was concurrently claimed by a different operation');
    }

    if (!concurrent.responseData) {
      await db.idempotencyRecord.update({
        where: { key },
        data: { responseHash, responseData },
      });
    }
  }
}

/**
 * Canonical shift-handover initiation.
 *
 * Closes every live execution session without changing its original action,
 * transitions the WO to pending_handover, creates the handover record, and
 * writes the audit entry in one transaction. Preserving start/resume actions is
 * essential because authoritative labor costing derives effort from those rows.
 */
export async function initiateCanonicalHandover(
  workOrderId: string,
  session: SessionContext,
  options: HandoverOptions = {},
): Promise<TransitionResult> {
  const idempotencyKey = options.idempotencyKey?.trim();
  if (idempotencyKey) {
    const existing = await readIdempotentResult(idempotencyKey, workOrderId, session.userId);
    if (existing) return existing;
  }

  const receiverId = options.receivedById?.trim();
  if (!receiverId) return { success: false, error: 'receivedById is required for shift handover' };
  if (receiverId === session.userId) {
    return { success: false, error: 'Handover receiver must be different from the outgoing worker' };
  }

  const now = new Date();
  const outcome = await db.$transaction(async (tx) => {
    const wo = await tx.workOrder.findUnique({
      where: { id: workOrderId },
      select: {
        id: true,
        woNumber: true,
        title: true,
        status: true,
        plantId: true,
        assignedTo: true,
        teamLeaderId: true,
        assignedSupervisorId: true,
        plannerId: true,
        teamMembers: { select: { userId: true, role: true } },
      },
    });
    if (!wo) return { success: false as const, error: 'Work order not found' };
    const resolvedReason = options.reason?.trim() || handoverReason({
      woNumber: wo.woNumber,
      title: wo.title,
      fromShift: options.fromShift,
      toShift: options.toShift,
    });
    if (!wo.plantId) {
      return {
        success: false as const,
        error: 'Operational work order must have a plant before handover',
      };
    }
    if (!hasHandoverAuthority(wo, session)) {
      return {
        success: false as const,
        error: 'Only the assigned technician, team leader, assigned supervisor, or authorized maintenance manager can initiate handover',
      };
    }

    const receiver = await tx.user.findUnique({
      where: { id: receiverId },
      select: {
        id: true,
        status: true,
        userRoles: {
          select: {
            role: {
              select: {
                slug: true,
                rolePermissions: {
                  select: { permission: { select: { slug: true } } },
                },
              },
            },
          },
        },
        directPerms: {
          select: {
            isGranted: true,
            expiresAt: true,
            permission: { select: { slug: true } },
          },
        },
      },
    });
    if (!receiver || receiver.status !== 'active') {
      return {
        success: false as const,
        error: 'Designated handover receiver is not an active user',
      };
    }
    if (!handoverUserHasEffectivePermission(receiver, 'work_orders.start')) {
      return {
        success: false as const,
        error: 'Designated handover receiver is not authorized to execute maintenance work',
      };
    }

    const receiverPlant = await tx.userPlant.findFirst({
      where: { userId: receiverId, plantId: wo.plantId },
      select: { id: true },
    });
    if (!receiverPlant) {
      return {
        success: false as const,
        error: 'Designated handover receiver does not have access to this plant',
      };
    }

    // The incoming worker must be able to inspect the WO and handover evidence
    // before confirming it, but cannot execute work until confirmation/resume.
    const existingReceiverMember = await tx.workOrderTeamMember.findFirst({
      where: { workOrderId, userId: receiverId },
      select: { id: true },
    });
    if (!existingReceiverMember) {
      await tx.workOrderTeamMember.create({
        data: {
          workOrderId,
          userId: receiverId,
          role: 'handover_receiver',
          accessLevel: 'read_only',
          addedVia: 'shift_handover_pending',
          addedById: session.userId,
          assignedAt: now,
        },
      });
    }

    const closed = await closeAllActiveWorkSessions(
      tx,
      workOrderId,
      now,
      'Auto-paused for shift handover',
    );

    const transition = await executeTransition(
      'work_order',
      workOrderId,
      'pending_handover',
      session,
      { reason: resolvedReason, tx },
    );
    if (!transition.success) {
      throw new HandoverTransitionError(
        transition.error || 'Failed to place work order into pending handover',
      );
    }

    const handover = await tx.shiftHandover.create({
      data: {
        shiftDate: options.shiftDate ? new Date(options.shiftDate) : now,
        shiftType: (options.shiftType || 'morning').toLowerCase(),
        fromShift: options.fromShift || null,
        toShift: options.toShift || null,
        handedOverById: session.userId,
        receivedById: receiverId,
        tasksSummary: parseStructuredArray(options.tasksSummary, 'task'),
        pendingIssues: parseStructuredArray(options.pendingIssues, 'issue'),
        safetyNotes: options.safetyNotes || null,
        equipmentStatus: options.equipmentStatus
          ? JSON.stringify(
              typeof options.equipmentStatus === 'string'
                ? [{ status: options.equipmentStatus }]
                : options.equipmentStatus,
            )
          : null,
        notes: options.notes || resolvedReason,
        workOrderId,
      },
    });

    await tx.auditLog.create({
      data: buildAuditData(
        'update',
        'work_order',
        workOrderId,
        session.userId,
        { status: wo.status },
        {
          status: 'pending_handover',
          handoverId: handover.id,
          receivedById: receiverId,
          closedTimerIds: closed.closedTimerIds,
          closedTimerUsers: closed.closedUserIds,
          actualHours: closed.actualHours,
        },
        {
          ipAddress: session.ipAddress,
          userAgent: session.userAgent,
        },
      ),
    });

    return {
      success: true as const,
      data: {
        status: 'pending_handover',
        handoverId: handover.id,
      },
      notify: {
        woNumber: wo.woNumber,
        assignedTo: wo.assignedTo,
        teamLeaderId: wo.teamLeaderId,
        assignedSupervisorId: wo.assignedSupervisorId,
        plannerId: wo.plannerId,
        teamMemberIds: wo.teamMembers.map((member) => member.userId),
        receivedById: receiverId,
        reason: resolvedReason,
      },
    };
  }).catch((error: unknown) => {
    if (error instanceof HandoverTransitionError) {
      return { success: false as const, error: error.message };
    }
    throw error;
  });

  if (!outcome.success) return outcome;

  const result: TransitionResult = { success: true, data: outcome.data };
  if (idempotencyKey) {
    await recordIdempotentResult(idempotencyKey, workOrderId, session.userId, result);
  }

  const recipients = new Set<string>();
  for (const userId of [
    outcome.notify.assignedTo,
    outcome.notify.teamLeaderId,
    outcome.notify.assignedSupervisorId,
    outcome.notify.plannerId,
    outcome.notify.receivedById,
    ...outcome.notify.teamMemberIds,
  ]) {
    if (userId && userId !== session.userId) recipients.add(userId);
  }

  for (const userId of recipients) {
    sendRepairNotification({
      userId,
      event: 'shift_handover_pending',
      woNumber: outcome.notify.woNumber,
      woId: workOrderId,
      title: session.fullName || 'Maintenance technician',
      details: { reason: outcome.notify.reason },
    });
  }

  return result;
}
