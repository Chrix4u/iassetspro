import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockDb, mockExecuteTransition } = vi.hoisted(() => ({
  mockDb: {
    $transaction: vi.fn(),
    workOrder: { findUnique: vi.fn(), update: vi.fn() },
    shiftHandover: { findFirst: vi.fn() },
    user: { findUnique: vi.fn() },
    userPlant: { findFirst: vi.fn() },
    workOrderTimeLog: { findFirst: vi.fn(), create: vi.fn() },
    workOrderTeamMember: { findFirst: vi.fn(), create: vi.fn() },
    auditLog: { create: vi.fn() },
  },
  mockExecuteTransition: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db: mockDb }));
vi.mock('@/lib/state-machine', () => ({ executeTransition: mockExecuteTransition }));

import { resumeConfirmedHandover } from '@/services/repairHandoverResume.service';
import type { SessionContext } from '@/services/workExecution.service';

const receiverSession: SessionContext = {
  userId: 'tech-in',
  fullName: 'Incoming Technician',
  roles: ['maintenance_technician'],
  permissions: ['work_orders.update'],
};

const managerSession: SessionContext = {
  userId: 'manager-1',
  fullName: 'Maintenance Manager',
  roles: ['maintenance_manager'],
  permissions: ['work_orders.update'],
};

const supervisorSession: SessionContext = {
  userId: 'sup-1',
  fullName: 'Maintenance Supervisor',
  roles: ['maintenance_supervisor'],
  permissions: ['work_orders.update'],
};

function installDefaults() {
  mockDb.$transaction.mockImplementation(async (callback: (tx: typeof mockDb) => unknown) => callback(mockDb));
  mockDb.workOrder.findUnique.mockResolvedValue({
    id: 'wo-1',
    status: 'pending_handover',
    assignedTo: 'tech-out',
    plantId: 'plant-1',
  });
  mockDb.shiftHandover.findFirst.mockResolvedValue({
    id: 'handover-1',
    workOrderId: 'wo-1',
    status: 'confirmed',
    receivedById: 'tech-in',
    updatedAt: new Date('2026-09-09T10:00:00.000Z'),
  });
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
  mockDb.workOrderTimeLog.findFirst.mockResolvedValue(null);
  mockDb.workOrderTeamMember.findFirst.mockResolvedValue({ id: 'member-1' });
  mockDb.workOrder.update.mockResolvedValue({ id: 'wo-1' });
  mockDb.workOrderTimeLog.create.mockResolvedValue({ id: 'log-1' });
  mockDb.auditLog.create.mockResolvedValue({ id: 'audit-1' });
  mockExecuteTransition.mockResolvedValue({ success: true });
}

describe('repairHandoverResume.resumeConfirmedHandover', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installDefaults();
  });

  it('opens labor only for the designated receiving technician', async () => {
    const result = await resumeConfirmedHandover('wo-1', receiverSession);

    expect(result.success).toBe(true);
    expect(result.data).toEqual(expect.objectContaining({
      status: 'in_progress',
      assignedTo: 'tech-in',
      executionSessionOpened: true,
    }));

    expect(mockDb.workOrderTimeLog.findFirst).toHaveBeenCalledWith({
      where: {
        userId: 'tech-in',
        action: { in: ['start', 'resume'] },
        endTime: null,
        workOrder: { status: 'in_progress' },
      },
      select: {
        workOrderId: true,
        workOrder: { select: { woNumber: true } },
        startTime: true,
        timestamp: true,
      },
    });

    expect(mockDb.workOrderTimeLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workOrderId: 'wo-1',
        userId: 'tech-in',
        action: 'resume',
        startTime: expect.any(Date),
      }),
    });
  });

  it('treats maintenance-manager override as a control release and never creates manager labor', async () => {
    const result = await resumeConfirmedHandover('wo-1', managerSession, {
      reason: 'Incoming technician confirmed verbally; release WO for execution',
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual(expect.objectContaining({
      status: 'in_progress',
      assignedTo: 'tech-in',
      executionSessionOpened: false,
      technicianExecutionStartRequired: true,
    }));

    expect(mockDb.workOrderTimeLog.findFirst).not.toHaveBeenCalled();
    expect(mockDb.workOrderTimeLog.create).not.toHaveBeenCalled();
    expect(mockDb.workOrder.update).toHaveBeenCalledWith({
      where: { id: 'wo-1' },
      data: { assignedTo: 'tech-in' },
    });

    expect(mockDb.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'manager-1',
        action: 'release_after_handover_override',
      }),
    });

    const auditPayload = mockDb.auditLog.create.mock.calls[0][0].data;
    expect(JSON.parse(auditPayload.newValues)).toEqual(expect.objectContaining({
      executionSessionOpened: false,
      technicianExecutionStartRequired: true,
      receivedById: 'tech-in',
      overrideReason: 'Incoming technician confirmed verbally; release WO for execution',
    }));
  });

  it('requires a reason for maintenance-management override', async () => {
    const result = await resumeConfirmedHandover('wo-1', managerSession);

    expect(result.success).toBe(false);
    expect(result.error).toContain('override requires a reason');
    expect(mockExecuteTransition).not.toHaveBeenCalled();
    expect(mockDb.workOrderTimeLog.create).not.toHaveBeenCalled();
  });

  it('does not let an unassigned supervisor impersonate the handover receiver', async () => {
    const result = await resumeConfirmedHandover('wo-1', supervisorSession, {
      reason: 'Release requested',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('designated handover receiver');
    expect(mockExecuteTransition).not.toHaveBeenCalled();
    expect(mockDb.workOrderTimeLog.create).not.toHaveBeenCalled();
  });

  it('blocks the receiver when another real in-progress execution session exists', async () => {
    mockDb.workOrderTimeLog.findFirst.mockResolvedValue({
      workOrderId: 'wo-2',
      workOrder: { woNumber: 'WO-002' },
      startTime: new Date('2026-09-09T09:00:00.000Z'),
      timestamp: new Date('2026-09-09T09:00:00.000Z'),
    });

    const result = await resumeConfirmedHandover('wo-1', receiverSession);

    expect(result.success).toBe(false);
    expect(result.error).toContain('WO #WO-002');
    expect(mockExecuteTransition).not.toHaveBeenCalled();
    expect(mockDb.workOrderTimeLog.create).not.toHaveBeenCalled();
  });
});
