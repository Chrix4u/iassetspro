import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  hasAnyPermission: vi.fn(),
  isAdmin: vi.fn(),
  getPlantScope: vi.fn(),
  getPlantFilterWhere: vi.fn(),
  resolveFunctionalLocationReportScope: vi.fn(),
  getAssetLiveLocationMap: vi.fn(),
  failureFindMany: vi.fn(),
  assetFindMany: vi.fn(),
  workOrderFindMany: vi.fn(),
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
vi.mock('@/lib/functional-location/reporting', () => ({
  resolveFunctionalLocationReportScope: mocks.resolveFunctionalLocationReportScope,
}));
vi.mock('@/lib/functional-location/live-location', () => ({
  getAssetLiveLocationMap: mocks.getAssetLiveLocationMap,
}));
vi.mock('@/lib/db', () => ({
  db: {
    failureRecord: { findMany: mocks.failureFindMany },
    asset: { findMany: mocks.assetFindMany },
    workOrder: { findMany: mocks.workOrderFindMany },
  },
}));

import { GET } from '@/app/api/reports/failure-analysis/route';

const workOrderLocationFilter = {
  OR: [
    { functionalLocationIdSnapshot: { in: ['loc-root', 'loc-child'] } },
    {
      AND: [
        { functionalLocationSourceSnapshot: null },
        { functionalLocationIdSnapshot: null },
        { assetId: { in: ['asset-current'] } },
      ],
    },
  ],
};

function request(query = '') {
  return new NextRequest(`http://localhost/api/reports/failure-analysis${query}`);
}

describe('failure analysis Functional Location rollups', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockReturnValue({ userId: 'user-1' });
    mocks.hasAnyPermission.mockReturnValue(true);
    mocks.isAdmin.mockReturnValue(false);
    mocks.getPlantScope.mockResolvedValue({ isScoped: true });
    mocks.getPlantFilterWhere.mockReturnValue({ plantId: 'plant-a' });
    mocks.resolveFunctionalLocationReportScope.mockResolvedValue({
      locationIds: ['loc-root', 'loc-child'],
      currentAssetIds: ['asset-current'],
      workOrderFilter: workOrderLocationFilter,
    });
    mocks.getAssetLiveLocationMap.mockResolvedValue(new Map([
      ['asset-1', {
        id: 'loc-current',
        name: 'Current Position',
        locationCode: 'NOW-P01',
        path: 'Now > Position 01',
        pathCode: 'NOW-P01 — Now > Position 01',
        source: 'structured',
        legacyPath: null,
      }],
    ]));
    mocks.failureFindMany.mockResolvedValue([
      {
        id: 'fr-1',
        assetId: 'asset-1',
        componentId: 'component-1',
        failureMode: 'bearing_failure',
        failureSeverity: 'high',
        rootCause: 'wear',
        correctiveAction: 'replace bearing',
        downtimeMinutes: 45,
        repairCost: 75,
        detectedAt: new Date('2026-10-10T08:00:00Z'),
        asset: {
          id: 'asset-1',
          name: 'Press 01',
          assetTag: 'PR-001',
          manufacturer: 'Maker',
          model: 'P1',
          plantId: 'plant-a',
          criticality: 'high',
          location: 'Legacy Bay',
          building: null,
          area: null,
          categoryId: 'cat-1',
          status: 'operational',
          createdAt: new Date('2025-01-01T00:00:00Z'),
        },
        component: { id: 'component-1', name: 'Bearing', componentCode: 'BRG-1' },
        workOrder: {
          id: 'wo-historical',
          woNumber: 'WO-1',
          type: 'corrective',
          status: 'closed',
          assetId: 'asset-1',
          assetName: 'Press 01',
          tradeActivity: 'mechanical',
          totalCost: 75,
          laborCost: 25,
          partsCost: 50,
          functionalLocationIdSnapshot: 'loc-child',
          functionalLocationNameSnapshot: 'Position 03',
          functionalLocationSourceSnapshot: 'structured',
          functionalLocationCodeSnapshot: 'OLD-P03',
          functionalLocationPathSnapshot: 'Old Factory > Line > Position 03',
          functionalLocationPathCodeSnapshot: 'OLD-P03 — Old Factory > Line > Position 03',
          repairCompletion: { rootCause: 'wear', correctiveAction: 'replace bearing', reworkCount: 0 },
        },
      },
    ]);
    mocks.assetFindMany.mockResolvedValue([
      { id: 'asset-1', category: { name: 'Presses' } },
    ]);
    mocks.workOrderFindMany.mockImplementation(async (args: any) => {
      if (args?.select?.id === true && Object.keys(args.select).length === 1) {
        return [{ id: 'wo-historical' }];
      }
      return [];
    });
  });

  it('uses snapshot-aware qualifying work orders plus unlinked-current-asset fallback under plant scope', async () => {
    const response = await GET(request('?functionalLocationId=loc-root'));
    expect(response.status).toBe(200);

    expect(mocks.resolveFunctionalLocationReportScope).toHaveBeenCalledWith('loc-root');
    expect(mocks.workOrderFindMany.mock.calls[0][0].where).toEqual({
      plantId: 'plant-a',
      AND: [workOrderLocationFilter],
    });
    const failureWhere = mocks.failureFindMany.mock.calls[0][0].where;
    expect(failureWhere.asset).toEqual({ plantId: 'plant-a' });
    expect(failureWhere.AND).toEqual([{
      OR: [
        { workOrderId: { in: ['wo-historical'] } },
        { AND: [{ workOrderId: null }, { assetId: { in: ['asset-current'] } }] },
      ],
    }]);
  });

  it('projects the frozen failure-time location into by-asset analysis', async () => {
    const response = await GET(request('?functionalLocationId=loc-root'));
    const body = await response.json();

    expect(body.data.byAsset[0]).toEqual(expect.objectContaining({
      assetId: 'asset-1',
      location: 'Old Factory > Line > Position 03',
      functionalLocationCode: 'OLD-P03',
      functionalLocationPath: 'Old Factory > Line > Position 03',
      functionalLocationPathCode: 'OLD-P03 — Old Factory > Line > Position 03',
    }));
    expect(mocks.getAssetLiveLocationMap).toHaveBeenCalledWith(['asset-1']);
  });
});
