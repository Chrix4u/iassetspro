import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { NextRequest } from 'next/server';

const mock = vi.hoisted(() => ({
  session: vi.fn(), scope: vi.fn(),
  points: vi.fn(), pointCount: vi.fn(),
  records: vi.fn(), recordCount: vi.fn(),
}));
vi.mock('@/lib/auth', () => ({
  getSession: mock.session, hasPermission: () => true, isAdmin: () => true,
}));
vi.mock('@/lib/plant-scope', () => ({
  getPlantScope: mock.scope, canAccessPlantStrict: () => true,
}));
vi.mock('@/lib/db', () => ({ db: {
  componentInspectionPoint: { findMany: mock.points, count: mock.pointCount },
  componentInspectionRecord: { findMany: mock.records, count: mock.recordCount },
} }));
import { GET as listPoints } from '@/app/api/pm-inspections/route';
import { GET as listExceptions } from '@/app/api/pm-inspections/exceptions/route';

const request = (path: string) => new NextRequest('http://localhost' + path);

describe('not measurable readings stay visible as follow-up, not failed equipment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.session.mockReturnValue({ userId: 'planner-1' });
    mock.scope.mockResolvedValue({ denyAccess: false, isSystemWide: true });
    mock.points.mockResolvedValue([]);
    mock.pointCount.mockResolvedValue(0);
    mock.records.mockResolvedValue([]);
    mock.recordCount.mockResolvedValue(0);
  });

  it('can find inspection checkpoints that have a recorded unavailable reading', async () => {
    const res = await listPoints(request('/api/pm-inspections?result=not_measured'));
    expect(res.status).toBe(200);
    expect(mock.points).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ records: { some: { result: 'not_measured' } } }),
    }));
    expect((await listPoints(request('/api/pm-inspections?result=unknown'))).status).toBe(400);
  });

  it('includes N/A follow-ups in the historical exception view, without labeling as failure', async () => {
    const res = await listExceptions(request('/api/pm-inspections/exceptions?result=not_measured'));
    expect(res.status).toBe(200);
    expect(mock.records).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ result: 'not_measured' }),
    }));
    await listExceptions(request('/api/pm-inspections/exceptions'));
    expect(mock.records).toHaveBeenLastCalledWith(expect.objectContaining({
      where: expect.objectContaining({ result: { in: expect.arrayContaining(['not_measured','fail']) } }),
    }));
  });

  it('shows an N/A and follow-up explanation rather than a fabricated zero or spurious WO', () => {
    const panel = readFileSync('src/components/modules/pm/PmInspectionExceptionsPanel.tsx','utf8');
    const list = readFileSync('src/components/modules/pm/PmInspectionWorksheetPanel.tsx','utf8');
    expect(panel).toContain('<SelectItem value="all">All findings</SelectItem>');
    expect(panel).toContain('N/A — no instrument reading taken');
    expect(panel).toContain('No corrective WO is generated solely because a measurement was unavailable.');
    expect(panel).toContain("notMeasured: rows.filter((row) => row.result === 'not_measured').length");
    expect(panel).toContain("row.result !== 'not_measured'");
    expect(list).toContain('<SelectItem value="not_measured">Not measurable — follow-up</SelectItem>');
  });
});
