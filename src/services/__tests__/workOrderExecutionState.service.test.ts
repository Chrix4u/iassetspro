import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockDb,
  mockExecuteTransition,
  mockCloseAllActiveWorkSessions,
  mockSendRepairNotification,
  mockBuildAuditData,
} = vi.hoisted(() => ({
  mockDb: {
    $transaction: vi.fn(),
    workOrder: { findUnique: vi.fn() },
    workOrderTimeLog: { findFirst: vi.fn(), create: vi.fn() },
    auditLog: { create: vi.fn() },
  },
  mockExecuteTransition: vi.fn(),
  mockCloseAllActiveWorkSessions: vi.fn(),
  mockSendRepairNotification: vi.fn(),
  mockBuildAuditData: vi.fn(() => ({})),
}));

vi.mock('@/lib/db', () => ({ db: mockDb }));
vi.mock('@/lib/state-machine', () => ({ executeTransition: mockExecuteTransition }));
vi.mock('@/services/workOrderActiveSession.service', () => ({
  closeAllActiveWorkSessions: mockCloseAllActiveWorkSessions,
}));
vi.mock('@/lib/repair-notifications', () => ({
  sendRepairNotification: mockSendRepairNotification,
}));
vi.mock('@/lib/audit-helpers', () => ({ buildAuditData: mockBuildAuditData }));

import {
  placeWorkOrderInWaitingState,
  resumeWaitingWorkOrder,
  type ExecutionStateSessionContext,
} from '@/services/workOrderExecutionState.service';

const technicianSession: ExecutionStateSessionContext = {
  userId: 'tech-1',
  fullName: 'Technician One',
  roles: ['technician'],
  permissions: ['work_orders.update'],
};

const supervisorSession: ExecutionStateSessionContext = {
  userId: 'sup-1',
  fullName: 'Supervisor One',
  roles: ['maintenance_supervisor'],
  permissions: ['work_orders.update'],
};

const plannerSession: ExecutionStateSessionContext = {
  userId: 'planner-1',
  fullName: 'Planner One',
  roles: ['maintenance_planner'],
  permissions: ['work_orders.update'],
};

function waitingWorkOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 'wo-1',
    woNumber: 'WO-001',
    status: 'waiting_parts',
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

