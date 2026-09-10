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
  userId: 'planner-1',
  fullName: 'Planner One',
  roles: ['planner'],
  permissions: ['reports.view'],
};

function request(query = ''): NextRequest {
  return new NextRequest(`http://localhost/api/reports/maintenance${query ? `?${query}` : ''}`);
}

describe('GET /api/reports/maintenance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockReturnValue(session);
    mockHasAnyPermission.mockReturnValue(true);
    mockIsAdmin.mockReturnValue(false);
    mockGetPlantScope.mockResolvedValue({ isScoped: true, plantIds: ['plant-a'] });
    mockGetPlantFilterWhere.mockReturnValue({ plantId: 'plant-a' });
    mockDb.workOrder.findMany.mockResolvedValue([]);
    mockDb.maintenanceRequest.findMany.mockResolvedValue([]);
    mockDb.asset.findMany.mockResolvedValue([]);
    mockDb.inventoryItem.findMany.mockResolvedValue([]);
  });

  it('returns 401 without an authenticated session', async () => {
    mockGetSession.mockReturnValue(null);

    const response = await GET(request());

    expect(response.status).toBe(401);
    expect(mockGetPlantScope).not.toHaveBeenCalled();
    expect(mockDb.workOrder.findMany).not.toHaveBeenCalled();
  });

  it('returns 403 when the actor has no report or analytics permission', async () => {
    mockHasAnyPermission.mockReturnValue(false);
    mockIsAdmin.mockReturnValue(false);

    const response = await GET(request());

    expect(response.status).toBe(403);
    expect(mockGetPlantScope).not.toHaveBeenCalled();
    expect(mockDb.workOrder.findMany).not.toHaveBeenCalled();
  });

  it('preserves the authenticated plant scope when a scoped user supplies another plantId', async () => {
    const response = await GET(request('plantId=plant-b&departmentId=dept-1'));

    expect(response.status).toBe(200);
    expect(mockDb.workOrder.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        plantId: 'plant-a',
        departmentId: 'dept-1',
      }),
    }));
    expect(mockDb.maintenanceRequest.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        plantId: 'plant-a',
        departmentId: 'dept-1',
      }),
    }));
  });

  it('allows an unscoped admin/report actor to request one explicit plant', async () => {
    mockGetPlantScope.mockResolvedValue({ isScoped: false, plantIds: [] });
    mockGetPlantFilterWhere.mockReturnValue({});

    const response = await GET(request('plantId=plant-b'));

    expect(response.status).toBe(200);
    expect(mockDb.workOrder.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ plantId: 'plant-b' }),
    }));
    expect(mockDb.maintenanceRequest.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ plantId: 'plant-b' }),
    }));
  });

  it('applies repairs-only and date filters to work orders without leaking WO-only fields into maintenance requests', async () => {
    const response = await GET(request('moduleFilter=repairs&startDate=2026-09-01&endDate=2026-09-09'));

    expect(response.status).toBe(200);
    expect(mockDb.workOrder.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        plantId: 'plant-a',
        type: { in: ['corrective', 'emergency'] },
        createdAt: {
          gte: new Date('2026-09-01T00:00:00'),
          lte: new Date('2026-09-09T23:59:59'),
        },
      }),
    }));

    const mrCall = mockDb.maintenanceRequest.findMany.mock.calls[0]?.[0];
    expect(mrCall.where).toMatchObject({
      plantId: 'plant-a',
      createdAt: {
        gte: new Date('2026-09-01T00:00:00'),
        lte: new Date('2026-09-09T23:59:59'),
      },
    });
    expect(mrCall.where).not.toHaveProperty('type');
  });

  it('applies the preventive-only module filter for PM reporting', async () => {
    const response = await GET(request('moduleFilter=pm'));

    expect(response.status).toBe(200);
    expect(mockDb.workOrder.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        plantId: 'plant-a',
        type: 'preventive',
      }),
    }));
  });
});
