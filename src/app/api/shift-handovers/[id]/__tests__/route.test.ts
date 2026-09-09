import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  mockDb,
  mockGetSession,
  mockHasPermission,
  mockIsAdmin,
  mockGetPlantScope,
  mockCanAccessPlantStrict,
} = vi.hoisted(() => ({
  mockDb: {
    shiftHandover: {
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    auditLog: { create: vi.fn() },
  },
  mockGetSession: vi.fn(),
  mockHasPermission: vi.fn(),
  mockIsAdmin: vi.fn(),
  mockGetPlantScope: vi.fn(),
  mockCanAccessPlantStrict: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db: mockDb }));
vi.mock('@/lib/auth', () => ({
  getSession: mockGetSession,
  hasPermission: mockHasPermission,
  isAdmin: mockIsAdmin,
}));
vi.mock('@/lib/plant-scope', () => ({
  getPlantScope: mockGetPlantScope,
  canAccessPlantStrict: mockCanAccessPlantStrict,
}));

import { DELETE, PUT } from '../route';

const adminSession = {
  userId: 'admin-1',
  fullName: 'Admin One',
  roles: ['admin'],
  permissions: ['shift_handovers.create'],
};

function linkedPendingHandover() {
  return {
    id: 'handover-1',
    status: 'pending',
    shiftType: 'night',
    workOrderId: 'wo-1',
    receivedById: 'tech-in',
    workOrder: { plantId: 'plant-1' },
  };
}

function putRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/shift-handovers/handover-1', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function deleteRequest(): NextRequest {
  return new NextRequest('http://localhost/api/shift-handovers/handover-1', {
    method: 'DELETE',
  });
}

describe('/api/shift-handovers/[id] canonical WO handover protection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockReturnValue(adminSession);
    mockHasPermission.mockReturnValue(true);
    mockIsAdmin.mockReturnValue(true);
    mockGetPlantScope.mockResolvedValue({ denyAccess: false });
    mockCanAccessPlantStrict.mockReturnValue(true);
    mockDb.shiftHandover.findUnique.mockResolvedValue(linkedPendingHandover());
  });

  it('blocks generic receiver edits for work-order-linked handovers', async () => {
    const response = await PUT(putRequest({ receivedById: 'tech-other' }), {
      params: Promise.resolve({ id: 'handover-1' }),
    });
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toContain('cannot be edited through the generic handover endpoint');
    expect(mockDb.shiftHandover.update).not.toHaveBeenCalled();
    expect(mockDb.auditLog.create).not.toHaveBeenCalled();
  });

  it('blocks even admin deletion of a pending work-order-linked handover', async () => {
    const response = await DELETE(deleteRequest(), {
      params: Promise.resolve({ id: 'handover-1' }),
    });
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toContain('cannot be deleted through the generic handover endpoint');
    expect(mockDb.shiftHandover.delete).not.toHaveBeenCalled();
    expect(mockDb.auditLog.create).not.toHaveBeenCalled();
  });
});
