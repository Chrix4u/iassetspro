import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { canAccessPlantStrict, getPlantScope } from '@/lib/plant-scope';
import { createPmAssignment, createPmAssignmentBatch } from '@/services/pm/pmAssignment.service';

export async function GET(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    const scope = await getPlantScope(request, session);
    if (scope.denyAccess) return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    const { searchParams } = new URL(request.url);
    const assetId = searchParams.get('assetId');
    const componentId = searchParams.get('componentId');
    const isActive = searchParams.get('isActive');
    const where: Record<string, unknown> = { scheduleId: null };
    if (assetId) where.assetId = assetId;
    if (componentId) where.componentId = componentId;
    if (isActive !== null) where.isActive = isActive === 'true';
    if (!scope.isSystemWide) {
      where.asset = {
        plantId: scope.isScoped && scope.plantId ? scope.plantId : { in: scope.accessiblePlantIds },
      };
    }
    const assignments = await db.pmScheduleTask.findMany({
      where,
      include: {
        asset: { select: { id: true, name: true, assetTag: true, plantId: true } },
        component: { select: { id: true, name: true, componentCode: true, componentType: true, parentId: true } },
        assetMeter: { select: { id: true, name: true, unit: true, currentValue: true, lastReadingAt: true, isActive: true } },
        pmTask: true,
      },
      orderBy: [{ nextDueDate: 'asc' }, { createdAt: 'asc' }],
    });
    return NextResponse.json({ success: true, data: assignments });
  } catch (error: unknown) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Failed to load PM assignments' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    if (!isAdmin(session) && !hasPermission(session, 'pm_schedules.create') && !hasPermission(session, 'work_orders.create')) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }
    const scope = await getPlantScope(request, session);
    if (scope.denyAccess) return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    const body = await request.json();
    const assetId = typeof body.assetId === 'string' ? body.assetId.trim() : '';
    if (!assetId) return NextResponse.json({ success: false, error: 'Asset is required' }, { status: 400 });
    const asset = await db.asset.findUnique({ where: { id: assetId }, select: { id: true, plantId: true } });
    if (!asset) return NextResponse.json({ success: false, error: 'Asset not found' }, { status: 404 });
    if (!canAccessPlantStrict(scope, asset.plantId)) return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });

    if (Array.isArray(body.assignments)) {
      const componentId = typeof body.componentId === 'string' && body.componentId.trim() ? body.componentId.trim() : null;
      const assignments = await createPmAssignmentBatch(db, {
        plantId: asset.plantId,
        actorId: session.userId,
        assetId,
        componentId,
        assignments: body.assignments,
      });
      return NextResponse.json({ success: true, data: assignments }, { status: 201 });
    }

    const assignment = await createPmAssignment(db, { plantId: asset.plantId, actorId: session.userId, input: body });
    await db.auditLog.create({
      data: {
        userId: session.userId,
        action: 'create',
        entityType: 'pm_assignment',
        entityId: assignment.id,
        newValues: JSON.stringify({ assetId: assignment.assetId, componentId: assignment.componentId, pmTaskId: assignment.pmTaskId, pmType: assignment.pmType }),
      },
    });
    return NextResponse.json({ success: true, data: assignment }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create PM assignment';
    const status = /required|must|invalid|belong|unavailable|active|greater|positive/i.test(message) ? 400 : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
