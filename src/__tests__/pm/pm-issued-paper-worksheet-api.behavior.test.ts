import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  session: vi.fn(), scope: vi.fn(), allowed: vi.fn(),
  machine: vi.fn(), tasks: vi.fn(), points: vi.fn(),
  issueCreate: vi.fn(), auditCreate: vi.fn(),
}));
vi.mock('@/lib/auth', () => ({
  getSession: mocks.session, isAdmin: () => false, hasPermission: () => true,
}));
vi.mock('@/lib/plant-scope', () => ({
  getPlantScope: mocks.scope, canAccessPlantStrict: mocks.allowed,
}));
vi.mock('@/lib/db', () => ({
  db: {
    asset: { findUnique: mocks.machine },
    pmScheduleTask: { findMany: mocks.tasks },
    componentInspectionPoint: { findMany: mocks.points },
    $transaction: async (work: (tx: unknown) => Promise<unknown>) => work({
      pmInspectionWorksheetIssue: { create: mocks.issueCreate },
      auditLog: { create: mocks.auditCreate },
    }),
  },
}));
import { POST } from '@/app/api/pm-inspections/checklist/issue/route';

async function issueRequest(assetId = 'machine-1', equipmentState = 'running',
  expectedPointIds: string[] = ['temperature', 'vibration']) {
  const response = await POST(new NextRequest('http://localhost/api/pm-inspections/checklist/issue', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ assetId, equipmentState, expectedPointIds }),
  }));
  return { status: response.status, body: await response.json() };
}
describe('paper worksheet issuance API (mocked database)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockReturnValue({ userId: 'planner-1' });
    mocks.scope.mockResolvedValue({ denyAccess: false });
    mocks.allowed.mockReturnValue(true);
    mocks.machine.mockResolvedValue({ id: 'machine-1', plantId: 'plant-1' });
    mocks.tasks.mockResolvedValue([{ componentId: 'part-1', component: { assetId: 'machine-1' } }]);
    mocks.points.mockResolvedValue([{ id: 'vibration' }, { id: 'temperature' }]);
    mocks.issueCreate.mockImplementation(async ({ data }) => ({
      ...data, id: 'issue-1', issuedAt: new Date('2026-11-09T10:00:00Z'),
    }));
    mocks.auditCreate.mockResolvedValue({ id: 'audit-1' });
  });

  it('issues a unique source-bound machine sheet with its authorized inspection point snapshot', async () => {
    const result = await issueRequest();
    expect(result.status).toBe(201);
    expect(result.body.data.reference).toMatch(/^PMI-\d{8}-[0-9A-F]{16}$/);
    expect(mocks.issueCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        assetId: 'machine-1', plantId: 'plant-1', equipmentState: 'running',
        issuedById: 'planner-1', pointIds: ['temperature', 'vibration'],
      }),
    });
    expect(mocks.auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: 'planner-1', entityId: 'issue-1', plantId: 'plant-1' }),
    });
  });

  it('does not issue a sheet when unauthenticated, out of plant, malformed, or without tasks', async () => {
    mocks.session.mockReturnValueOnce(null);
    expect((await issueRequest()).status).toBe(401);
    mocks.allowed.mockReturnValueOnce(false);
    expect((await issueRequest()).status).toBe(403);
    expect((await issueRequest('machine-1', 'unknown')).status).toBe(400);
    mocks.tasks.mockResolvedValueOnce([]);
    expect((await issueRequest()).status).toBe(422);
    expect(mocks.issueCreate).not.toHaveBeenCalled();
  });

  it('rejects an old browser worksheet if the point configuration changed', async () => {
    const result = await issueRequest('machine-1', 'running', ['obsolete-point']);
    expect(result.status).toBe(409);
    expect(mocks.issueCreate).not.toHaveBeenCalled();
  });

  it('never authorizes an inspection point from another registered machine', async () => {
    mocks.tasks.mockResolvedValueOnce([
      { componentId: 'part-1', component: { assetId: 'machine-1' } },
      { componentId: 'other-part', component: { assetId: 'machine-2' } },
    ]);
    await issueRequest();
    expect(mocks.points).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ componentId: { in: ['part-1'] } }),
    }));
  });
});
