import { createHash } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { getSession, isAdmin, type SessionData } from '@/lib/auth';
import { getPlantScope, canAccessPlantStrict } from '@/lib/plant-scope';
import { createLogger } from '@/lib/logger';
import { notifyUser } from '@/lib/notifications';
import {
  buildOfflineRequestHash,
  isOfflineReplayMatch,
} from '@/lib/offline-idempotency';
import {
  WORK_ORDER_TASK_STATUSES,
  canTransitionWorkOrderTask,
  isWorkOrderTaskStatus,
  taskTransitionError,
} from '@/lib/work-order-task-transitions';

const logger = createLogger('sync:offline');

const ALLOWED_OPERATIONS: Record<string, string[]> = {
  work_order_comment: ['create'],
  work_order_task: ['update'],
  work_order_time_log: ['create'],
  work_order_measurement: ['create'],
  work_order_assistance: ['create'],
};

interface SyncRecord {
  id: string;
  operation: 'create' | 'update' | 'delete';
  entityType: string;
  entityId: string;
  data: Record<string, unknown>;
  timestamp: string;
  idempotencyKey?: string;
  originUserId?: string;
}

interface SyncResult {
  id: string;
  success: boolean;
  replayed?: boolean;
  error?: string;
}

type DeferredNotification = {
  userId: string;
  type: string;
  title: string;
  message: string;
  entityType: string;
  entityId: string;
  actionUrl: string;
};

type OfflineWorkOrder = {
  id: string;
  woNumber: string | null;
  plantId: string | null;
  isLocked: boolean;
  status: string;
  assignedTo: string | null;
  assignedBy: string | null;
  plannerId: string | null;
  teamLeaderId: string | null;
  teamMembers: Array<{ userId: string; accessLevel: string }>;
  workOrderComponents: Array<{ componentRegistryId: string }>;
};

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function isExecutionActor(wo: OfflineWorkOrder, session: SessionData): boolean {
  if (isAdmin(session) || session.roles.includes('maintenance_manager') || session.roles.includes('plant_manager')) {
    return true;
  }
  if (wo.assignedTo === session.userId || wo.teamLeaderId === session.userId) return true;
  return wo.teamMembers.some(
    (member) => member.userId === session.userId && member.accessLevel !== 'read_only',
  );
}

function canComment(wo: OfflineWorkOrder, session: SessionData): boolean {
  if (isExecutionActor(wo, session)) return true;
  return session.roles.some((role) =>
    ['maintenance_planner', 'planner', 'maintenance_supervisor'].includes(role),
  );
}

function assertMutable(wo: OfflineWorkOrder): void {
  if (wo.isLocked || wo.status === 'closed') {
    throw new Error('Work order is closed or locked and cannot be modified');
  }
}

async function loadWorkOrder(tx: Prisma.TransactionClient, workOrderId: string): Promise<OfflineWorkOrder> {
  const wo = await tx.workOrder.findUnique({
    where: { id: workOrderId },
    select: {
      id: true,
      woNumber: true,
      plantId: true,
      isLocked: true,
      status: true,
      assignedTo: true,
      assignedBy: true,
      plannerId: true,
      teamLeaderId: true,
      teamMembers: { select: { userId: true, accessLevel: true } },
      workOrderComponents: { select: { componentRegistryId: true } },
    },
  });
  if (!wo) throw new Error('Work order not found');
  return wo;
}

async function handleCommentCreate(
  tx: Prisma.TransactionClient,
  wo: OfflineWorkOrder,
  data: Record<string, unknown>,
  session: SessionData,
): Promise<void> {
  assertMutable(wo);
  if (!canComment(wo, session)) throw new Error('You do not have access to comment on this work order');

  const content = data.content;
  if (typeof content !== 'string' || !content.trim()) throw new Error('Comment content is required');

  await tx.workOrderComment.create({
    data: { workOrderId: wo.id, userId: session.userId, content: content.trim() },
  });
}

