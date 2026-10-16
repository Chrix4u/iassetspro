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
  workOrderFindMany: vi.fn(),
  assetFindMany: vi.fn(),
  inventoryItemFindMany: vi.fn(),
  inventoryItemCount: vi.fn(),
  failureFindMany: vi.fn(),
  repairToolRequestFindMany: vi.fn(),
  toolCount: vi.fn(),
  purchaseOrderCount: vi.fn(),
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
    workOrder: { findMany: mocks.workOrderFindMany },
    asset: { findMany: mocks.assetFindMany },
    inventoryItem: { findMany: mocks.inventoryItemFindMany, count: mocks.inventoryItemCount },
    failureRecord: { findMany: mocks.failureFindMany },
    repairToolRequest: { findMany: mocks.repairToolRequestFindMany },
    tool: { count: mocks.toolCount },
    purchaseOrder: { count: mocks.purchaseOrderCount },
  },
}));

import { GET } from '@/app/api/reports/enterprise/route';

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
  return new NextRequest(`http://localhost/api/reports/enterprise${query}`);
}

describe('enterprise report Functional Location rollups', () => {
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
    mocks.getAssetLiveLocationMap.mockResolvedValue(new Map());
    mocks.workOrderFindMany.mockImplementation(async (args: any) => {
      if (args?.select?.id === true && Object.keys(args.select).length === 1) {
        return [{ id: 'wo-historical' }];
      }
      return [];
    });
    mocks.assetFindMany.mockResolvedValue([]);
    mocks.inventoryItemFindMany.mockResolvedValue([]);
    mocks.inventoryItemCount.mockResolvedValue(0);
    mocks.failureFindMany.mockResolvedValue([]);
    mocks.repairToolRequestFindMany.mockResolvedValue([]);
    mocks.toolCount.mockResolvedValue(0);
    mocks.purchaseOrderCount.mockResolvedValue(0);
  });

  it('ANDs descendant-aware location scope into current and comparison-period work-order analytics', async () => {
    const response = await GET(request('?functionalLocationId=loc-root'));
    expect(response.status).toBe(200);

    expect(mocks.resolveFunctionalLocationReportScope).toHaveBeenCalledWith('loc-root');

    const mainCall = mocks.workOrderFindMany.mock.calls.find(([args]) => args?.include?.materials === true);
    expect(mainCall?.[0].where).toEqual(expect.objectContaining({
      plantId: 'plant-a',
      status: { notIn: ['cancelled'] },
      AND: [workOrderLocationFilter],
    }));

    const comparisonCalls = mocks.workOrderFindMany.mock.calls
      .filter(([args]) => args?.include?.workOrderDowntimes === true && args?.include?.materials !== true);
    expect(comparisonCalls).toHaveLength(2);
    for (const [args] of comparisonCalls) {
      expect(args.where).toEqual(expect.objectContaining({
        plantId: 'plant-a',
        status: { notIn: ['cancelled'] },
        AND: [workOrderLocationFilter],
      }));
    }
  });

  it('scopes the enterprise repeat-failure subsection by historical work-order snapshot with current-asset fallback', async () => {
    const response = await GET(request('?functionalLocationId=loc-root'));
    expect(response.status).toBe(200);

    expect(mocks.workOrderFindMany).toHaveBeenCalledWith({
      where: { plantId: 'plant-a', AND: [workOrderLocationFilter] },
      select: { id: true },
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
});
