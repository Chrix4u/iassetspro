import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { canAccessPlantStrict, getPlantScope } from '@/lib/plant-scope';
import { createPmAssignmentBundle } from '@/services/pm/pmBundling.service';

export async function POST(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    if (!isAdmin(session) && !hasPermission(session, 'work_orders.create') && !hasPermission(session, 'pm_schedules.create')) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }
    const scope = await getPlantScope(request, session);
    if (scope.denyAccess) return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });

    const body = await request.json();
    const assetId = typeof body.assetId === 'string' ? body.assetId.trim() : '';
    const assignmentIds = Array.isArray(body.assignmentIds) ? body.assignmentIds.filter((id: unknown) => typeof id === 'string' && id.trim()) : [];
    const plannedExecutionAt = typeof body.plannedExecutionAt === 'string' && body.plannedExecutionAt.trim()
      ? new Date(body.plannedExecutionAt)
      : undefined;
    if (plannedExecutionAt && !Number.isFinite(plannedExecutionAt.getTime())) {
      return NextResponse.json({ success: false, error: 'Planned execution date is invalid' }, { status: 400 });
    }
    if (!assetId) return NextResponse.json({ success: false, error: 'Asset is required' }, { status: 400 });
    if (assignmentIds.length === 0) return NextResponse.json({ success: false, error: 'At least one PM assignment is required' }, { status: 400 });

    const asset = await db.asset.findUnique({ where: { id: assetId }, select: { id: true, plantId: true } });
    if (!asset) return NextResponse.json({ success: false, error: 'Asset not found' }, { status: 404 });
    if (!canAccessPlantStrict(scope, asset.plantId)) return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });

    const result = await createPmAssignmentBundle(db as never, {
      actorId: session.userId,
      assetId,
      assignmentIds,
      planningWindowDays: Number(body.planningWindowDays ?? 7),
      plannedExecutionAt,
    });
    return NextResponse.json({ success: true, data: result }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create PM work bundle';
    const status = /required|same machine|Running|Standstill|planning window|past|due|unavailable|already materialized|not eligible|no longer exist/i.test(message) ? 400 : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
