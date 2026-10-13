import { NextRequest, NextResponse } from 'next/server';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { canAccessPlant, getPlantScope } from '@/lib/plant-scope';
import {
  FunctionalLocationDomainError,
  getFunctionalLocationPath,
} from '@/lib/functional-location/service';

function canView(session: ReturnType<typeof getSession>): boolean {
  return !!session && (isAdmin(session) || hasPermission(session, 'assets.functional_locations.view'));
}

function domainErrorResponse(error: FunctionalLocationDomainError) {
  const status = error.code === 'NOT_FOUND' ? 404 : error.code === 'CONFLICT' ? 409 : 400;
  return NextResponse.json({ success: false, error: error.message }, { status });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = getSession(request);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    if (!canView(session)) return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });

    const plantScope = await getPlantScope(request, session);
    if (plantScope.denyAccess) return NextResponse.json({ success: false, error: 'Plant access denied' }, { status: 403 });

    const { id } = await params;
    const path = await getFunctionalLocationPath(id);
    const inaccessibleNode = path.find((node) => !canAccessPlant(plantScope, node.plantId));
    if (inaccessibleNode) {
      return NextResponse.json({ success: false, error: 'Plant access denied' }, { status: 403 });
    }

    return NextResponse.json({ success: true, data: path });
  } catch (error: unknown) {
    if (error instanceof FunctionalLocationDomainError) return domainErrorResponse(error);
    const message = error instanceof Error ? error.message : 'Failed to load functional location path';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
