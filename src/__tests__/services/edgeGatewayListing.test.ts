import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findMany: vi.fn().mockResolvedValue([
    { id: 'gateway-1', connections: [{ id: 'connection-1', protocol: 'mqtt', connectedAt: new Date('2026-11-18T12:00:00.000Z') }] },
  ]),
  count: vi.fn().mockResolvedValue(1),
  findUnique: vi.fn().mockResolvedValue(null),
  create: vi.fn().mockResolvedValue({
    id: 'gw-sync', bufferSize: 100, batchSize: 10, syncIntervalMs: 5000,
  }),
  update: vi.fn().mockResolvedValue({}),
  mappingFindMany: vi.fn().mockResolvedValue([{ id: 'mapping-1', sourceId: 'source-1' }]),
  streamCreateMany: vi.fn().mockResolvedValue({ count: 1 }),
  batchCreate: vi.fn().mockResolvedValue({}),
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));
vi.mock('@/lib/db', () => ({
  db: {
    edgeGateway: {
      findMany: mocks.findMany, count: mocks.count,
      findUnique: mocks.findUnique, create: mocks.create, update: mocks.update,
    },
    telemetryMapping: { findMany: mocks.mappingFindMany },
    telemetryStream: { createMany: mocks.streamCreateMany },
    telemetryBatch: { create: mocks.batchCreate },
  },
}));

import { EdgeGatewayService } from '@/services/connectivity/edgeGateway';

describe('edge gateway list projection', () => {
  it('selects connected protocol and timestamp without unbound identifier errors', async () => {
    const service = new EdgeGatewayService();
    const result = await service.listGateways({ plantId: 'plant-1', status: 'online', page: 2, limit: 10 });
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { plantId: 'plant-1', status: 'online' },
      skip: 10,
      take: 10,
      include: expect.objectContaining({
        connections: {
          where: { status: 'connected' },
          select: { id: true, protocol: true, connectedAt: true },
        },
      }),
    }));
    expect(result).toEqual({
      data: [{ id: 'gateway-1', connections: [{ id: 'connection-1', protocol: 'mqtt', connectedAt: new Date('2026-11-18T12:00:00.000Z') }] }],
      pagination: { page: 2, limit: 10, total: 1, totalPages: 1 },
    });
  });

  it('loads authorized plant gateway lists without leaking other plants', async () => {
    const service = new EdgeGatewayService();
    await service.listGateways({ plantIds: ['plant-1'], status: 'online' });
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { status: 'online', AND: [{ plantId: { in: ['plant-1'] } }] },
    }));
  });

  it('persists telemetry streams with the actual mapping source, not a mapping ID', async () => {
    const service = new EdgeGatewayService();
    await service.registerGateway({
      name: 'Sync test gateway', gatewayCode: 'GW-TEST', createdById: 'user-1',
      config: { offlineBuffering: true },
    });
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ config: { offlineBuffering: true } }),
    }));
    const at = new Date('2026-11-18T12:00:00.000Z');
    service.bufferReading('gw-sync', { mappingId: 'mapping-1', value: 24.5, quality: 99, timestamp: at });
    expect(await service.syncGateway('gw-sync')).toEqual({
      synced: 1, failed: 0, batchesCreated: 1,
    });
    expect(mocks.mappingFindMany).toHaveBeenCalledWith({
      where: { id: { in: ['mapping-1'] } },
      select: { id: true, sourceId: true },
    });
    expect(mocks.streamCreateMany).toHaveBeenCalledWith({
      data: [{ mappingId: 'mapping-1', sourceId: 'source-1', value: 24.5, quality: 99, timestamp: at }],
      skipDuplicates: true,
    });
    expect(mocks.batchCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ sourceId: 'source-1', gatewayId: 'gw-sync' }),
    });
  });
});