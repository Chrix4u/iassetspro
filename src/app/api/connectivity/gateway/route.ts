import { NextRequest, NextResponse } from 'next/server';
import { edgeGatewayService } from '@/services/connectivity';
import { createLogger } from '@/lib/logger';
import { getSession, isAdmin } from '@/lib/auth';
import { getPlantScope } from '@/lib/plant-scope';

const log = createLogger('API:ConnectivityGateway');

// GET /api/connectivity/gateway — List gateways
export async function GET(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const scope = await getPlantScope(request, session);
    if (scope.denyAccess) return NextResponse.json({ error: 'Plant access denied' }, { status: 403 });
    const { searchParams } = new URL(request.url);
    const plantId = searchParams.get('plantId') || undefined;
    const plantIds = scope.isSystemWide ? undefined
      : scope.isScoped && scope.plantId ? [scope.plantId] : scope.accessiblePlantIds;
    if (plantId && plantIds && !plantIds.includes(plantId))
      return NextResponse.json({ error: 'Plant access denied' }, { status: 403 });
    const gateways = await edgeGatewayService.listGateways({
      plantId, plantIds,
      status: searchParams.get('status') || undefined,
      page: Math.max(1, parseInt(searchParams.get('page') || '1') || 1),
      limit: Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50') || 50)),
    });
    return NextResponse.json(gateways);
  } catch (error) {
    log.error('Failed to list gateways', error as Error);
    return NextResponse.json({ error: 'Failed to list gateways' }, { status: 500 });
  }
}

// POST /api/connectivity/gateway — Register a new gateway
export async function POST(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!isAdmin(session)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const gateway = await edgeGatewayService.registerGateway(body);
    return NextResponse.json({ data: gateway }, { status: 201 });
  } catch (error) {
    log.error('Failed to register gateway', error as Error);
    return NextResponse.json({ error: (error as Error).message || 'Failed to register gateway' }, { status: 500 });
  }
}