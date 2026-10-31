import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { canAccessPlantStrict, getPlantScope } from '@/lib/plant-scope';
import { deactivatePmAssignmentTarget, replacePmAssignmentTarget } from '@/services/pm/pmAssignment.service';

async function scopedTarget(request: NextRequest, assetId: string) {
  const session = getSession(request);
  if (!session) return { response: NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 }) };
  const scope = await getPlantScope(request, session);
  if (scope.denyAccess) return { response: NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 }) };
  const asset = await db.asset.findUnique({ where: { id: assetId }, select: { id: true, plantId: true } });
  if (!asset) return { response: NextResponse.json({ success: false, error: 'Asset not found' }, { status: 404 }) };
  if (!canAccessPlantStrict(scope, asset.plantId)) return { response: NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 }) };
  return { session, asset };
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const assetId = typeof body.assetId === 'string' ? body.assetId.trim() : '';
    if (!assetId) return NextResponse.json({ success: false, error: 'Asset is required' }, { status: 400 });
    const scoped = await scopedTarget(request, assetId);
    if ('response' in scoped) return scoped.response;
    if (!isAdmin(scoped.session) && !hasPermission(scoped.session, 'pm_schedules.update') && !hasPermission(scoped.session, 'work_orders.update')) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }
    const componentId = typeof body.componentId === 'string' && body.componentId.trim() ? body.componentId.trim() : null;
    const data = await replacePmAssignmentTarget(db, {
      plantId: scoped.asset.plantId, actorId: scoped.session.userId, assetId, componentId,
      assignments: Array.isArray(body.assignments) ? body.assignments : [],
    });
    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update PM target';
    return NextResponse.json({ success: false, error: message }, { status: /required|must|invalid|belong|active|positive|greater|target/i.test(message) ? 400 : 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const assetId = searchParams.get('assetId')?.trim() || '';
    if (!assetId) return NextResponse.json({ success: false, error: 'Asset is required' }, { status: 400 });
    const scoped = await scopedTarget(request, assetId);
    if ('response' in scoped) return scoped.response;
    if (!isAdmin(scoped.session) && !hasPermission(scoped.session, 'pm_schedules.delete') && !hasPermission(scoped.session, 'work_orders.delete')) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }
    const componentId = searchParams.get('componentId')?.trim() || null;
    const data = await deactivatePmAssignmentTarget(db, {
      plantId: scoped.asset.plantId, actorId: scoped.session.userId, assetId, componentId,
    });
    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to delete PM target';
    return NextResponse.json({ success: false, error: message }, { status: /required|belong|target/i.test(message) ? 400 : 500 });
  }
}