async function handleTaskUpdate(
  tx: Prisma.TransactionClient,
  wo: OfflineWorkOrder,
  data: Record<string, unknown>,
  session: SessionData,
): Promise<void> {
  assertMutable(wo);
  if (!isExecutionActor(wo, session)) throw new Error('You do not have execution access to this work order');

  const taskId = data.taskId;
  if (typeof taskId !== 'string' || !taskId) throw new Error('taskId is required in data');

  const status = data.status;
  if (!isWorkOrderTaskStatus(status)) {
    throw new Error(`Invalid status. Must be one of: ${WORK_ORDER_TASK_STATUSES.join(', ')}`);
  }

  const task = await tx.workOrderTaskExecution.findUnique({ where: { id: taskId } });
  if (!task || task.workOrderId !== wo.id) throw new Error('Task not found or does not belong to this work order');

  if (!canTransitionWorkOrderTask(task.status, status)) {
    throw new Error(taskTransitionError(task.status, status));
  }

  const now = new Date();
  const updateData: Prisma.WorkOrderTaskExecutionUpdateInput = {
    status,
    updatedAt: now,
  };
  if (['completed', 'skipped', 'failed'].includes(status)) {
    updateData.completedAt = now;
    updateData.completedBy = { connect: { id: session.userId } };
  } else {
    updateData.completedAt = null;
    updateData.completedBy = { disconnect: true };
  }

  if (typeof data.notes === 'string' && data.notes.trim()) {
    const prefix = task.notes ? `${task.notes}\n` : '';
    updateData.notes = `${prefix}[${now.toISOString()}] ${session.username}: ${data.notes.trim()}`;
  }

  if (data.findings !== undefined) {
    updateData.findings = typeof data.findings === 'string' && data.findings.trim()
      ? data.findings.trim()
      : null;
  }

  await tx.workOrderTaskExecution.update({ where: { id: taskId }, data: updateData });

  await tx.auditLog.create({
    data: {
      userId: session.userId,
      action: 'update',
      entityType: 'wo_task_execution',
      entityId: taskId,
      oldValues: JSON.stringify({ status: task.status }),
      newValues: JSON.stringify({
        status,
        notes: typeof data.notes === 'string' ? data.notes : undefined,
        findings: typeof data.findings === 'string' ? data.findings : undefined,
        source: 'offline_replay',
      }),
    },
  });
}

async function handleTimeLogCreate(
  tx: Prisma.TransactionClient,
  wo: OfflineWorkOrder,
  data: Record<string, unknown>,
  session: SessionData,
  recordTimestamp: Date,
): Promise<void> {
  assertMutable(wo);
  if (wo.status === 'verified') throw new Error('Work order has been reviewed and time logging is no longer allowed');
  if (!isExecutionActor(wo, session)) throw new Error('You do not have execution access to this work order');

  // Offline generic time records are CLOSED retrospective labor entries only.
  // Live Start/Hold/Resume/Complete remain work-order lifecycle operations and
  // must use their canonical endpoints. This keeps WO.actualHours, readiness,
  // completion snapshots and authoritative costing on one labor model.
  const validActions = ['start', 'resume'];
  const action = typeof data.action === 'string' ? data.action : '';
  if (!validActions.includes(action)) {
    throw new Error("Offline time log action must be 'start' or 'resume'; lifecycle pause/complete actions are not accepted here");
  }

  const duration = typeof data.duration === 'number' && Number.isFinite(data.duration) && data.duration > 0
    ? data.duration
    : null;
  if (duration == null) {
    throw new Error('Offline labor duration must be greater than zero');
  }

  const breakMinutes = typeof data.breakMinutes === 'number' && Number.isFinite(data.breakMinutes)
    ? Math.max(0, Math.min(Math.round(data.breakMinutes), 480))
    : 0;
  const startTime = recordTimestamp;
  const endTime = new Date(startTime.getTime() + duration * 3_600_000);

  await tx.workOrderTimeLog.create({
    data: {
      workOrderId: wo.id,
      userId: session.userId,
      action,
      duration,
      notes: typeof data.notes === 'string' ? data.notes : null,
      timestamp: recordTimestamp,
      startTime,
      endTime,
      activityType: typeof data.activityType === 'string' ? data.activityType : 'maintenance',
      breakMinutes,
      pauseReason: null,
    },
  });

  const logs = await tx.workOrderTimeLog.findMany({
    where: {
      workOrderId: wo.id,
      action: { in: ['start', 'resume'] },
    },
    select: { duration: true },
  });
  const actualHours = Math.round(logs.reduce((sum, log) => sum + (log.duration || 0), 0) * 100) / 100;
  await tx.workOrder.update({ where: { id: wo.id }, data: { actualHours } });
}

async function handleMeasurementCreate(
  tx: Prisma.TransactionClient,
  wo: OfflineWorkOrder,
  data: Record<string, unknown>,
  session: SessionData,
  recordTimestamp: Date,
): Promise<void> {
  assertMutable(wo);
  if (!isExecutionActor(wo, session)) throw new Error('You do not have execution access to this work order');

  const parameterKey = data.parameterKey;
  const value = data.value;
  const unit = data.unit;
  if (typeof parameterKey !== 'string' || !parameterKey) throw new Error('parameterKey is required');
  if (typeof value !== 'number') throw new Error('Measurement value is required');
  if (typeof unit !== 'string' || !unit) throw new Error('Measurement unit is required');

  const requestedComponentId = typeof data.componentId === 'string' && data.componentId
    ? data.componentId
    : null;
  const componentId = requestedComponentId || wo.workOrderComponents[0]?.componentRegistryId;
  if (!componentId) {
    throw new Error('No components linked to this work order. Provide a componentId.');
  }
  if (!wo.workOrderComponents.some((component) => component.componentRegistryId === componentId)) {
    throw new Error('Component is not linked to this work order');
  }

  const minThreshold = typeof data.minThreshold === 'number' ? data.minThreshold : null;
  const maxThreshold = typeof data.maxThreshold === 'number' ? data.maxThreshold : null;
  const isAlarm = (minThreshold != null && value < minThreshold) || (maxThreshold != null && value > maxThreshold);

  await tx.componentConditionReading.create({
    data: {
      componentId,
      parameterKey,
      value,
      unit,
      minThreshold,
      maxThreshold,
      isAlarm,
      source: 'manual',
      recordedAt: recordTimestamp,
      recordedById: session.userId,
    },
  });
}

