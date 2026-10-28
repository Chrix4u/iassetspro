import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { canAccessPlantStrict, getPlantScope } from '@/lib/plant-scope';
import { getPmMachineRollup } from '@/services/pm/pmMachineRollup.service';
import { buildPmBundleGroups } from '@/services/pm/pmBundling.service';

export async function GET(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    const scope = await getPlantScope(request, session);
    if (scope.denyAccess) return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const assetId = String(searchParams.get('assetId') || '').trim();
    if (!assetId) return NextResponse.json({ success: false, error: 'Asset is required' }, { status: 400 });
    const planningWindowDays = Number(searchParams.get('planningWindowDays') || 7);
    const asset = await db.asset.findUnique({ where: { id: assetId }, select: { id: true, plantId: true } });
    if (!asset) return NextResponse.json({ success: false, error: 'Asset not found' }, { status: 404 });
    if (!canAccessPlantStrict(scope, asset.plantId)) return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });

    const rollup = await getPmMachineRollup({ client: db, assetId, planningWindowDays });
    const bundleGroups = buildPmBundleGroups(rollup.assignments, rollup.planningWindowDays);
    return NextResponse.json({ success: true, data: { ...rollup, bundleGroups } });
  } catch (error: unknown) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Failed to load PM machine roll-up' }, { status: 500 });
  }
}
