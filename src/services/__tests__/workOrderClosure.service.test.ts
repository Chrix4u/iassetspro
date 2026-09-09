import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockDb,
  mockExecuteTransition,
  mockCheckReadiness,
  mockCalculateCosts,
  mockNormalizeTimeLogs,
  mockCalculateNextDueDate,
  mockIsAutoCalculableFrequency,
  mockSendRepairNotification,
  mockBuildAuditData,
} = vi.hoisted(() => ({
  mockDb: {
    $transaction: vi.fn(),
    workOrder: { findUnique: vi.fn() },
    repairCompletion: { update: vi.fn() },
    workOrderComment: { create: vi.fn() },
    pmSchedule: { findUnique: vi.fn(), update: vi.fn() },
    failureRecord: { upsert: vi.fn() },
    auditLog: { create: vi.fn() },
  },
  mockExecuteTransition: vi.fn(),
  mockCheckReadiness: vi.fn(),
  mockCalculateCosts: vi.fn(),
  mockNormalizeTimeLogs: vi.fn(),
  mockCalculateNextDueDate: vi.fn(),
  mockIsAutoCalculableFrequency: vi.fn(),
  mockSendRepairNotification: vi.fn(),
  mockBuildAuditData: vi.fn(() => ({})),
}));

vi.mock('@/lib/db', () => ({ db: mockDb }));
vi.mock('@/lib/state-machine', () => ({ executeTransition: mockExecuteTransition }));
vi.mock('@/services/workOrderReadiness.service', () => ({ checkReadiness: mockCheckReadiness }));
vi.mock('@/services/workExecution.service', () => ({ calculateAuthoritativeCosts: mockCalculateCosts }));
vi.mock('@/services/workOrderTimeLogNormalization.service', () => ({
  normalizeWorkOrderTimeLogs: mockNormalizeTimeLogs,
}));
vi.mock('@/lib/pm-utils', () => ({
  calculateNextDueDate: mockCalculateNextDueDate,
  isAutoCalculableFrequency: mockIsAutoCalculableFrequency,
}));
vi.mock('@/lib/repair-notifications', () => ({ sendRepairNotification: mockSendRepairNotification }));
vi.mock('@/lib/audit-helpers', () => ({ buildAuditData: mockBuildAuditData }));

import {
  closeRepairWorkOrder,
  type ClosureSessionContext,
} from '@/services/workOrderClosure.service';

const plannerSession: ClosureSessionContext = {
  userId: 'planner-1',
  fullName: 'Planner One',
  roles: ['planner'],
  permissions: ['work_orders.close'],
};

const actualEnd = new Date('2026-09-09T08:00:00.000Z');
const nextDueDate = new Date('2026-09-16T08:00:00.000Z');

function verifiedWorkOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 'wo-1',
    woNumber: 'WO-001',
    title: 'Generator PM',
    status: 'verified',
    isLocked: false,
    assetId: 'asset-1',
    actualStart: new Date('2026-09-09T06:00:00.000Z'),
    actualEnd,
    pmScheduleId: 'pm-1',
    plannerId: 'planner-1',
    assignedTo: 'tech-1',
    teamLeaderId: null,
    maintenanceRequest: { requestedBy: 'requester-1' },
    workOrderDowntimes: [],
    workOrderComponents: [],
    ...overrides,
  };
}

function installTransaction() {
  mockDb.$transaction.mockImplementation(async (callback: (tx: typeof mockDb) => unknown) => callback(mockDb));
}

