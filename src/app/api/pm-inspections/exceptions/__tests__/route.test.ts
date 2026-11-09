import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  session: vi.fn(), scope: vi.fn(), access: vi.fn(), records: vi.fn(), count: vi.fn(),
}));
vi.mock('@/lib/auth', () => ({
  getSession: mocks.session,
  hasPermission: (session: { permissions?: string[] }, permission: string) =>
    session.permissions ? session.permissions.includes(permission) : true,
  isAdmin: () => false,
}));
vi.mock('@/lib/plant-scope', () => ({
  getPlantScope: mocks.scope,
  canAccessPlantStrict: mocks.access,
}));
vi.mock('@/lib/db', () => ({
  db: { componentInspectionRecord: { findMany: mocks.records, count: mocks.count } },
}));
import { GET } from '@/app/api/pm-inspections/exceptions/route';

async function run(query = '') {
  const response = await GET(new NextRequest(
    `http://localhost/api/pm-inspections/exceptions${query ? '?' + query : ''}`,
  ));
  return { status: response.status, body: await response.json() };
}

const oldDefect = {
  id: 'record-1', result: 'fail', value: '7.9', findings: 'Bearing vibration high',
  recommendation: 'Inspect bearing mounting', inspectedAt: new Date('2026-11-08T12:00:00Z'),
  inspector: { id: 'user-a', fullName: 'Maintenance Technician' },
  inspectionPoint: {
    id: 'point-vib', name: 'Vibration', inspectionType: 'measurement',
    parameterKey: 'vibration', normalRange: '{"min":0,"max":4.5,"unit":"mm/s"}',
  },
  component: {
    id: 'bearing', name: 'Bearing', componentCode: 'C314-21-02',
    asset: { id: 'asset-a', name: 'Mercerizer C314', assetTag: 'C314', plantId: 'plant-1', departmentId: 'production' },
  },
  workOrder: { id: 'wo-open', woNumber: 'WO-01', status: 'draft' },
};

describe('GET /api/pm-inspections/exceptions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockReturnValue({ userId: 'planner-1' });
    mocks.scope.mockResolvedValue({
      denyAccess: false, isScoped: true, isSystemWide: false,
      plantId: 'plant-1', accessiblePlantIds: ['plant-1'],
    });
    mocks.access.mockReturnValue(true);
    mocks.records.mockResolvedValue([oldDefect]);
    mocks.count.mockResolvedValue(1);
  });

  it('returns 401 before querying database for unauthenticated callers', async () => {
    mocks.session.mockReturnValue(null);
    expect((await run()).status).toBe(401);
    expect(mocks.records).not.toHaveBeenCalled();
  });

  it('does not expose plant-wide exception history to work-orders-own-only users', async () => {
    mocks.session.mockReturnValue({ userId: 'technician-1', permissions: ['work_orders.view_own'] });
    expect((await run()).status).toBe(403);
    expect(mocks.records).not.toHaveBeenCalled();
  });

  it('denies users with no authorized plant', async () => {
    mocks.scope.mockResolvedValue({ denyAccess: true });
    expect((await run()).status).toBe(403);
    expect(mocks.records).not.toHaveBeenCalled();
  });

  it('denies explicit plant override outside current authorized plant', async () => {
    mocks.access.mockReturnValue(false);
    expect((await run('plantId=other-plant')).status).toBe(403);
    expect(mocks.records).not.toHaveBeenCalled();
  });

  it('rejects malformed dates, reversed dates and unsupported filter values', async () => {
    for (const query of [
      'from=2026-02-30', 'to=2026-11-99',
      'from=2026-11-09&to=2026-11-08',
      'result=pass', 'followUp=everything',
    ]) {
      expect((await run(query)).status).toBe(400);
    }
    expect(mocks.records).not.toHaveBeenCalled();
  });

  it('lists historical abnormal events in scope including inspector, full part and WO provenance', async () => {
    const response = await run('page=1&limit=25');
    expect(response.status).toBe(200);
    expect(response.body.pagination.total).toBe(1);
    expect(response.body.data[0]).toMatchObject({
      id: 'record-1', result: 'fail', value: '7.9',
      equipmentState: null,
      component: { componentCode: 'C314-21-02' },
      inspectionPoint: { name: 'Vibration' },
      inspector: { fullName: 'Maintenance Technician' },
      workOrder: { woNumber: 'WO-01', status: 'draft' },
    });
    expect(mocks.records).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        result: { in: ['fail', 'needs_attention', 'conditional'] },
        component: { asset: { is: { plantId: { in: ['plant-1'] } } } },
      }),
      orderBy: [{ inspectedAt: 'desc' }, { id: 'desc' }],
      skip: 0,
      take: 25,
    }));
  });

  it('shows an explicitly captured historical state without manufacturing one for legacy records', async () => {
    const legacy = await run();
    expect(legacy.body.data[0].equipmentState).toBeNull();

    mocks.records.mockResolvedValueOnce([{ ...oldDefect, equipmentState: 'standstill' }]);
    const known = await run();
    expect(known.status).toBe(200);
    expect(known.body.data[0].equipmentState).toBe('standstill');
  });

  it('filters exact date ranges and open corrective work orders without guessing operating state', async () => {
    expect((await run('from=2026-11-01&to=2026-11-09&result=fail&followUp=open&assetId=asset-a')).status).toBe(200);
    expect(mocks.records).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        result: 'fail',
        component: { asset: { is: { id: 'asset-a', plantId: { in: ['plant-1'] } } } },
        inspectedAt: {
          gte: new Date('2026-11-01T00:00:00.000Z'),
          lte: new Date('2026-11-09T23:59:59.999Z'),
        },
        workOrder: { is: { type: 'corrective', status: { notIn: ['closed', 'cancelled'] } } },
      }),
    }));
  });

  it('can locate exceptions with no linked corrective WO for planner review', async () => {
    expect((await run('followUp=none')).status).toBe(200);
    expect(mocks.count).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ workOrderId: null }),
    }));
  });

  it('paginates a bounded result without revealing another plant', async () => {
    expect((await run('page=2&limit=500&plantId=plant-1')).status).toBe(200);
    expect(mocks.records).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ component: { asset: { is: { plantId: 'plant-1' } } } }),
      skip: 100, take: 100,
    }));
  });
});
