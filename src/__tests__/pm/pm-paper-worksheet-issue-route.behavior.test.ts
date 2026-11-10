import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mock = vi.hoisted(() => ({
  session: vi.fn(), scope: vi.fn(), access: vi.fn(), asset: vi.fn(),
  findIssue: vi.fn(), createIssue: vi.fn(), assignments: vi.fn(), points: vi.fn(),
  records: vi.fn(), listIssues: vi.fn(), audit: vi.fn(), links: vi.fn(),
}));
vi.mock('@/lib/auth', () => ({
  getSession: mock.session, isAdmin: () => false, hasPermission: () => true,
}));
vi.mock('@/lib/plant-scope', () => ({
  getPlantScope: mock.scope, canAccessPlantStrict: mock.access,
}));
vi.mock('@/lib/db', () => ({ db: {
  asset: { findUnique: mock.asset },
  pmPaperWorksheetIssue: { findUnique: mock.findIssue, findMany: mock.listIssues },
  pmScheduleTask: { findMany: mock.assignments },
  componentInspectionPoint: { findMany: mock.points },
  pmInspectionTaskPoint: { findMany: mock.links },
  componentInspectionRecord: { findMany: mock.records },
  $transaction: (callback: (tx: unknown) => Promise<unknown>) => callback({
    pmPaperWorksheetIssue: { create: mock.createIssue },
    auditLog: { create: mock.audit },
  }),
} }));
import { POST, GET } from '@/app/api/pm-inspections/sheets/route';

const request = (body: Record<string, unknown>) => new NextRequest(
  'http://localhost/api/pm-inspections/sheets', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  },
);
const payload = {
  assetId: 'machine-1', equipmentState: 'running',
  requestKey: 'paper-issue-20261109-0001',
  taskIds: ['task-1'], pointIds: ['point-1', 'point-2'],
};

