import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mock = vi.hoisted(() => ({
  session: vi.fn(), admin: vi.fn(), permission: vi.fn(),
  plantScope: vi.fn(), canAccess: vi.fn(),
  assignments: vi.fn(), executions: vi.fn(),
}));
vi.mock('@/lib/auth', () => ({
  getSession: mock.session, isAdmin: mock.admin, hasPermission: mock.permission,
}));
vi.mock('@/lib/plant-scope', () => ({
  getPlantScope: mock.plantScope, canAccessPlantStrict: mock.canAccess,
}));
vi.mock('@/lib/db', () => ({
  db: {
    pmScheduleTask: { findMany: mock.assignments },
    workOrderTaskExecution: { findMany: mock.executions },
  },
}));
import { GET } from '@/app/api/pm-assignments/forward-plan/route';

const request = (plantId = '') => new NextRequest(
  'http://localhost/api/pm-assignments/forward-plan' +
    (plantId ? '?plantId=' + encodeURIComponent(plantId) : ''),
);
const fixture = {
  id: 'pm-1', assetId: 'asset-1', componentId: 'bearing-1',
  pmType: 'tbm', basis: 'calendar', activityMode: 'inspection',
  equipmentState: 'running', estimatedMinutes: 45,
  nextDueDate: new Date('2026-11-09T19:00:00.000Z'), nextDueReading: null,
  lastGeneratedCycleKey: 'tbm:pm-1:2026-11-09T19:00:00.000Z',
  asset: { name: 'Mercerizer C314', assetTag: 'C314', plantId: 'plant-1',
    criticality: 'critical', status: 'operational', plant: { name: 'Weaving Plant' } },
  component: { name: 'Bearing', componentCode: 'C314-21-02' },
  pmTask: { taskNumber: 8, description: 'Vibration check' },
  assetMeter: null,
};
describe('plant-scoped enterprise PM forward register', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.session.mockReturnValue({ userId: 'planner-1' });
    mock.admin.mockReturnValue(false);
    mock.permission.mockReturnValue(true);
    mock.plantScope.mockResolvedValue({ isSystemWide: false, isScoped: false,
      plantId: null, accessiblePlantIds: ['plant-1'], denyAccess: false });
    mock.canAccess.mockImplementation((_scope, id) => id === 'plant-1');
    mock.assignments.mockResolvedValue([fixture]);
    mock.executions.mockResolvedValue([]);
  });
  it('requires authenticated read permission before querying the PM register', async () => {
    mock.session.mockReturnValue(null);
    expect((await GET(request())).status).toBe(401);
    expect(mock.assignments).not.toHaveBeenCalled();
    mock.session.mockReturnValue({ userId: 'planner-1' });
    mock.permission.mockReturnValue(false);
    expect((await GET(request())).status).toBe(403);
    expect(mock.assignments).not.toHaveBeenCalled();
  });
  it('enforces all accessible plant IDs, never unrestricted where for regular users', async () => {
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(mock.assignments).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        asset: { is: { plantId: { in: ['plant-1'] } } },
        isActive: true,
      }),
    }));
    const data = (await response.json()).data;
    expect(data.items[0]).toMatchObject({
      id: 'pm-1', plantId: 'plant-1', assetCriticality: 'critical',
      basis: 'calendar', estimatedMinutes: 45,
    });
  });
  it('denies an unauthorized plant selector', async () => {
    const result = await GET(request('plant-2'));
    expect(result.status).toBe(403);
    expect(mock.assignments).not.toHaveBeenCalled();
  });
  it('narrows a permitted large-company register to one explicitly chosen plant', async () => {
    const response = await GET(request('plant-1'));
    expect(response.status).toBe(200);
    expect(mock.assignments).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        asset: { is: { plantId: 'plant-1' } },
      }),
    }));
  });

  it('returns no records for a user with no accessible plants', async () => {
    mock.plantScope.mockResolvedValue({ isSystemWide: false, isScoped: false,
      plantId: null, accessiblePlantIds: [], denyAccess: false });
    mock.assignments.mockResolvedValue([]);
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(mock.assignments).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ asset: { is: { plantId: { in: [] } } } }),
    }));
    expect(mock.executions).not.toHaveBeenCalled();
  });
  it('matches only the current due-cycle work order, not a previous cycle', async () => {
    mock.executions.mockResolvedValue([
      { pmScheduleTaskId: 'pm-1', pmDueCycleKey: 'tbm:pm-1:2026-10-01', workOrder: {
        id: 'wo-old', woNumber: 'WO-OLD', status: 'planned', plantId: 'plant-1' } },
      { pmScheduleTaskId: 'pm-1', pmDueCycleKey: fixture.lastGeneratedCycleKey, workOrder: {
        id: 'wo-current', woNumber: 'WO-CURRENT', status: 'draft', plantId: 'plant-1' } },
    ]);
    const response = await GET(request());
    expect((await response.json()).data.items[0].openWorkOrder).toMatchObject({
      id: 'wo-current', woNumber: 'WO-CURRENT', status: 'draft',
    });
    expect(mock.executions).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        pmScheduleTaskId: { in: ['pm-1'] },
        workOrder: { is: { status: { notIn: ['closed', 'verified', 'cancelled'] } } },
      }),
    }));
  });
  it('does not disclose a work order belonging to another plant even when linked incorrectly', async () => {
    mock.executions.mockResolvedValue([
      { pmScheduleTaskId: 'pm-1', pmDueCycleKey: fixture.lastGeneratedCycleKey,
        workOrder: { id: 'other', woNumber: 'WO-OTHER-PLANT', status: 'draft', plantId: 'plant-2' } },
    ]);
    const res = await GET(request());
    expect(res.status).toBe(200);
    expect((await res.json()).data.items[0].openWorkOrder).toBeNull();
  });
  it('uses only real active meter readings and flags legacy frequency for review', async () => {
    mock.assignments.mockResolvedValue([
      { ...fixture, id: 'meter', basis: 'meter', nextDueDate: null,
        nextDueReading: 1600, assetMeter: { isActive: true, currentValue: 1595,
          name: 'Run Hours', unit: 'h', lastReadingAt: new Date('2026-11-09T10:00:00Z') } },
      { ...fixture, id: 'legacy', basis: null },
    ]);
    const res = await GET(request());
    const items = (await res.json()).data.items;
    expect(items[0]).toMatchObject({ basis: 'meter', meterValue: 1595, nextDueReading: 1600 });
    expect(items[1].basis).toBe('legacy_review');
  });
  it('fails clearly instead of returning a silently truncated plant-wide forecast', async () => {
    mock.assignments.mockResolvedValue(Array(10001).fill(fixture));
    const response = await GET(request());
    expect(response.status).toBe(422);
    expect((await response.json()).error).toMatch(/Select one plant/);
    expect(mock.executions).not.toHaveBeenCalled();
  });
});
