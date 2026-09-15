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
    workOrder: { findUnique: vi.fn() },
    repairCompletion: { findUnique: vi.fn(), update: vi.fn() },
    workOrderComment: { create: vi.fn() },
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
  verifyRepairWorkOrder,
  type VerificationSessionContext,
} from '@/services/workOrderVerification.service';
import {
  requestRepairRework,
  type ReworkSessionContext,
} from '@/services/workOrderRework.service';

const supervisorSession: VerificationSessionContext & ReworkSessionContext = {
  userId: 'sup-1',
  fullName: 'Supervisor One',
  roles: ['maintenance_supervisor'],
  permissions: ['work_orders.verify'],
};

function completedWorkOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 'wo-1',
    woNumber: 'WO-001',
    title: 'Pump repair',
    status: 'completed',
    plannerId: 'planner-1',
    assignedTo: 'tech-1',
    teamLeaderId: null,
    assignedSupervisorId: 'sup-1',
    repairCompletion: { id: 'completion-1', supervisorStatus: 'pending' },
    ...overrides,
  };
}

function installTransaction() {
  mockDb.$transaction.mockImplementation(async (callback: (tx: typeof mockDb) => unknown) => callback(mockDb));
}

describe('RWOP supervisor review accountability', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installTransaction();
    mockDb.workOrder.findUnique.mockResolvedValue(completedWorkOrder());
    mockCheckReadiness.mockResolvedValue({ ready: true, blockers: [], warnings: [] });
    mockDb.repairCompletion.findUnique.mockResolvedValue({ id: 'completion-1', reworkCount: 0 });
    mockDb.repairCompletion.update.mockResolvedValue({ id: 'completion-1', reworkCount: 1 });
    mockDb.workOrderComment.create.mockResolvedValue({ id: 'comment-1' });
    mockDb.auditLog.create.mockResolvedValue({ id: 'audit-1' });
    mockExecuteTransition.mockResolvedValue({ success: true });
  });

  it('allows the assigned supervisor to verify completed work', async () => {
    const result = await verifyRepairWorkOrder('wo-1', supervisorSession, {
      notes: 'Repair inspected and accepted',
      qualityRating: 5,
    });

    expect(result.success).toBe(true);
    expect(mockExecuteTransition).toHaveBeenCalledWith(
      'work_order',
      'wo-1',
      'verified',
      supervisorSession,
      { tx: mockDb },
    );
  });

  it('rejects a different supervisor with generic verify permission', async () => {
    const otherSupervisor = {
      ...supervisorSession,
      userId: 'sup-2',
      fullName: 'Supervisor Two',
    };

    const result = await verifyRepairWorkOrder('wo-1', otherSupervisor, {});

    expect(result.success).toBe(false);
    expect(result.error).toContain('assigned supervisor');
    expect(mockCheckReadiness).not.toHaveBeenCalled();
    expect(mockExecuteTransition).not.toHaveBeenCalled();
  });

  it('rejects rework from a different supervisor with generic verify permission', async () => {
    const otherSupervisor = {
      ...supervisorSession,
      userId: 'sup-2',
      fullName: 'Supervisor Two',
    };

    const result = await requestRepairRework('wo-1', otherSupervisor, {
      reason: 'Repeat alignment check',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('assigned supervisor');
    expect(mockDb.repairCompletion.findUnique).not.toHaveBeenCalled();
    expect(mockExecuteTransition).not.toHaveBeenCalled();
  });

  it('allows a maintenance manager to request rework as an auditable override and clears terminal completion state', async () => {
    const managerSession: ReworkSessionContext = {
      userId: 'manager-1',
      fullName: 'Maintenance Manager',
      roles: ['maintenance_manager'],
      permissions: ['work_orders.verify'],
    };

    const result = await requestRepairRework('wo-1', managerSession, {
      reason: 'Repeat vibration test',
    });

    expect(result.success).toBe(true);
    expect(mockExecuteTransition).toHaveBeenCalledWith(
      'work_order',
      'wo-1',
      'in_progress',
      managerSession,
      expect.objectContaining({
        reason: 'Repeat vibration test',
        extraData: { actualEnd: null },
        tx: mockDb,
      }),
    );
    expect(mockBuildAuditData).toHaveBeenCalledWith(
      'update',
      'work_order',
      'wo-1',
      'manager-1',
      expect.any(Object),
      expect.objectContaining({
        actualEnd: null,
        supervisorReworkOverride: true,
        assignedSupervisorId: 'sup-1',
        technicianExecutionRestartRequired: true,
      }),
      undefined,
    );
  });
});
