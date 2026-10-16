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
  downtimeFindMany: vi.fn(),
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
    workOrderDowntime: { findMany: mocks.downtimeFindMany },
    workOrder: { findMany: mocks.workOrderFindMany },
  },
}));

import { GET } from '@/app/api/reports/downtime/route';

const locationFilter = {
  OR: [
    { functionalLocationIdSnapshot: { in: ['loc-root', 'loc-child'] } },
    {
      AND: [
        { functionalLocationSourceSnapshot: null },
        { functionalLocationIdSnapshot: null },
        { assetId: { in: ['asset-1'] } },
      ],
    },
  ],
};

function request(query = '') {
  return new NextRequest(`http://localhost/api/reports/downtime${query}`);
}

describe('downtime report Functional Location rollups', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockReturnValue({ userId: 'user-1' });
    mocks.hasAnyPermission.mockReturnValue(true);
    mocks.isAdmin.mockReturnValue(false);
    mocks.getPlantScope.mockResolvedValue({ isScoped: true });
    mocks.getPlantFilterWhere.mockReturnValue({ plantId: 'plant-a' });
    mocks.resolveFunctionalLocationReportScope.mockResolvedValue({
      locationIds: ['loc-root', 'loc-child'],
      currentAssetIds: ['asset-1'],
      workOrderFilter: locationFilter,
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
    mocks.downtimeFindMany.mockResolvedValue([
      {
        id: 'dt-1',
        assetId: 'asset-1',
        assetName: 'Press 01',
        workOrderId: 'wo-1',
        downtimeStart: new Date('2026-10-10T08:00:00Z'),
        durationMinutes: 90,
        category: 'unplanned',
        reason: 'Bearing',
        productionLoss: 20,
        workOrder: {
          id: 'wo-1',
          woNumber: 'WO-1',
          title: 'Repair press',
          priority: 'high',
          status: 'closed',
          functionalLocationIdSnapshot: 'loc-child',
          functionalLocationSourceSnapshot: 'structured',
          functionalLocationCodeSnapshot: 'OLD-P03',
          functionalLocationPathSnapshot: 'Old Factory > Line > Position 03',
          functionalLocationPathCodeSnapshot: 'OLD-P03 — Old Factory > Line > Position 03',
        },
      },
    ]);
    mocks.workOrderFindMany.mockImplementation(async (args: any) => {
      if (args?.select?.actualStart) {
        return [{
          id: 'wo-1',
          actualStart: new Date('2026-10-10T08:00:00Z'),
          actualEnd: new Date('2026-10-10T09:30:00Z'),
          assetId: 'asset-1',
          assetName: 'Press 01',
          plantId: 'plant-a',
        }];
      }
      return [{ totalCost: 100, laborCost: 40, partsCost: 60 }];
    });
  });

  it('intersects the selected location subtree with plant scope for downtime and completed-WO metrics', async () => {
    const response = await GET(request('?functionalLocationId=loc-root'));
    expect(response.status).toBe(200);

    expect(mocks.resolveFunctionalLocationReportScope).toHaveBeenCalledWith('loc-root');
    expect(mocks.downtimeFindMany.mock.calls[0][0].where.workOrder).toEqual({
      plantId: 'plant-a',
      AND: [locationFilter],
    });
    expect(mocks.workOrderFindMany.mock.calls[0][0].where).toEqual(expect.objectContaining({
      plantId: 'plant-a',
      AND: [locationFilter],
    }));
  });

  it('keeps historical snapshot location details in the downtime asset breakdown', async () => {
    const response = await GET(request('?functionalLocationId=loc-root'));
    const body = await response.json();

    expect(body.data.breakdownByAsset[0]).toEqual(expect.objectContaining({
      assetId: 'asset-1',
      assetName: 'Press 01',
      functionalLocationCode: 'OLD-P03',
      functionalLocationPath: 'Old Factory > Line > Position 03',
      functionalLocationPathCode: 'OLD-P03 — Old Factory > Line > Position 03',
    }));
    expect(mocks.getAssetLiveLocationMap).toHaveBeenCalledWith(['asset-1']);
  });
});
