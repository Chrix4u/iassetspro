import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  canView: vi.fn(),
  plantScope: vi.fn(),
  canAccess: vi.fn(),
  membership: vi.fn(),
  findWO: vi.fn(),
  unavailable: vi.fn(),
  locations: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  getSession: mocks.session,
  hasPermission: (session: { permissions: string[] }, slug: string) => session.permissions.includes(slug),
  isAdmin: (session: { roles: string[] }) => session.roles.includes('admin'),
}));
vi.mock('@/lib/db', () => ({
  db: {
    workOrder: { findUnique: mocks.findWO },
    userPlant: { findFirst: mocks.membership },
  },
}));
vi.mock('@/lib/plant-scope', () => ({
  getPlantScope: mocks.plantScope,
  canAccessPlantStrict: mocks.canAccess,
}));
vi.mock('@/lib/plant-auth-helpers', () => ({ authorizeWorkOrderPlant: vi.fn() }));
vi.mock('@/services/workOrderAccess.service', () => ({
  canViewWorkOrder: mocks.canView,
  canManageWorkOrder: vi.fn(),
}));
vi.mock('@/lib/module-access.server', () => ({
  getUnavailableOperationalModules: mocks.unavailable,
}));
vi.mock('@/lib/functional-location/live-location', () => ({
  getAssetLiveLocationMap: mocks.locations,
}));

import { GET } from '@/app/api/work-orders/[id]/route';

const orphan = {
  id: 'wo-1', woNumber: 'WO-202611-0001',
  status: 'draft', pmScheduleId: 'schedule-a', plannerId: null,
  plantId: 'plant-a', isLocked: false,
  createdAt: new Date('2026-11-07T00:00:00Z'),
  updatedAt: new Date('2026-11-07T00:00:00Z'),
  assetId: null,
  maintenanceRequest: null,
  assignee: null, teamLeader: null, assignedSupervisor: null, assigner: null, planner: null,
  repairToolRequests: [], repairMaterialRequests: [], materials: [],
  workOrderComponents: [], teamMemberRequests: [], timeLogs: [],
  suggestedParts: '[]', suggestedTools: '[]',
};

async function get() {
  const result = await GET(
    new NextRequest('http://localhost/api/work-orders/wo-1'),
    { params: Promise.resolve({ id: 'wo-1' }) },
  );
  return { status: result.status, body: await result.json() };
}

describe('PM unowned draft detail — real-world planner claim path', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockReturnValue({
      userId: 'planner-1', roles: ['maintenance_planner'],
      permissions: ['work_orders.view', 'work_orders.update'],
    });
    mocks.canView.mockReturnValue(false); // No pre-existing relationship to an orphan draft
    mocks.canAccess.mockReturnValue(true);
    mocks.plantScope.mockResolvedValue({
      denyAccess: false, isScoped: true, plantId: 'plant-a',
      accessiblePlantIds: ['plant-a'],
    });
    mocks.findWO.mockResolvedValue({ ...orphan });
    mocks.membership.mockResolvedValue({ id: 'plant-membership' });
    mocks.unavailable.mockResolvedValue([]);
    mocks.locations.mockResolvedValue(new Map());
  });

  it('allows an eligible planner to open an orphan PM draft and reach its claim action', async () => {
    const result = await get();
    expect(result.status).toBe(200);
    expect(result.body.data).toMatchObject({
      id: 'wo-1', plannerId: null, pmScheduleId: 'schedule-a', status: 'draft',
    });
    expect(mocks.membership).toHaveBeenCalledOnce();
  });

  it('denies a planner without current plant write membership', async () => {
    mocks.membership.mockResolvedValue(null);
    expect((await get()).status).toBe(403);
  });

  it('denies a planner when they cannot access the work-order plant', async () => {
    mocks.canAccess.mockReturnValue(false);
    expect((await get()).status).toBe(403);
    expect(mocks.membership).not.toHaveBeenCalled();
  });

  it('does not extend the exception to ordinary corrective work orders', async () => {
    mocks.findWO.mockResolvedValue({ ...orphan, pmScheduleId: null });
    expect((await get()).status).toBe(403);
    expect(mocks.membership).not.toHaveBeenCalled();
  });

  it('does not extend the exception to a claimed draft or active work', async () => {
    for (const patch of [{ plannerId: 'planner-2' }, { status: 'approved' }, { isLocked: true }]) {
      mocks.findWO.mockResolvedValue({ ...orphan, ...patch });
      expect((await get()).status).toBe(403);
    }
    expect(mocks.membership).not.toHaveBeenCalled();
  });

  it('requires a planner with basic view and update permission', async () => {
    mocks.session.mockReturnValue({
      userId: 'technician-1', roles: ['maintenance_technician'],
      permissions: ['work_orders.view', 'work_orders.update'],
    });
    expect((await get()).status).toBe(403);
    expect(mocks.membership).not.toHaveBeenCalled();
  });
});
