import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  mockDb,
  mockGetSession,
  mockGetPlantScope,
  mockCanAccessPlantStrict,
} = vi.hoisted(() => ({
  mockDb: {
    $transaction: vi.fn(),
    shiftHandover: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
    auditLog: { create: vi.fn() },
  },
  mockGetSession: vi.fn(),
  mockGetPlantScope: vi.fn(),
  mockCanAccessPlantStrict: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db: mockDb }));
vi.mock('@/lib/auth', () => ({ getSession: mockGetSession }));
vi.mock('@/lib/plant-scope', () => ({
  getPlantScope: mockGetPlantScope,
  canAccessPlantStrict: mockCanAccessPlantStrict,
}));

import { POST } from '../route';

const receiverSession = {
  userId: 'tech-in',
  fullName: 'Incoming Technician',
  roles: ['maintenance_technician'],
  permissions: ['work_orders.update'],
};

const managerSession = {
  userId: 'manager-1',
  fullName: 'Maintenance Manager',
  roles: ['maintenance_manager'],
  permissions: ['work_orders.update'],
};

function request(): NextRequest {
  return new NextRequest('http://localhost/api/shift-handovers/handover-1/confirm', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
  });
}

function pendingHandover() {
  return {
    id: 'handover-1',
    status: 'pending',
    receivedById: 'tech-in',
    handedOverById: 'tech-out',
    workOrderId: 'wo-1',
    workOrder: {
      id: 'wo-1',
      plantId: 'plant-1',
      status: 'pending_handover',
    },
    handedOverBy: { id: 'tech-out' },
    receivedBy: { id: 'tech-in' },
  };
}

function confirmedHandover() {
  return {
    ...pendingHandover(),
    status: 'confirmed',
    handedOverBy: { id: 'tech-out', fullName: 'Outgoing Technician', username: 'tech.out' },
    receivedBy: { id: 'tech-in', fullName: 'Incoming Technician', username: 'tech.in' },
  };
}

describe('POST /api/shift-handovers/[id]/confirm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockReturnValue(receiverSession);
    mockGetPlantScope.mockResolvedValue({ denyAccess: false, plantIds: ['plant-1'] });
    mockCanAccessPlantStrict.mockReturnValue(true);
    mockDb.shiftHandover.findUnique
      .mockResolvedValueOnce(pendingHandover())
      .mockResolvedValueOnce(confirmedHandover());
    mockDb.shiftHandover.updateMany.mockResolvedValue({ count: 1 });
    mockDb.auditLog.create.mockResolvedValue({ id: 'audit-1' });
    mockDb.$transaction.mockImplementation(async (callback: (tx: typeof mockDb) => unknown) => callback(mockDb));
  });

  it('lets only the designated receiver atomically accept the handover', async () => {
    const response = await POST(request(), {
      params: Promise.resolve({ id: 'handover-1' }),
    });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.status).toBe('confirmed');

    expect(mockDb.shiftHandover.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'handover-1',
        status: 'pending',
        receivedById: 'tech-in',
      },
      data: { status: 'confirmed' },
    });

    expect(mockDb.auditLog.create).toHaveBeenCalledTimes(1);
    expect(mockDb.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'tech-in',
        action: 'shift_handover_confirm',
        entityType: 'shift_handover',
        entityId: 'handover-1',
      }),
    });
  });

  it('does not allow maintenance management to impersonate receiver acceptance', async () => {
    mockGetSession.mockReturnValue(managerSession);

    const response = await POST(request(), {
      params: Promise.resolve({ id: 'handover-1' }),
    });
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(json.error).toContain('designated handover receiver');
    expect(mockDb.$transaction).not.toHaveBeenCalled();
    expect(mockDb.shiftHandover.updateMany).not.toHaveBeenCalled();
    expect(mockDb.auditLog.create).not.toHaveBeenCalled();
  });

  it('returns 409 and does not double-audit when another confirmation wins the race', async () => {
    mockDb.shiftHandover.updateMany.mockResolvedValue({ count: 0 });

    const response = await POST(request(), {
      params: Promise.resolve({ id: 'handover-1' }),
    });
    const json = await response.json();

    expect(response.status).toBe(409);
    expect(json.error).toContain('already confirmed or is no longer pending');
    expect(mockDb.auditLog.create).not.toHaveBeenCalled();
  });
});
