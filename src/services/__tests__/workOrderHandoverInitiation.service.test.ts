import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockDb,
  mockExecuteTransition,
  mockCloseAllActiveWorkSessions,
  mockBuildAuditData,
  mockSendRepairNotification,
} = vi.hoisted(() => ({
  mockDb: {
    $transaction: vi.fn(),
    workOrder: { findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
    userPlant: { findFirst: vi.fn() },
    shiftHandover: { create: vi.fn() },
    workOrderTeamMember: { findFirst: vi.fn(), create: vi.fn() },
    auditLog: { create: vi.fn() },
    idempotencyRecord: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  },
  mockExecuteTransition: vi.fn(),
  mockCloseAllActiveWorkSessions: vi.fn(),
  mockBuildAuditData: vi.fn(() => ({})),
  mockSendRepairNotification: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db: mockDb }));
vi.mock('@/lib/state-machine', () => ({ executeTransition: mockExecuteTransition }));
vi.mock('@/services/workOrderActiveSession.service', () => ({
  closeAllActiveWorkSessions: mockCloseAllActiveWorkSessions,
}));
vi.mock('@/lib/audit-helpers', () => ({ buildAuditData: mockBuildAuditData }));
vi.mock('@/lib/repair-notifications', () => ({ sendRepairNotification: mockSendRepairNotification }));

import { handoverUserHasEffectivePermission, initiateCanonicalHandover } from '@/services/workOrderHandoverInitiation.service';
import type { SessionContext } from '@/services/workExecution.service';

const technicianSession: SessionContext = {
  userId: 'tech-out',
  fullName: 'Outgoing Technician',
  roles: ['maintenance_technician'],
  permissions: ['work_orders.update'],
};

const supervisorSession: SessionContext = {
  userId: 'sup-1',
  fullName: 'Assigned Supervisor',
  roles: ['maintenance_supervisor'],
  permissions: ['work_orders.update'],
};

const plantManagerSession: SessionContext = {
  userId: 'plant-manager-1',
  fullName: 'Plant Manager',
  roles: ['plant_manager'],
  permissions: ['work_orders.update'],
};

function workOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 'wo-1',
    woNumber: 'WO-001',
    status: 'in_progress',
    plantId: 'plant-1',
    assignedTo: 'tech-out',
    teamLeaderId: null,
    assignedSupervisorId: 'sup-1',
    plannerId: 'planner-1',
    teamMembers: [],
    ...overrides,
  };
}

function installDefaults() {
  mockDb.$transaction.mockImplementation(async (callback: (tx: typeof mockDb) => unknown) => callback(mockDb));
  mockDb.workOrder.findUnique.mockResolvedValue(workOrder());
  mockDb.user.findUnique.mockResolvedValue({
    id: 'tech-in',
    status: 'active',
    userRoles: [{
      role: {
        slug: 'maintenance_technician',
        rolePermissions: [{ permission: { slug: 'work_orders.start' } }],
      },
    }],
    directPerms: [],
  });
  mockDb.userPlant.findFirst.mockResolvedValue({ id: 'user-plant-1' });
  mockDb.workOrderTeamMember.findFirst.mockResolvedValue(null);
  mockDb.workOrderTeamMember.create.mockResolvedValue({ id: 'handover-receiver-member' });
  mockDb.shiftHandover.create.mockResolvedValue({ id: 'handover-1' });
  mockDb.auditLog.create.mockResolvedValue({ id: 'audit-1' });
  mockDb.idempotencyRecord.findUnique.mockResolvedValue(null);
  mockDb.idempotencyRecord.create.mockResolvedValue({ id: 'idem-1' });
  mockDb.idempotencyRecord.update.mockResolvedValue({ id: 'idem-1' });
  mockExecuteTransition.mockResolvedValue({ success: true });
  mockCloseAllActiveWorkSessions.mockResolvedValue({
    closedTimerIds: ['log-1'],
    closedUserIds: ['tech-out'],
    actualHours: 1.5,
  });
}

