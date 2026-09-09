import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockDb,
  mockExecuteTransition,
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
  mockSendRepairNotification: vi.fn(),
  mockBuildAuditData: vi.fn(() => ({})),
}));

vi.mock('@/lib/db', () => ({ db: mockDb }));
vi.mock('@/lib/state-machine', () => ({ executeTransition: mockExecuteTransition }));
vi.mock('@/services/workOrderActiveSession.service', () => ({
  closeAllActiveWorkSessions: vi.fn(),
}));
vi.mock('@/lib/repair-notifications', () => ({
  sendRepairNotification: mockSendRepairNotification,
}));
vi.mock('@/lib/audit-helpers', () => ({ buildAuditData: mockBuildAuditData }));

import {
  resumeWaitingWorkOrder,
  type ExecutionStateSessionContext,
} from '@/services/workOrderExecutionState.service';

const session: ExecutionStateSessionContext = {
  userId: 'tech-1',
  fullName: 'Technician One',
  roles: ['technician'],
  permissions: ['work_orders.update'],
};

function waitingWorkOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 'wo-1',
    woNumber: 'WO-001',
    status: 'on_hold',
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

  it('checks only timers whose parent work order is actually in_progress', async () => {
    const result = await resumeWaitingWorkOrder('wo-1', session, { reason: 'Parts received' });

    expect(result.success).toBe(true);
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
      session,
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

    const result = await resumeWaitingWorkOrder('wo-1', session, { reason: 'Resume' });

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

    const result = await resumeWaitingWorkOrder('wo-1', session);

    expect(result.success).toBe(false);
    expect(result.reason).toBe('ACTIVE_SESSION_ALREADY_RUNNING');
    expect(result.conflict?.workOrderId).toBe('wo-1');
    expect(mockExecuteTransition).not.toHaveBeenCalled();
  });
});
