import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findMany: vi.fn().mockResolvedValue([
    { id: 'gateway-1', connections: [{ id: 'connection-1', protocol: 'mqtt', connectedAt: new Date('2026-11-18T12:00:00.000Z') }] },
  ]),
  count: vi.fn().mockResolvedValue(1),
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));
vi.mock('@/lib/db', () => ({
  db: { edgeGateway: { findMany: mocks.findMany, count: mocks.count } },
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
});
