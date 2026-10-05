// ============================================================================
// POST /api/mobile/sync — Upload offline changes to the server
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { createLogger } from '@/lib/logger';
import { getPlantScope, canAccessPlantStrict } from '@/lib/plant-scope';
import { authorizeWorkOrderExecutionAccess } from '@/lib/plant-auth-helpers';
import { isWorkOrderExecutionMember } from '@/services/workOrderAccess.service';
import { Prisma } from '@prisma/client';

const logger = createLogger('api:mobile:sync');

interface SyncResult {
  localId?: string;
  success: boolean;
  conflict?: boolean;
  conflictReason?: string;
  error?: string;
}

interface NormalizedSyncOperation {
  localId?: string;
  operation: 'create' | 'update' | 'delete';
  entityType: string;
  entityId?: string;
  data: Record<string, unknown>;
  serverVersion?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeOperation(value: unknown): NormalizedSyncOperation {
  if (!isRecord(value)) throw new Error('Sync operation must be an object');

  const operation = value.operation;
  const entityType = value.entityType;
  if (operation !== 'create' && operation !== 'update' && operation !== 'delete') {
    throw new Error('Unsupported sync operation');
  }
  if (typeof entityType !== 'string' || !entityType) {
    throw new Error('entityType is required');
  }

  const data = value.data === undefined ? {} : value.data;
  if (!isRecord(data)) throw new Error('Sync operation data must be an object');

  return {
    localId: typeof value.localId === 'string' ? value.localId : undefined,
    operation,
    entityType,
    entityId: typeof value.entityId === 'string' ? value.entityId : undefined,
    data,
    serverVersion: typeof value.serverVersion === 'number' ? value.serverVersion : undefined,
  };
}

function nullableString(value: unknown, field: string): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') throw new Error(`${field} must be a string or null`);
  return value;
}

