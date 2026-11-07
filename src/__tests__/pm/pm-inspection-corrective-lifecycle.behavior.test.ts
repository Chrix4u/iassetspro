import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(), getScope: vi.fn(), access: vi.fn(),
  pointFind: vi.fn(), pointUpdate: vi.fn(),
  recordFind: vi.fn(), recordFindFirst: vi.fn(), recordCreate: vi.fn(), recordUpdate: vi.fn(),
  readingCreate: vi.fn(), woFindMany: vi.fn(), woCreate: vi.fn(),
  componentUpsert: vi.fn(), auditCreate: vi.fn(), lock: vi.fn(),
}));
vi.mock('@/lib/auth', () => ({ getSession: mocks.getSession, isAdmin: () => false, hasPermission: () => true }));
vi.mock('@/lib/plant-scope', () => ({ getPlantScope: mocks.getScope, canAccessPlantStrict: mocks.access }));
vi.mock('@/lib/functional-location/live-location', () => ({ getAssetLiveLocationMap: async () => new Map() }));
vi.mock('@/lib/functional-location/maintenance-snapshot', () => ({ buildMaintenanceLocationSnapshot: () => ({}) }));

function tx() {
  return {
    $executeRawUnsafe: mocks.lock,
    componentInspectionPoint: { findUnique: mocks.pointFind, update: mocks.pointUpdate },
    componentInspectionRecord: { findUnique: mocks.recordFind, findFirst: mocks.recordFindFirst, create: mocks.recordCreate, update: mocks.recordUpdate },
    componentConditionReading: { create: mocks.readingCreate },
    workOrder: { findMany: mocks.woFindMany, create: mocks.woCreate },
    workOrderComponent: { upsert: mocks.componentUpsert },
    auditLog: { create: mocks.auditCreate },
  };
}
vi.mock('@/lib/db', () => ({ db: {
  componentInspectionPoint: { findUnique: mocks.pointFind },
  $transaction: async (callback: (client: ReturnType<typeof tx>) => unknown) => callback(tx()),
} }));

import { POST } from '@/app/api/pm-inspections/[pointId]/records/route';
import { advanceClosedInspectionPoint } from '@/services/pm/advanceClosedInspectionPoint.service';

interface RecordState {
  id: string; inspectionPointId: string; inspectorId: string; inspectedAt: Date;
  workOrderId: string | null; requestKey: string | null; result: string;
  value: string | null; findings: string | null; recommendation: string | null;
}
interface Wo { id: string; woNumber: string; status: string; type: 'corrective' }
let records: RecordState[];
let orders: Map<string, Wo>;
let point: {
  id: string; isActive: boolean; inspectionType: string; parameterKey: string;
  normalRange: string; frequency: string; nextInspection: Date; lastInspected: Date | null;
  name: string;
  component: { id: string; name: string; componentCode: string; criticality: string;
    asset: { id: string; name: string; assetTag: string; plantId: string; departmentId: string } };
};

async function submit(payload: Record<string, unknown>) {
  const request = new NextRequest('http://localhost/api/pm-inspections/temperature-point/records', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
  });
  const response = await POST(request, { params: Promise.resolve({ pointId: 'temperature-point' }) });
  return { status: response.status, body: await response.json() };
}

