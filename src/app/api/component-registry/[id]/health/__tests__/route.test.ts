import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  mockDb,
  mockGetSession,
  mockHasPermission,
  mockIsAdmin,
  mockGetComponentPlantAccess,
} = vi.hoisted(() => ({
  mockDb: {
    componentRegistry: { findUnique: vi.fn() },
    failureRecord: { findMany: vi.fn() },
    iotAlert: { count: vi.fn() },
  },
  mockGetSession: vi.fn(),
  mockHasPermission: vi.fn(),
  mockIsAdmin: vi.fn(),
  mockGetComponentPlantAccess: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db: mockDb }));
vi.mock('@/lib/auth', () => ({
  getSession: mockGetSession,
  hasPermission: mockHasPermission,
  isAdmin: mockIsAdmin,
}));
vi.mock('@/lib/component-plant-access', () => ({
  getComponentPlantAccess: mockGetComponentPlantAccess,
}));

import { GET } from '../route';

const session = {
  userId: 'viewer-1',
  fullName: 'Viewer One',
  roles: ['viewer'],
  permissions: ['digital_twin.view'],
};

function request() {
  return new NextRequest('http://localhost/api/component-registry/component-b/health');
}

describe('GET /api/component-registry/[id]/health plant isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockReturnValue(session);
    mockHasPermission.mockReturnValue(true);
    mockIsAdmin.mockReturnValue(false);
    mockGetComponentPlantAccess.mockResolvedValue({
      exists: true,
      allowed: false,
      plantId: 'plant-b',
    });
    mockDb.componentRegistry.findUnique.mockResolvedValue({
      id: 'component-b',
      assetId: 'asset-b',
      expectedLifeHours: 1000,
      operatingHours: 100,
      lastInspection: new Date('2026-10-01T00:00:00Z'),
      lifecycleStatus: 'operational',
      asset: { id: 'asset-b' },
    });
    mockDb.failureRecord.findMany.mockResolvedValue([]);
    mockDb.iotAlert.count.mockResolvedValue(0);
  });

  it('denies a cross-plant health read before querying component health data', async () => {
    const req = request();
    const response = await GET(req, { params: Promise.resolve({ id: 'component-b' }) });

    expect(response.status).toBe(403);
    expect(mockGetComponentPlantAccess).toHaveBeenCalledWith(req, session, 'component-b');
    expect(mockDb.componentRegistry.findUnique).not.toHaveBeenCalled();
    expect(mockDb.failureRecord.findMany).not.toHaveBeenCalled();
    expect(mockDb.iotAlert.count).not.toHaveBeenCalled();
  });
});
