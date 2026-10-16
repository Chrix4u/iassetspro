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
  workOrderComponentFindMany: vi.fn(),
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
    workOrderComponent: { findMany: mocks.workOrderComponentFindMany },
  },
}));

import { GET } from '@/app/api/reports/enterprise/route';

function request() {
  return new NextRequest('http://localhost/api/reports/enterprise?functionalLocationId=loc-root');
}

function failure(id: string, detectedAt: string) {
  return {
    id,
    assetId: 'asset-1',
    workOrderId: 'wo-historical',
    componentId: null,
    failureMode: 'bearing_failure',
    failureSeverity: 'high',
    downtimeMinutes: 60,
    repairCost: 100,
    detectedAt: new Date(detectedAt),
    asset: {
      id: 'asset-1',
      name: 'Press 01',
      assetTag: 'PR-001',
      manufacturer: 'Maker',
      model: 'P1',
      serialNumber: 'SER-1',
      criticality: 'high',
      condition: 'fair',
      location: 'Legacy Bay',
      building: null,
      area: null,
      category: { name: 'Presses' },
    },
    component: null,
    workOrder: {
      id: 'wo-historical',
      functionalLocationIdSnapshot: 'loc-child',
      functionalLocationNameSnapshot: 'Position 03',
      functionalLocationSourceSnapshot: 'structured',
      functionalLocationCodeSnapshot: 'OLD-P03',
      functionalLocationPathSnapshot: 'Old Factory > Line > Position 03',
      functionalLocationPathCodeSnapshot: 'OLD-P03 — Old Factory > Line > Position 03',
    },
  };
}

describe('enterprise report Functional Location projection', () => {
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
      workOrderFilter: { functionalLocationIdSnapshot: { in: ['loc-root', 'loc-child'] } },
    });
    mocks.workOrderFindMany.mockImplementation(async (args: any) => {
      if (args?.select?.id === true && Object.keys(args.select).length === 1) return [{ id: 'wo-historical' }];
      return [];
    });
    mocks.assetFindMany.mockResolvedValue([]);
    mocks.inventoryItemFindMany.mockResolvedValue([]);
    mocks.inventoryItemCount.mockResolvedValue(0);
    mocks.failureFindMany.mockResolvedValue([
      failure('fr-3', '2026-10-12T08:00:00Z'),
      failure('fr-2', '2026-10-11T08:00:00Z'),
      failure('fr-1', '2026-10-10T08:00:00Z'),
    ]);
    mocks.repairToolRequestFindMany.mockResolvedValue([]);
    mocks.toolCount.mockResolvedValue(0);
    mocks.purchaseOrderCount.mockResolvedValue(0);
    mocks.workOrderComponentFindMany.mockResolvedValue([]);
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
  });

  it('uses the frozen failure-time coded path and only batch-loads live location as fallback', async () => {
    const response = await GET(request());
    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.data.repeatFailures[0]).toEqual(expect.objectContaining({
      assetId: 'asset-1',
      location: 'Old Factory > Line > Position 03',
      functionalLocationCode: 'OLD-P03',
      functionalLocationPath: 'Old Factory > Line > Position 03',
      functionalLocationPathCode: 'OLD-P03 — Old Factory > Line > Position 03',
    }));
    expect(mocks.getAssetLiveLocationMap).toHaveBeenCalledTimes(1);
    expect(mocks.getAssetLiveLocationMap).toHaveBeenCalledWith(['asset-1']);
  });
  it('projects the latest in-period work-order snapshot onto enterprise downtime and cost asset rows', async () => {
    const wo = {
      id: 'wo-asset-1',
      assetId: 'asset-1',
      assetName: 'Press 01',
      status: 'closed',
      priority: 'high',
      type: 'corrective',
      createdAt: new Date('2026-10-12T09:00:00Z'),
      actualEnd: new Date('2026-10-12T11:00:00Z'),
      plannedEnd: new Date('2026-10-12T12:00:00Z'),
      plannedStart: new Date('2026-10-12T09:00:00Z'),
      departmentId: null,
      assignedTo: null,
      plannerId: null,
      estimatedHours: 2,
      actualHours: 2,
      totalCost: 200,
      laborCost: 100,
      partsCost: 100,
      contractorCost: 0,
      tradeActivity: 'mechanical',
      assignee: null,
      teamLeader: null,
      planner: null,
      materials: [],
      teamMembers: [],
      timeLogs: [],
      workOrderDowntimes: [{
        id: 'dt-1',
        durationMinutes: 60,
        category: 'unplanned',
        downtimeStart: new Date('2026-10-12T09:00:00Z'),
      }],
      repairCompletion: null,
      functionalLocationIdSnapshot: 'loc-child',
      functionalLocationNameSnapshot: 'Position 03',
      functionalLocationSourceSnapshot: 'structured',
      functionalLocationCodeSnapshot: 'OLD-P03',
      functionalLocationPathSnapshot: 'Old Factory > Line > Position 03',
      functionalLocationPathCodeSnapshot: 'OLD-P03 — Old Factory > Line > Position 03',
    };

    mocks.failureFindMany.mockResolvedValue([]);
    mocks.workOrderFindMany.mockImplementation(async (args: any) => {
      if (args?.select?.id === true && Object.keys(args.select).length === 1) return [{ id: 'wo-asset-1' }];
      if (args?.include?.materials === true) return [wo];
      if (args?.include?.workOrderDowntimes === true) return [];
      return [];
    });
    mocks.assetFindMany.mockResolvedValue([{
      id: 'asset-1',
      name: 'Press 01',
      assetTag: 'PR-001',
      manufacturer: 'Maker',
      model: 'P1',
      serialNumber: 'SER-1',
      criticality: 'high',
      condition: 'fair',
      location: 'Legacy Bay',
      building: null,
      floor: null,
      area: null,
      purchaseCost: 1000,
      currentValue: 800,
      category: { name: 'Presses' },
    }]);

    const response = await GET(request());
    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.data.downtimeAnalysis.byAsset[0]).toEqual(expect.objectContaining({
      assetId: 'asset-1',
      location: 'Old Factory > Line > Position 03',
      functionalLocationCode: 'OLD-P03',
      functionalLocationPathCode: 'OLD-P03 — Old Factory > Line > Position 03',
    }));
    expect(body.data.costAnalytics.byAsset[0]).toEqual(expect.objectContaining({
      assetId: 'asset-1',
      location: 'Old Factory > Line > Position 03',
      functionalLocationCode: 'OLD-P03',
      functionalLocationPathCode: 'OLD-P03 — Old Factory > Line > Position 03',
    }));
    expect(mocks.getAssetLiveLocationMap).toHaveBeenCalledWith(['asset-1']);
  });

});
