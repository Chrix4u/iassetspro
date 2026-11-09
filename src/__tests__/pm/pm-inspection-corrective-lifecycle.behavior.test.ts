import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(), getScope: vi.fn(), access: vi.fn(),
  pointFind: vi.fn(), pointUpdate: vi.fn(),
  recordFind: vi.fn(), recordFindFirst: vi.fn(), recordCreate: vi.fn(), recordUpdate: vi.fn(),
  readingCreate: vi.fn(), woFindMany: vi.fn(), woCreate: vi.fn(),
  componentUpsert: vi.fn(), auditCreate: vi.fn(), lock: vi.fn(), plannerFind: vi.fn(), worksheetFind: vi.fn(),
}));
vi.mock('@/lib/auth', () => ({ getSession: mocks.getSession, isAdmin: () => false, hasPermission: () => true }));
vi.mock('@/lib/plant-scope', () => ({ getPlantScope: mocks.getScope, canAccessPlantStrict: mocks.access }));
vi.mock('@/lib/functional-location/live-location', () => ({ getAssetLiveLocationMap: async () => new Map() }));
vi.mock('@/lib/functional-location/maintenance-snapshot', () => ({ buildMaintenanceLocationSnapshot: () => ({}) }));

function tx() {
  return {
    $executeRawUnsafe: mocks.lock,
    userPlant: { findFirst: mocks.plannerFind },
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
  pmInspectionWorksheetIssue: { findUnique: mocks.worksheetFind },
  $transaction: async (callback: (client: ReturnType<typeof tx>) => unknown) => callback(tx()),
} }));

import { POST } from '@/app/api/pm-inspections/[pointId]/records/route';
import { advanceClosedInspectionPoint } from '@/services/pm/advanceClosedInspectionPoint.service';