describe('workOrderClosure PM lifecycle integrity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installTransaction();
    mockDb.workOrder.findUnique.mockResolvedValue(verifiedWorkOrder());
    mockNormalizeTimeLogs.mockResolvedValue(undefined);
    mockCheckReadiness.mockResolvedValue({ ready: true, blockers: [], warnings: [] });
    mockCalculateCosts.mockResolvedValue({
      actualLaborCost: 100,
      actualMaterialCost: 50,
      actualToolCost: 0,
      actualContractorCost: 25,
      totalActualCost: 175,
      laborHours: 2,
      appliedLaborRate: 50,
      appliedLaborCurrency: 'GHS',
    });
    mockExecuteTransition.mockResolvedValue({ success: true });
    mockDb.repairCompletion.update.mockResolvedValue({ id: 'completion-1' });
    mockDb.auditLog.create.mockResolvedValue({ id: 'audit-1' });
    mockDb.pmSchedule.findUnique.mockResolvedValue({
      id: 'pm-1',
      isActive: true,
      frequencyType: 'days',
      frequencyValue: 7,
      lastCompletedDate: null,
      nextDueDate: null,
    });
    mockIsAutoCalculableFrequency.mockReturnValue(true);
    mockCalculateNextDueDate.mockReturnValue(nextDueDate);
    mockDb.pmSchedule.update.mockResolvedValue({ id: 'pm-1' });
  });

  it('advances an active recurring PM only after verified work is planner-closed', async () => {
    const result = await closeRepairWorkOrder('wo-1', plannerSession, {});

    expect(result.success).toBe(true);
    expect(mockExecuteTransition).toHaveBeenCalledWith(
      'work_order',
      'wo-1',
      'closed',
      plannerSession,
      expect.objectContaining({ tx: mockDb }),
    );
    expect(mockCalculateNextDueDate).toHaveBeenCalledWith(actualEnd, 'days', 7);
    expect(mockDb.pmSchedule.update).toHaveBeenCalledWith({
      where: { id: 'pm-1' },
      data: { lastCompletedDate: actualEnd, nextDueDate },
    });
  });

  it('rejects a different planner even when that user has generic close permission', async () => {
    const otherPlanner: ClosureSessionContext = {
      ...plannerSession,
      userId: 'planner-2',
      fullName: 'Planner Two',
    };

    const result = await closeRepairWorkOrder('wo-1', otherPlanner, {});

    expect(result.success).toBe(false);
    expect(result.error).toContain('assigned planner');
    expect(mockNormalizeTimeLogs).not.toHaveBeenCalled();
    expect(mockCheckReadiness).not.toHaveBeenCalled();
    expect(mockExecuteTransition).not.toHaveBeenCalled();
    expect(mockDb.pmSchedule.update).not.toHaveBeenCalled();
  });

  it('allows a maintenance manager to close as an auditable assignment override', async () => {
    const managerSession: ClosureSessionContext = {
      userId: 'manager-1',
      fullName: 'Maintenance Manager',
      roles: ['maintenance_manager'],
      permissions: ['work_orders.close'],
    };

    const result = await closeRepairWorkOrder('wo-1', managerSession, {});

    expect(result.success).toBe(true);
    expect(mockExecuteTransition).toHaveBeenCalledWith(
      'work_order',
      'wo-1',
      'closed',
      managerSession,
      expect.objectContaining({ tx: mockDb }),
    );
    expect(mockBuildAuditData).toHaveBeenCalledWith(
      'update',
      'work_order',
      'wo-1',
      'manager-1',
      expect.any(Object),
      expect.objectContaining({
        plannerCloseOverride: true,
        assignedPlannerId: 'planner-1',
      }),
      undefined,
    );
  });

  it('does not advance an inactive PM schedule during closeout', async () => {
    mockDb.pmSchedule.findUnique.mockResolvedValue({
      id: 'pm-1',
      isActive: false,
      frequencyType: 'days',
      frequencyValue: 7,
      lastCompletedDate: null,
      nextDueDate: null,
    });

    const result = await closeRepairWorkOrder('wo-1', plannerSession, {});

    expect(result.success).toBe(true);
    expect(mockDb.pmSchedule.update).not.toHaveBeenCalled();
    expect(mockCalculateNextDueDate).not.toHaveBeenCalled();
  });

  it('keeps planner close transactional when readiness fails', async () => {
    mockCheckReadiness.mockResolvedValue({
      ready: false,
      blockers: [{ code: 'SUPERVISOR_REVIEW_REQUIRED', message: 'Supervisor approval is required' }],
      warnings: [],
    });

    const result = await closeRepairWorkOrder('wo-1', plannerSession, {});

    expect(result.success).toBe(false);
    expect(result.error).toBe('Work order is not ready for closure');
    expect(mockExecuteTransition).not.toHaveBeenCalled();
    expect(mockDb.pmSchedule.update).not.toHaveBeenCalled();
  });
});
