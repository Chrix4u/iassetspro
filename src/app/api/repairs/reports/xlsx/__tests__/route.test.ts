import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  mockGetSession,
  mockHasAnyPermission,
  mockIsAdmin,
  mockGetPlantScope,
  mockCanAccessPlant,
  mockGenerateRepairsReport,
} = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockHasAnyPermission: vi.fn(),
  mockIsAdmin: vi.fn(),
  mockGetPlantScope: vi.fn(),
  mockCanAccessPlant: vi.fn(),
  mockGenerateRepairsReport: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  getSession: mockGetSession,
  hasAnyPermission: mockHasAnyPermission,
  isAdmin: mockIsAdmin,
}));
vi.mock('@/lib/plant-scope', () => ({
  getPlantScope: mockGetPlantScope,
  canAccessPlant: mockCanAccessPlant,
}));
vi.mock('@/services/repairsReportXlsx.service', () => ({
  SUPPORTED_REPORT_TYPES: ['work-order', 'maintenance-request', 'operations-summary', 'asset-history', 'department-cost'],
}));
vi.mock('@/services/repairsReportXlsxSafe.service', () => ({
  generateRepairsReport: mockGenerateRepairsReport,
}));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), error: vi.fn() }),
}));

import { POST } from '../route';

const session = {
  userId: 'planner-1',
  fullName: 'Planner One',
  roles: ['maintenance_planner'],
  permissions: ['reports.export'],
};

function request(body: Record<string, unknown>, plantHeader?: string): NextRequest {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (plantHeader) headers.set('X-Plant-ID', plantHeader);
  return new NextRequest('http://localhost/api/repairs/reports/xlsx', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

describe('POST /api/repairs/reports/xlsx', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockReturnValue(session);
    mockHasAnyPermission.mockReturnValue(true);
    mockIsAdmin.mockReturnValue(false);
    mockGetPlantScope.mockResolvedValue({
      plantId: 'plant-a',
      accessiblePlantIds: ['plant-a'],
      isScoped: true,
      isSystemWide: false,
      accessLevel: 'write',
    });
    mockCanAccessPlant.mockReturnValue(true);
    mockGenerateRepairsReport.mockResolvedValue({
      buffer: Buffer.from('xlsx-bytes'),
      filename: 'work-order-report.xlsx',
    });
  });

  it('requires authentication', async () => {
    mockGetSession.mockReturnValue(null);

    const response = await POST(request({ reportType: 'work-order' }));

    expect(response.status).toBe(401);
    expect(mockGenerateRepairsReport).not.toHaveBeenCalled();
  });

  it('requires reports.export and does not accept view-only access', async () => {
    mockHasAnyPermission.mockReturnValue(false);

    const response = await POST(request({ reportType: 'work-order' }));
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(json.error).toContain('reports.export');
    expect(mockGetPlantScope).not.toHaveBeenCalled();
    expect(mockGenerateRepairsReport).not.toHaveBeenCalled();
  });

  it('prevents body filters from overriding the active plant scope', async () => {
    const response = await POST(request({
      reportType: 'work-order',
      filters: { plantId: 'plant-b' },
    }, 'plant-a'));

    expect(response.status).toBe(403);
    expect(mockGenerateRepairsReport).not.toHaveBeenCalled();
  });

  it('fails closed for an ordinary multi-plant user who omits plant selection', async () => {
    mockGetPlantScope.mockResolvedValue({
      plantId: null,
      accessiblePlantIds: ['plant-a', 'plant-b'],
      isScoped: false,
      isSystemWide: false,
      accessLevel: null,
    });

    const response = await POST(request({ reportType: 'work-order' }));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toContain('Select one of your accessible plants');
    expect(mockGenerateRepairsReport).not.toHaveBeenCalled();
  });

  it('passes the server-authoritative active plant to the generator and disables caching', async () => {
    const response = await POST(request({
      reportType: 'work-order',
      filters: { status: 'closed' },
    }, 'plant-a'));

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('content-type')).toContain('spreadsheetml.sheet');
    expect(mockGenerateRepairsReport).toHaveBeenCalledWith(
      'work-order',
      expect.objectContaining({ plantId: 'plant-a', status: 'closed' }),
      session,
    );
  });

  it('accepts the extended operational report pack and preserves repairs scope filters', async () => {
    mockGenerateRepairsReport.mockResolvedValue({
      buffer: Buffer.from('xlsx-bytes'),
      filename: 'asset-repair-history.xlsx',
    });

    const response = await POST(request({
      reportType: 'asset-history',
      filters: {
        dateFrom: '2026-09-01',
        dateTo: '2026-09-30',
        maintenanceScope: 'repairs',
      },
    }, 'plant-a'));

    expect(response.status).toBe(200);
    expect(mockGenerateRepairsReport).toHaveBeenCalledWith(
      'asset-history',
      expect.objectContaining({
        plantId: 'plant-a',
        dateFrom: '2026-09-01',
        dateTo: '2026-09-30',
        maintenanceScope: 'repairs',
      }),
      session,
    );
  });

});
