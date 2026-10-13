import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { canAccessPlant, getPlantScope } from '@/lib/plant-scope';
import { canMutateFunctionalLocationForScope } from '@/lib/functional-location/access';
import {
  FunctionalLocationDomainError,
  moveFunctionalLocation,
} from '@/lib/functional-location/service';

function canManage(session: ReturnType<typeof getSession>): boolean {
  return !!session && (isAdmin(session) || hasPermission(session, 'assets.functional_locations.manage'));
}

function domainErrorResponse(error: FunctionalLocationDomainError) {
  const status = error.code === 'NOT_FOUND' ? 404 : error.code === 'CONFLICT' ? 409 : 400;
  return NextResponse.json({ success: false, error: error.message }, { status });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = getSession(request);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    if (!canManage(session)) return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });

    const plantScope = await getPlantScope(request, session);
    if (plantScope.denyAccess) return NextResponse.json({ success: false, error: 'Plant access denied' }, { status: 403 });

    const { id } = await params;
    const body = await request.json();
    if (body.newParentId !== null && body.newParentId !== undefined && typeof body.newParentId !== 'string') {
      return NextResponse.json({ success: false, error: 'newParentId must be a functional-location id or null' }, { status: 400 });
    }

    const current = await db.functionalLocation.findUnique({
      where: { id },
      select: { id: true, parentId: true, hierarchyLevelId: true, depth: true, plantId: true },
    });
    if (!current) return NextResponse.json({ success: false, error: 'Functional location not found' }, { status: 404 });
    if (!canAccessPlant(plantScope, current.plantId) || !canMutateFunctionalLocationForScope(plantScope, current.plantId)) {
      return NextResponse.json({ success: false, error: 'Plant access denied' }, { status: 403 });
    }

    const newParentId = typeof body.newParentId === 'string' && body.newParentId ? body.newParentId : null;
    const destination = newParentId
      ? await db.functionalLocation.findUnique({ where: { id: newParentId }, select: { id: true, plantId: true } })
      : null;
    if (newParentId && !destination) {
      return NextResponse.json({ success: false, error: 'Destination parent functional location not found' }, { status: 404 });
    }
    if (destination?.plantId && !canAccessPlant(plantScope, destination.plantId)) {
      return NextResponse.json({ success: false, error: 'Plant access denied' }, { status: 403 });
    }

    const moved = await moveFunctionalLocation({
      id,
      newParentId,
      hierarchyLevelId: typeof body.hierarchyLevelId === 'string' && body.hierarchyLevelId
        ? body.hierarchyLevelId
        : null,
    });

    await db.auditLog.create({
      data: {
        userId: session.userId,
        action: 'move',
        entityType: 'functional_location',
        entityId: id,
        oldValues: JSON.stringify({
          parentId: current.parentId,
          hierarchyLevelId: current.hierarchyLevelId,
          depth: current.depth,
        }),
        newValues: JSON.stringify({
          parentId: moved.parentId,
          hierarchyLevelId: moved.hierarchyLevelId,
          depth: moved.depth,
        }),
        plantId: current.plantId,
      },
    });

    return NextResponse.json({ success: true, data: moved });
  } catch (error: unknown) {
    if (error instanceof FunctionalLocationDomainError) return domainErrorResponse(error);
    const message = error instanceof Error ? error.message : 'Failed to move functional location';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
