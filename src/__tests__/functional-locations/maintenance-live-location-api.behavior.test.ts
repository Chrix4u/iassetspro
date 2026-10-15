import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  hasPermission: vi.fn(),
  isAdmin: vi.fn(),
  getPlantScope: vi.fn(),
  applyPlantScope: vi.fn(),
  canAccessPlantStrict: vi.fn(),
  getAssetLiveLocationMap: vi.fn(),
  findAssetIdsByLiveLocationSearch: vi.fn(),
  maintenanceFindMany: vi.fn(),
  maintenanceFindUnique: vi.fn(),
  maintenanceCount: vi.fn(),
  departmentFindMany: vi.fn(),
  departmentFindFirst: vi.fn(),
  workOrderFindMany: vi.fn(),
  workOrderFindUnique: vi.fn(),
  workOrderCount: vi.fn(),
  workOrderTeamFindMany: vi.fn(),
  assetFindMany: vi.fn(),
  assetFindUnique: vi.fn(),
  pmScheduleFindMany: vi.fn(),
  pmScheduleFindUnique: vi.fn(),
  canViewWorkOrder: vi.fn(),
  getUnavailableOperationalModules: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  getSession: mocks.getSession,
  hasPermission: mocks.hasPermission,
  isAdmin: mocks.isAdmin,
}));
vi.mock('@/lib/plant-scope', () => ({
  getPlantScope: mocks.getPlantScope,
  applyPlantScope: mocks.applyPlantScope,
  canAccessPlantStrict: mocks.canAccessPlantStrict,
}));
vi.mock('@/lib/functional-location/live-location', () => ({
  getAssetLiveLocationMap: mocks.getAssetLiveLocationMap,
  findAssetIdsByLiveLocationSearch: mocks.findAssetIdsByLiveLocationSearch,
}));
vi.mock('@/lib/notifications', () => ({ notifyUser: vi.fn(), notifyAdmins: vi.fn() }));
vi.mock('@/lib/maintenance-approvers', () => ({
  getMaintenanceApproverEligibility: vi.fn(),
  maintenanceApproverErrorMessage: vi.fn(),
}));
vi.mock('@/lib/pm-utils', () => ({
  calculateNextDueDate: vi.fn(),
  isAutoCalculableFrequency: vi.fn(),
  isPmFrequencyType: vi.fn(),
}));
vi.mock('@/services/pm/templateLifecycle.service', () => ({ lockPmTemplateLifecycle: vi.fn(), lockPmScheduleLifecycle: vi.fn() }));
vi.mock('@/lib/plant-auth-helpers', () => ({ authorizeMaintenanceRequestPlant: vi.fn(), authorizeWorkOrderPlant: vi.fn() }));
vi.mock('@/services/workOrderAccess.service', () => ({ canViewWorkOrder: mocks.canViewWorkOrder, canManageWorkOrder: vi.fn(() => true) }));
vi.mock('@/lib/module-access.server', () => ({ getUnavailableOperationalModules: mocks.getUnavailableOperationalModules }));
vi.mock('@/services/pm/triggerConfig.service', () => ({ findOpenRuntimeGeneratedWorkOrder: vi.fn(), normalizePmTriggerConfig: vi.fn(), parsePmTriggerConfig: vi.fn() }));
vi.mock('@/lib/db', () => ({
  db: {
    maintenanceRequest: { findMany: mocks.maintenanceFindMany, findUnique: mocks.maintenanceFindUnique, count: mocks.maintenanceCount },
    department: { findMany: mocks.departmentFindMany, findFirst: mocks.departmentFindFirst },
    workOrder: { findMany: mocks.workOrderFindMany, findUnique: mocks.workOrderFindUnique, count: mocks.workOrderCount },
    workOrderTeamMember: { findMany: mocks.workOrderTeamFindMany },
    asset: { findMany: mocks.assetFindMany, findUnique: mocks.assetFindUnique },
    pmSchedule: { findMany: mocks.pmScheduleFindMany, findUnique: mocks.pmScheduleFindUnique },
  },
}));

