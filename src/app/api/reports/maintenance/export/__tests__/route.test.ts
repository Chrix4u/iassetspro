import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  mockDb,
  mockGetSession,
  mockHasAnyPermission,
  mockIsAdmin,
  mockGetPlantScope,
  mockGetPlantFilterWhere,
} = vi.hoisted(() => ({
  mockDb: {
    workOrder: { findMany: vi.fn() },
    maintenanceRequest: { findMany: vi.fn() },
    asset: { findMany: vi.fn() },
    inventoryItem: { findMany: vi.fn() },
  },
  mockGetSession: vi.fn(),
  mockHasAnyPermission: vi.fn(),
  mockIsAdmin: vi.fn(),
  mockGetPlantScope: vi.fn(),
  mockGetPlantFilterWhere: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db: mockDb }));
vi.mock('@/lib/auth', () => ({
  getSession: mockGetSession,
  hasAnyPermission: mockHasAnyPermission,
  isAdmin: mockIsAdmin,
}));
vi.mock('@/lib/plant-scope', () => ({
  getPlantScope: mockGetPlantScope,
  getPlantFilterWhere: mockGetPlantFilterWhere,
}));

import { GET } from '../route';

const session = {
  userId: 'reporter-1',
  fullName: 'Report Exporter',
  roles: ['planner'],
  permissions: ['reports.export'],
};

function request(format = 'xlsx'): NextRequest {
  return new NextRequest(
    `http://localhost/api/reports/maintenance/export?format=${format}&startDate=2026-09-01&endDate=2026-09-09&moduleFilter=repairs`,
  );
}

describe('GET /api/reports/maintenance/export', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockReturnValue(session);
    mockHasAnyPermission.mockImplementation((_session: unknown, permissions: string[]) =>
      permissions.some(permission => permission === 'reports.export' || permission === 'reports.view'),
    );
    mockIsAdmin.mockReturnValue(false);
    mockGetPlantScope.mockResolvedValue({ isScoped: true, plantIds: ['plant-a'] });
    mockGetPlantFilterWhere.mockReturnValue({ plantId: 'plant-a' });
    mockDb.workOrder.findMany.mockResolvedValue([]);
    mockDb.maintenanceRequest.findMany.mockResolvedValue([]);
    mockDb.asset.findMany.mockResolvedValue([]);
    mockDb.inventoryItem.findMany.mockResolvedValue([]);
  });

  it('requires authentication', async () => {
    mockGetSession.mockReturnValue(null);

    const response = await GET(request('csv'));

    expect(response.status).toBe(401);
    expect(mockDb.workOrder.findMany).not.toHaveBeenCalled();
  });

  it('requires reports.export even when ordinary reporting could otherwise be viewed', async () => {
    mockHasAnyPermission.mockImplementation((_session: unknown, permissions: string[]) =>
      permissions.includes('reports.view'),
    );

    const response = await GET(request('csv'));

    expect(response.status).toBe(403);
    expect(mockDb.workOrder.findMany).not.toHaveBeenCalled();
  });

  it('rejects unsupported export formats before querying report data', async () => {
    const response = await GET(request('pdf'));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toContain('xlsx or csv');
    expect(mockDb.workOrder.findMany).not.toHaveBeenCalled();
  });

  it('returns an Excel-compatible UTF-8 CSV with a scoped filename', async () => {
    const response = await GET(request('csv'));
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/csv');
    expect(response.headers.get('content-disposition')).toContain(
      'maintenance-report-repairs-2026-09-01-to-2026-09-09.csv',
    );
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(text.charCodeAt(0)).toBe(0xfeff);
    expect(text).toContain('WO Number');
    expect(mockDb.workOrder.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        plantId: 'plant-a',
        type: { in: ['corrective', 'emergency'] },
      }),
    }));
  });

  it('returns a real XLSX workbook payload and never marks it cacheable', async () => {
    const response = await GET(request('xlsx'));
    const bytes = new Uint8Array(await response.arrayBuffer());

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect(response.headers.get('content-disposition')).toContain('.xlsx');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(bytes.length).toBeGreaterThan(100);
    expect(String.fromCharCode(bytes[0], bytes[1])).toBe('PK');
  });
});
