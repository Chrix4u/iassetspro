import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { canAccessPlant, getPlantScope } from '@/lib/plant-scope';
import { FunctionalLocationDomainError, getFunctionalLocationPath } from '@/lib/functional-location/service';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = getSession(request);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    if (!isAdmin(session) && !hasPermission(session, 'assets.functional_locations.view')) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const plantScope = await getPlantScope(request, session);
    if (plantScope.denyAccess) return NextResponse.json({ success: false, error: 'Plant access denied' }, { status: 403 });

    const { id } = await params;
    const location = await db.functionalLocation.findUnique({ where: { id }, select: { plantId: true } });
    if (!location) return NextResponse.json({ success: false, error: 'Functional location not found' }, { status: 404 });
    if (!canAccessPlant(plantScope, location.plantId)) return NextResponse.json({ success: false, error: 'Plant access denied' }, { status: 403 });

    const path = await getFunctionalLocationPath(id);
    if (path.some((node) => !canAccessPlant(plantScope, node.plantId))) {
      return NextResponse.json({ success: false, error: 'Plant access denied' }, { status: 403 });
    }
    return NextResponse.json({ success: true, data: path });
  } catch (error: unknown) {
    if (error instanceof FunctionalLocationDomainError) {
      const status = error.code === 'NOT_FOUND' ? 404 : 400;
      return NextResponse.json({ success: false, error: error.message }, { status });
    }
    const message = error instanceof Error ? error.message : 'Failed to load functional location path';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
