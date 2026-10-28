import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { canAccessPlantStrict, getPlantScope } from '@/lib/plant-scope';
import { recordAssetMeterReading } from '@/services/assets/assetMeter.service';

async function context(request: NextRequest, assetId: string, meterId: string) {
  const session = getSession(request);
  if (!session) return { response: NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 }) };
  const asset = await db.asset.findUnique({ where: { id: assetId }, select: { id: true, plantId: true } });
  if (!asset) return { response: NextResponse.json({ success: false, error: 'Asset not found' }, { status: 404 }) };
  const plantScope = await getPlantScope(request, session);
  if (plantScope.denyAccess || !canAccessPlantStrict(plantScope, asset.plantId)) {
    return { response: NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 }) };
  }
  const meter = await db.assetMeter.findUnique({ where: { id: meterId } });
  if (!meter || meter.assetId !== asset.id) {
    return { response: NextResponse.json({ success: false, error: 'Meter not found on this asset' }, { status: 404 }) };
  }
  return { session, asset, meter };
}

function readingNumber() {
  const now = new Date();
  const month = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  return `MR-OPS-${month}-${String(now.getTime()).slice(-8)}`;
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string; meterId: string }> }) {
  try {
    const { id, meterId } = await params;
    const scoped = await context(request, id, meterId);
    if ('response' in scoped) return scoped.response;
    if (!isAdmin(scoped.session) && !hasPermission(scoped.session, 'meters.update') && !hasPermission(scoped.session, 'meters.create')) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }
    const body = await request.json();
    if (body.value !== undefined) {
      const reading = await recordAssetMeterReading(db, {
        assetId: scoped.asset.id,
        meterId: scoped.meter.id,
        value: body.value,
        readingDate: body.readingDate,
        notes: body.notes,
        actorId: scoped.session.userId,
        plantId: scoped.asset.plantId,
        readingNumber: readingNumber(),
      });
      return NextResponse.json({ success: true, data: reading });
    }
    const data: { name?: string; unit?: string; meterType?: string; isActive?: boolean } = {};
    if (typeof body.name === 'string' && body.name.trim()) data.name = body.name.trim();
    if (typeof body.unit === 'string' && body.unit.trim()) data.unit = body.unit.trim();
    if (typeof body.meterType === 'string' && body.meterType.trim()) data.meterType = body.meterType.trim().toLowerCase();
    if (typeof body.isActive === 'boolean') data.isActive = body.isActive;
    const meter = await db.assetMeter.update({ where: { id: scoped.meter.id }, data });
    return NextResponse.json({ success: true, data: meter });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update asset meter';
    return NextResponse.json({ success: false, error: message }, { status: /numeric|invalid|required/i.test(message) ? 400 : 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string; meterId: string }> }) {
  try {
    const { id, meterId } = await params;
    const scoped = await context(request, id, meterId);
    if ('response' in scoped) return scoped.response;
    if (!isAdmin(scoped.session) && !hasPermission(scoped.session, 'meters.update')) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }
    const meter = await db.assetMeter.update({ where: { id: scoped.meter.id }, data: { isActive: false } });
    return NextResponse.json({ success: true, data: meter });
  } catch (error: unknown) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Failed to deactivate meter' }, { status: 500 });
  }
}
