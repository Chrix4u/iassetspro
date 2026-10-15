import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasPermission, isAdmin, type SessionData } from '@/lib/auth';
import { canAccessPlant, getPlantScope } from '@/lib/plant-scope';
import { FunctionalLocationDomainError } from '@/lib/functional-location/service';
import {
  assignAssetToFunctionalLocation,
  getAssetFunctionalLocationAssignments,
  getCurrentAssetFunctionalLocations,
} from '@/lib/functional-location/asset-assignment';

function errorResponse(error: unknown) {
  if (error instanceof FunctionalLocationDomainError) {
    const status = error.code === 'NOT_FOUND' ? 404 : error.code === 'CONFLICT' ? 409 : 400;
    return NextResponse.json({ success: false, error: error.message }, { status });
  }
  const message = error instanceof Error ? error.message : 'Asset functional-location operation failed';
  return NextResponse.json({ success: false, error: message }, { status: 500 });
}

async function resolveScopedAsset(request: NextRequest, session: SessionData, assetId: string) {
  const asset = await db.asset.findUnique({
    where: { id: assetId },
    select: { id: true, plantId: true, assetTag: true, name: true },
  });
  if (!asset) return { error: 'Asset not found', status: 404 as const };

  const plantScope = await getPlantScope(request, session);
  if (plantScope.denyAccess || !canAccessPlant(plantScope, asset.plantId)) {
    return { error: 'Plant access denied', status: 403 as const };
  }

  return { asset, plantScope, session };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = getSession(request);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    if (!isAdmin(session) && !hasPermission(session, 'assets.functional_locations.view') &&
      !hasPermission(session, 'assets.functional_locations.assign')) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const { id } = await params;
    const scoped = await resolveScopedAsset(request, session, id);
    if ('error' in scoped) {
      return NextResponse.json({ success: false, error: scoped.error }, { status: scoped.status });
    }

    const [history, current] = await Promise.all([
      getAssetFunctionalLocationAssignments(scoped.asset.id),
      getCurrentAssetFunctionalLocations(scoped.asset.id),
    ]);
    const primary = current.find((assignment) => assignment.hierarchySystem.isPrimary) ?? null;

    return NextResponse.json({
      success: true,
      data: { current, primary, history },
    });
  } catch (error: unknown) {
    return errorResponse(error);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = getSession(request);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    if (!isAdmin(session) && !hasPermission(session, 'assets.functional_locations.assign')) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const { id } = await params;
    const scoped = await resolveScopedAsset(request, session, id);
    if ('error' in scoped) {
      return NextResponse.json({ success: false, error: scoped.error }, { status: scoped.status });
    }

    const body = await request.json();
    const functionalLocationId = String(body.functionalLocationId || '').trim();
    if (!functionalLocationId) {
      return NextResponse.json({ success: false, error: 'Functional location is required' }, { status: 400 });
    }

    const target = await db.functionalLocation.findUnique({
      where: { id: functionalLocationId },
      select: { id: true, plantId: true },
    });
    if (!target) {
      return NextResponse.json({ success: false, error: 'Functional location not found' }, { status: 404 });
    }
    if (!canAccessPlant(scoped.plantScope, target.plantId)) {
      return NextResponse.json({ success: false, error: 'Functional location access denied' }, { status: 403 });
    }

    const assignment = await assignAssetToFunctionalLocation({
      assetId: scoped.asset.id,
      functionalLocationId: target.id,
      actorId: session.userId,
      reason: typeof body.reason === 'string' ? body.reason : null,
    });

    return NextResponse.json({ success: true, data: assignment }, { status: 201 });
  } catch (error: unknown) {
    return errorResponse(error);
  }
}
