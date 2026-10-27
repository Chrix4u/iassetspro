import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { canAccessPlantStrict, getPlantScope } from '@/lib/plant-scope';
import { createAssetMeter, listAssetMeters } from '@/services/assets/assetMeter.service';

async function scopedAsset(request: NextRequest, assetId: string) {
  const session = getSession(request);
  if (!session) return { response: NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 }) };
  const plantScope = await getPlantScope(request, session);
  if (plantScope.denyAccess) return { response: NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 }) };
  const asset = await db.asset.findUnique({ where: { id: assetId }, select: { id: true, plantId: true, name: true, assetTag: true } });
  if (!asset) return { response: NextResponse.json({ success: false, error: 'Asset not found' }, { status: 404 }) };
  if (!canAccessPlantStrict(plantScope, asset.plantId)) {
    return { response: NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 }) };
  }
  return { session, asset };
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const scoped = await scopedAsset(request, id);
    if ('response' in scoped) return scoped.response;
    if (!isAdmin(scoped.session) && !hasPermission(scoped.session, 'meters.view')) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }
    const meters = await listAssetMeters(db, scoped.asset.id);
    return NextResponse.json({ success: true, data: meters });
  } catch (error: unknown) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Failed to load asset meters' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const scoped = await scopedAsset(request, id);
    if ('response' in scoped) return scoped.response;
    if (!isAdmin(scoped.session) && !hasPermission(scoped.session, 'meters.create')) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }
    const body = await request.json();
    const meter = await createAssetMeter(db, { assetId: scoped.asset.id, actorId: scoped.session.userId, definition: body });
    await db.auditLog.create({
      data: {
        userId: scoped.session.userId,
        action: 'create',
        entityType: 'asset_meter',
        entityId: meter.id,
        newValues: JSON.stringify({ assetId: scoped.asset.id, name: meter.name, unit: meter.unit, meterType: meter.meterType }),
      },
    });
    return NextResponse.json({ success: true, data: meter }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create asset meter';
    const status = /required|numeric/i.test(message) ? 400 : /unique/i.test(message) ? 409 : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
