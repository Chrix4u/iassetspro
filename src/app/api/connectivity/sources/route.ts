import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { industrialPollingEngine } from '@/services/connectivity';
import { createLogger } from '@/lib/logger';
import { getSession, isAdmin } from '@/lib/auth';
import { getPlantFilterWhere, getPlantScope } from '@/lib/plant-scope';

const log = createLogger('API:ConnectivitySources');

// GET /api/connectivity/sources — List all data sources with connection status
export async function GET(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const plantScope = await getPlantScope(request, session);
    if (plantScope.denyAccess) {
      return NextResponse.json({ error: 'Plant access denied' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const sourceType = searchParams.get('sourceType');
    const status = searchParams.get('status');
    const plantId = searchParams.get('plantId');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');

    const where: Record<string, unknown> = {
      isActive: true,
      ...getPlantFilterWhere(plantScope),
    };
    if (sourceType) where.sourceType = sourceType;
    if (status) where.status = status;
    if (plantId) {
      const plantAllowed = plantScope.isSystemWide || plantScope.accessiblePlantIds.includes(plantId);
      const matchesExplicitScope = !plantScope.isScoped || !plantScope.plantId || plantScope.plantId === plantId;
      if (!plantAllowed || !matchesExplicitScope) {
        return NextResponse.json({ error: 'Plant access denied' }, { status: 403 });
      }
      where.plantId = plantId;
    }

    const [sources, total] = await Promise.all([
      db.telemetryDataSource.findMany({
        where,
        select: {
          id: true,
          name: true,
          sourceType: true,
          status: true,
          lastConnectionAt: true,
          lastError: true,
          isActive: true,
          plant: { select: { id: true, name: true, code: true } },
          gateway: { select: { id: true, name: true, gatewayCode: true, status: true } },
          createdBy: { select: { id: true, fullName: true } },
          sessions: {
            where: { status: 'connected' },
            select: { id: true, protocol: true, connectedAt: true, messagesIn: true, messagesOut: true },
          },
          mappings: {
            where: { isActve: true },
            select: { id: true, parameterName: true, externalId: true, dataType: true },
          },
          _count: { select: { mappings: true, streams: true, sessions: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.telemetryDataSource.count({ where }),
    ]);

    // Get engine status for active adapters
    const engineStatus = industrialPollingEngine.getStatus();

    const enrichedSources = sources.map(source => ({
      ...source,
      engineStatus: engineStatus.find(s => s.sourceId === source.id) || null,
    }));

    return NextResponse.json({ data: enrichedSources, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (error) {
    log.error('Failed to list connectivity sources', error as Error);
    return NextResponse.json({ error: 'Failed to list sources' }, { status: 500 });
  }
}

// POST /api/connectivity/sources — Create a new data source
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
    const { name, sourceType, connectionConfig, plantId, gatewayId, metadata } = body;

    if (!name?.trim()) return NextResponse.json({ error: 'Source name is required' }, { status: 400 });
    if (!sourceType?.trim()) return NextResponse.json({ error: 'Source type is required' }, { status: 400 });

    const validTypes = ['mqtt', 'opcua', 'modbus_tcp', 'bacnet', 'siemens_s7', 'ethernet_ip', 'rest_api'];
    if (!validTypes.includes(sourceType)) return NextResponse.json({ error: `Invalid source type: ${sourceType}` }, { status: 400 });

    if (!connectionConfig) return NextResponse.json({ error: 'Connection config is required' }, { status: 400 });
    try { JSON.parse(typeof connectionConfig === 'string' ? connectionConfig : JSON.stringify(connectionConfig)); } catch { return NextResponse.json({ error: 'Connection config must be valid JSON' }, { status: 400 }); }

    const configStr = typeof connectionConfig === 'string' ? connectionConfig : JSON.stringify(connectionConfig);

    // Validate gateway if provided
    if (gatewayId) {
      const gateway = await db.edgeGateway.findUnique({ where: { id: gatewayId } });
      if (!gateway) return NextResponse.json({ error: 'Gateway not found' }, { status: 400 });
    }

    const source = await db.telemetryDataSource.create({
      data: {
        name, sourceType, connectionConfig: configStr, plantId: plantId || null, gatewayId: gatewayId || null,
        metadata: metadata ? (typeof metadata === 'string' ? metadata : JSON.stringify(metadata)) : null,
        createdById: session.userId, status: 'disconnected',
      },
    });

    log.info(`Created connectivity source: ${name} (${sourceType})`);
    return NextResponse.json({ data: source }, { status: 201 });
  } catch (error) {
    log.error('Failed to create connectivity source', error as Error);
    return NextResponse.json({ error: 'Failed to create source' }, { status: 500 });
  }
}
