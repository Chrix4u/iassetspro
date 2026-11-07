import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  session: vi.fn(), permission: vi.fn(), admin: vi.fn(),
  plantScope: vi.fn(), applyScope: vi.fn(),
  list: vi.fn(), count: vi.fn(), locations: vi.fn(),
}));
vi.mock('@/lib/auth', () => ({
  getSession: mocks.session,
  hasPermission: mocks.permission,
  isAdmin: mocks.admin,
}));
vi.mock('@/lib/plant-scope', () => ({
  getPlantScope: mocks.plantScope,
  applyPlantScope: mocks.applyScope,
}));
vi.mock('@/lib/functional-location/live-location', () => ({
  findAssetIdsByLiveLocationSearch: vi.fn(async () => []),
  getAssetLiveLocationMap: mocks.locations,
}));
vi.mock('@/lib/functional-location/maintenance-snapshot', () => ({
  buildMaintenanceLocationSnapshot: vi.fn(),
  getMaintenanceLocationSnapshot: vi.fn(),
}));
vi.mock('@/lib/db', () => ({
  db: {
    workOrder: { findMany: mocks.list, count: mocks.count },
    asset: { findMany: vi.fn(async () => []) },
  },
}));

import { GET } from '@/app/api/work-orders/route';

async function get(query = '') {
  const response = await GET(new NextRequest(`http://localhost/api/work-orders${query}`));
  return { status: response.status, body: await response.json() };
}

describe('Unassigned draft PM work order listing: authorization, exact scope, no non-PM records', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockReturnValue({ userId: 'planner-1', roles: ['maintenance_planner'] });
    mocks.permission.mockReturnValue(true);
    mocks.admin.mockReturnValue(false);
    mocks.plantScope.mockResolvedValue({
      denyAccess: false, isScoped: true, plantId: 'plant-1', accessiblePlantIds: ['plant-1'],
    });
    // Use the same plant scoping helper as the normal work-order listing.
    mocks.applyScope.mockImplementation((where: Record<string, unknown>) => {
      where.plantId = 'plant-1';
    });
    mocks.list.mockResolvedValue([]);
    mocks.count.mockResolvedValue(10);
    mocks.locations.mockResolvedValue(new Map());
  });

  it('requires authentication before any database query', async () => {
    mocks.session.mockReturnValue(null);
    expect((await get('?pmPlannerState=unassigned')).status).toBe(401);
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it('requires normal work-order list permissions', async () => {
    mocks.permission.mockReturnValue(false);
    expect((await get('?pmPlannerState=unassigned')).status).toBe(403);
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it('rejects unsupported PM planner states and incompatible status filters', async () => {
    expect((await get('?pmPlannerState=all')).status).toBe(400);
    expect((await get('?pmPlannerState=unassigned&status=closed')).status).toBe(400);
    expect((await get('?pmPlannerState=unassigned&overdue=true')).status).toBe(400);
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it('filters only unlocked draft PM work orders missing a planner, in the current plant', async () => {
    const result = await get('?pmPlannerState=unassigned&page=2&limit=5');
    expect(result.status).toBe(200);
    expect(result.body.pagination).toMatchObject({ page: 2, limit: 5, total: 10, totalPages: 2 });
    expect(mocks.applyScope).toHaveBeenCalledOnce();
    expect(mocks.list).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        pmScheduleId: { not: null },
        plannerId: null,
        status: 'draft',
        isLocked: false,
        plantId: 'plant-1',
      }),
      skip: 5, take: 5,
    }));
    expect(mocks.count).toHaveBeenCalledWith({
      where: expect.objectContaining({ pmScheduleId: { not: null }, plannerId: null, plantId: 'plant-1' }),
    });
  });

  it('keeps planner and plant filters when historical status is draft', async () => {
    const result = await get('?pmPlannerState=unassigned&status=draft&priority=high');
    expect(result.status).toBe(200);
    expect(mocks.list).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        status: 'draft',
        priority: 'high',
        pmScheduleId: { not: null },
        plannerId: null,
        plantId: 'plant-1',
      }),
    }));
  });
});
