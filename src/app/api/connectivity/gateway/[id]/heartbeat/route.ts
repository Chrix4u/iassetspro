import { NextRequest, NextResponse } from 'next/server';
import { edgeGatewayService } from '@/services/connectivity';
import { createLogger } from '@/lib/logger';
import { getSession, isAdmin } from '@/lib/auth';
import { getPlantScope, canAccessPlantStrict } from '@/lib/plant-scope';
import { db } from '@/lib/db';

const log = createLogger('API:GatewayHeartbeat');

// POST /api/connectivity/gateway/[id]/heartbeat
// Until per-gateway service credentials are provisioned, only authenticated
// administrators in the target gateway's plant may change its live status.
// Do not trust a caller-provided plant ID: resolve it from the stored gateway.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdmin(session)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    const scope = await getPlantScope(request, session);
    if (scope.denyAccess) return NextResponse.json({ error: 'Plant access denied' }, { status: 403 });
    const { id } = await params;
    const gateway = await db.edgeGateway.findUnique({
      where: { id },
      select: { id: true, plantId: true },
    });
    if (!gateway) return NextResponse.json({ error: 'Gateway not found' }, { status: 404 });
    if (!canAccessPlantStrict(scope, gateway.plantId)) {
      return NextResponse.json({ error: 'Plant access denied' }, { status: 403 });
    }

    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return NextResponse.json({ error: 'Valid JSON heartbeat data is required' }, { status: 400 });
    }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return NextResponse.json({ error: 'Heartbeat data must be a JSON object' }, { status: 400 });
    }
    const data = payload as Record<string, unknown>;
    if ((data.bufferedCount !== undefined &&
      (typeof data.bufferedCount !== 'number' || !Number.isSafeInteger(data.bufferedCount) || data.bufferedCount < 0)) ||
      (data.batteryLevel !== undefined &&
        (typeof data.batteryLevel !== 'number' || !Number.isFinite(data.batteryLevel) ||
          data.batteryLevel < 0 || data.batteryLevel > 100)) ||
      (data.signalStrength !== undefined &&
        (typeof data.signalStrength !== 'number' || !Number.isFinite(data.signalStrength)))) {
      return NextResponse.json({ error: 'Invalid heartbeat measurements' }, { status: 400 });
    }

    await edgeGatewayService.processHeartbeat(id, {
      bufferedCount: data.bufferedCount as number | undefined,
      batteryLevel: data.batteryLevel as number | undefined,
      signalStrength: data.signalStrength as number | undefined,
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    log.error('Failed to process heartbeat', error as Error);
    return NextResponse.json({ error: 'Failed to process gateway heartbeat' }, { status: 500 });
  }
}