describe('issued paper worksheet: plant-authorized immutable scope', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.session.mockReturnValue({ userId: 'planner-1' });
    mock.scope.mockResolvedValue({ denyAccess: false, isScoped: true, plantId: 'plant-1' });
    mock.access.mockReturnValue(true);
    mock.asset.mockResolvedValue({ id: 'machine-1', plantId: 'plant-1', assetTag: 'C314' });
    mock.findIssue.mockResolvedValue(null);
    mock.links.mockResolvedValue([]);
    mock.assignments.mockResolvedValue([{
      id: 'task-1', pmTaskId: 'pm-1', componentId: 'part-1', component: { assetId: 'machine-1' },
    }]);
    mock.points.mockResolvedValue([
      { id: 'point-1', componentId: 'part-1', inspectionType: 'visual', parameterKey: null },
      { id: 'point-2', componentId: 'part-1', inspectionType: 'measurement', parameterKey: 'temperature' },
    ]);
    mock.createIssue.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: 'issue-1', issuedAt: new Date('2026-11-09T12:00:00Z'), ...data,
    }));
    mock.audit.mockResolvedValue({});
    mock.listIssues.mockResolvedValue([]);
    mock.records.mockResolvedValue([]);
  });
  it('issues one unique reference with the authorized task and point snapshot, and audits it', async () => {
    const result = await POST(request(payload));
    expect(result.status).toBe(201);
    const body = await result.json();
    expect(body.success).toBe(true);
    expect(body.data.reference).toMatch(/^IW-C314-\d{8}-[A-F0-9]{10}$/);
    expect(JSON.parse(body.data.pointIds)).toEqual(['point-1', 'point-2']);
    expect(mock.audit).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ entityType: 'pm_paper_worksheet_issue' }),
    }));
    mock.findIssue.mockResolvedValue(body.data);
    const replay = await POST(request(payload));
    expect(replay.status).toBe(200);
    expect((await replay.json()).duplicate).toBe(true);
    expect(mock.createIssue).toHaveBeenCalledTimes(1);
  });
  it('records the early field visit date and purpose without changing PM due dates', async () => {
    const early = { ...payload, equipmentState: 'standstill',
      plannedForDate: '2026-11-11', purpose: 'early_check' };
    const issued = await POST(request(early));
    expect(issued.status).toBe(201);
    expect((await issued.json()).data).toMatchObject({
      plannedForDate: '2026-11-11', purpose: 'early_check',
    });
    expect(mock.createIssue).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        plannedForDate: '2026-11-11', purpose: 'early_check',
      }),
    }));
    // Issuing paper must never update the PM schedule assignment.
    expect(mock.assignments).toHaveBeenCalledTimes(1);
  });
  it('rejects impossible field visit dates and unsupported purposes', async () => {
    expect((await POST(request({ ...payload, plannedForDate: '2026-02-30' }))).status).toBe(400);
    expect((await POST(request({ ...payload, purpose: 'condition_frequency' }))).status).toBe(400);
    expect(mock.createIssue).not.toHaveBeenCalled();
  });
  it('rejects a retry trying to re-purpose an issued field visit', async () => {
    const first = await POST(request({ ...payload, purpose: 'early_check' }));
    expect(first.status).toBe(201);
    mock.findIssue.mockResolvedValue((await first.json()).data);
    expect((await POST(request({ ...payload, purpose: 'routine' }))).status).toBe(409);
  });
  it('does not demand electronic entry of unconfigured printed inspection checks', async () => {
    mock.points.mockResolvedValue([
      { id: 'point-1', componentId: 'part-1', inspectionType: 'visual', parameterKey: null },
      { id: 'point-2', componentId: 'part-1', inspectionType: 'measurement', parameterKey: 'temperature' },
      { id: 'missing-param', componentId: 'part-1', inspectionType: 'measurement', parameterKey: null },
      { id: 'legacy', componentId: 'part-1', inspectionType: 'obsolete', parameterKey: null },
    ]);
    const response = await POST(request(payload));
    expect(response.status).toBe(201);
    const data = (await response.json()).data;
    expect(JSON.parse(data.pointIds)).toEqual(['point-1', 'point-2']);
  });
  it('rejects a tampered point list before issuing a paper reference', async () => {
    const result = await POST(request({ ...payload, pointIds: ['other-point'] }));
    expect(result.status).toBe(409);
    expect(mock.createIssue).not.toHaveBeenCalled();
  });
  it('rejects a changed retry payload using the same request key', async () => {
    mock.findIssue.mockResolvedValue({
      ...payload, issuedById: 'planner-1',
      issuedAt: new Date('2026-11-09T12:00:00Z'),
      plannedForDate: new Date().toISOString().slice(0, 10), purpose: 'routine',
      pointIds: JSON.stringify(['point-1', 'point-2']),
      taskIds: JSON.stringify(['task-1']),
    });
    expect((await POST(request({ ...payload, pointIds: ['forged'] }))).status).toBe(409);
    expect(mock.createIssue).not.toHaveBeenCalled();
  });
  it('rejects access to a different plant without disclosing the worksheet', async () => {
    mock.access.mockReturnValue(false);
    expect((await POST(request(payload))).status).toBe(403);
    expect(mock.findIssue).not.toHaveBeenCalled();
  });
  it('blocks ambiguous shared-part PM instructions until each task is mapped', async () => {
    mock.assignments.mockResolvedValue([
      { id: 'task-1', pmTaskId: 'pm-1', componentId: 'part-1', component: { assetId: 'machine-1' } },
      { id: 'task-2', pmTaskId: 'pm-2', componentId: 'part-1', component: { assetId: 'machine-1' } },
    ]);
    const result = await POST(request({ ...payload, taskIds: ['task-1', 'task-2'] }));
    expect(result.status).toBe(422);
    expect((await result.json()).error).toMatch(/exact check mapping/);
    expect(mock.createIssue).not.toHaveBeenCalled();
  });
  it('requires exact task/point pairs and snapshots the authorized mapping on issue', async () => {
    mock.assignments.mockResolvedValue([
      { id: 'task-1', pmTaskId: 'pm-1', componentId: 'part-1', component: { assetId: 'machine-1' } },
      { id: 'task-2', pmTaskId: 'pm-2', componentId: 'part-1', component: { assetId: 'machine-1' } },
    ]);
    mock.links.mockResolvedValue([
      { pmTaskId: 'pm-1', inspectionPointId: 'point-1' },
      { pmTaskId: 'pm-2', inspectionPointId: 'point-2' },
    ]);
    const taskIds = ['task-1', 'task-2'];
    const pairs = [
      { pmTaskId: 'pm-1', inspectionPointId: 'point-1' },
      { pmTaskId: 'pm-2', inspectionPointId: 'point-2' },
    ];
    expect((await POST(request({ ...payload, taskIds }))).status).toBe(409);
    expect((await POST(request({ ...payload, taskIds, taskPointLinks: [
      { pmTaskId: 'pm-2', inspectionPointId: 'point-1' }, pairs[0],
    ] }))).status).toBe(409);
    expect(mock.createIssue).not.toHaveBeenCalled();
    const result = await POST(request({ ...payload, taskIds, taskPointLinks: pairs }));
    expect(result.status).toBe(201);
    const record = (await result.json()).data;
    expect(JSON.parse(record.taskPointSnapshot)).toEqual(pairs);
    expect(JSON.parse(record.pointIds)).toEqual(['point-1', 'point-2']);
  });
  it('keeps unmeasurable readings distinct from completed measured results', async () => {
    mock.listIssues.mockResolvedValue([{
      ...payload, id: 'issue-2', reference: 'IW-C314-20261111-AABBCCDDEE',
      issuedById: 'planner-1', issuedAt: new Date(),
      plannedForDate: '2026-11-11', purpose: 'early_check',
      pointIds: JSON.stringify(payload.pointIds), taskIds: JSON.stringify(payload.taskIds),
    }]);
    mock.records.mockResolvedValue([
      { paperReference: 'IW-C314-20261111-AABBCCDDEE', inspectionPointId: 'point-1', result: 'pass' },
      { paperReference: 'IW-C314-20261111-AABBCCDDEE', inspectionPointId: 'point-2', result: 'not_measured' },
    ]);
    const res = await GET(new NextRequest(
      'http://localhost/api/pm-inspections/sheets?assetId=machine-1&equipmentState=running'));
    expect((await res.json()).data[0]).toMatchObject({
      plannedForDate: '2026-11-11', purpose: 'early_check',
      entered: 2, remaining: 0, followUpRequired: 1, status: 'needs_follow_up',
    });
  });
  it('counts only recorded points on the issued paper reference', async () => {
    mock.listIssues.mockResolvedValue([{
      ...payload, id: 'issue-1', reference: 'IW-C314-20261109-AABBCCDDEE',
      issuedById: 'planner-1', issuedAt: new Date(),
      pointIds: JSON.stringify(payload.pointIds), taskIds: JSON.stringify(payload.taskIds),
    }]);
    mock.records.mockResolvedValue([{
      paperReference: 'IW-C314-20261109-AABBCCDDEE', inspectionPointId: 'point-1',
    }]);
    const response = await GET(new NextRequest(
      'http://localhost/api/pm-inspections/sheets?assetId=machine-1&equipmentState=running'));
    expect(response.status).toBe(200);
    expect((await response.json()).data[0]).toMatchObject({
      expected: 2, entered: 1, remaining: 1, missingPointIds: ['point-2'], status: 'partial',
    });
  });
});