describe('PM inspection corrective lifecycle: mocked transaction, no production data', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    records = [];
    orders = new Map();
    point = {
      id: 'temperature-point', isActive: true, inspectionType: 'measurement',
      parameterKey: 'Temperature', normalRange: '{"min":20,"max":80,"unit":"C"}',
      frequency: 'weekly', nextInspection: new Date('2026-11-07T00:00:00Z'),
      lastInspected: null, name: 'Bearing temperature',
      component: { id: 'bearing-1', name: 'Drive bearing', componentCode: 'BR-001',
        criticality: 'high', asset: { id: 'machine-1', name: 'Machine A',
          assetTag: 'MA-01', plantId: 'plant-1', departmentId: 'dept-1' } },
    };
    mocks.getSession.mockReturnValue({ userId: 'technician-1' });
    mocks.getScope.mockResolvedValue({ denyAccess: false, plantId: 'plant-1', isScoped: true, accessiblePlantIds: ['plant-1'] });
    mocks.access.mockReturnValue(true);
    mocks.pointFind.mockImplementation(async () => point);
    mocks.pointUpdate.mockImplementation(async (args: { data: { nextInspection?: Date; lastInspected?: Date } }) => {
      Object.assign(point, args.data); return point;
    });
    mocks.recordFind.mockImplementation(async (args: { where: { requestKey: string } }) => {
      const r = records.find((x) => x.requestKey === args.where.requestKey);
      return r ? { ...r, workOrder: r.workOrderId ? orders.get(r.workOrderId) || null : null } : null;
    });
    mocks.recordFindFirst.mockImplementation(async (args: { where: { workOrderId?: string; inspectionPointId?: string } }) => {
      if (args.where.workOrderId) {
        const r = records.find((x) => x.workOrderId === args.where.workOrderId);
        return r ? { id: r.id, inspectionPointId: r.inspectionPointId, inspectedAt: r.inspectedAt } : null;
      }
      const r = [...records].reverse().find((x) => x.inspectionPointId === args.where.inspectionPointId
        && x.workOrderId && !['closed', 'cancelled'].includes(orders.get(x.workOrderId)?.status || 'closed'));
      return r ? { workOrder: orders.get(r.workOrderId!) } : null;
    });
    mocks.recordCreate.mockImplementation(async (args: { data: Omit<RecordState, 'id' | 'workOrderId'> }) => {
      const r: RecordState = { ...args.data, id: 'record-' + (records.length + 1), workOrderId: null };
      records.push(r); return r;
    });
    mocks.recordUpdate.mockImplementation(async (args: { where: { id: string }; data: { workOrderId: string } }) => {
      const r = records.find((x) => x.id === args.where.id)!; r.workOrderId = args.data.workOrderId; return r;
    });
    mocks.woFindMany.mockImplementation(async () => [...orders.values()].map((x) => ({ woNumber: x.woNumber })));
    mocks.woCreate.mockImplementation(async (args: { data: { woNumber: string; status: string } }) => {
      const wo: Wo = { id: 'wo-' + (orders.size + 1), woNumber: args.data.woNumber, status: args.data.status, type: 'corrective' };
      orders.set(wo.id, wo); return wo;
    });
    mocks.lock.mockResolvedValue([]);
    mocks.componentUpsert.mockResolvedValue({});
    mocks.readingCreate.mockResolvedValue({});
    mocks.auditCreate.mockResolvedValue({});
  });

  it('blocks plant access before recording readings or drafting a WO', async () => {
    mocks.access.mockReturnValue(false);
    const result = await submit({ outcome: 'fail', value: '120', findings: 'Too hot' });
    expect(result.status).toBe(403);
    expect(mocks.recordCreate).not.toHaveBeenCalled();
    expect(mocks.woCreate).not.toHaveBeenCalled();
  });

  it('records a failed sight inspection without fabricating an instrument reading', async () => {
    point.inspectionType = 'visual';
    const originalDue = point.nextInspection.toISOString();
    const result = await submit({
      requestKey: 'visual-inspect-0001', outcome: 'needs_attention',
      findings: 'Seal leaking during the visual inspection', recommendation: 'Inspect seal',
    });
    expect(result.status).toBe(201);
    expect(result.body.data.record.result).toBe('needs_attention');
    expect(result.body.data.workOrder.status).toBe('draft');
    expect(result.body.data.awaitingCloseout).toBe(true);
    expect(mocks.readingCreate).not.toHaveBeenCalled();
    expect(mocks.woCreate).toHaveBeenCalledOnce();
    expect(point.nextInspection.toISOString()).toBe(originalDue);
  });

  it('rejects invalid instrument readings before creating a record, condition reading, or WO', async () => {
    const result = await submit({
      requestKey: 'bad-reading-0001', outcome: 'pass', value: 'not-numeric',
    });
    expect(result.status).toBe(400);
    expect(mocks.recordCreate).not.toHaveBeenCalled();
    expect(mocks.readingCreate).not.toHaveBeenCalled();
    expect(mocks.woCreate).not.toHaveBeenCalled();
  });

  it('keeps a defect due until verified corrective closeout, even after a later passing reinspection', async () => {
    const originalDue = point.nextInspection.toISOString();
    const failedInput = { requestKey: 'mobile-inspect-001', outcome: 'pass',
      value: '120', findings: '', recommendation: 'Replace bearing' };
    const failed = await submit(failedInput);
    expect(failed.status).toBe(201);
    expect(failed.body.data.record.result).toBe('fail');
    expect(failed.body.data.workOrder.status).toBe('draft');
    expect(failed.body.data.awaitingCloseout).toBe(true);
    expect(mocks.readingCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ value: 120, isAlarm: true, parameterKey: 'Temperature' }),
    }));
    expect(point.nextInspection.toISOString()).toBe(originalDue);
    expect(orders.size).toBe(1);

    const replay = await submit(failedInput);
    expect(replay.status).toBe(200);
    expect(replay.body.data.duplicate).toBe(true);
    expect(mocks.recordCreate).toHaveBeenCalledTimes(1);
    expect(mocks.readingCreate).toHaveBeenCalledTimes(1);
    expect(mocks.woCreate).toHaveBeenCalledTimes(1);

    const conflict = await submit({ ...failedInput, value: '121' });
    expect(conflict.status).toBe(409);
    expect(records).toHaveLength(1);

    const laterPass = await submit({ requestKey: 'mobile-inspect-002', outcome: 'pass', value: '60' });
    expect(laterPass.status).toBe(201);
    expect(laterPass.body.data.record.result).toBe('pass');
    expect(laterPass.body.data.awaitingCloseout).toBe(true);
    expect(laterPass.body.data.workOrder.id).toBe(failed.body.data.workOrder.id);
    expect(point.nextInspection.toISOString()).toBe(originalDue);
    expect(orders.size).toBe(1);

    // The Repairs planner has verified and closed the corrective WO.
    const order = orders.get(failed.body.data.workOrder.id)!;
    order.status = 'closed';
    const completedAt = new Date(Date.now() + 3_600_000);
    const advanced = await advanceClosedInspectionPoint({
      tx: tx() as never, workOrderId: order.id, woNumber: order.woNumber,
      woActualEnd: completedAt, closedAt: new Date(completedAt.getTime() + 60_000),
      actorId: 'planner-1',
    });
    const expectedDue = new Date(completedAt);
    expectedDue.setDate(expectedDue.getDate() + 7);
    expect(advanced.advanced).toBe(true);
    expect(point.nextInspection.toISOString()).toBe(expectedDue.toISOString());
    expect(mocks.auditCreate).toHaveBeenCalled();

    const oldReplay = await submit(failedInput);
    expect(oldReplay.status).toBe(200);
    expect(oldReplay.body.data.duplicate).toBe(true);
    expect(oldReplay.body.data.workOrder).toBeNull();
    expect(oldReplay.body.data.awaitingCloseout).toBe(false);
    expect(mocks.recordCreate).toHaveBeenCalledTimes(2);
    expect(mocks.woCreate).toHaveBeenCalledTimes(1);
  });
});