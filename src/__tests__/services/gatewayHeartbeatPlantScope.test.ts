import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  isAdmin: vi.fn(),
  getPlantScope: vi.fn(),
  canAccessPlantStrict: vi.fn(),
  gatewayFindUnique: vi.fn(),
  processHeartbeat: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  getSession: mocks.getSession,
  isAdmin: mocks.isAdmin,
}));
vi.mock('@/lib/plant-scope', () => ({
  getPlantScope: mocks.getPlantScope,
  canAccessPlantStrict: mocks.canAccessPlantStrict,
}));
vi.mock('@/lib/db', () => ({
  db: { edgeGateway: { findUnique: mocks.gatewayFindUnique } },
}));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ error: vi.fn(), info: vi.fn() }),
}));
vi.mock('@/services/connectivity', () => ({
  edgeGatewayService: { processHeartbeat: mocks.processHeartbeat },
}));

import { POST } from '@/app/api/connectivity/gateway/[id]/heartbeat/route';

const scope = (overrides: Record<string, unknown> = {}) => ({
  plantId: 'plant-one', accessiblePlantIds: ['plant-one'],
  isScoped: true, isSystemWide: false, denyAccess: false, ...overrides,
});
const params = { params: Promise.resolve({ id: 'gateway-123' }) };
const request = (body: unknown, plant='plant-one') => new NextRequest(
  'http://localhost/api/connectivity/gateway/gateway-123/heartbeat', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(plant ? { 'X-Plant-ID': plant } : {}) },
    body: JSON.stringify(body),
  },
);

describe('gateway heartbeat write authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockReturnValue({ userId: 'admin-actor', roles: ['admin'] });
    mocks.isAdmin.mockReturnValue(true);
    mocks.getPlantScope.mockResolvedValue(scope());
    mocks.canAccessPlantStrict.mockImplementation(
      (value, plantId) => !value.denyAccess &&
        (value.isSystemWide || (plantId != null && value.plantId === plantId)),
    );
    mocks.gatewayFindUnique.mockResolvedValue({ id: 'gateway-123', plantId: 'plant-one' });
    mocks.processHeartbeat.mockResolvedValue(undefined);
  });

  it('rejects callers with no authenticated session', async () => {
    mocks.getSession.mockReturnValue(null);
    expect((await POST(request({ bufferedCount: 2 }), params)).status).toBe(401);
    expect(mocks.gatewayFindUnique).not.toHaveBeenCalled();
    expect(mocks.processHeartbeat).not.toHaveBeenCalled();
  });

  it('rejects ordinary users before any database read', async () => {
    mocks.isAdmin.mockReturnValue(false);
    expect((await POST(request({ bufferedCount: 2 }), params)).status).toBe(403);
    expect(mocks.gatewayFindUnique).not.toHaveBeenCalled();
  });

  it('rejects a denied plant context before reading the gateway', async () => {
    mocks.getPlantScope.mockResolvedValue(scope({ denyAccess: true }));
    expect((await POST(request({ bufferedCount: 2 }), params)).status).toBe(403);
    expect(mocks.gatewayFindUnique).not.toHaveBeenCalled();
  });

  it('does not permit changes to another plant\'s gateway', async () => {
    mocks.gatewayFindUnique.mockResolvedValue({ id: 'gateway-123', plantId: 'plant-two' });
    expect((await POST(request({ bufferedCount: 2 }), params)).status).toBe(403);
    expect(mocks.gatewayFindUnique).toHaveBeenCalledWith({
      where: { id: 'gateway-123' }, select: { id: true, plantId: true },
    });
    expect(mocks.processHeartbeat).not.toHaveBeenCalled();
  });

  it('does not allow a plant-less device in a scoped context', async () => {
    mocks.gatewayFindUnique.mockResolvedValue({ id: 'gateway-123', plantId: null });
    expect((await POST(request({ bufferedCount: 2 }), params)).status).toBe(403);
  });

  it('returns not found for a missing gateway', async () => {
    mocks.gatewayFindUnique.mockResolvedValue(null);
    expect((await POST(request({ bufferedCount: 2 }), params)).status).toBe(404);
    expect(mocks.processHeartbeat).not.toHaveBeenCalled();
  });

  it('validates buffered count and battery level without mutating gateway status', async () => {
    for (const body of [
      { bufferedCount: -1 }, { bufferedCount: 'many' }, { bufferedCount: 3.5 },
      { batteryLevel: 101 }, { batteryLevel: -1 }, { batteryLevel: 'full' },
      { signalStrength: 'strong' }, [], null,
    ]) {
      expect((await POST(request(body), params)).status).toBe(400);
    }
    expect(mocks.processHeartbeat).not.toHaveBeenCalled();
  });

  it('accepts sanitized heartbeat metrics for the authorized plant', async () => {
    const result = await POST(request({
      bufferedCount: 8, batteryLevel: 75.5, signalStrength: -65,
      plantId: 'foreign-plant', status: 'maintenance',
    }), params);
    expect(result.status).toBe(200);
    expect(mocks.processHeartbeat).toHaveBeenCalledWith('gateway-123', {
      bufferedCount: 8, batteryLevel: 75.5, signalStrength: -65,
    });
  });

  it('supports system-wide admin heartbeat for an unassigned gateway', async () => {
    mocks.getPlantScope.mockResolvedValue(scope({
      plantId: null, isScoped: false, isSystemWide: true, accessiblePlantIds: [],
    }));
    mocks.gatewayFindUnique.mockResolvedValue({ id: 'gateway-123', plantId: null });
    expect((await POST(request({ bufferedCount: 0 }, ''), params)).status).toBe(200);
  });
});
