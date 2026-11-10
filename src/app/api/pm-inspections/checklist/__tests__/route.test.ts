import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  session: vi.fn(), scope: vi.fn(), plantAccess: vi.fn(),
  asset: vi.fn(), tasks: vi.fn(), points: vi.fn(), pending: vi.fn(), links: vi.fn(),
}));
vi.mock('@/lib/auth', () => ({
  getSession: mocks.session,
  hasPermission: () => true,
  isAdmin: () => false,
}));
vi.mock('@/lib/plant-scope', () => ({
  getPlantScope: mocks.scope,
  canAccessPlantStrict: mocks.plantAccess,
}));
vi.mock('@/lib/db', () => ({
  db: {
    asset: { findUnique: mocks.asset },
    pmScheduleTask: { findMany: mocks.tasks },
    componentInspectionPoint: { findMany: mocks.points },
    componentInspectionRecord: { findMany: mocks.pending },
    pmInspectionTaskPoint: { findMany: mocks.links },
  },
}));

import { GET } from '@/app/api/pm-inspections/checklist/route';

function request(assetId = 'asset-1', equipmentState = 'running') {
  const params = new URLSearchParams({ assetId, equipmentState });
  return new NextRequest('http://localhost/api/pm-inspections/checklist?' + params.toString());
}
async function get(assetId?: string, state?: string) {
  const response = await GET(request(assetId, state));
  return { status: response.status, body: await response.json() };
}

describe('generated machine inspection checklist (read-only, plant-scoped)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockReturnValue({ userId: 'technician-1' });
    mocks.scope.mockResolvedValue({ denyAccess: false, isScoped: true, plantId: 'plant-1' });
    mocks.plantAccess.mockReturnValue(true);
    mocks.asset.mockResolvedValue({ id: 'asset-1', name: 'Mercerizer C314', assetTag: 'C314', plantId: 'plant-1' });
    mocks.tasks.mockResolvedValue([{
      id: 'assgn-1', assetId: 'asset-1', componentId: 'bearing-1',
      component: { id: 'bearing-1', assetId: 'asset-1', name: 'Drive bearing', componentCode: 'C314-21-02', componentType: 'part' },
      pmTask: { id: 'pm-1', taskNumber: 5, description: 'Measure bearing vibration', taskType: 'measure' },
      pmType: 'tbm', basis: 'calendar', nextDueDate: new Date(), nextDueReading: null,
      equipmentState: 'running',
    }]);
    mocks.points.mockResolvedValue([{
      id: 'vib', componentId: 'bearing-1', name: 'Vibration',
      description: null, inspectionType: 'measurement', parameterKey: 'vibration',
      normalRange: '{"min":0,"max":4.5,"unit":"mm/s"}', frequency: 'weekly',
      nextInspection: new Date('2026-11-01T00:00:00Z'),
      records: [],
    }]);
    mocks.pending.mockResolvedValue([]);
    mocks.links.mockResolvedValue([]);
  });

  it('rejects anonymous calls before querying assets or inspection values', async () => {
    mocks.session.mockReturnValue(null);
    const response = await get();
    expect(response.status).toBe(401);
    expect(mocks.asset).not.toHaveBeenCalled();
  });

  it('rejects malformed machine/state inputs before any DB read', async () => {
    const response = await get('asset-1', 'unsafe');
    expect(response.status).toBe(400);
    expect(mocks.asset).not.toHaveBeenCalled();
  });

  it('requires access to the machine plant, not just a valid machine ID', async () => {
    mocks.plantAccess.mockReturnValue(false);
    const response = await get();
    expect(response.status).toBe(403);
    expect(mocks.tasks).not.toHaveBeenCalled();
    expect(mocks.points).not.toHaveBeenCalled();
  });

  it('generates a running checklist with real task/part/measurement provenance', async () => {
    const response = await get();
    expect(response.status).toBe(200);
    expect(response.body.data.machine.assetTag).toBe('C314');
    expect(response.body.data.equipmentState).toBe('running');
    expect(response.body.data.groups[0].component.componentCode).toBe('C314-21-02');
    expect(response.body.data.groups[0].tasks[0].pmTask.description).toBe('Measure bearing vibration');
    expect(response.body.data.groups[0].points[0].normalRange).toContain('4.5');
    expect(mocks.tasks).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        assetId: 'asset-1', isActive: true, activityMode: 'inspection',
        equipmentState: { in: ['running'] },
      }),
      take: 1501,
    }));
    expect(mocks.points).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ componentId: { in: ['bearing-1'] }, isActive: true }),
    }));
  });

  it('normalizes the legacy stopped mode into standstill', async () => {
    mocks.tasks.mockResolvedValueOnce([{
      id: 'assgn-2', componentId: null, component: null,
      pmTask: { id: 'pm-2', taskNumber: 2, description: 'General safety guards', taskType: 'inspect' },
      pmType: 'tbm', basis: 'calendar', nextDueDate: null, nextDueReading: null, equipmentState: 'stopped',
    }]);
    const response = await get('asset-1', 'standstill');
    expect(response.status).toBe(200);
    expect(response.body.data.generalTasks[0].equipmentState).toBe('standstill');
    expect(response.body.data.unconfiguredTasks).toBe(1);
    expect(mocks.tasks).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ equipmentState: { in: ['standstill', 'stopped'] } }),
    }));
    expect(mocks.points).not.toHaveBeenCalled();
  });

  it('does not silently return an incomplete list when too many tasks exist', async () => {
    mocks.tasks.mockResolvedValueOnce(Array.from({ length: 1501 }, (_, i) => ({ id: String(i) })));
    const response = await get();
    expect(response.status).toBe(422);
    expect(mocks.points).not.toHaveBeenCalled();
  });

  it('does not claim a part that is registered to a different machine', async () => {
    mocks.tasks.mockResolvedValueOnce([{
      id: 'assgn-3', componentId: 'other-part',
      component: { id: 'other-part', assetId: 'other-machine', name: 'Other plant part', componentCode: 'OTHER-01', componentType: 'part' },
      pmTask: { id: 'pm-3', taskNumber: 2, description: 'Inspect', taskType: 'inspect' },
      pmType: 'tbm', basis: 'calendar', nextDueDate: null, nextDueReading: null, equipmentState: 'running',
    }]);
    const response = await get();
    expect(response.status).toBe(200);
    expect(response.body.data.generalTasks[0].component).toBeNull();
    expect(response.body.data.groups).toHaveLength(0);
    expect(mocks.points).not.toHaveBeenCalled();
  });
});
