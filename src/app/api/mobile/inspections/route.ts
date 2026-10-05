// ============================================================================
// GET/POST /api/mobile/inspections — Manage mobile inspections
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { createLogger } from '@/lib/logger';
import { getPlantScope, canAccessPlantStrict } from '@/lib/plant-scope';
import { authorizeWorkOrderExecutionAccess } from '@/lib/plant-auth-helpers';
import { isWorkOrderExecutionMember } from '@/services/workOrderAccess.service';
import { Prisma } from '@prisma/client';

const logger = createLogger('api:mobile:inspections');

function jsonInput(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull | undefined {
  if (value === undefined) return undefined;
  if (value === null) return Prisma.JsonNull;
  return value as Prisma.InputJsonValue;
}

async function authorizeAssetReference(req: NextRequest, session: NonNullable<ReturnType<typeof getSession>>, assetId: string) {
  const asset = await db.asset.findUnique({ where: { id: assetId }, select: { plantId: true } });
  if (!asset) return NextResponse.json({ success: false, error: 'Asset not found' }, { status: 404 });
  const scope = await getPlantScope(req, session);
  if (scope.denyAccess || !canAccessPlantStrict(scope, asset.plantId)) {
    return NextResponse.json({ success: false, error: 'Asset access denied' }, { status: 403 });
  }
  return null;
}

async function authorizeWorkOrderReference(req: NextRequest, session: NonNullable<ReturnType<typeof getSession>>, workOrderId: string) {
  const auth = await authorizeWorkOrderExecutionAccess(req, session, workOrderId);
  if (!auth.ok) return auth.response;
  if (!isAdmin(session) && !isWorkOrderExecutionMember(session, auth.entity)) {
    return NextResponse.json({ success: false, error: 'Work order execution access denied' }, { status: 403 });
  }
  return null;
}

export async function GET(req: NextRequest) {
  try {
    const session = getSession(req);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(req.url);
    const status = url.searchParams.get('status');
    const templateId = url.searchParams.get('templateId');
    const assetId = url.searchParams.get('assetId');
    const inspectorId = url.searchParams.get('inspectorId') || session.userId;
    const limit = parseInt(url.searchParams.get('limit') || '50', 10);
    const offset = parseInt(url.searchParams.get('offset') || '0', 10);

    if (inspectorId !== session.userId && !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Cannot view another inspector’s records' }, { status: 403 });
    }
    if (assetId) {
      const assetDeny = await authorizeAssetReference(req, session, assetId);
      if (assetDeny) return assetDeny;
    }

    const where: Record<string, unknown> = {};
    if (status && status !== 'all') where.status = status;
    if (templateId) where.templateId = templateId;
    if (assetId) where.assetId = assetId;
    where.inspectorId = inspectorId;

    const [inspections, total] = await Promise.all([
      db.mobileInspection.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        include: {
          template: { select: { id: true, name: true, category: true } },
        },
      }),
      db.mobileInspection.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: inspections,
      pagination: { total, limit, offset, hasMore: offset + limit < total },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch inspections';
    logger.error('Inspections GET error', error instanceof Error ? error : { error: message });
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = getSession(req);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    if (!isAdmin(session) && !hasPermission(session, 'quality_inspections.create')) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const body = await req.json();
    const {
      templateId, assetId, workOrderId, resultsJson, findingsJson,
      photosJson, signatureData, gpsCoordinates, notes, status,
    } = body;

    if (!templateId) {
      return NextResponse.json({ success: false, error: 'templateId is required' }, { status: 400 });
    }

    // Verify template exists
    const template = await db.inspectionTemplate.findUnique({
      where: { id: templateId },
      select: { id: true, passThreshold: true, sectionsJson: true },
    });

    if (!template) {
      return NextResponse.json({ success: false, error: 'Inspection template not found' }, { status: 404 });
    }

    if (assetId) {
      const assetDeny = await authorizeAssetReference(req, session, String(assetId));
      if (assetDeny) return assetDeny;
    }
    if (workOrderId) {
      const workOrderDeny = await authorizeWorkOrderReference(req, session, String(workOrderId));
      if (workOrderDeny) return workOrderDeny;
    }

    // Calculate score if results provided
    let score: number | undefined;
    let passCount = 0;
    let failCount = 0;
    let conditionalCount = 0;
    let naCount = 0;
    let totalItems = 0;

    if (resultsJson && Array.isArray(resultsJson)) {
      totalItems = resultsJson.length;
      for (const item of resultsJson) {
        const rating = item.rating || item.value;
        if (rating === 'pass') passCount++;
        else if (rating === 'fail') failCount++;
        else if (rating === 'conditional') conditionalCount++;
        else if (rating === 'na') naCount++;
      }
      const ratedItems = totalItems - naCount;
      score = ratedItems > 0 ? (passCount * 1 + conditionalCount * 0.5) / ratedItems : 1;
    }

    const isComplete = status === 'completed';
    const inspection = await db.mobileInspection.create({
      data: {
        templateId,
        assetId: assetId || null,
        workOrderId: workOrderId || null,
        inspectorId: session.userId,
        status: isComplete ? 'completed' : 'in_progress',
        startedAt: new Date(),
        completedAt: isComplete ? new Date() : null,
        score: isComplete ? score : undefined,
        passCount,
        failCount,
        conditionalCount,
        naCount,
        totalItems,
        resultsJson: jsonInput(resultsJson),
        findingsJson: jsonInput(findingsJson),
        photosJson: jsonInput(photosJson),
        signatureData: signatureData || undefined,
        gpsCoordinates: jsonInput(gpsCoordinates),
        notes: notes || undefined,
      },
    });

    logger.info('Mobile inspection created', {
      inspectionId: inspection.id,
      templateId,
      status: inspection.status,
      score,
    });

    return NextResponse.json({ success: true, data: inspection }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create inspection';
    logger.error('Inspections POST error', error instanceof Error ? error : { error: message });
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