import { GET as getMaintenanceRequests } from '@/app/api/maintenance-requests/route';
import { GET as getWorkOrders } from '@/app/api/work-orders/route';
import { GET as getPmSchedules } from '@/app/api/pm-schedules/route';
import { GET as getMaintenanceRequestDetail } from '@/app/api/maintenance-requests/[id]/route';
import { GET as getWorkOrderDetail } from '@/app/api/work-orders/[id]/route';
import { GET as getPmScheduleDetail } from '@/app/api/pm-schedules/[id]/route';

const session = { userId: 'planner-1', username: 'planner', roles: ['maintenance_planner'] };
const scope = {
  plantId: 'plant-a',
  accessiblePlantIds: ['plant-a'],
  isScoped: true,
  isSystemWide: false,
  denyAccess: false,
};
const liveLocation = {
  id: 'loc-4',
  name: 'Position 03',
  locationCode: 'TEMA-PRT-L01-P03',
  path: 'Tema Factory > Printing > Line 01 > Position 03',
  pathCode: 'TEMA-PRT-L01-P03 — Tema Factory > Printing > Line 01 > Position 03',
  source: 'structured',
  legacyPath: 'Legacy Position',
};

function request(path: string) {
  return new NextRequest(`http://localhost${path}`);
}

describe('maintenance live functional-location API projection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockReturnValue(session);
    mocks.hasPermission.mockReturnValue(true);
    mocks.isAdmin.mockReturnValue(false);
    mocks.getPlantScope.mockResolvedValue(scope);
    mocks.canAccessPlantStrict.mockReturnValue(true);
    mocks.applyPlantScope.mockImplementation((where: Record<string, unknown>) => {
      where.plantId = 'plant-a';
      return where;
    });
    mocks.getAssetLiveLocationMap.mockResolvedValue(new Map([['asset-1', liveLocation]]));
    mocks.findAssetIdsByLiveLocationSearch.mockResolvedValue([]);
    mocks.maintenanceCount.mockResolvedValue(1);
    mocks.workOrderCount.mockResolvedValue(1);
    mocks.departmentFindMany.mockResolvedValue([]);
    mocks.workOrderTeamFindMany.mockResolvedValue([]);
    mocks.assetFindMany.mockResolvedValue([
      { id: 'asset-1', name: 'Printer 01', assetTag: 'PR-001', serialNumber: 'SN-1', status: 'active', criticality: 'high' },
    ]);
    mocks.assetFindUnique.mockResolvedValue({ id: 'asset-1', name: 'Printer 01', assetTag: 'PR-001', serialNumber: 'SN-1', status: 'active', criticality: 'high' });
    mocks.departmentFindFirst.mockResolvedValue({ id: 'dept-a', name: 'Printing', code: 'PRT', plantId: 'plant-a', supervisorId: null });
    mocks.canViewWorkOrder.mockReturnValue(true);
    mocks.getUnavailableOperationalModules.mockResolvedValue([]);
  });

  it('adds the asset live Functional Location to maintenance-request list rows', async () => {
    mocks.maintenanceFindMany.mockResolvedValue([{
      id: 'mr-1', requestNumber: 'MR-1', title: 'Printer fault', assetId: 'asset-1', assetName: 'Printer 01', plantId: 'plant-a',
      asset: { id: 'asset-1', name: 'Printer 01', assetTag: 'PR-001', serialNumber: 'SN-1' },
    }]);

    const response = await getMaintenanceRequests(request('/api/maintenance-requests'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data[0].asset.functionalLocation).toEqual(liveLocation);
    expect(mocks.getAssetLiveLocationMap).toHaveBeenCalledWith(['asset-1']);
  });

  it('adds a batched asset summary with live Functional Location to work-order list rows', async () => {
    mocks.workOrderFindMany.mockResolvedValue([{
      id: 'wo-1', woNumber: 'WO-1', title: 'Repair printer', assetId: 'asset-1', assetName: 'Printer 01', plantId: 'plant-a',
      teamMembers: [], timeLogs: [],
    }]);

    const response = await getWorkOrders(request('/api/work-orders'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data[0].asset).toEqual(expect.objectContaining({
      id: 'asset-1',
      name: 'Printer 01',
      assetTag: 'PR-001',
      functionalLocation: liveLocation,
    }));
    expect(mocks.assetFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: { in: ['asset-1'] } } }));
    expect(mocks.getAssetLiveLocationMap).toHaveBeenCalledWith(['asset-1']);
  });

  it('adds the asset live Functional Location to PM schedule list rows', async () => {
    mocks.pmScheduleFindMany.mockResolvedValue([{
      id: 'pm-1', title: 'Monthly printer PM', assetId: 'asset-1',
      asset: { id: 'asset-1', name: 'Printer 01', assetTag: 'PR-001', status: 'active' },
    }]);

    const response = await getPmSchedules(request('/api/pm-schedules'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data[0].asset.functionalLocation).toEqual(liveLocation);
    expect(mocks.getAssetLiveLocationMap).toHaveBeenCalledWith(['asset-1']);
  });
});


