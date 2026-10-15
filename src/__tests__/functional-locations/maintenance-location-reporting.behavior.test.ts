import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  hasAnyPermission: vi.fn(),
  isAdmin: vi.fn(),
  getPlantScope: vi.fn(),
  getPlantFilterWhere: vi.fn(),
  getAssetLiveLocationMap: vi.fn(),
  getAssetIdsInFunctionalLocationSubtree: vi.fn(),
  workOrderFindMany: vi.fn(),
  assetFindMany: vi.fn(),
  inventoryFindMany: vi.fn(),
  maintenanceFindMany: vi.fn(),
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
vi.mock('@/lib/functional-location/live-location', () => ({
  getAssetLiveLocationMap: mocks.getAssetLiveLocationMap,
  getAssetIdsInFunctionalLocationSubtree: mocks.getAssetIdsInFunctionalLocationSubtree,
}));
vi.mock('@/lib/db', () => ({
  db: {
    workOrder: { findMany: mocks.workOrderFindMany },
    asset: { findMany: mocks.assetFindMany },
    inventoryItem: { findMany: mocks.inventoryFindMany },
    maintenanceRequest: { findMany: mocks.maintenanceFindMany },
    workOrderComponent: { findMany: mocks.workOrderComponentFindMany },
  },
}));

import { GET as getMaintenanceReport } from '@/app/api/reports/maintenance/route';
import { GET as getWorkOrderReport } from '@/app/api/work-orders/reports/route';

const liveLocation = {
  id: 'loc-position',
  name: 'Position 03',
  locationCode: 'TEMA-PRT-L01-P03',
  path: 'Tema Factory > Printing > Line 01 > Position 03',
  pathCode: 'TEMA-PRT-L01-P03 — Tema Factory > Printing > Line 01 > Position 03',
  source: 'structured',
  legacyPath: 'Legacy Position',
};

const workOrder = {
  id: 'wo-1',
  woNumber: 'WO-202610-0001',
  title: 'Repair Printer 01',
  description: null,
  type: 'corrective',
  priority: 'high',
  status: 'closed',
  assetId: 'asset-1',
  assetName: 'Printer 01',
  plantId: 'plant-a',
  departmentId: 'dept-a',
  tradeActivity: 'mechanical',
  createdAt: new Date('2026-10-01T08:00:00Z'),
  updatedAt: new Date('2026-10-01T12:00:00Z'),
  plannedStart: new Date('2026-10-01T08:30:00Z'),
  plannedEnd: new Date('2026-10-01T12:30:00Z'),
  actualStart: new Date('2026-10-01T09:00:00Z'),
  actualEnd: new Date('2026-10-01T12:00:00Z'),
  estimatedHours: 3,
  actualHours: 3,
  totalCost: 120,
  laborCost: 70,
  partsCost: 50,
  contractorCost: 0,
  assignee: { id: 'tech-1', fullName: 'Technician One' },
  teamLeader: { id: 'lead-1', fullName: 'Lead One' },
  materials: [],
  teamMembers: [],
  timeLogs: [],
  workOrderDowntimes: [],
  repairCompletion: null,
  statusHistory: [],
  repairMaterialRequests: [],
  repairToolRequests: [],
  teamMemberRequests: [],
  sparePartReturns: [],
  damagedToolReports: [],
  shiftHandovers: [],
  maintenanceRequest: { createdAt: new Date('2026-10-01T07:30:00Z'), machineDownStatus: false },
  taskExecutions: [],
  failureRecords: [],
};

const asset = {
  id: 'asset-1',
  name: 'Printer 01',
  assetTag: 'PR-001',
  manufacturer: 'Maker',
  model: 'Model 1',
  serialNumber: 'SN-1',
  criticality: 'high',
  condition: 'good',
  location: 'Legacy Position',
  building: 'Legacy Building',
  floor: 'Legacy Floor',
  area: 'Legacy Area',
  purchaseCost: 1000,
  currentValue: 800,
  category: { name: 'Production Equipment' },
};

function request(query = '') {
  return new NextRequest(`http://localhost/api/reports/maintenance${query}`);
}