interface RecordState {
  id: string; inspectionPointId: string; inspectorId: string; inspectedAt: Date;
  workOrderId: string | null; requestKey: string | null; result: string;
  value: string | null; findings: string | null; recommendation: string | null;
  equipmentState?: string | null;
  captureSource?: 'paper' | 'digital' | null;
  fieldInspectedAt?: Date | null;
  fieldInspectorName?: string | null;
  paperReference?: string | null;
}
interface Wo { id: string; woNumber: string; status: string; type: 'corrective'; plannerId: string | null }
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
    mocks.plannerFind.mockResolvedValue({ userId: 'plant-planner-1' });
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
    mocks.woCreate.mockImplementation(async (args: { data: { woNumber: string; status: string; plannerId: string | null } }) => {
      const wo: Wo = { id: 'wo-' + (orders.size + 1), woNumber: args.data.woNumber, status: args.data.status, type: 'corrective', plannerId: args.data.plannerId };
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

  it('records the exact selected operating state and rejects invalid state before any write', async () => {
    const running = await submit({
      requestKey: 'record-state-running-0001',
      outcome: 'pass', value: '55', equipmentState: 'running',
    });
    expect(running.status).toBe(201);
    expect(running.body.data.record.equipmentState).toBe('running');
    expect(records[0].equipmentState).toBe('running');

    const same = await submit({
      requestKey: 'record-state-running-0001',
      outcome: 'pass', value: '55', equipmentState: 'running',
    });
    expect(same.status).toBe(200);
    expect(same.body.data.duplicate).toBe(true);

    const changed = await submit({
      requestKey: 'record-state-running-0001',
      outcome: 'pass', value: '55', equipmentState: 'standstill',
    });
    expect(changed.status).toBe(409);
    expect(records).toHaveLength(1);

    const invalid = await submit({
      requestKey: 'record-state-invalid-0001',
      outcome: 'pass', value: '55', equipmentState: 'moving',
    });
    expect(invalid.status).toBe(400);
    expect(records).toHaveLength(1);
    expect(mocks.woCreate).not.toHaveBeenCalled();
  });

  it('preserves NULL for readings made through legacy worksheets', async () => {
    const result = await submit({ outcome: 'pass', value: '60' });
    expect(result.status).toBe(201);
    expect(result.body.data.record.equipmentState).toBeNull();
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
    expect(orders.get(failed.body.data.workOrder.id)?.plannerId).toBe('plant-planner-1');
    expect(mocks.plannerFind).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ plantId: 'plant-1', accessLevel: { in: ['write', 'admin'] } }),
    }));
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

  it('transcribes paper evidence without replacing the authenticated entering user', async () => {
    const fieldInspectedAt = new Date(Date.now() - 2 * 3_600_000).toISOString();
    const payload = {
      requestKey: 'paper-record-20261109-0001', outcome: 'pass', value: '55',
      equipmentState: 'running', captureSource: 'paper',
      fieldInspectedAt, fieldInspectorName: 'Ama Mensah',
      paperReference: 'C314-P267-20261109',
    };
    const entered = await submit(payload);
    expect(entered.status).toBe(201);
    expect(records).toHaveLength(1);
    expect(records[0].inspectorId).toBe('technician-1');
    expect(records[0].captureSource).toBe('paper');
    expect(records[0].fieldInspectedAt?.toISOString()).toBe(fieldInspectedAt);
    expect(records[0].fieldInspectorName).toBe('Ama Mensah');
    expect(records[0].paperReference).toBe('C314-P267-20261109');
    expect(records[0].inspectedAt.getTime()).toBeGreaterThan(new Date(fieldInspectedAt).getTime());
    expect(mocks.readingCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ recordedAt: new Date(fieldInspectedAt), recordedById: 'technician-1' }),
    }));
    const next = new Date(fieldInspectedAt);
    next.setDate(next.getDate() + 7);
    expect(point.nextInspection.toISOString()).toBe(next.toISOString());
    const retry = await submit(payload);
    expect(retry.status).toBe(200);
    expect(retry.body.data.duplicate).toBe(true);
    for (const patch of [
      { fieldInspectorName: 'Another Person' },
      { fieldInspectedAt: new Date(Date.now() - 3_600_000).toISOString() },
      { paperReference: 'Other-Paper' },
    ]) expect((await submit({ ...payload, ...patch })).status).toBe(409);
    expect((await submit({
      requestKey: payload.requestKey, outcome: 'pass', value: '55',
      equipmentState: 'running', captureSource: 'digital',
    })).status).toBe(409);
    expect((await submit({ ...payload, captureSource: 'digital' })).status).toBe(400);
    expect(records).toHaveLength(1);
    expect(mocks.recordCreate).toHaveBeenCalledOnce();
  });

  it('validates registered paper sheet against machine, operating state and point before recording', async () => {
    const reference = 'PMI-20261109-0123456789ABCDEF';
    const fieldInspectedAt = new Date(Date.now() - 20 * 60_000);
    mocks.worksheetFind.mockResolvedValue({
      reference, assetId: 'machine-1', plantId: 'plant-1',
      equipmentState: 'running', pointIds: ['temperature-point'],
      issuedAt: new Date(fieldInspectedAt.getTime() - 10 * 60_000),
    });
    const payload = {
      requestKey: 'pm-issued-reading-00001', outcome: 'pass', value: '55',
      equipmentState: 'running', captureSource: 'paper',
      fieldInspectedAt: fieldInspectedAt.toISOString(), fieldInspectorName: 'Ama Mensah',
      paperReference: reference,
    };
    const valid = await submit(payload);
    expect(valid.status).toBe(201);
    expect(records).toHaveLength(1);
    expect(mocks.worksheetFind).toHaveBeenCalledWith({ where: { reference } });
    const oldCount = records.length;
    expect((await submit({ ...payload, requestKey: 'pm-mismatch-state-01',
      equipmentState: 'standstill' })).status).toBe(400);
    mocks.worksheetFind.mockResolvedValue({ reference, assetId: 'machine-2', plantId: 'plant-1',
      equipmentState: 'running', pointIds: ['temperature-point'],
      issuedAt: new Date(fieldInspectedAt.getTime() - 10 * 60_000) });
    expect((await submit({ ...payload, requestKey: 'pm-mismatch-machine01' })).status).toBe(400);
    expect((await submit({ ...payload, requestKey: 'pm-fake-ref-00001',
      paperReference: 'PMI-20261109-INVALID' })).status).toBe(400);
    expect(records).toHaveLength(oldCount);
  });

  it('rejects missing paper source details or future field dates before any write', async () => {
    const base = {
      requestKey: 'paper-invalid-20261109', outcome: 'pass', value: '55',
      captureSource: 'paper', fieldInspectorName: 'Ama Mensah',
      paperReference: 'C314-P267', fieldInspectedAt: new Date(Date.now() - 3_600_000).toISOString(),
    };
    for (const patch of [
      { fieldInspectorName: '' }, { paperReference: '' },
      { fieldInspectedAt: new Date(Date.now() + 3_600_000).toISOString() },
    ]) expect((await submit({ ...base, ...patch })).status).toBe(400);
    expect(records).toHaveLength(0);
    expect(mocks.woCreate).not.toHaveBeenCalled();
    expect(mocks.readingCreate).not.toHaveBeenCalled();
  });

  it('does not reset a newer due cycle when an older paper PASS is transcribed', async () => {
    const recent = new Date(Date.now() - 3_600_000);
    point.lastInspected = recent;
    const originalDue = point.nextInspection.toISOString();
    const fieldInspectedAt = new Date(Date.now() - 3 * 86_400_000).toISOString();
    const result = await submit({
      requestKey: 'paper-old-reading-0001', outcome: 'pass', value: '50',
      captureSource: 'paper', fieldInspectedAt,
      fieldInspectorName: 'Ama Mensah', paperReference: 'C314-P267',
    });
    expect(result.status).toBe(201);
    expect(point.lastInspected).toEqual(recent);
    expect(point.nextInspection.toISOString()).toBe(originalDue);
    expect(mocks.pointUpdate).not.toHaveBeenCalled();
    expect(records).toHaveLength(1);
  });

  it('does not shorten next due after a newer verified closeout when a late paper PASS arrives', async () => {
    const observed = new Date(Date.now() - 2 * 86_400_000);
    point.lastInspected = new Date(Date.now() - 12 * 86_400_000);
    point.nextInspection = new Date(Date.now() + 25 * 86_400_000);
    const due = point.nextInspection.toISOString();
    const result = await submit({
      requestKey: 'paper-verified-safe-2026', outcome: 'pass', value: '50',
      captureSource: 'paper', fieldInspectedAt: observed.toISOString(),
      fieldInspectorName: 'Ama Mensah', paperReference: 'C314-P267',
    });
    expect(result.status).toBe(201);
    expect(point.lastInspected).toEqual(observed);
    expect(point.nextInspection.toISOString()).toBe(due);
  });

  it('keeps abnormal paper evidence in a corrective draft WO and leaves next due untouched', async () => {
    const due = point.nextInspection.toISOString();
    const result = await submit({
      requestKey: 'paper-defect-20261109', outcome: 'fail', value: '120',
      equipmentState: 'running', captureSource: 'paper',
      fieldInspectedAt: new Date(Date.now() - 2 * 3_600_000).toISOString(),
      fieldInspectorName: 'Ama Mensah', paperReference: 'C314-P267',
    });
    expect(result.status).toBe(201);
    expect(result.body.data.workOrder.status).toBe('draft');
    expect(point.nextInspection.toISOString()).toBe(due);
    expect(mocks.woCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ description: expect.stringContaining('Paper worksheet C314-P267') }),
    }));
  });
});
