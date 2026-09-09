import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockDb,
  mockExecuteTransition,
  mockCheckReadiness,
  mockSendRepairNotification,
  mockBuildAuditData,
} = vi.hoisted(() => ({
  mockDb: {
    $transaction: vi.fn(),
    workOrder: { findUnique: vi.fn(), update: vi.fn() },
    workOrderTimeLog: { findFirst: vi.fn(), create: vi.fn() },
    auditLog: { create: vi.fn() },
  },
  mockExecuteTransition: vi.fn(),
  mockCheckReadiness: vi.fn(),
  mockSendRepairNotification: vi.fn(),
  mockBuildAuditData: vi.fn(() => ({})),
}));

vi.mock('@/lib/db', () => ({ db: mockDb }));
vi.mock('@/lib/state-machine', () => ({ executeTransition: mockExecuteTransition }));
vi.mock('@/services/workOrderReadiness.service', () => ({ checkReadiness: mockCheckReadiness }));
vi.mock('@/lib/repair-notifications', () => ({ sendRepairNotification: mockSendRepairNotification }));
vi.mock('@/lib/audit-helpers', () => ({ buildAuditData: mockBuildAuditData }));

import {
  startWorkOrderExecution,
  type StartExecutionSessionContext,
} from '@/services/workOrderStartExecution.service';

const session: StartExecutionSessionContext = {
  userId: 'tech-1',
  fullName: 'Technician One',
  roles: ['technician'],
  permissions: ['work_orders.start'],
};

function workOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 'wo-1',
    woNumber: 'WO-001',
    status: 'assigned',
    actualStart: null,
    assignedTo: 'tech-1',
    teamLeaderId: null,
    assignedSupervisorId: 'sup-1',
    plannerId: 'planner-1',
    teamMembers: [],
    ...overrides,
  };
}

function installTransaction() {
  mockDb.$transaction.mockImplementation(async (callback: (tx: typeof mockDb) => unknown) => callback(mockDb));
}

