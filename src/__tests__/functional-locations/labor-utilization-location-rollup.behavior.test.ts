import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  hasAnyPermission: vi.fn(),
  isAdmin: vi.fn(),
  getPlantScope: vi.fn(),
  getPlantFilterWhere: vi.fn(),
  resolveFunctionalLocationReportScope: vi.fn(),
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
vi.mock('@/lib/db', () => ({
  db: {
    workOrder: { findMany: mocks.workOrderFindMany },
  },
}));

import { GET } from '@/app/api/reports/labor-utilization/route';

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
  return new NextRequest(`http://localhost/api/reports/labor-utilization${query}`);
}

describe('labor utilization Functional Location rollups', () => {
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
    mocks.workOrderFindMany.mockResolvedValue([]);
  });

  it('ANDs descendant-aware location scope with existing plant and work-order filters', async () => {
    const response = await GET(request('?functionalLocationId=loc-root'));
    expect(response.status).toBe(200);

    expect(mocks.resolveFunctionalLocationReportScope).toHaveBeenCalledWith('loc-root');
    expect(mocks.workOrderFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        plantId: 'plant-a',
        status: { notIn: ['cancelled', 'draft'] },
        AND: [workOrderLocationFilter],
      },
    }));
  });
});
