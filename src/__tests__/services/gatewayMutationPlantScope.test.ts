import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  isAdmin: vi.fn(),
  getPlantScope: vi.fn(),
  canAccessPlantStrict: vi.fn(),
  registerGateway: vi.fn(),
  syncGateway: vi.fn(),
  gatewayFindUnique: vi.fn(),
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
  createLogger: () => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn() }),
}));
vi.mock('@/services/connectivity', () => ({
  edgeGatewayService: {
    registerGateway: mocks.registerGateway,
    syncGateway: mocks.syncGateway,
  },
}));

import { POST as register } from '@/app/api/connectivity/gateway/route';
import { POST as sync } from '@/app/api/connectivity/gateway/[id]/sync/route';

const scope = (overrides: Record<string, unknown> = {}) => ({
  plantId: 'plant-A', isScoped: true, isSystemWide: false, denyAccess: false,
  accessiblePlantIds: ['plant-A'], accessLevel: 'admin', ...overrides,
});
const post = (body: unknown, selected = 'plant-A') => new NextRequest(
  'http://localhost/api/connectivity/gateway', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(selected ? { 'X-Plant-ID': selected } : {}) },
    body: JSON.stringify(body),
  },
);
const syncRequest = (selected = 'plant-A') => new NextRequest(
  'http://localhost/api/connectivity/gateway/gateway-1/sync', {
    method: 'POST',
    headers: selected ? { 'X-Plant-ID': selected } : {},
  },
);
const syncParams = { params: Promise.resolve({ id: 'gateway-1' }) };

describe('industrial gateway mutations honor actor identity and plant scope', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockReturnValue({ userId: 'admin-actor', roles: ['admin'] });
    mocks.isAdmin.mockReturnValue(true);
    mocks.getPlantScope.mockResolvedValue(scope());
    mocks.canAccessPlantStrict.mockImplementation(
      (allowed, plantId) => !allowed.denyAccess &&
        (allowed.isSystemWide || (plantId != null && allowed.plantId === plantId)),
    );
    mocks.registerGateway.mockResolvedValue({ id: 'gateway-1' });
    mocks.syncGateway.mockResolvedValue({ synced: 0, failed: 0, batchesCreated: 0 });
    mocks.gatewayFindUnique.mockResolvedValue({ id: 'gateway-1', plantId: 'plant-A' });
  });

  it('requires authentication and admin permission before registration', async () => {
    mocks.getSession.mockReturnValue(null);
    expect((await register(post({ name: 'A', gatewayCode: 'GA' }))).status).toBe(401);
    mocks.getSession.mockReturnValue({ userId: 'ordinary', roles: ['operator'] });
    mocks.isAdmin.mockReturnValue(false);
    expect((await register(post({ name: 'A', gatewayCode: 'GA' }))).status).toBe(403);
    expect(mocks.getPlantScope).not.toHaveBeenCalled();
    expect(mocks.registerGateway).not.toHaveBeenCalled();
  });

  it('cannot forge creator identity or omit the selected plant', async () => {
    const response = await register(post({
      name: '  Line Gateway  ', gatewayCode: '  GW-01 ', createdById: 'forged-admin',
      config: { polling: true },
    }));
    expect(response.status).toBe(201);
    expect(mocks.registerGateway).toHaveBeenCalledWith({
      name: 'Line Gateway', gatewayCode: 'GW-01', plantId: 'plant-A',
      createdById: 'admin-actor', config: { polling: true },
      ipAddress: undefined, firmwareVersion: undefined, capabilities: undefined,
    });
  });

  it('blocks a different plant in a request with a selected plant context', async () => {
    expect((await register(post({
      name: 'Gateway', gatewayCode: 'GW-02', plantId: 'plant-B',
    }))).status).toBe(403);
    expect(mocks.registerGateway).not.toHaveBeenCalled();
  });

  it('does not allow registration if the selected scope is denied', async () => {
    mocks.getPlantScope.mockResolvedValue(scope({ denyAccess: true }));
    expect((await register(post({ name: 'A', gatewayCode: 'GA' }))).status).toBe(403);
    expect(mocks.registerGateway).not.toHaveBeenCalled();
  });

  it('rejects invalid plant type and missing required gateway identity', async () => {
    expect((await register(post({ name: 'A', gatewayCode: 'GA', plantId: 123 }))).status).toBe(400);
    expect((await register(post({ name: '', gatewayCode: 'GA' }))).status).toBe(400);
    expect((await register(post([]))).status).toBe(400);
    expect(mocks.registerGateway).not.toHaveBeenCalled();
  });

  it('preserves system-wide admin registration with no assigned plant', async () => {
    mocks.getPlantScope.mockResolvedValue(scope({
      plantId: null, isScoped: false, isSystemWide: true, accessiblePlantIds: [],
    }));
    expect((await register(post({
      name: 'Unassigned staging gateway', gatewayCode: 'GW-99',
    }, ''))).status).toBe(201);
    expect(mocks.registerGateway).toHaveBeenCalledWith(
      expect.objectContaining({ plantId: undefined, createdById: 'admin-actor' }),
    );
  });

  it('requires admin permission and authentication before syncing', async () => {
    mocks.getSession.mockReturnValue(null);
    expect((await sync(syncRequest(), syncParams)).status).toBe(401);
    mocks.getSession.mockReturnValue({ userId: 'ordinary', roles: ['operator'] });
    mocks.isAdmin.mockReturnValue(false);
    expect((await sync(syncRequest(), syncParams)).status).toBe(403);
    expect(mocks.syncGateway).not.toHaveBeenCalled();
    expect(mocks.gatewayFindUnique).not.toHaveBeenCalled();
  });

  it('prevents sync for a gateway in another plant even by a scoped admin', async () => {
    mocks.gatewayFindUnique.mockResolvedValue({ id: 'gateway-1', plantId: 'plant-B' });
    expect((await sync(syncRequest(), syncParams)).status).toBe(403);
    expect(mocks.gatewayFindUnique).toHaveBeenCalledWith({
      where: { id: 'gateway-1' }, select: { id: true, plantId: true },
    });
    expect(mocks.syncGateway).not.toHaveBeenCalled();
  });

  it('prevents syncing when plant scope is denied', async () => {
    mocks.getPlantScope.mockResolvedValue(scope({ denyAccess: true }));
    expect((await sync(syncRequest(), syncParams)).status).toBe(403);
    expect(mocks.syncGateway).not.toHaveBeenCalled();
  });

  it('returns not found instead of syncing a deleted gateway', async () => {
    mocks.gatewayFindUnique.mockResolvedValue(null);
    expect((await sync(syncRequest(), syncParams)).status).toBe(404);
    expect(mocks.syncGateway).not.toHaveBeenCalled();
  });

  it('syncs a gateway in the selected plant and permits system-wide unassigned gateways', async () => {
    expect((await sync(syncRequest(), syncParams)).status).toBe(200);
    mocks.getPlantScope.mockResolvedValue(scope({
      plantId: null, isScoped: false, isSystemWide: true,
    }));
    mocks.gatewayFindUnique.mockResolvedValue({ id: 'gateway-1', plantId: null });
    expect((await sync(syncRequest(''), syncParams)).status).toBe(200);
    expect(mocks.syncGateway).toHaveBeenCalledTimes(2);
  });
});