describe('workOrderExecutionState.placeWorkOrderInWaitingState', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installTransaction();
    mockDb.workOrder.findUnique.mockResolvedValue(waitingWorkOrder({ status: 'in_progress' }));
    mockCloseAllActiveWorkSessions.mockResolvedValue({
      closedTimerIds: ['timer-1', 'timer-2'],
      closedUserIds: ['tech-1', 'tech-2'],
      closedHours: 1.5,
      actualHours: 4.25,
    });
    mockDb.auditLog.create.mockResolvedValue({ id: 'audit-1' });
    mockExecuteTransition.mockResolvedValue({ success: true });
  });

  it('allows the assigned supervisor to place the whole work order on hold', async () => {
    const result = await placeWorkOrderInWaitingState('wo-1', 'on_hold', supervisorSession, {
      reason: 'Unsafe vibration detected',
      requireExecutionAuthority: true,
    });

    expect(result).toEqual({
      success: true,
      data: { status: 'on_hold', closedTimers: 2, actualHours: 4.25 },
    });
    expect(mockCloseAllActiveWorkSessions).toHaveBeenCalledWith(
      mockDb,
      'wo-1',
      expect.any(Date),
      'Work order entered on_hold: Unsafe vibration detected',
    );
    expect(mockExecuteTransition).toHaveBeenCalledWith(
      'work_order',
      'wo-1',
      'on_hold',
      supervisorSession,
      expect.objectContaining({ reason: 'Unsafe vibration detected', tx: mockDb }),
    );
    expect(mockBuildAuditData).toHaveBeenCalledWith(
      'update',
      'work_order',
      'wo-1',
      'sup-1',
      { status: 'in_progress' },
      expect.objectContaining({
        status: 'on_hold',
        reason: 'Unsafe vibration detected',
        closedTimerIds: ['timer-1', 'timer-2'],
        actualHours: 4.25,
      }),
      undefined,
    );
  });

  it('rejects a technician attempting the supervisor hold action', async () => {
    const result = await placeWorkOrderInWaitingState('wo-1', 'on_hold', technicianSession, {
      reason: 'Stop work',
      requireExecutionAuthority: true,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('assigned supervisor');
    expect(mockCloseAllActiveWorkSessions).not.toHaveBeenCalled();
    expect(mockExecuteTransition).not.toHaveBeenCalled();
  });

  it('rejects an unrelated supervisor even with generic update permission', async () => {
    const otherSupervisor: ExecutionStateSessionContext = {
      ...supervisorSession,
      userId: 'sup-2',
      fullName: 'Supervisor Two',
    };

    const result = await placeWorkOrderInWaitingState('wo-1', 'on_hold', otherSupervisor, {
      reason: 'Stop work',
      requireExecutionAuthority: true,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('assigned supervisor');
    expect(mockCloseAllActiveWorkSessions).not.toHaveBeenCalled();
  });

  it('allows the assigned planner to move active work into a normal waiting state', async () => {
    const result = await placeWorkOrderInWaitingState('wo-1', 'waiting_parts', plannerSession, {
      reason: 'Seal kit is being sourced',
      requireExecutionAuthority: true,
    });

    expect(result.success).toBe(true);
    expect(mockExecuteTransition).toHaveBeenCalledWith(
      'work_order',
      'wo-1',
      'waiting_parts',
      plannerSession,
      expect.objectContaining({ reason: 'Seal kit is being sourced', tx: mockDb }),
    );
  });
});

describe('workOrderExecutionState.resumeWaitingWorkOrder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installTransaction();
    mockDb.workOrder.findUnique.mockResolvedValue(waitingWorkOrder());
    mockDb.workOrderTimeLog.findFirst.mockResolvedValue(null);
    mockDb.workOrderTimeLog.create.mockResolvedValue({ id: 'log-1' });
    mockDb.auditLog.create.mockResolvedValue({ id: 'audit-1' });
    mockExecuteTransition.mockResolvedValue({ success: true });
  });

  it('checks only timers whose parent work order is actually in_progress for technician resume', async () => {
    const result = await resumeWaitingWorkOrder('wo-1', technicianSession, { reason: 'Parts received' });

    expect(result.success).toBe(true);
    expect(result.data?.executionSessionOpened).toBe(true);
    expect(mockDb.workOrderTimeLog.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 'tech-1',
          action: { in: ['start', 'resume'] },
          endTime: null,
          workOrder: { status: 'in_progress' },
        }),
      }),
    );
    expect(mockExecuteTransition).toHaveBeenCalledWith(
      'work_order',
      'wo-1',
      'in_progress',
      technicianSession,
      expect.objectContaining({ reason: 'Parts received', tx: mockDb }),
    );
    expect(mockDb.workOrderTimeLog.create).toHaveBeenCalledOnce();
  });

  it('returns a structured conflict when another live work order is active', async () => {
    const startedAt = new Date('2026-09-09T08:30:00.000Z');
    mockDb.workOrderTimeLog.findFirst.mockResolvedValue({
      workOrderId: 'wo-2',
      startTime: startedAt,
      timestamp: startedAt,
      workOrder: {
        woNumber: 'WO-002',
        title: 'Repair compressor',
        status: 'in_progress',
      },
    });

    const result = await resumeWaitingWorkOrder('wo-1', technicianSession, { reason: 'Resume' });

    expect(result).toEqual({
      success: false,
      reason: 'ACTIVE_SESSION_CONFLICT',
      error: 'You already have active work on WO #WO-002 (Repair compressor). Open that work order and pause, hand over, or complete it before resuming another.',
      conflict: {
        workOrderId: 'wo-2',
        woNumber: 'WO-002',
        title: 'Repair compressor',
        status: 'in_progress',
        startedAt: startedAt.toISOString(),
      },
    });
    expect(mockExecuteTransition).not.toHaveBeenCalled();
    expect(mockDb.workOrderTimeLog.create).not.toHaveBeenCalled();
  });

  it('reports already-running when resume is called on the same active work order', async () => {
    const startedAt = new Date('2026-09-09T09:00:00.000Z');
    mockDb.workOrder.findUnique.mockResolvedValue(waitingWorkOrder({ status: 'in_progress' }));
    mockDb.workOrderTimeLog.findFirst.mockResolvedValue({
      workOrderId: 'wo-1',
      startTime: startedAt,
      timestamp: startedAt,
      workOrder: {
        woNumber: 'WO-001',
        title: 'Pump inspection',
        status: 'in_progress',
      },
    });

    const result = await resumeWaitingWorkOrder('wo-1', technicianSession);

    expect(result.success).toBe(false);
    expect(result.reason).toBe('ACTIVE_SESSION_ALREADY_RUNNING');
    expect(result.conflict?.workOrderId).toBe('wo-1');
    expect(mockExecuteTransition).not.toHaveBeenCalled();
  });

  it('lets the assigned supervisor release on-hold work without creating supervisor labor time', async () => {
    mockDb.workOrder.findUnique.mockResolvedValue(waitingWorkOrder({ status: 'on_hold' }));

    const result = await resumeWaitingWorkOrder('wo-1', supervisorSession, {
      reason: 'Safety condition cleared',
    });

    expect(result.success).toBe(true);
    expect(result.data?.executionSessionOpened).toBe(false);
    expect(mockDb.workOrderTimeLog.findFirst).not.toHaveBeenCalled();
    expect(mockDb.workOrderTimeLog.create).not.toHaveBeenCalled();
    expect(mockExecuteTransition).toHaveBeenCalledWith(
      'work_order',
      'wo-1',
      'in_progress',
      supervisorSession,
      expect.objectContaining({ reason: 'Safety condition cleared', tx: mockDb }),
    );
    expect(mockBuildAuditData).toHaveBeenCalledWith(
      'update',
      'work_order',
      'wo-1',
      'sup-1',
      { status: 'on_hold' },
      expect.objectContaining({
        status: 'in_progress',
        executionSessionOpened: false,
        technicianExecutionStartRequired: true,
      }),
      undefined,
    );
  });

  it('rejects a technician attempting to release a supervisor hold', async () => {
    mockDb.workOrder.findUnique.mockResolvedValue(waitingWorkOrder({ status: 'on_hold' }));

    const result = await resumeWaitingWorkOrder('wo-1', technicianSession, {
      reason: 'Try to restart',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('assigned supervisor');
    expect(mockExecuteTransition).not.toHaveBeenCalled();
    expect(mockDb.workOrderTimeLog.create).not.toHaveBeenCalled();
  });

  it('lets the assigned planner clear a normal waiting state without creating planner labor time', async () => {
    const result = await resumeWaitingWorkOrder('wo-1', plannerSession, {
      reason: 'Required parts are now available',
    });

    expect(result.success).toBe(true);
    expect(result.data?.executionSessionOpened).toBe(false);
    expect(mockDb.workOrderTimeLog.findFirst).not.toHaveBeenCalled();
    expect(mockDb.workOrderTimeLog.create).not.toHaveBeenCalled();
    expect(mockBuildAuditData).toHaveBeenCalledWith(
      'update',
      'work_order',
      'wo-1',
      'planner-1',
      { status: 'waiting_parts' },
      expect.objectContaining({
        executionSessionOpened: false,
        technicianExecutionStartRequired: true,
      }),
      undefined,
    );
  });
});
