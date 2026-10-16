import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getPlantScope: vi.fn(),
  applyPlantScope: vi.fn(),
  assetFindMany: vi.fn(),
  assetCount: vi.fn(),
  getAssetLiveLocationMap: vi.fn(),
  findAssetIdsByLiveLocationSearch: vi.fn(),
  getAssetIdsInFunctionalLocationSubtree: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  getSession: mocks.getSession,
  hasPermission: vi.fn(),
  isAdmin: vi.fn(),
}));
vi.mock('@/lib/plant-scope', () => ({
  getPlantScope: mocks.getPlantScope,
  canAccessPlant: vi.fn(),
  applyPlantScope: mocks.applyPlantScope,
}));
vi.mock('@/lib/functional-location/live-location', () => ({
  getAssetLiveLocationMap: mocks.getAssetLiveLocationMap,
  findAssetIdsByLiveLocationSearch: mocks.findAssetIdsByLiveLocationSearch,
  getAssetIdsInFunctionalLocationSubtree: mocks.getAssetIdsInFunctionalLocationSubtree,
}));
vi.mock('@/lib/db', () => ({
  db: {
    asset: {
      findMany: mocks.assetFindMany,
      count: mocks.assetCount,
    },
  },
}));

import { GET } from '@/app/api/assets/route';

const scope = {
  plantId: 'plant-a',
  accessiblePlantIds: ['plant-a'],
  isScoped: true,
  isSystemWide: false,
  denyAccess: false,
};
const asset = {
  id: 'asset-1',
  name: 'Printer 01',
  assetTag: 'PR-001',
  serialNumber: 'SN-1',
  location: 'Legacy Position',
  status: 'operational',
};
const liveLocation = {
  id: 'loc-position',
  name: 'Position 03',
  locationCode: 'TEMA-PRT-L01-P03',
  path: 'Tema Factory > Printing > Line 01 > Position 03',
  pathCode: 'TEMA-PRT-L01-P03 — Tema Factory > Printing > Line 01 > Position 03',
  source: 'structured',
  legacyPath: 'Legacy Position',
};

function request(query = '') {
  return new NextRequest(`http://localhost/api/assets${query}`);
}

describe('asset register live Functional Location projection and filtering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockReturnValue({ userId: 'user-1', roles: ['asset_manager'] });
    mocks.getPlantScope.mockResolvedValue(scope);
    mocks.applyPlantScope.mockImplementation((where: Record<string, unknown>) => {
      where.plantId = 'plant-a';
      return where;
    });
    mocks.assetFindMany.mockResolvedValue([asset]);
    mocks.assetCount.mockResolvedValue(1);
    mocks.getAssetLiveLocationMap.mockResolvedValue(new Map([['asset-1', liveLocation]]));
    mocks.findAssetIdsByLiveLocationSearch.mockResolvedValue([]);
    mocks.getAssetIdsInFunctionalLocationSubtree.mockResolvedValue([]);
  });

  it('batch-projects the authoritative live Functional Location onto asset register rows', async () => {
    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data[0].functionalLocation).toEqual(liveLocation);
    expect(mocks.getAssetLiveLocationMap).toHaveBeenCalledWith(['asset-1']);
  });

  it('searches coded Functional Locations without weakening plant scope', async () => {
    mocks.findAssetIdsByLiveLocationSearch.mockResolvedValue(['asset-location-match']);

    await GET(request('?search=TEMA-PRT'));

    expect(mocks.findAssetIdsByLiveLocationSearch).toHaveBeenCalledWith('TEMA-PRT');
    const query = mocks.assetFindMany.mock.calls[0][0];
    expect(query.where).toEqual(expect.objectContaining({
      plantId: 'plant-a',
      AND: [expect.objectContaining({
        OR: expect.arrayContaining([
          { name: { contains: 'TEMA-PRT' } },
          { assetTag: { contains: 'TEMA-PRT' } },
          { id: { in: ['asset-location-match'] } },
        ]),
      })],
    }));
  });

  it('filters the register to a selected Functional Location subtree under existing plant scope', async () => {
    mocks.getAssetIdsInFunctionalLocationSubtree.mockResolvedValue(['asset-1', 'asset-2']);

    await GET(request('?functionalLocationId=loc-area'));

    expect(mocks.getAssetIdsInFunctionalLocationSubtree).toHaveBeenCalledWith('loc-area');
    const query = mocks.assetFindMany.mock.calls[0][0];
    expect(query.where).toEqual(expect.objectContaining({
      plantId: 'plant-a',
      AND: [{ id: { in: ['asset-1', 'asset-2'] } }],
    }));
  });

  it('intersects Functional Location subtree and text search instead of replacing either constraint', async () => {
    mocks.findAssetIdsByLiveLocationSearch.mockResolvedValue(['asset-search']);
    mocks.getAssetIdsInFunctionalLocationSubtree.mockResolvedValue(['asset-search', 'asset-other']);

    await GET(request('?search=Printing&functionalLocationId=loc-area'));

    const query = mocks.assetFindMany.mock.calls[0][0];
    expect(query.where.plantId).toBe('plant-a');
    expect(query.where.AND).toHaveLength(2);
    expect(query.where.AND).toEqual(expect.arrayContaining([
      { id: { in: ['asset-search', 'asset-other'] } },
      expect.objectContaining({ OR: expect.arrayContaining([{ id: { in: ['asset-search'] } }]) }),
    ]));
  });
});
