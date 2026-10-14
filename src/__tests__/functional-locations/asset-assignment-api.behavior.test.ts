import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  hasPermission: vi.fn(),
  isAdmin: vi.fn(),
  getPlantScope: vi.fn(),
  canAccessPlant: vi.fn(),
  assetFindUnique: vi.fn(),
  locationFindUnique: vi.fn(),
  assign: vi.fn(),
  history: vi.fn(),
  current: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  getSession: mocks.getSession,
  hasPermission: mocks.hasPermission,
  isAdmin: mocks.isAdmin,
}));
vi.mock('@/lib/plant-scope', () => ({
  getPlantScope: mocks.getPlantScope,
  canAccessPlant: mocks.canAccessPlant,
}));
vi.mock('@/lib/db', () => ({
  db: {
    asset: { findUnique: mocks.assetFindUnique },
    functionalLocation: { findUnique: mocks.locationFindUnique },
  },
}));
vi.mock('@/lib/functional-location/asset-assignment', () => ({
  assignAssetToFunctionalLocation: mocks.assign,
  getAssetFunctionalLocationAssignments: mocks.history,
  getCurrentAssetFunctionalLocations: mocks.current,
}));

import { GET, POST } from '@/app/api/assets/[id]/functional-locations/route';

const params = { params: Promise.resolve({ id: 'asset-1' }) };
const session = { userId: 'user-1', username: 'operator', roles: ['operator'] };
const scope = {
  plantId: 'plant-a', accessiblePlantIds: ['plant-a'], isScoped: true, isSystemWide: false, denyAccess: false,
};

function request(method: 'GET' | 'POST', body?: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/assets/asset-1/functional-locations', {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe('asset functional-location API behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockReturnValue(session);
    mocks.isAdmin.mockReturnValue(false);
    mocks.hasPermission.mockImplementation((_session: unknown, permission: string) =>
      permission === 'assets.functional_locations.view' || permission === 'assets.functional_locations.assign');
    mocks.getPlantScope.mockResolvedValue(scope);
    mocks.canAccessPlant.mockImplementation((_scope: unknown, plantId: string | null) => plantId === 'plant-a');
    mocks.assetFindUnique.mockResolvedValue({ id: 'asset-1', plantId: 'plant-a', assetTag: 'A-1', name: 'Asset 1' });
    mocks.locationFindUnique.mockResolvedValue({ id: 'loc-1', plantId: 'plant-a' });
    mocks.assign.mockResolvedValue({ id: 'assignment-1', functionalLocationId: 'loc-1' });
    mocks.history.mockResolvedValue([]);
    mocks.current.mockResolvedValue([]);
  });

  it('requires view permission for assignment history', async () => {
    mocks.hasPermission.mockReturnValue(false);
    const response = await GET(request('GET'), params);
    expect(response.status).toBe(403);
    expect(mocks.history).not.toHaveBeenCalled();
  });

  it('returns current, primary, and historical assignments for an accessible asset', async () => {
    const primary = { id: 'a1', hierarchySystem: { isPrimary: true } };
    mocks.current.mockResolvedValue([primary]);
    mocks.history.mockResolvedValue([primary]);
    const response = await GET(request('GET'), params);
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.data.primary.id).toBe('a1');
    expect(body.data.history).toHaveLength(1);
  });

  it('requires assign permission for relocation', async () => {
    mocks.hasPermission.mockImplementation((_session: unknown, permission: string) => permission === 'assets.functional_locations.view');
    const response = await POST(request('POST', { functionalLocationId: 'loc-1' }), params);
    expect(response.status).toBe(403);
    expect(mocks.assign).not.toHaveBeenCalled();
  });

  it('fails closed when the target functional location is outside plant scope', async () => {
    mocks.locationFindUnique.mockResolvedValue({ id: 'loc-b', plantId: 'plant-b' });
    const response = await POST(request('POST', { functionalLocationId: 'loc-b' }), params);
    expect(response.status).toBe(403);
    expect(mocks.assign).not.toHaveBeenCalled();
  });

  it('delegates a valid assignment with the authenticated actor and reason', async () => {
    const response = await POST(request('POST', { functionalLocationId: 'loc-1', reason: 'Installed after overhaul' }), params);
    expect(response.status).toBe(201);
    expect(mocks.assign).toHaveBeenCalledWith({
      assetId: 'asset-1', functionalLocationId: 'loc-1', actorId: 'user-1', reason: 'Installed after overhaul',
    });
  });
});
