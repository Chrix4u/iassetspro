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
    workOrder: { findMany: mocks.workOrderFindMany },
  },
}));

import { GET } from '@/app/api/reports/repeat-failures/route';

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
  return new NextRequest(`http://localhost/api/reports/repeat-failures${query}`);
}

function failure(id: string, detectedAt: string) {
  return {
    id,
    assetId: 'asset-1',
    componentId: null,
    workOrderId: 'wo-historical',
    failureMode: 'bearing_failure',
    failureSeverity: 'high',
    rootCause: 'wear',
    correctiveAction: 'replace bearing',
    downtimeMinutes: 60,
    repairCost: 100,
    detectedAt: new Date(detectedAt),
    resolvedAt: new Date(detectedAt),
    asset: {
      id: 'asset-1',
      name: 'Press 01',
      assetTag: 'PR-001',
      manufacturer: 'Maker',
      model: 'P1',
      serialNumber: 'SN-1',
      criticality: 'high',
      location: 'Legacy Bay',
      building: null,
      area: null,
      category: { name: 'Presses' },
    },
    component: null,
    workOrder: {
      id: 'wo-historical',
      woNumber: 'WO-1',
      title: 'Bearing repair',
      assignedTo: 'tech-1',
      functionalLocationIdSnapshot: 'loc-child',
      functionalLocationNameSnapshot: 'Position 03',
      functionalLocationSourceSnapshot: 'structured',
      functionalLocationCodeSnapshot: 'OLD-P03',
      functionalLocationPathSnapshot: 'Old Factory > Line > Position 03',
      functionalLocationPathCodeSnapshot: 'OLD-P03 — Old Factory > Line > Position 03',
    },
  };
}

describe('repeat-failure Functional Location rollups', () => {
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
    mocks.workOrderFindMany.mockResolvedValue([{ id: 'wo-historical' }]);
    mocks.failureFindMany.mockResolvedValue([
      failure('fr-3', '2026-10-12T08:00:00Z'),
      failure('fr-2', '2026-10-11T08:00:00Z'),
      failure('fr-1', '2026-10-10T08:00:00Z'),
    ]);
  });

  it('intersects linked and unlinked failures with snapshot-aware location scope under plant scope', async () => {
    const response = await GET(request('?functionalLocationId=loc-root'));
    expect(response.status).toBe(200);

    expect(mocks.resolveFunctionalLocationReportScope).toHaveBeenCalledWith('loc-root');
    expect(mocks.workOrderFindMany).toHaveBeenCalledWith({
      where: { plantId: 'plant-a', AND: [workOrderLocationFilter] },
      select: { id: true },
    });
    const where = mocks.failureFindMany.mock.calls[0][0].where;
    expect(where.asset).toEqual({ plantId: 'plant-a' });
    expect(where.AND).toEqual([{
      OR: [
        { workOrderId: { in: ['wo-historical'] } },
        { AND: [{ workOrderId: null }, { assetId: { in: ['asset-current'] } }] },
      ],
    }]);
  });

  it('uses the most recent frozen failure-time location instead of the asset current location', async () => {
    const response = await GET(request('?functionalLocationId=loc-root'));
    const body = await response.json();

    expect(body.data.problematicAssets[0]).toEqual(expect.objectContaining({
      assetId: 'asset-1',
      location: 'Old Factory > Line > Position 03',
      functionalLocationCode: 'OLD-P03',
      functionalLocationPath: 'Old Factory > Line > Position 03',
      functionalLocationPathCode: 'OLD-P03 — Old Factory > Line > Position 03',
    }));
    expect(mocks.getAssetLiveLocationMap).toHaveBeenCalledWith(['asset-1']);
  });
});
