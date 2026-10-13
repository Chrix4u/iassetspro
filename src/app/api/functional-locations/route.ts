import { Prisma } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { canAccessPlant, getPlantScope } from '@/lib/plant-scope';
import {
  canMutateFunctionalLocationForScope,
  getFunctionalLocationPlantWhere,
} from '@/lib/functional-location/access';
import {
  createFunctionalLocation,
  FunctionalLocationDomainError,
} from '@/lib/functional-location/service';

const LOCATION_STATUSES = new Set(['active', 'inactive', 'retired']);

function canView(session: ReturnType<typeof getSession>): boolean {
  return !!session && (isAdmin(session) || hasPermission(session, 'assets.functional_locations.view'));
}

function canManage(session: ReturnType<typeof getSession>): boolean {
  return !!session && (isAdmin(session) || hasPermission(session, 'assets.functional_locations.manage'));
}

function domainErrorResponse(error: FunctionalLocationDomainError) {
  const status = error.code === 'NOT_FOUND' ? 404 : error.code === 'CONFLICT' ? 409 : 400;
  return NextResponse.json({ success: false, error: error.message }, { status });
}

export async function GET(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    if (!canView(session)) return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });

    const plantScope = await getPlantScope(request, session);
    if (plantScope.denyAccess) {
      return NextResponse.json({ success: false, error: 'Plant access denied' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const systemId = searchParams.get('systemId');
    const parentId = searchParams.get('parentId');
    const status = searchParams.get('status');
    const search = searchParams.get('search')?.trim();
    const requestedPlantId = searchParams.get('plantId');

    if (status && !LOCATION_STATUSES.has(status)) {
      return NextResponse.json({ success: false, error: 'Unsupported functional location status' }, { status: 400 });
    }
    if (requestedPlantId && !canAccessPlant(plantScope, requestedPlantId)) {
      return NextResponse.json({ success: false, error: 'Plant access denied' }, { status: 403 });
    }

    const and: Prisma.FunctionalLocationWhereInput[] = [getFunctionalLocationPlantWhere(plantScope)];
    if (systemId) and.push({ hierarchySystemId: systemId });
    if (parentId === 'root') and.push({ parentId: null });
    else if (parentId) and.push({ parentId });
    if (status) and.push({ status });
    if (requestedPlantId) and.push({ OR: [{ plantId: null }, { plantId: requestedPlantId }] });
    if (search) {
      and.push({
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { locationCode: { contains: search, mode: 'insensitive' } },
        ],
      });
    }

    const locations = await db.functionalLocation.findMany({
      where: { AND: and },
      include: {
        hierarchySystem: { select: { id: true, name: true, code: true, isPrimary: true } },
        hierarchyLevel: { select: { id: true, label: true, order: true, allowAssetAssignment: true } },
        parent: { select: { id: true, name: true, locationCode: true, plantId: true } },
        plant: { select: { id: true, name: true, code: true } },
      },
      orderBy: [{ depth: 'asc' }, { name: 'asc' }],
    });

    return NextResponse.json({ success: true, data: locations });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load functional locations';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    if (!canManage(session)) return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });

    const plantScope = await getPlantScope(request, session);
    if (plantScope.denyAccess) {
      return NextResponse.json({ success: false, error: 'Plant access denied' }, { status: 403 });
    }

    const body = await request.json();
    const requestedStatus = body.status === undefined ? 'active' : String(body.status);
    if (!LOCATION_STATUSES.has(requestedStatus)) {
      return NextResponse.json({ success: false, error: 'Status must be active, inactive, or retired' }, { status: 400 });
    }

    const parentId = typeof body.parentId === 'string' && body.parentId ? body.parentId : null;
    const parent = parentId
      ? await db.functionalLocation.findUnique({ where: { id: parentId }, select: { id: true, plantId: true } })
      : null;
    if (parentId && !parent) {
      return NextResponse.json({ success: false, error: 'Parent functional location not found' }, { status: 404 });
    }
    if (parent?.plantId && !canAccessPlant(plantScope, parent.plantId)) {
      return NextResponse.json({ success: false, error: 'Plant access denied' }, { status: 403 });
    }

    const requestedPlantId = typeof body.plantId === 'string' && body.plantId ? body.plantId : null;
    if (requestedPlantId && !canAccessPlant(plantScope, requestedPlantId)) {
      return NextResponse.json({ success: false, error: 'Plant access denied' }, { status: 403 });
    }

    let effectivePlantId = requestedPlantId ?? parent?.plantId ?? plantScope.plantId ?? null;
    if (!effectivePlantId && !plantScope.isSystemWide) {
      if (plantScope.accessiblePlantIds.length === 1) {
        effectivePlantId = plantScope.accessiblePlantIds[0];
      } else {
        return NextResponse.json(
          { success: false, error: 'Select a plant before creating this functional location' },
          { status: 400 },
        );
      }
    }

    if (!canMutateFunctionalLocationForScope(plantScope, effectivePlantId)) {
      return NextResponse.json({ success: false, error: 'Plant access denied' }, { status: 403 });
    }

    const created = await createFunctionalLocation({
      hierarchySystemId: String(body.hierarchySystemId || ''),
      hierarchyLevelId: String(body.hierarchyLevelId || ''),
      parentId,
      name: String(body.name || ''),
      codeSegment: typeof body.codeSegment === 'string' ? body.codeSegment : null,
      locationCode: typeof body.locationCode === 'string' ? body.locationCode : null,
      description: typeof body.description === 'string' ? body.description : null,
      status: requestedStatus as 'active' | 'inactive' | 'retired',
      plantId: effectivePlantId,
      createdById: session.userId,
    });

    await db.auditLog.create({
      data: {
        userId: session.userId,
        action: 'create',
        entityType: 'functional_location',
        entityId: created.id,
        newValues: JSON.stringify(created),
        plantId: created.plantId,
      },
    });

    return NextResponse.json({ success: true, data: created }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof FunctionalLocationDomainError) return domainErrorResponse(error);
    const message = error instanceof Error ? error.message : 'Failed to create functional location';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
