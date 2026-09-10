import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  mockDb,
  mockGetSession,
  mockHasPermission,
  mockIsAdmin,
  mockGetPlantScope,
} = vi.hoisted(() => ({
  mockDb: {
    shiftHandover: {
      create: vi.fn(),
    },
    auditLog: { create: vi.fn() },
  },
  mockGetSession: vi.fn(),
  mockHasPermission: vi.fn(),
  mockIsAdmin: vi.fn(),
  mockGetPlantScope: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db: mockDb }));
vi.mock('@/lib/auth', () => ({
  getSession: mockGetSession,
  hasPermission: mockHasPermission,
  isAdmin: mockIsAdmin,
}));
vi.mock('@/lib/plant-scope', () => ({
  getPlantScope: mockGetPlantScope,
}));

import { POST } from '../route';

const session = {
  userId: 'tech-1',
  fullName: 'Technician One',
  roles: ['maintenance_technician'],
  permissions: ['shift_handovers.create'],
};

function request(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/shift-handovers', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/shift-handovers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockReturnValue(session);
    mockHasPermission.mockReturnValue(true);
    mockIsAdmin.mockReturnValue(false);
    mockGetPlantScope.mockResolvedValue({
      denyAccess: false,
      isSystemWide: false,
      isScoped: true,
      plantId: 'plant-1',
      accessiblePlantIds: ['plant-1'],
    });
  });

  it('rejects work-order-linked creation so canonical lifecycle cannot be bypassed', async () => {
    const response = await POST(request({
      workOrderId: 'wo-1',
      shiftType: 'night',
      receivedById: 'tech-2',
      notes: 'Legacy linked handover attempt',
    }));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toContain('/api/work-orders/[id]/handover');
    expect(mockDb.shiftHandover.create).not.toHaveBeenCalled();
    expect(mockDb.auditLog.create).not.toHaveBeenCalled();
  });
});