describe('maintenance reporting live functional location', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockReturnValue({ userId: 'manager-1', roles: ['maintenance_manager'] });
    mocks.hasAnyPermission.mockReturnValue(true);
    mocks.isAdmin.mockReturnValue(false);
    mocks.getPlantScope.mockResolvedValue({
      plantId: 'plant-a', accessiblePlantIds: ['plant-a'], isScoped: true, isSystemWide: false, denyAccess: false,
    });
    mocks.getPlantFilterWhere.mockReturnValue({ plantId: 'plant-a' });
    mocks.getAssetIdsInFunctionalLocationSubtree.mockResolvedValue(['asset-1', 'asset-2']);
    mocks.getAssetLiveLocationMap.mockResolvedValue(new Map([['asset-1', liveLocation]]));
    mocks.workOrderFindMany.mockResolvedValue([workOrder]);
    mocks.assetFindMany.mockResolvedValue([asset]);
    mocks.inventoryFindMany.mockResolvedValue([]);
    mocks.maintenanceFindMany.mockResolvedValue([]);
    mocks.workOrderComponentFindMany.mockResolvedValue([]);
  });

  it('filters maintenance reports to assets at the selected location or descendants without dropping plant scope', async () => {
    const response = await getMaintenanceReport(request('?functionalLocationId=loc-area'));
    expect(response.status).toBe(200);
    expect(mocks.getAssetIdsInFunctionalLocationSubtree).toHaveBeenCalledWith('loc-area');
    expect(mocks.workOrderFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        plantId: 'plant-a',
        assetId: { in: ['asset-1', 'asset-2'] },
      }),
    }));
  });

  it('prefers the structured live path and exposes code/path fields in recent work-order rows', async () => {
    const response = await getMaintenanceReport(request());
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(mocks.getAssetLiveLocationMap).toHaveBeenCalledWith(['asset-1']);
    expect(body.data.recentWorkOrders[0]).toEqual(expect.objectContaining({
      location: liveLocation.path,
      functionalLocationCode: liveLocation.locationCode,
      functionalLocationPath: liveLocation.path,
      functionalLocationPathCode: liveLocation.pathCode,
    }));
  });

  it('falls back to legacy location when no structured assignment exists', async () => {
    mocks.getAssetLiveLocationMap.mockResolvedValue(new Map([['asset-1', {
      id: null,
      name: 'Legacy Position',
      locationCode: null,
      path: 'Legacy Building > Legacy Floor > Legacy Area > Legacy Position',
      pathCode: 'Legacy Building > Legacy Floor > Legacy Area > Legacy Position',
      source: 'legacy',
      legacyPath: 'Legacy Building > Legacy Floor > Legacy Area > Legacy Position',
    }]]));
    const response = await getMaintenanceReport(request());
    const body = await response.json();
    expect(body.data.recentWorkOrders[0]).toEqual(expect.objectContaining({
      location: 'Legacy Building > Legacy Floor > Legacy Area > Legacy Position',
      functionalLocationCode: null,
    }));
  });
});


describe('work-order reporting live functional location', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockReturnValue({ userId: 'manager-1', fullName: 'Manager One', roles: ['maintenance_manager'] });
    mocks.hasAnyPermission.mockReturnValue(true);
    mocks.isAdmin.mockReturnValue(false);
    mocks.getPlantScope.mockResolvedValue({
      plantId: 'plant-a', accessiblePlantIds: ['plant-a'], isScoped: true, isSystemWide: false, denyAccess: false,
    });
    mocks.getPlantFilterWhere.mockReturnValue({ plantId: 'plant-a' });
    mocks.getAssetIdsInFunctionalLocationSubtree.mockResolvedValue(['asset-1', 'asset-2']);
    mocks.getAssetLiveLocationMap.mockResolvedValue(new Map([['asset-1', liveLocation]]));
    mocks.workOrderFindMany.mockResolvedValue([workOrder]);
    mocks.assetFindMany.mockResolvedValue([asset]);
    mocks.inventoryFindMany.mockResolvedValue([]);
    mocks.workOrderComponentFindMany.mockResolvedValue([]);
  });

  it('filters work-order reports by selected Functional Location descendants and keeps plant scope', async () => {
    const response = await getWorkOrderReport(new NextRequest('http://localhost/api/work-orders/reports?functionalLocationId=loc-area'));
    expect(response.status).toBe(200);
    expect(mocks.getAssetIdsInFunctionalLocationSubtree).toHaveBeenCalledWith('loc-area');
    expect(mocks.workOrderFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        plantId: 'plant-a',
        assetId: { in: ['asset-1', 'asset-2'] },
      }),
    }));
  });

  it('exposes live Location Code and path on work-order asset groups', async () => {
    const response = await getWorkOrderReport(new NextRequest('http://localhost/api/work-orders/reports'));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(mocks.getAssetLiveLocationMap).toHaveBeenCalledWith(['asset-1']);
    expect(body.data.workOrdersByAsset[0]).toEqual(expect.objectContaining({
      location: liveLocation.path,
      functionalLocationCode: liveLocation.locationCode,
      functionalLocationPath: liveLocation.path,
      functionalLocationPathCode: liveLocation.pathCode,
    }));
  });
});
