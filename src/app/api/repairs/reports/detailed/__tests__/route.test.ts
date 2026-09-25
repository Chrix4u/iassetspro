import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  mockDb,
  mockGetSession,
  mockHasPermission,
  mockIsAdmin,
  mockGetPlantScope,
  mockCanAccessPlant,
  mockApplyPlantScope,
} = vi.hoisted(() => ({
  mockDb: {
    workOrder: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
    asset: {
      findMany: vi.fn(),
    },
  },
  mockGetSession: vi.fn(),
  mockHasPermission: vi.fn(),
  mockIsAdmin: vi.fn(),
  mockGetPlantScope: vi.fn(),
  mockCanAccessPlant: vi.fn(),
  mockApplyPlantScope: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db: mockDb }));
vi.mock('@/lib/auth', () => ({
  getSession: mockGetSession,
  hasPermission: mockHasPermission,
  isAdmin: mockIsAdmin,
}));
vi.mock('@/lib/plant-scope', () => ({
  getPlantScope: mockGetPlantScope,
  canAccessPlant: mockCanAccessPlant,
  applyPlantScope: mockApplyPlantScope,
}));

import { GET } from '../route';

const session = {
  userId: 'planner-1',
  fullName: 'Planner One',
  roles: ['maintenance_planner'],
  permissions: ['reports.view', 'reports.export'],
};

function request(query = ''): NextRequest {
  return new NextRequest(`http://localhost/api/repairs/reports/detailed${query}`);
}

describe('GET /api/repairs/reports/detailed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockReturnValue(session);
    mockIsAdmin.mockReturnValue(false);
    mockHasPermission.mockImplementation((_session: unknown, permission: string) =>
      permission === 'reports.view' || permission === 'reports.export'
    );
    mockGetPlantScope.mockResolvedValue({
      plantId: 'plant-a',
      accessiblePlantIds: ['plant-a'],
      isScoped: true,
      isSystemWide: false,
      accessLevel: 'write',
      denyAccess: false,
    });
    mockCanAccessPlant.mockReturnValue(true);
    mockDb.workOrder.count.mockResolvedValue(0);
    mockDb.workOrder.findMany.mockResolvedValue([]);
    mockDb.asset.findMany.mockResolvedValue([]);
  });

  it('applies plant, department, date, completed-state and repairs-only scope to the detailed report', async () => {
    const response = await GET(request(
      '?departmentId=dept-a&dateFrom=2026-09-01&dateTo=2026-09-30'
    ));

    expect(response.status).toBe(200);
    expect(mockDb.workOrder.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        plantId: 'plant-a',
        departmentId: 'dept-a',
        type: { in: ['corrective', 'emergency', 'predictive'] },
        status: { in: ['completed', 'verified', 'closed'] },
        createdAt: expect.objectContaining({
          gte: expect.any(Date),
          lte: expect.any(Date),
        }),
      }),
    });
    expect(mockDb.workOrder.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        plantId: 'plant-a',
        departmentId: 'dept-a',
        type: { in: ['corrective', 'emergency', 'predictive'] },
      }),
      skip: 0,
      take: 50,
    }));
  });

  it('requires reports.export for XLSX downloads even when reports.view is granted', async () => {
    mockHasPermission.mockImplementation((_session: unknown, permission: string) =>
      permission === 'reports.view'
    );

    const response = await GET(request('?format=xlsx'));
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(json.error).toContain('reports.export');
    expect(mockDb.workOrder.findMany).not.toHaveBeenCalled();
  });

  it('rejects a query-string plant that conflicts with the active scoped plant', async () => {
    const response = await GET(request('?plantId=plant-b'));
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(json.error).toBe('Forbidden');
    expect(mockDb.workOrder.findMany).not.toHaveBeenCalled();
  });
});