function optionalFiniteNumber(value: unknown, field: string): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${field} must be a finite number or null`);
  }
  return value;
}

function jsonInput(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull | undefined {
  if (value === undefined) return undefined;
  if (value === null) return Prisma.JsonNull;
  return value as Prisma.InputJsonValue;
}

function buildWorkOrderFieldUpdate(data: Record<string, unknown>): Prisma.WorkOrderUncheckedUpdateInput {
  const update: Prisma.WorkOrderUncheckedUpdateInput = {};

  const notes = nullableString(data.notes, 'notes');
  if (notes !== undefined) update.notes = notes;
  const failureDescription = nullableString(data.failureDescription, 'failureDescription');
  if (failureDescription !== undefined) update.failureDescription = failureDescription;
  const causeDescription = nullableString(data.causeDescription, 'causeDescription');
  if (causeDescription !== undefined) update.causeDescription = causeDescription;
  const actionDescription = nullableString(data.actionDescription, 'actionDescription');
  if (actionDescription !== undefined) update.actionDescription = actionDescription;
  const actualHours = optionalFiniteNumber(data.actualHours, 'actualHours');
  if (actualHours !== undefined) update.actualHours = actualHours;

  if (data.personalTools !== undefined) {
    if (typeof data.personalTools !== 'string') throw new Error('personalTools must be serialized JSON text');
    update.personalTools = data.personalTools;
  }

  if (Object.keys(update).length === 0) {
    throw new Error('No supported offline Work Order fields were supplied');
  }
  return update;
}

function inspectionMetrics(resultsJson: unknown): {
  score?: number;
  passCount: number;
  failCount: number;
  conditionalCount: number;
  naCount: number;
  totalItems: number;
} {
  if (!Array.isArray(resultsJson)) {
    return { passCount: 0, failCount: 0, conditionalCount: 0, naCount: 0, totalItems: 0 };
  }

  let passCount = 0;
  let failCount = 0;
  let conditionalCount = 0;
  let naCount = 0;
  for (const item of resultsJson) {
    if (!isRecord(item)) continue;
    const rating = item.rating ?? item.value;
    if (rating === 'pass') passCount++;
    else if (rating === 'fail') failCount++;
    else if (rating === 'conditional') conditionalCount++;
    else if (rating === 'na') naCount++;
  }
  const totalItems = resultsJson.length;
  const ratedItems = totalItems - naCount;
  const score = ratedItems > 0 ? (passCount + conditionalCount * 0.5) / ratedItems : 1;
  return { score, passCount, failCount, conditionalCount, naCount, totalItems };
}

async function authorizeAssetReference(req: NextRequest, session: NonNullable<ReturnType<typeof getSession>>, assetId: string) {
  const asset = await db.asset.findUnique({ where: { id: assetId }, select: { plantId: true } });
  if (!asset) throw new Error('Asset not found');
  const scope = await getPlantScope(req, session);
  if (scope.denyAccess || !canAccessPlantStrict(scope, asset.plantId)) {
    throw new Error('Asset access denied');
  }
}

async function authorizeExecutionWorkOrder(req: NextRequest, session: NonNullable<ReturnType<typeof getSession>>, workOrderId: string) {
  const auth = await authorizeWorkOrderExecutionAccess(req, session, workOrderId);
  if (!auth.ok) throw new Error('Work order access denied');
  if (!isAdmin(session) && !isWorkOrderExecutionMember(session, auth.entity)) {
    throw new Error('Work order execution access denied');
  }
  return auth.entity;
}

export async function POST(req: NextRequest) {
  try {
    const session = getSession(req);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json() as Record<string, unknown>;
    const operations = body.operations;
    const deviceId = typeof body.deviceId === 'string' ? body.deviceId : null;

    if (!Array.isArray(operations) || operations.length === 0) {
      return NextResponse.json({ success: false, error: 'Operations array is required' }, { status: 400 });
    }

    if (operations.length > 100) {
      return NextResponse.json({ success: false, error: 'Maximum 100 operations per sync batch' }, { status: 400 });
    }

    const results: SyncResult[] = [];
    let conflicts = 0;
    let processed = 0;
    let failed = 0;

    for (const rawOperation of operations) {
      let syncOperationId: string | undefined;
      let resultLocalId: string | undefined;
      try {
        const op = normalizeOperation(rawOperation);
        resultLocalId = op.localId ?? op.entityId;

        if (op.entityType !== 'work_orders' && op.entityType !== 'inspections') {
          throw new Error(`Unsupported entity type: ${op.entityType}`);
        }

        const syncOp = await db.syncOperation.create({
          data: {
            userId: session.userId,
            deviceId,
            operationType: 'upload',
            entityType: op.entityType,
            entityId: op.entityId ?? null,
            dataJson: jsonInput(op.data),
            status: 'processing',
          },
          select: { id: true },
        });
        syncOperationId = syncOp.id;

        if (op.entityType === 'work_orders') {
          if (op.operation !== 'update') throw new Error('Offline Work Orders support update operations only');
          const workOrderId = op.entityId ?? (typeof op.data.id === 'string' ? op.data.id : undefined);
          if (!workOrderId) throw new Error('Work Order entityId is required');

          await authorizeExecutionWorkOrder(req, session, workOrderId);

          if (op.serverVersion !== undefined) {
            const existing = await db.workOrder.findUnique({
              where: { id: workOrderId },
              select: { updatedAt: true },
            });
            if (!existing) throw new Error('Work order not found');
            const serverVersion = existing.updatedAt.getTime();
            if (Math.abs(serverVersion - op.serverVersion) > 60000) {
              const conflictReason = 'Server version mismatch';
              await db.syncOperation.update({
                where: { id: syncOp.id },
                data: { status: 'conflict', conflictReason, resolvedAt: new Date() },
              });
              conflicts++;
              results.push({ localId: resultLocalId, success: false, conflict: true, conflictReason });
              continue;
            }
          }

          await db.workOrder.update({
            where: { id: workOrderId },
            data: buildWorkOrderFieldUpdate(op.data),
          });
        } else {
          if (op.operation === 'delete') throw new Error('Offline inspection deletion is not supported');

          const requiredPermission = op.operation === 'create'
            ? 'quality_inspections.create'
            : 'quality_inspections.update';
          if (!isAdmin(session) && !hasPermission(session, requiredPermission)) {
            throw new Error('Inspection permission denied');
          }

          if (op.operation === 'create') {
            const templateId = typeof op.data.templateId === 'string' ? op.data.templateId : undefined;
            if (!templateId) throw new Error('Inspection templateId is required');
            const template = await db.inspectionTemplate.findUnique({ where: { id: templateId }, select: { id: true } });
            if (!template) throw new Error('Inspection template not found');

            const assetId = typeof op.data.assetId === 'string' ? op.data.assetId : undefined;
            const workOrderId = typeof op.data.workOrderId === 'string' ? op.data.workOrderId : undefined;
            if (assetId) await authorizeAssetReference(req, session, assetId);
            if (workOrderId) await authorizeExecutionWorkOrder(req, session, workOrderId);

            const status = op.data.status === 'completed' ? 'completed' : 'in_progress';
            const metrics = inspectionMetrics(op.data.resultsJson);
            await db.mobileInspection.create({
              data: {
                templateId,
                assetId: assetId ?? null,
                workOrderId: workOrderId ?? null,
                inspectorId: session.userId,
                status,
                startedAt: new Date(),
                completedAt: status === 'completed' ? new Date() : null,
                score: status === 'completed' ? metrics.score : undefined,
                passCount: metrics.passCount,
                failCount: metrics.failCount,
                conditionalCount: metrics.conditionalCount,
                naCount: metrics.naCount,
                totalItems: metrics.totalItems,
                resultsJson: jsonInput(op.data.resultsJson),
                findingsJson: jsonInput(op.data.findingsJson),
                photosJson: jsonInput(op.data.photosJson),
                signatureData: nullableString(op.data.signatureData, 'signatureData'),
                gpsCoordinates: jsonInput(op.data.gpsCoordinates),
                notes: nullableString(op.data.notes, 'notes'),
              },
            });
          } else {
            if (!op.entityId) throw new Error('Inspection entityId is required');
            const inspection = await db.mobileInspection.findUnique({
              where: { id: op.entityId },
              select: { inspectorId: true, assetId: true, workOrderId: true },
            });
            if (!inspection) throw new Error('Inspection not found');
            if (!isAdmin(session) && inspection.inspectorId !== session.userId) {
              throw new Error('Inspection access denied');
            }
            if (inspection.assetId) await authorizeAssetReference(req, session, inspection.assetId);
            if (inspection.workOrderId) await authorizeExecutionWorkOrder(req, session, inspection.workOrderId);

            const update: Prisma.MobileInspectionUncheckedUpdateInput = {};
            if (op.data.status !== undefined) {
              if (op.data.status !== 'in_progress' && op.data.status !== 'completed' && op.data.status !== 'failed') {
                throw new Error('Invalid inspection status');
              }
              update.status = op.data.status;
              if (op.data.status === 'completed') update.completedAt = new Date();
            }
            if (op.data.resultsJson !== undefined) {
              update.resultsJson = jsonInput(op.data.resultsJson);
              const metrics = inspectionMetrics(op.data.resultsJson);
              update.score = metrics.score;
              update.passCount = metrics.passCount;
              update.failCount = metrics.failCount;
              update.conditionalCount = metrics.conditionalCount;
              update.naCount = metrics.naCount;
              update.totalItems = metrics.totalItems;
            }
            if (op.data.findingsJson !== undefined) update.findingsJson = jsonInput(op.data.findingsJson);
            if (op.data.photosJson !== undefined) update.photosJson = jsonInput(op.data.photosJson);
            if (op.data.gpsCoordinates !== undefined) update.gpsCoordinates = jsonInput(op.data.gpsCoordinates);
            const signatureData = nullableString(op.data.signatureData, 'signatureData');
            if (signatureData !== undefined) update.signatureData = signatureData;
            const notes = nullableString(op.data.notes, 'notes');
            if (notes !== undefined) update.notes = notes;

            if (Object.keys(update).length === 0) throw new Error('No supported inspection fields were supplied');
            await db.mobileInspection.update({ where: { id: op.entityId }, data: update });
          }
        }

        await db.syncOperation.update({
          where: { id: syncOp.id },
          data: { status: 'completed', resolvedAt: new Date() },
        });
        processed++;
        results.push({ localId: resultLocalId, success: true, conflict: false });
      } catch (err: unknown) {
        failed++;
        const message = err instanceof Error ? err.message : 'Sync operation failed';
        if (syncOperationId) {
          await db.syncOperation.update({
            where: { id: syncOperationId },
            data: { status: 'failed', conflictReason: message, resolvedAt: new Date() },
          }).catch(() => undefined);
        }
        results.push({ localId: resultLocalId, success: false, error: message });
        logger.error('Sync operation failed', { error: message });
      }
    }

    logger.info('Sync batch processed', {
      userId: session.userId,
      total: operations.length,
      processed,
      conflicts,
      failed,
    });

    return NextResponse.json({
      success: true,
      data: { processed, conflicts, failed, results },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Sync failed';
    logger.error('Sync POST error', error instanceof Error ? error : { error: message });
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