describe('maintenance live functional-location detail projection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockReturnValue(session);
    mocks.hasPermission.mockReturnValue(true);
    mocks.isAdmin.mockReturnValue(false);
    mocks.getPlantScope.mockResolvedValue(scope);
    mocks.canAccessPlantStrict.mockReturnValue(true);
    mocks.getAssetLiveLocationMap.mockResolvedValue(new Map([['asset-1', liveLocation]]));
    mocks.assetFindUnique.mockResolvedValue({ id: 'asset-1', name: 'Printer 01', assetTag: 'PR-001', serialNumber: 'SN-1', status: 'active', criticality: 'high' });
    mocks.departmentFindFirst.mockResolvedValue({ id: 'dept-a', name: 'Printing', code: 'PRT', plantId: 'plant-a', supervisorId: null });
    mocks.canViewWorkOrder.mockReturnValue(true);
    mocks.getUnavailableOperationalModules.mockResolvedValue([]);
  });

  it('adds live Functional Location to a maintenance-request detail asset', async () => {
    mocks.maintenanceFindUnique.mockResolvedValue({
      id: 'mr-1', requestedBy: 'planner-1', plantId: 'plant-a', departmentId: 'dept-a', assetId: 'asset-1',
      asset: { id: 'asset-1', name: 'Printer 01', assetTag: 'PR-001', serialNumber: 'SN-1', location: 'Legacy Position' },
      comments: [],
    });
    const response = await getMaintenanceRequestDetail(request('/api/maintenance-requests/mr-1'), { params: Promise.resolve({ id: 'mr-1' }) });
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.data.asset.functionalLocation).toEqual(liveLocation);
  });

  it('adds a direct asset summary with live Functional Location to work-order detail', async () => {
    mocks.workOrderFindUnique.mockResolvedValue({
      id: 'wo-1', woNumber: 'WO-1', title: 'Repair printer', plantId: 'plant-a', assetId: 'asset-1', assetName: 'Printer 01',
      repairToolRequests: [], repairMaterialRequests: [], materials: [], workOrderComponents: [], teamMemberRequests: [],
      suggestedParts: '[]', suggestedTools: '[]', planner: null,
      maintenanceRequest: null, pmSchedule: null,
      createdAt: new Date('2026-10-15T10:00:00Z'), updatedAt: new Date('2026-10-15T10:00:00Z'),
    });
    const response = await getWorkOrderDetail(request('/api/work-orders/wo-1'), { params: Promise.resolve({ id: 'wo-1' }) });
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.data.asset).toEqual(expect.objectContaining({
      id: 'asset-1', assetTag: 'PR-001', functionalLocation: liveLocation,
    }));
  });

  it('adds live Functional Location to a PM schedule detail asset', async () => {
    mocks.pmScheduleFindUnique.mockResolvedValue({
      id: 'pm-1', title: 'Monthly printer PM', assetId: 'asset-1',
      asset: { id: 'asset-1', name: 'Printer 01', assetTag: 'PR-001', status: 'active', criticality: 'high', plantId: 'plant-a' },
    });
    const response = await getPmScheduleDetail(request('/api/pm-schedules/pm-1'), { params: Promise.resolve({ id: 'pm-1' }) });
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.data.asset.functionalLocation).toEqual(liveLocation);
  });
});

