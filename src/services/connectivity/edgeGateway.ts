// ============================================================================
// EDGE GATEWAY SERVICE — Offline buffering, sync recovery, batch processing
// Manages edge device lifecycle, heartbeat monitoring, data synchronization
// ============================================================================
import { createLogger } from '@/lib/logger';
import { db } from '@/lib/db';
import { EventEmitter } from 'events';
import type { Prisma } from '@prisma/client';

const log = createLogger('EdgeGatewayService');

interface GatewayHeartbeat {
  gatewayId: string;
  timestamp: Date;
  bufferedCount: number;
  batteryLevel?: number;
  signalStrength?: number;
}

// Track active gateways and their state
const activeGateways = new Map<string, {
  buffer: Array<{ mappingId: string; value: number; timestamp: Date; quality: number }>;
  bufferSize: number;
  lastSync: Date;
  syncIntervalMs: number;
  batchSize: number;
}>();

// Heartbeat tracking
const heartbeatHistory = new Map<string, GatewayHeartbeat[]>();

export class EdgeGatewayService extends EventEmitter {
  // ── Gateway Registration & Lifecycle ──────────────────────────────────

  async registerGateway(data: { name: string; gatewayCode: string; plantId?: string; ipAddress?: string; firmwareVersion?: string; capabilities?: string[]; config?: Record<string, unknown>; createdById: string }) {
    if (!data.name?.trim()) throw new Error('Gateway name is required');
    if (!data.gatewayCode?.trim()) throw new Error('Gateway code is required');

    const rawConfig = data.config ?? {};
    if (typeof rawConfig !== 'object' || Array.isArray(rawConfig))
      throw new Error('Gateway configuration must be a JSON object');
    let config: Prisma.InputJsonObject;
    try {
      config = JSON.parse(JSON.stringify(rawConfig)) as Prisma.InputJsonObject;
    } catch {
      throw new Error('Gateway configuration must be JSON serializable');
    }

    const existing = await db.edgeGateway.findUnique({ where: { gatewayCode: data.gatewayCode } });
    if (existing) throw new Error(`Gateway with code "${data.gatewayCode}" already exists`);

    const gateway = await db.edgeGateway.create({
      data: {
        name: data.name,
        gatewayCode: data.gatewayCode,
        plantId: data.plantId || null,
        ipAddress: data.ipAddress,
        firmwareVersion: data.firmwareVersion,
        capabilities: data.capabilities || [],
        config,
        createdById: data.createdById,
        status: 'offline',
      },
    });

    // Initialize buffer
    activeGateways.set(gateway.id, {
      buffer: [],
      bufferSize: gateway.bufferSize,
      lastSync: new Date(),
      syncIntervalMs: gateway.syncIntervalMs,
      batchSize: gateway.batchSize,
    });

    log.info(`Registered edge gateway: ${data.name} (${data.gatewayCode})`);
    this.emit('gateway_registered', { gatewayId: gateway.id, gatewayCode: data.gatewayCode });
    return gateway;
  }

