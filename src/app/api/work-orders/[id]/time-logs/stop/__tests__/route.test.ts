import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { mockDb, mockGetSession, mockIsAdmin, mockAuthorizeWorkOrderPlant } = vi.hoisted(() => ({
  mockDb: {
    workOrder: { findUnique: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(),
    workOrderTimeLog: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
      aggregate: vi.fn(),
    },
    auditLog: { create: vi.fn() },
  },
  mockGetSession: vi.fn(),
  mockIsAdmin: vi.fn(),
  mockAuthorizeWorkOrderPlant: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db: mockDb }));
vi.mock('@/lib/auth', () => ({
  getSession: mockGetSession,
  isAdmin: mockIsAdmin,
}));
vi.mock('@/lib/plant-auth-helpers', () => ({
  authorizeWorkOrderPlant: mockAuthorizeWorkOrderPlant,
}));

import { POST } from '../route';

const session = {
  userId: 'tech-1',
  fullName: 'Technician One',
  roles: ['maintenance_technician'],
  permissions: ['work_orders.update'],
};

function request(): NextRequest {
  return new NextRequest('http://localhost/api/work-orders/wo-1/time-logs/stop', {
    method: 'POST',
  });
}

function installTransaction() {
  mockDb.$transaction.mockImplementation(async (callback: (tx: typeof mockDb) => unknown) => callback(mockDb));
}

describe('POST /api/work-orders/[id]/time-logs/stop', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installTransaction();
    mockGetSession.mockReturnValue(session);
    mockIsAdmin.mockReturnValue(false);
    mockAuthorizeWorkOrderPlant.mockResolvedValue({ ok: true });
    mockDb.workOrder.findUnique.mockResolvedValue({
      id: 'wo-1',
      status: 'in_progress',
      isLocked: false,
      assignedTo: 'tech-1',
      teamLeaderId: null,
      teamMembers: [],
    });
    mockDb.workOrderTimeLog.findMany.mockResolvedValue([
      {
        id: 'log-1',
        workOrderId: 'wo-1',
        userId: 'tech-1',
        action: 'start',
        timestamp: new Date('2026-09-09T08:00:00.000Z'),
        startTime: new Date('2026-09-09T08:00:00.000Z'),
        endTime: null,
        duration: null,
        breakMinutes: 0,
        notes: null,
      },
    ]);
    mockDb.workOrderTimeLog.updateMany.mockResolvedValue({ count: 1 });
    mockDb.workOrderTimeLog.aggregate.mockResolvedValue({ _sum: { duration: 1.25 } });
    mockDb.workOrder.update.mockResolvedValue({ id: 'wo-1' });
    mockDb.auditLog.create.mockResolvedValue({ id: 'audit-1' });
  });

  it('refuses to extend a stale unclosed timer when the WO is no longer in progress', async () => {
    mockDb.workOrder.findUnique.mockResolvedValue({
      id: 'wo-1',
      status: 'on_hold',
      isLocked: false,
      assignedTo: 'tech-1',
      teamLeaderId: null,
      teamMembers: [],
    });

    const response = await POST(request(), { params: Promise.resolve({ id: 'wo-1' }) });
    const json = await response.json();

    expect(response.status).toBe(409);
    expect(json.error).toContain('Historical unclosed rows require reconciliation');
    expect(mockDb.$transaction).not.toHaveBeenCalled();
    expect(mockDb.workOrderTimeLog.updateMany).not.toHaveBeenCalled();
  });

  it('closes a genuine in-progress timer with a conditional endTime-null update', async () => {
    const response = await POST(request(), { params: Promise.resolve({ id: 'wo-1' }) });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.closedTimers).toBe(1);
    expect(json.data.actualHours).toBe(1.25);
    expect(mockDb.workOrderTimeLog.updateMany).toHaveBeenCalledWith({
      where: { id: 'log-1', endTime: null },
      data: expect.objectContaining({
        endTime: expect.any(Date),
        duration: expect.any(Number),
      }),
    });
    expect(mockDb.auditLog.create).toHaveBeenCalledTimes(1);
  });

  it('does not double-close a timer that another concurrent request already claimed', async () => {
    mockDb.workOrderTimeLog.updateMany.mockResolvedValue({ count: 0 });

    const response = await POST(request(), { params: Promise.resolve({ id: 'wo-1' }) });
    const json = await response.json();

    expect(response.status).toBe(409);
    expect(json.error).toContain('already stopped by another request');
    expect(mockDb.workOrderTimeLog.aggregate).not.toHaveBeenCalled();
    expect(mockDb.auditLog.create).not.toHaveBeenCalled();
  });
});