async function handleAssistanceCreate(
  tx: Prisma.TransactionClient,
  wo: OfflineWorkOrder,
  data: Record<string, unknown>,
  session: SessionData,
): Promise<DeferredNotification | null> {
  assertMutable(wo);
  if (!isExecutionActor(wo, session)) throw new Error('You do not have execution access to this work order');

  const requestedTrade = typeof data.requestedTrade === 'string' && data.requestedTrade.trim()
    ? data.requestedTrade.trim()
    : typeof data.tradeSkill === 'string' && data.tradeSkill.trim()
      ? data.tradeSkill.trim()
      : null;
  const requestedUserId = typeof data.requestedUserId === 'string' && data.requestedUserId.trim()
    ? data.requestedUserId.trim()
    : null;
  const role = typeof data.role === 'string' && data.role.trim() ? data.role.trim() : 'assistant';
  const reason = typeof data.reason === 'string' && data.reason.trim() ? data.reason.trim() : null;

  if (!requestedTrade && !requestedUserId) {
    throw new Error('requestedTrade or requestedUserId is required');
  }

  let targetUser: { id: string; fullName: string } | null = null;
  if (requestedUserId) {
    const requestedUser = await tx.user.findUnique({
      where: { id: requestedUserId },
      select: {
        id: true,
        fullName: true,
        status: true,
        plantAccess: wo.plantId
          ? { where: { plantId: wo.plantId }, select: { id: true } }
          : { select: { id: true } },
      },
    });
    if (!requestedUser) throw new Error('Requested user not found');
    if (requestedUser.status !== 'active') throw new Error('Requested user is not active');
    if (wo.plantId && requestedUser.plantAccess.length === 0) {
      throw new Error('Requested technician does not have access to the work order plant');
    }
    if (wo.teamMembers.some((member) => member.userId === requestedUserId)) {
      throw new Error('User is already a team member of this work order');
    }
    targetUser = { id: requestedUser.id, fullName: requestedUser.fullName };
  }

  const duplicateWhere: Prisma.WoTeamMemberRequestWhereInput = {
    workOrderId: wo.id,
    status: 'pending',
  };
  if (requestedUserId) {
    duplicateWhere.requestedUserId = requestedUserId;
  } else if (requestedTrade) {
    duplicateWhere.requestedTrade = requestedTrade;
  }

  const existingPending = await tx.woTeamMemberRequest.findFirst({ where: duplicateWhere });
  if (existingPending) {
    throw new Error('A pending request already exists for this on this work order');
  }

  const teamRequest = await tx.woTeamMemberRequest.create({
    data: {
      workOrderId: wo.id,
      requestedBy: session.userId,
      requestedTrade,
      requestedUserId,
      role,
      reason,
    },
  });

  await tx.auditLog.create({
    data: {
      userId: session.userId,
      action: 'create',
      entityType: 'wo_team_member_request',
      entityId: teamRequest.id,
      newValues: JSON.stringify({
        workOrderId: wo.id,
        requestedTrade,
        requestedUser: targetUser?.fullName || null,
        role,
        reason,
        source: 'offline_replay',
      }),
    },
  });

  const approverId = wo.plannerId || wo.assignedBy;
  if (!approverId || approverId === session.userId) return null;

  return {
    userId: approverId,
    type: 'wo_team_request',
    title: 'Team Member Request',
    message: requestedTrade
      ? `${session.fullName} requested a ${requestedTrade} for WO ${wo.woNumber || 'Work Order'}`
      : `${session.fullName} requested ${targetUser?.fullName || 'a team member'} for WO ${wo.woNumber || 'Work Order'}`,
    entityType: 'work_order',
    entityId: wo.id,
    actionUrl: `wo-detail?id=${wo.id}`,
  };
}