describe('workOrderStartExecution.startWorkOrderExecution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installTransaction();
    mockDb.workOrder.findUnique.mockResolvedValue(workOrder());
    mockDb.workOrder.update.mockResolvedValue({ id: 'wo-1' });
    mockDb.workOrderTimeLog.findFirst.mockResolvedValue(null);
    mockDb.workOrderTimeLog.create.mockResolvedValue({ id: 'log-1' });
    mockDb.auditLog.create.mockResolvedValue({ id: 'audit-1' });
    mockCheckReadiness.mockResolvedValue({ ready: true, blockers: [], warnings: [] });
    mockExecuteTransition.mockResolvedValue({ success: true });
  });

  it('uses the canonical state transition and opens a start timer for first execution', async () => {
    const result = await startWorkOrderExecution('wo-1', session, { notes: 'Begin repair' });

    expect(result.success).toBe(true);
    expect(mockExecuteTransition).toHaveBeenCalledWith(
      'work_order',
      'wo-1',
      'in_progress',
      session,
      expect.objectContaining({
        tx: mockDb,
        extraData: expect.objectContaining({ actualStart: expect.any(Date) }),
      }),
    );
    expect(mockDb.workOrderTimeLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workOrderId: 'wo-1',
        userId: 'tech-1',
        action: 'start',
        notes: 'Begin repair',
        startTime: expect.any(Date),
      }),
    });
  });

  it('rejects an unassigned maintenance manager instead of attributing technician labor to management', async () => {
    const managerSession: StartExecutionSessionContext = {
      userId: 'manager-1',
      fullName: 'Maintenance Manager',
      roles: ['maintenance_manager'],
      permissions: ['work_orders.start', 'work_orders.update'],
    };

    const result = await startWorkOrderExecution('wo-1', managerSession, {
      reason: 'Manager override',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('assigned technician or team leader');
    expect(mockCheckReadiness).not.toHaveBeenCalled();
    expect(mockExecuteTransition).not.toHaveBeenCalled();
    expect(mockDb.workOrderTimeLog.create).not.toHaveBeenCalled();
  });

  it('opens a resume timer without an in_progress-to-in_progress transition after rework', async () => {
    const originalStart = new Date('2026-09-09T07:15:00.000Z');
    mockDb.workOrder.findUnique.mockResolvedValue(workOrder({
      status: 'in_progress',
      actualStart: originalStart,
    }));

    const result = await startWorkOrderExecution('wo-1', session, {
      reason: 'Supervisor requested rework',
      notes: 'Restart rework execution',
    });

    expect(result.success).toBe(true);
    expect(result.data?.actualStart).toEqual(originalStart);
    expect(mockExecuteTransition).not.toHaveBeenCalled();
    expect(mockDb.workOrder.update).not.toHaveBeenCalled();
    expect(mockDb.workOrderTimeLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workOrderId: 'wo-1',
        userId: 'tech-1',
        action: 'resume',
        notes: 'Restart rework execution',
        startTime: expect.any(Date),
      }),
    });
    expect(mockBuildAuditData).toHaveBeenCalledWith(
      'update',
      'work_order',
      'wo-1',
      'tech-1',
      { status: 'in_progress' },
      expect.objectContaining({
        status: 'in_progress',
        executionSessionRestarted: true,
        actualStartInitialized: false,
        reason: 'Supervisor requested rework',
      }),
      undefined,
    );
  });

  it('initializes actualStart when the first genuine labor session starts on a legacy in_progress WO', async () => {
    mockDb.workOrder.findUnique.mockResolvedValue(workOrder({
      status: 'in_progress',
      actualStart: null,
    }));

    const result = await startWorkOrderExecution('wo-1', session, {
      notes: 'Begin execution after control release',
    });

    expect(result.success).toBe(true);
    expect(result.data?.actualStart).toBeInstanceOf(Date);
    expect(mockExecuteTransition).not.toHaveBeenCalled();
    expect(mockDb.workOrder.update).toHaveBeenCalledWith({
      where: { id: 'wo-1' },
      data: { actualStart: expect.any(Date) },
    });
    expect(mockDb.workOrderTimeLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'resume', userId: 'tech-1' }),
    });
    expect(mockBuildAuditData).toHaveBeenCalledWith(
      'update',
      'work_order',
      'wo-1',
      'tech-1',
      { status: 'in_progress' },
      expect.objectContaining({ actualStartInitialized: true }),
      undefined,
    );
  });

  it('still returns a structured conflict instead of opening a second live timer', async () => {
    const activeAt = new Date('2026-09-09T09:30:00.000Z');
    mockDb.workOrder.findUnique.mockResolvedValue(workOrder({ status: 'in_progress' }));
    mockDb.workOrderTimeLog.findFirst.mockResolvedValue({
      workOrderId: 'wo-2',
      startTime: activeAt,
      timestamp: activeAt,
      workOrder: { woNumber: 'WO-002', title: 'Compressor repair', status: 'in_progress' },
    });

    const result = await startWorkOrderExecution('wo-1', session);

    expect(result.success).toBe(false);
    expect(result.reason).toBe('ACTIVE_SESSION_CONFLICT');
    expect(result.conflict?.workOrderId).toBe('wo-2');
    expect(mockExecuteTransition).not.toHaveBeenCalled();
    expect(mockDb.workOrderTimeLog.create).not.toHaveBeenCalled();
  });

  it('does not exempt an assigned admin from the one-live-session labor invariant', async () => {
    const activeAt = new Date('2026-09-09T10:15:00.000Z');
    const adminSession: StartExecutionSessionContext = {
      userId: 'admin-1',
      fullName: 'Admin Technician',
      roles: ['admin'],
      permissions: ['work_orders.start'],
    };
    mockDb.workOrder.findUnique.mockResolvedValue(workOrder({ assignedTo: 'admin-1' }));
    mockDb.workOrderTimeLog.findFirst.mockResolvedValue({
      workOrderId: 'wo-2',
      startTime: activeAt,
      timestamp: activeAt,
      workOrder: { woNumber: 'WO-002', title: 'Pump repair', status: 'in_progress' },
    });

    const result = await startWorkOrderExecution('wo-1', adminSession);

    expect(result.success).toBe(false);
    expect(result.reason).toBe('ACTIVE_SESSION_CONFLICT');
    expect(mockDb.workOrderTimeLog.findFirst).toHaveBeenCalled();
    expect(mockDb.workOrderTimeLog.create).not.toHaveBeenCalled();
  });
});