describe('maintenance live-location search preserves authorization scope', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockReturnValue({ ...session, roles: ['maintenance_technician'] });
    mocks.hasPermission.mockReturnValue(true);
    mocks.isAdmin.mockReturnValue(false);
    mocks.getPlantScope.mockResolvedValue(scope);
    mocks.applyPlantScope.mockImplementation((where: Record<string, unknown>) => {
      where.plantId = 'plant-a';
      return where;
    });
    mocks.findAssetIdsByLiveLocationSearch.mockResolvedValue(['asset-1']);
    mocks.getAssetLiveLocationMap.mockResolvedValue(new Map());
    mocks.maintenanceFindMany.mockResolvedValue([]);
    mocks.maintenanceCount.mockResolvedValue(0);
    mocks.workOrderFindMany.mockResolvedValue([]);
    mocks.workOrderCount.mockResolvedValue(0);
    mocks.workOrderTeamFindMany.mockResolvedValue([{ workOrderId: 'wo-team' }]);
    mocks.pmScheduleFindMany.mockResolvedValue([]);
    mocks.assetFindMany.mockResolvedValue([]);
  });

  it('keeps maintenance-request technician OR scope while adding location search under AND', async () => {
    await getMaintenanceRequests(request('/api/maintenance-requests?search=TEMA-PRT'));
    const query = mocks.maintenanceFindMany.mock.calls[0][0];
    expect(query.where).toEqual(expect.objectContaining({
      plantId: 'plant-a',
      OR: [
        { requestedBy: 'planner-1' },
        { workOrder: { assignedTo: 'planner-1' } },
      ],
      AND: [expect.objectContaining({
        OR: expect.arrayContaining([
          { title: { contains: 'TEMA-PRT' } },
          { requestNumber: { contains: 'TEMA-PRT' } },
          { assetName: { contains: 'TEMA-PRT' } },
          { assetId: { in: ['asset-1'] } },
        ]),
      })],
    }));
  });

  it('keeps work-order technician/team OR scope while adding location search under AND', async () => {
    await getWorkOrders(request('/api/work-orders?search=TEMA-PRT'));
    const query = mocks.workOrderFindMany.mock.calls[0][0];
    expect(query.where).toEqual(expect.objectContaining({
      plantId: 'plant-a',
      OR: [
        { assignedTo: 'planner-1' },
        { id: { in: ['wo-team'] } },
      ],
      AND: [expect.objectContaining({
        OR: expect.arrayContaining([
          { title: { contains: 'TEMA-PRT' } },
          { woNumber: { contains: 'TEMA-PRT' } },
          { assetName: { contains: 'TEMA-PRT' } },
          { assetId: { in: ['asset-1'] } },
        ]),
      })],
    }));
  });

  it('keeps PM asset plant scope while adding live-location search under AND', async () => {
    await getPmSchedules(request('/api/pm-schedules?search=TEMA-PRT'));
    const query = mocks.pmScheduleFindMany.mock.calls[0][0];
    expect(query.where).toEqual(expect.objectContaining({
      asset: { plantId: 'plant-a' },
      AND: [expect.objectContaining({
        OR: expect.arrayContaining([
          { title: { contains: 'TEMA-PRT' } },
          { assetId: { in: ['asset-1'] } },
        ]),
      })],
    }));
    expect(mocks.findAssetIdsByLiveLocationSearch).toHaveBeenCalledWith('TEMA-PRT');
  });
});