describe('workOrderHandoverInitiation.initiateCanonicalHandover', () => {
  it('fails closed when effective-permission relations are absent', () => {
    expect(handoverUserHasEffectivePermission({}, 'work_orders.start')).toBe(false);
  });

  beforeEach(() => {
    vi.clearAllMocks();
    installDefaults();
  });

  it('allows the specifically assigned supervisor to initiate handover without creating labor', async () => {
    const result = await initiateCanonicalHandover('wo-1', supervisorSession, {
      receivedById: 'tech-in',
      reason: 'Shift change',
    });

    expect(result.success).toBe(true);
    expect(mockCloseAllActiveWorkSessions).toHaveBeenCalledWith(
      mockDb,
      'wo-1',
      expect.any(Date),
      'Auto-paused for shift handover',
    );
    expect(mockExecuteTransition).toHaveBeenCalledWith(
      'work_order',
      'wo-1',
      'pending_handover',
      supervisorSession,
      expect.objectContaining({ reason: 'Shift change', tx: mockDb }),
    );
    expect(mockDb.shiftHandover.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        handedOverById: 'sup-1',
        receivedById: 'tech-in',
        workOrderId: 'wo-1',
      }),
    });
  });

  it('rejects a non-technician receiver even when another role has start permission', async () => {
    mockDb.user.findUnique.mockResolvedValue({
      id: 'tech-in',
      status: 'active',
      userRoles: [{
        role: {
          slug: 'maintenance_supervisor',
          rolePermissions: [{ permission: { slug: 'work_orders.start' } }],
        },
      }],
      directPerms: [],
    });

    const result = await initiateCanonicalHandover('wo-1', supervisorSession, {
      receivedById: 'tech-in',
      reason: 'Shift change',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('maintenance technician');
    expect(mockCloseAllActiveWorkSessions).not.toHaveBeenCalled();
    expect(mockExecuteTransition).not.toHaveBeenCalled();
  });

  it('does not grant plant management direct execution-handover authority', async () => {
    const result = await initiateCanonicalHandover('wo-1', plantManagerSession, {
      receivedById: 'tech-in',
      reason: 'Plant manager requested handover',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('assigned technician');
    expect(mockCloseAllActiveWorkSessions).not.toHaveBeenCalled();
    expect(mockExecuteTransition).not.toHaveBeenCalled();
    expect(mockDb.shiftHandover.create).not.toHaveBeenCalled();
  });

  it('returns a stored result only when the idempotency key is bound to the same WO/action/user', async () => {
    const stored = { success: true, data: { status: 'pending_handover', handoverId: 'handover-stored' } };
    mockDb.idempotencyRecord.findUnique.mockResolvedValue({
      entityType: 'work_order',
      entityId: 'wo-1',
      action: 'handover',
      userId: 'tech-out',
      responseData: JSON.stringify(stored),
    });

    const result = await initiateCanonicalHandover('wo-1', technicianSession, {
      receivedById: 'tech-in',
      idempotencyKey: 'idem-key-1',
    });

    expect(result).toEqual(stored);
    expect(mockDb.$transaction).not.toHaveBeenCalled();
  });

  it('rejects reuse of an idempotency key that belongs to a different work order', async () => {
    mockDb.idempotencyRecord.findUnique.mockResolvedValue({
      entityType: 'work_order',
      entityId: 'wo-other',
      action: 'handover',
      userId: 'tech-out',
      responseData: JSON.stringify({ success: true }),
    });

    const result = await initiateCanonicalHandover('wo-1', technicianSession, {
      receivedById: 'tech-in',
      idempotencyKey: 'idem-key-collision',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('already bound to a different');
    expect(mockDb.$transaction).not.toHaveBeenCalled();
  });

  it('fails closed when an idempotency key exists without a completed response', async () => {
    mockDb.idempotencyRecord.findUnique.mockResolvedValue({
      entityType: 'work_order',
      entityId: 'wo-1',
      action: 'handover',
      userId: 'tech-out',
      responseData: null,
    });

    const result = await initiateCanonicalHandover('wo-1', technicianSession, {
      receivedById: 'tech-in',
      idempotencyKey: 'idem-incomplete',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('without a completed stored response');
    expect(mockDb.$transaction).not.toHaveBeenCalled();
  });
});