async function processRecord(
  record: SyncRecord,
  session: SessionData,
  plantScope: Awaited<ReturnType<typeof getPlantScope>>,
): Promise<{ replayed: boolean; notification?: DeferredNotification | null }> {
  if (record.originUserId && record.originUserId !== session.userId) {
    throw new Error('Offline record belongs to a different authenticated user');
  }

  const idempotencyKey = record.idempotencyKey ||
    (typeof record.data.idempotencyKey === 'string' ? record.data.idempotencyKey : undefined);
  const recordTimestamp = new Date(record.timestamp);
  if (Number.isNaN(recordTimestamp.getTime())) throw new Error('Invalid offline record timestamp');

  const requestHash = buildOfflineRequestHash(record);
  const conflictMessage = 'Idempotency key conflict: key is already bound to a different offline action';

  try {
    return await db.$transaction(async (tx) => {
      if (idempotencyKey) {
        const existing = await tx.idempotencyRecord.findUnique({ where: { key: idempotencyKey } });
        if (existing) {
          if (!isOfflineReplayMatch(existing, record, session.userId)) {
            throw new Error(conflictMessage);
          }
          return { replayed: true, notification: null };
        }
      }

      const wo = await loadWorkOrder(tx, record.entityId);
      if (!canAccessPlantStrict(plantScope, wo.plantId)) {
        throw new Error('Access denied: work order is outside your plant scope');
      }

      let notification: DeferredNotification | null = null;
      const key = `${record.entityType}+${record.operation}`;
      switch (key) {
        case 'work_order_comment+create':
          await handleCommentCreate(tx, wo, record.data, session);
          break;
        case 'work_order_task+update':
          await handleTaskUpdate(tx, wo, record.data, session);
          break;
        case 'work_order_time_log+create':
          await handleTimeLogCreate(tx, wo, record.data, session, recordTimestamp);
          break;
        case 'work_order_measurement+create':
          await handleMeasurementCreate(tx, wo, record.data, session, recordTimestamp);
          break;
        case 'work_order_assistance+create':
          notification = await handleAssistanceCreate(tx, wo, record.data, session);
          break;
        default:
          throw new Error(`Operation not supported for offline execution: ${record.entityType}/${record.operation}`);
      }

      if (idempotencyKey) {
        const responseData = JSON.stringify({ success: true, recordId: record.id, requestHash });
        await tx.idempotencyRecord.create({
          data: {
            key: idempotencyKey,
            entityType: record.entityType,
            entityId: record.entityId,
            action: record.operation,
            userId: session.userId,
            responseHash: sha256(responseData),
            responseData,
          },
        });
      }

      return { replayed: false, notification };
    });
  } catch (error: unknown) {
    // Concurrent duplicate requests may race on the unique idempotency key.
    // The losing transaction is rolled back; only an exact same-user/same-
    // payload replay is accepted. A collided or reused key must fail closed.
    if (idempotencyKey) {
      const existing = await db.idempotencyRecord.findUnique({ where: { key: idempotencyKey } });
      if (existing) {
        if (isOfflineReplayMatch(existing, record, session.userId)) {
          return { replayed: true, notification: null };
        }
        throw new Error(conflictMessage);
      }
    }
    throw error;
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    const plantScope = await getPlantScope(request, session);
    if (plantScope.denyAccess) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }

    const body = await request.json();
    const records = body.records as SyncRecord[];
    if (!Array.isArray(records) || records.length === 0) {
      return NextResponse.json({ success: false, error: 'records array is required' }, { status: 400 });
    }
    if (records.length > 100) {
      return NextResponse.json({ success: false, error: 'Maximum 100 records per sync batch' }, { status: 400 });
    }

    const results: SyncResult[] = [];
    for (const record of records) {
      const allowedOps = ALLOWED_OPERATIONS[record.entityType];
      if (!allowedOps || !allowedOps.includes(record.operation)) {
        results.push({
          id: record.id,
          success: false,
          error: `Operation not supported for offline execution: ${record.entityType}/${record.operation}`,
        });
        continue;
      }

      try {
        const processed = await processRecord(record, session, plantScope);

        if (!processed.replayed && processed.notification) {
          await notifyUser(
            processed.notification.userId,
            processed.notification.type,
            processed.notification.title,
            processed.notification.message,
            processed.notification.entityType,
            processed.notification.entityId,
            processed.notification.actionUrl,
          );
        }

        results.push({ id: record.id, success: true, replayed: processed.replayed });
        logger.info(processed.replayed ? 'Offline record replayed idempotently' : 'Offline record processed', {
          recordId: record.id,
          entityType: record.entityType,
          entityId: record.entityId,
        });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error processing record';
        results.push({ id: record.id, success: false, error: message });
        logger.error('Failed to process offline record', {
          recordId: record.id,
          entityType: record.entityType,
          entityId: record.entityId,
          error: message,
        });
      }
    }

    return NextResponse.json({ success: true, results });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Sync failed';
    logger.error('Offline sync endpoint error', { error: message });
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
