import { NextRequest, NextResponse } from 'next/server';
import { edgeGatewayService } from '@/services/connectivity';
import { createLogger } from '@/lib/logger';
import { getSession, isAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { getPlantScope, canAccessPlantStrict } from '@/lib/plant-scope';

const log = createLogger('API:GatewaySync');

// POST /api/connectivity/gateway/[id]/sync — Trigger sync
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!isAdmin(session)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const scope = await getPlantScope(request, session);
    if (scope.denyAccess) {
      return NextResponse.json({ error: 'Plant access denied' }, { status: 403 });
    }
    const { id } = await params;
    const gateway = await db.edgeGateway.findUnique({
      where: { id },
      select: { id: true, plantId: true },
    });
    if (!gateway) {
      return NextResponse.json({ error: 'Gateway not found' }, { status: 404 });
    }
    if (!canAccessPlantStrict(scope, gateway.plantId)) {
      return NextResponse.json({ error: 'Plant access denied' }, { status: 403 });
    }
    const result = await edgeGatewayService.syncGateway(id);
    return NextResponse.json({ data: result });
  } catch (error) {
    log.error('Failed to sync gateway', error as Error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
