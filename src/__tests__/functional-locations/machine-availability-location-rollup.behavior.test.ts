import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  hasAnyPermission: vi.fn(),
  isAdmin: vi.fn(),
  getPlantScope: vi.fn(),
  getPlantFilterWhere: vi.fn(),
  getAssetIdsInFunctionalLocationSubtree: vi.fn(),
  getAssetLiveLocationMap: vi.fn(),
  assetFindMany: vi.fn(),
  workOrderFindMany: vi.fn(),
  downtimeFindMany: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  getSession: mocks.getSession,
  hasAnyPermission: mocks.hasAnyPermission,
  isAdmin: mocks.isAdmin,
}));
vi.mock('@/lib/plant-scope', () => ({
  getPlantScope: mocks.getPlantScope,
  getPlantFilterWhere: mocks.getPlantFilterWhere,
}));
vi.mock('@/lib/functional-location/live-location', () => ({
  getAssetIdsInFunctionalLocationSubtree: mocks.getAssetIdsInFunctionalLocationSubtree,
  getAssetLiveLocationMap: mocks.getAssetLiveLocationMap,
}));
vi.mock('@/lib/db', () => ({
  db: {
    asset: { findMany: mocks.assetFindMany },
    workOrder: { findMany: mocks.workOrderFindMany },
    workOrderDowntime: { findMany: mocks.downtimeFindMany },
  },
}));

import { GET } from '@/app/api/reports/machine-availability/route';

function request(query = '') {
  return new NextRequest(`http://localhost/api/reports/machine-availability${query}`);
}

const asset = {
  id: 'asset-1',
  name: 'Press 01',
  assetTag: 'PR-001',
  manufacturer: 'Maker',
  model: 'P1',
  criticality: 'high',
  yearManufactured: 2021,
  installedDate: new Date('2022-01-01T00:00:00Z'),
  category: { name: 'Presses' },
};

const liveLocation = {
  id: 'loc-child',
  name: 'Position 03',
  locationCode: 'TEMA-PRT-L01-P03',
  path: 'Tema Factory > Printing > Line 01 > Position 03',
  pathCode: 'TEMA-PRT-L01-P03 — Tema Factory > Printing > Line 01 > Position 03',
  source: 'structured',
  legacyPath: null,
};

describe('machine availability Functional Location rollups', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockReturnValue({ userId: 'user-1' });
    mocks.hasAnyPermission.mockReturnValue(true);
    mocks.isAdmin.mockReturnValue(false);
    mocks.getPlantScope.mockResolvedValue({ isScoped: true });
    mocks.getPlantFilterWhere.mockReturnValue({ plantId: 'plant-a' });
    mocks.getAssetIdsInFunctionalLocationSubtree.mockResolvedValue(['asset-1']);
    mocks.getAssetLiveLocationMap.mockResolvedValue(new Map([['asset-1', liveLocation]]));
    mocks.assetFindMany.mockResolvedValue([asset]);
    mocks.workOrderFindMany.mockResolvedValue([]);
    mocks.downtimeFindMany.mockResolvedValue([]);
  });

  it('intersects the selected location subtree with the current plant-scoped machine population', async () => {
    const response = await GET(request('?year=2025&functionalLocationId=loc-root'));
    expect(response.status).toBe(200);

    expect(mocks.getAssetIdsInFunctionalLocationSubtree).toHaveBeenCalledWith('loc-root');
    expect(mocks.assetFindMany.mock.calls[0][0].where).toEqual(expect.objectContaining({
      plantId: 'plant-a',
      id: { in: ['asset-1'] },
      status: { in: ['operational', 'standby', 'under_maintenance'] },
    }));
  });

  it('fails closed for an empty selected subtree', async () => {
    mocks.getAssetIdsInFunctionalLocationSubtree.mockResolvedValue([]);
    mocks.assetFindMany.mockResolvedValue([]);

    const response = await GET(request('?year=2025&functionalLocationId=loc-empty'));
    expect(response.status).toBe(200);
    expect(mocks.assetFindMany.mock.calls[0][0].where.id).toEqual({ in: [] });
  });

  it('projects the current coded Functional Location into each machine row', async () => {
    const response = await GET(request('?year=2025&functionalLocationId=loc-root'));
    const body = await response.json();

    expect(mocks.getAssetLiveLocationMap).toHaveBeenCalledWith(['asset-1']);
    expect(body.data.machines[0]).toEqual(expect.objectContaining({
      assetId: 'asset-1',
      functionalLocationCode: liveLocation.locationCode,
      functionalLocationPath: liveLocation.path,
      functionalLocationPathCode: liveLocation.pathCode,
    }));
  });
});
