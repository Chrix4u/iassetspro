import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { canAccessPlant, getPlantScope } from '@/lib/plant-scope';
import { FunctionalLocationDomainError, moveFunctionalLocation } from '@/lib/functional-location/service';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = getSession(request);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    if (!isAdmin(session) && !hasPermission(session, 'assets.functional_locations.manage')) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const plantScope = await getPlantScope(request, session);
    if (plantScope.denyAccess) return NextResponse.json({ success: false, error: 'Plant access denied' }, { status: 403 });

    const { id } = await params;
    const current = await db.functionalLocation.findUnique({ where: { id }, select: { id: true, plantId: true } });
    if (!current) return NextResponse.json({ success: false, error: 'Functional location not found' }, { status: 404 });
    if (!canAccessPlant(plantScope, current.plantId)) return NextResponse.json({ success: false, error: 'Plant access denied' }, { status: 403 });
    if (!current.plantId && !plantScope.isSystemWide) {
      return NextResponse.json(
        { success: false, error: 'System-wide access required to move global functional locations' },
        { status: 403 },
      );
    }

    const body = await request.json();
    const newParentId = body.newParentId || null;
    if (newParentId) {
      const parent = await db.functionalLocation.findUnique({ where: { id: newParentId }, select: { plantId: true } });
      if (!parent || !canAccessPlant(plantScope, parent.plantId)) {
        return NextResponse.json({ success: false, error: 'Destination parent not found or access denied' }, { status: 403 });
      }
    }

    const moved = await moveFunctionalLocation({
      id,
      newParentId,
      hierarchyLevelId: body.hierarchyLevelId || null,
      actorId: session.userId,
    });

    return NextResponse.json({ success: true, data: moved });
  } catch (error: unknown) {
    if (error instanceof FunctionalLocationDomainError) {
      const status = error.code === 'NOT_FOUND' ? 404 : error.code === 'CONFLICT' ? 409 : 400;
      return NextResponse.json({ success: false, error: error.message }, { status });
    }
    const message = error instanceof Error ? error.message : 'Failed to move functional location';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
