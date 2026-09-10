import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  mockDb,
  mockGetSession,
  mockHasPermission,
  mockIsAdmin,
  mockNotifyUser,
  mockExecuteTransition,
  mockAuthorizeWorkOrderPlant,
  mockCloseAllActiveWorkSessions,
  mockBuildAuditData,
} = vi.hoisted(() => ({
  mockDb: {
    $transaction: vi.fn(),
    workOrder: { findUnique: vi.fn() },
    workOrderTeamMember: { findMany: vi.fn() },
    maintenanceRequest: { findUnique: vi.fn() },
    auditLog: { create: vi.fn() },
  },
  mockGetSession: vi.fn(),
  mockHasPermission: vi.fn(),
  mockIsAdmin: vi.fn(),
  mockNotifyUser: vi.fn(),
  mockExecuteTransition: vi.fn(),
  mockAuthorizeWorkOrderPlant: vi.fn(),
  mockCloseAllActiveWorkSessions: vi.fn(),
  mockBuildAuditData: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db: mockDb }));
vi.mock('@/lib/auth', () => ({
  getSession: mockGetSession,
  hasPermission: mockHasPermission,
  isAdmin: mockIsAdmin,
}));
vi.mock('@/lib/notifications', () => ({ notifyUser: mockNotifyUser }));
vi.mock('@/lib/state-machine', () => ({ executeTransition: mockExecuteTransition }));
vi.mock('@/lib/plant-auth-helpers', () => ({
  authorizeWorkOrderPlant: mockAuthorizeWorkOrderPlant,
}));
vi.mock('@/services/workOrderActiveSession.service', () => ({
  closeAllActiveWorkSessions: mockCloseAllActiveWorkSessions,
}));
vi.mock('@/lib/audit-helpers', () => ({ buildAuditData: mockBuildAuditData }));

import { POST } from '../route';

const session = {
  userId: 'manager-1',
  fullName: 'Maintenance Manager',
  roles: ['maintenance_manager'],
  permissions: ['work_orders.cancel'],
};

function request(reason = 'Equipment is being permanently removed from service'): NextRequest {
  return new NextRequest('http://localhost/api/work-orders/wo-1/cancel', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ reason }),
  });
}

function installWorkOrder(status: string) {
  mockDb.workOrder.findUnique
    .mockResolvedValueOnce({
      id: 'wo-1',
      woNumber: 'WO-001',
      status,
      assignedTo: 'tech-1',
      maintenanceRequestId: null,
    })
    .mockResolvedValue({
      id: 'wo-1',
      woNumber: 'WO-001',
      status: 'cancelled',
    });
}

describe('POST /api/work-orders/[id]/cancel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.$transaction.mockImplementation(async (callback: (tx: typeof mockDb) => unknown) => callback(mockDb));
    mockGetSession.mockReturnValue(session);
    mockHasPermission.mockReturnValue(true);
    mockIsAdmin.mockReturnValue(false);
    mockAuthorizeWorkOrderPlant.mockResolvedValue({ ok: true });
    mockExecuteTransition.mockResolvedValue({ success: true });
    mockCloseAllActiveWorkSessions.mockResolvedValue({
      closedTimerIds: ['timer-1', 'timer-2'],
      closedUserIds: ['tech-1', 'tech-2'],
      closedHours: 2.5,
      actualHours: 5.75,
    });
    mockBuildAuditData.mockReturnValue({
      userId: 'manager-1',
      action: 'update',
      entityType: 'work_order',
      entityId: 'wo-1',
    });
    mockDb.auditLog.create.mockResolvedValue({ id: 'audit-1' });
    mockDb.workOrderTeamMember.findMany.mockResolvedValue([]);
    mockDb.maintenanceRequest.findUnique.mockResolvedValue(null);
    mockNotifyUser.mockResolvedValue(undefined);
  });

  it('closes every active labor session atomically when cancelling in-progress work', async () => {
    installWorkOrder('in_progress');

    const response = await POST(request(), { params: Promise.resolve({ id: 'wo-1' }) });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.cancellation).toEqual({
      closedTimers: 2,
      closedTimerUsers: ['tech-1', 'tech-2'],
      actualHours: 5.75,
    });

    expect(mockCloseAllActiveWorkSessions).toHaveBeenCalledWith(
      mockDb,
      'wo-1',
      expect.any(Date),
      'Work order cancelled: Equipment is being permanently removed from service',
    );
    expect(mockExecuteTransition).toHaveBeenCalledWith(
      'work_order',
      'wo-1',
      'cancelled',
      session,
      expect.objectContaining({
        reason: 'Equipment is being permanently removed from service',
        tx: mockDb,
      }),
    );
    expect(mockDb.auditLog.create).toHaveBeenCalledTimes(1);
  });

  it('does not fabricate labor by closing stale rows when cancelling a waiting work order', async () => {
    installWorkOrder('waiting_parts');

    const response = await POST(request('Part is obsolete; repair abandoned'), {
      params: Promise.resolve({ id: 'wo-1' }),
    });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.cancellation.closedTimers).toBe(0);
    expect(json.cancellation.closedTimerUsers).toEqual([]);
    expect(mockCloseAllActiveWorkSessions).not.toHaveBeenCalled();
    expect(mockExecuteTransition).toHaveBeenCalledWith(
      'work_order',
      'wo-1',
      'cancelled',
      session,
      expect.objectContaining({ reason: 'Part is obsolete; repair abandoned', tx: mockDb }),
    );
  });

  it('returns a business-rule 400 when the canonical transition rejects cancellation', async () => {
    installWorkOrder('in_progress');
    mockExecuteTransition.mockResolvedValue({
      success: false,
      error: 'Role is not permitted to cancel this work order',
    });

    const response = await POST(request(), { params: Promise.resolve({ id: 'wo-1' }) });
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toBe('Role is not permitted to cancel this work order');
    expect(mockDb.auditLog.create).not.toHaveBeenCalled();
    expect(mockDb.workOrderTeamMember.findMany).not.toHaveBeenCalled();
    expect(mockNotifyUser).not.toHaveBeenCalled();
  });

  it('blocks cancellation after technician completion/review has begun', async () => {
    installWorkOrder('completed');

    const response = await POST(request(), { params: Promise.resolve({ id: 'wo-1' }) });
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toContain('dedicated review or rework lifecycle');
    expect(mockDb.$transaction).not.toHaveBeenCalled();
    expect(mockExecuteTransition).not.toHaveBeenCalled();
    expect(mockCloseAllActiveWorkSessions).not.toHaveBeenCalled();
  });
});
