import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { canAccessPlant, getPlantScope } from '@/lib/plant-scope';
import { createFunctionalLocation, FunctionalLocationDomainError } from '@/lib/functional-location/service';

function errorResponse(error: unknown) {
  if (error instanceof FunctionalLocationDomainError) {
    const status = error.code === 'NOT_FOUND' ? 404 : error.code === 'CONFLICT' ? 409 : 400;
    return NextResponse.json({ success: false, error: error.message }, { status });
  }
  const message = error instanceof Error ? error.message : 'Functional location operation failed';
  return NextResponse.json({ success: false, error: message }, { status: 500 });
}

export async function GET(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    if (!isAdmin(session) && !hasPermission(session, 'assets.functional_locations.view')) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const plantScope = await getPlantScope(request, session);
    if (plantScope.denyAccess) return NextResponse.json({ success: false, error: 'Plant access denied' }, { status: 403 });

    const { searchParams } = new URL(request.url);
    let hierarchySystemId = searchParams.get('hierarchySystemId');
    const parentId = searchParams.get('parentId');
    const status = searchParams.get('status');
    const search = searchParams.get('search')?.trim();

    if (!hierarchySystemId) {
      const primary = await db.hierarchySystem.findFirst({ where: { isPrimary: true, isActive: true }, select: { id: true } });
      hierarchySystemId = primary?.id ?? null;
    }
    if (!hierarchySystemId) return NextResponse.json({ success: true, data: [] });

    const where: Record<string, unknown> = { hierarchySystemId };
    if (parentId === 'root') where.parentId = null;
    else if (parentId) where.parentId = parentId;
    if (status) where.status = status;
    if (search) where.OR = [{ name: { contains: search, mode: 'insensitive' } }, { locationCode: { contains: search, mode: 'insensitive' } }];

    if (!plantScope.isSystemWide) {
      const allowedPlantIds = plantScope.isScoped && plantScope.plantId
        ? [plantScope.plantId]
        : plantScope.accessiblePlantIds;
      where.AND = [
        { OR: [{ plantId: null }, { plantId: { in: allowedPlantIds } }] },
      ];
    }

    const locations = await db.functionalLocation.findMany({
      where,
      include: {
        hierarchyLevel: true,
        plant: { select: { id: true, name: true, code: true } },
        _count: { select: { children: true } },
      },
      orderBy: [{ depth: 'asc' }, { locationCode: 'asc' }],
    });

    const data = locations.filter((location) => canAccessPlant(plantScope, location.plantId));
    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    if (!isAdmin(session) && !hasPermission(session, 'assets.functional_locations.manage')) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const plantScope = await getPlantScope(request, session);
    if (plantScope.denyAccess) return NextResponse.json({ success: false, error: 'Plant access denied' }, { status: 403 });
    const body = await request.json();

    if (body.plantId && !canAccessPlant(plantScope, body.plantId)) {
      return NextResponse.json({ success: false, error: 'Plant access denied' }, { status: 403 });
    }

    let parentPlantId: string | null = null;
    if (body.parentId) {
      const parent = await db.functionalLocation.findUnique({ where: { id: body.parentId }, select: { plantId: true } });
      if (!parent || !canAccessPlant(plantScope, parent.plantId)) {
        return NextResponse.json({ success: false, error: 'Parent functional location not found or access denied' }, { status: 403 });
      }
      parentPlantId = parent.plantId;
    }

    const inferredPlantId = body.plantId
      || parentPlantId
      || plantScope.plantId
      || (!plantScope.isSystemWide && plantScope.accessiblePlantIds.length === 1 ? plantScope.accessiblePlantIds[0] : null);

    if (!plantScope.isSystemWide && !inferredPlantId) {
      return NextResponse.json(
        { success: false, error: 'System-wide access required to manage global functional locations' },
        { status: 403 },
      );
    }

    const location = await createFunctionalLocation({
      hierarchySystemId: String(body.hierarchySystemId || ''),
      hierarchyLevelId: String(body.hierarchyLevelId || ''),
      parentId: body.parentId || null,
      name: String(body.name || ''),
      codeSegment: body.codeSegment || null,
      locationCode: body.locationCode || null,
      description: body.description || null,
      status: body.status || 'active',
      plantId: inferredPlantId || null,
      actorId: session.userId,
    });

    return NextResponse.json({ success: true, data: location }, { status: 201 });
  } catch (error: unknown) {
    return errorResponse(error);
  }
}