  async listGateways(params: { plantId?: string; plantIds?: string[]; status?: string; page?: number; limit?: number } = {}) {
    const { plantId, status, page = 1, limit = 50 } = params;
    const where: Record<string, unknown> = {};
    if (plantId) where.plantId = plantId;
    if (params.plantIds) where.AND = [{ plantId: { in: params.plantIds } }];
    if (status) where.status = status;

    const [gateways, total] = await Promise.all([
      db.edgeGateway.findMany({
        where,
        include: {
          plant: { select: { id: true, name: true, code: true } },
          createdBy: { select: { id: true, fullName: true } },
          sources: { select: { id: true, name: true, sourceType: true, status: true } },
          connections: { where: { status: 'connected' }, select: { id: true, protocol: true, connectedAt: true } },
          _count: { select: { sources: true, connections: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.edgeGateway.count({ where }),
    ]);

    return { data: gateways, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  // ── Heartbeat & Monitoring ───────────────────────────────────────────

  async processHeartbeat(gatewayId: string, data: { bufferedCount?: number; batteryLevel?: number; signalStrength?: number }) {
    const gateway = await db.edgeGateway.findUnique({ where: { id: gatewayId } });
    if (!gateway) throw new Error(`Gateway ${gatewayId} not found`);

    const now = new Date();
    await db.edgeGateway.update({
      where: { id: gatewayId },
      data: { lastHeartbeatAt: now, status: 'online' },
    });

    // Store heartbeat history
    if (!heartbeatHistory.has(gatewayId)) heartbeatHistory.set(gatewayId, []);
    const history = heartbeatHistory.get(gatewayId)!;
    history.push({ gatewayId, timestamp: now, bufferedCount: data.bufferedCount || 0, batteryLevel: data.batteryLevel, signalStrength: data.signalStrength });
    if (history.length > 100) history.shift();

    this.emit('heartbeat', { gatewayId, bufferedCount: data.bufferedCount, batteryLevel: data.batteryLevel, signalStrength: data.signalStrength });
    log.debug(`Heartbeat from gateway ${gateway.gatewayCode}: ${data.bufferedCount || 0} buffered readings`);
  }

  // ── Offline Buffering ────────────────────────────────────────────────

  bufferReading(gatewayId: string, reading: { mappingId: string; value: number; timestamp: Date; quality: number }): void {
    const state = activeGateways.get(gatewayId);
    if (!state) { log.warn(`No active state for gateway ${gatewayId}`); return; }

    if (state.buffer.length >= state.bufferSize) {
      // Buffer full — discard oldest
      state.buffer.shift();
      log.warn(`Gateway ${gatewayId} buffer full, discarding oldest reading`);
    }
    state.buffer.push(reading);
  }

  getBufferStatus(gatewayId: string): { count: number; capacity: number; utilizationPct: number } {
    const state = activeGateways.get(gatewayId);
    if (!state) return { count: 0, capacity: 0, utilizationPct: 0 };
    return {
      count: state.buffer.length,
      capacity: state.bufferSize,
      utilizationPct: Math.round((state.buffer.length / state.bufferSize) * 100),
    };
  }

  // ── Sync & Recovery ──────────────────────────────────────────────────

  async syncGateway(gatewayId: string): Promise<{ synced: number; failed: number; batchesCreated: number }> {
    const state = activeGateways.get(gatewayId);
    if (!state || state.buffer.length === 0) return { synced: 0, failed: 0, batchesCreated: 0 };

    const readings = [...state.buffer];
    state.buffer = [];
    state.lastSync = new Date();

    let synced = 0;
    let failed = 0;
    const batchCount = Math.ceil(readings.length / state.batchSize);
    let batchesCreated = 0;

    for (let i = 0; i < batchCount; i++) {
      const batch = readings.slice(i * state.batchSize, (i + 1) * state.batchSize);
      try {
        // Each stream row requires the source registered to its exact mapping.
        // A mapping ID is not interchangeable with a telemetry source ID.
        const mappingIds = [...new Set(batch.map(r => r.mappingId))];
        const mappings = await db.telemetryMapping.findMany({
          where: { id: { in: mappingIds } },
          select: { id: true, sourceId: true },
        });
        const sourceByMapping = new Map(mappings.map(mapping => [mapping.id, mapping.sourceId]));
        if (batch.some(reading => !sourceByMapping.has(reading.mappingId)))
          throw new Error('Cannot sync readings for an unknown telemetry mapping');
        await db.telemetryStream.createMany({
          data: batch.map(r => ({
            mappingId: r.mappingId,
            sourceId: sourceByMapping.get(r.mappingId)!,
            value: r.value,
            quality: r.quality,
            timestamp: r.timestamp,
          })),
          skipDuplicates: true,
        });
        synced += batch.length;
        batchesCreated++;

        // Create batch record
        if (i === 0) {
          await db.telemetryBatch.create({
            data: {
              sourceId: sourceByMapping.get(readings[0].mappingId)!, // primary source
              gatewayId,
              batchNumber: Math.floor(Date.now() / 1000),
              status: 'completed',
              readingCount: readings.length,
              startTime: readings[0].timestamp,
              endTime: readings[readings.length - 1].timestamp,
              processedAt: new Date(),
            },
          });
        }
      } catch (error) {
        failed += batch.length;
        log.error(`Batch ${i} sync failed for gateway ${gatewayId}`, error as Error);
        // Re-add failed readings to buffer
        state.buffer.unshift(...batch);
      }
    }

    await db.edgeGateway.update({ where: { id: gatewayId }, data: { lastSyncAt: new Date() } });
    this.emit('sync_completed', { gatewayId, synced, failed, batchesCreated });
    log.info(`Gateway ${gatewayId} sync: ${synced} synced, ${failed} failed`);
    return { synced, failed, batchesCreated };
  }

  async syncAllGateways(): Promise<Map<string, { synced: number; failed: number }>> {
    const results = new Map();
    for (const [gatewayId] of activeGateways) {
      const result = await this.syncGateway(gatewayId);
      results.set(gatewayId, result);
    }
    return results;
  }

  // ── Gateway Status Update ────────────────────────────────────────────

  async updateGatewayStatus(gatewayId: string, status: 'online' | 'offline' | 'degraded' | 'maintenance'): Promise<void> {
    await db.edgeGateway.update({ where: { id: gatewayId }, data: { status } });
    this.emit('status_change', { gatewayId, status });
    log.info(`Gateway ${gatewayId} status changed to ${status}`);
  }

  // ── Dashboard Stats ──────────────────────────────────────────────────

  async getConnectivityStats() {
    const [totalGateways, onlineGateways, totalSources, activeConnections] = await Promise.all([
      db.edgeGateway.count(),
      db.edgeGateway.count({ where: { status: 'online' } }),
      db.telemetryDataSource.count({ where: { isActive: true } }),
      db.connectivitySession.count({ where: { status: 'connected' } }),
    ]);

    const bufferStatuses: Record<string, { count: number; capacity: number }> = {};
    for (const [id, state] of activeGateways) {
      bufferStatuses[id] = { count: state.buffer.length, capacity: state.bufferSize };
    }

    return {
      gateways: { total: totalGateways, online: onlineGateways },
      dataSources: totalSources,
      activeConnections,
      bufferStatuses,
    };
  }
}

export const edgeGatewayService = new EdgeGatewayService();