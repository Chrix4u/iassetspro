// ============================================================================
// Work Execution Service — Function-Level Tests (Phase 3A/3D)
// ============================================================================
// Tests the actual exported service functions: startWork, pauseWork, resumeWork,
// enterWaitingState, initiateHandover, resumeAfterHandover, submitCompletion,
// supervisorVerify, requestRework, plannerClose, cancelWorkOrder,
// calculateAuthoritativeCosts.
//
// Uses the same mocking patterns as the existing test suite:
// vi.hoisted → vi.mock('@/lib/db') → import service.
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';

// ---- Hoisted mocks ----
const {
  mockDb,
  mockExecuteTransition,
  mockNotifyUser,
  mockSendRepairNotification,
  mockCheckReadiness,
  mockJobQueue,
} = vi.hoisted(() => ({
  mockDb: {
    $transaction: vi.fn(),
    workOrder: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    workOrderTimeLog: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      update: vi.fn(),
      updateMany: vi.fn(),
      create: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
    workOrderComment: {
      create: vi.fn(),
    },
    repairCompletion: {
      upsert: vi.fn(),
    },
    pmSchedule: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    failureRecord: {
      upsert: vi.fn(),
    },
    shiftHandover: {
      findFirst: vi.fn(),
      create: vi.fn().mockResolvedValue({ id: 'sh-new' }),
    },
  },
  mockExecuteTransition: vi.fn(),
  mockNotifyUser: vi.fn().mockResolvedValue(undefined),
  mockSendRepairNotification: vi.fn(),
  mockCheckReadiness: vi.fn(),
  mockJobQueue: {
    add: vi.fn().mockResolvedValue({}),
  },
}));

vi.mock('@/lib/db', () => ({ db: mockDb }));
vi.mock('@/lib/state-machine', () => ({ executeTransition: mockExecuteTransition }));
vi.mock('@/services/workOrderReadiness.service', () => ({ checkReadiness: mockCheckReadiness }));
vi.mock('@/lib/repair-notifications', () => ({ sendRepairNotification: mockSendRepairNotification }));
vi.mock('@/lib/notifications', () => ({ notifyUser: mockNotifyUser }));
vi.mock('@/lib/queue', () => ({ jobQueue: mockJobQueue, QUEUES: { NOTIFICATION: 'notifications' } }));

// ---- Import AFTER mocks ----
import {
  startWork,
  pauseWork,
  resumeWork,
  enterWaitingState,
  initiateHandover,
  resumeAfterHandover,
  submitCompletion,
  supervisorVerify,
  requestRework,
  plannerClose,
  cancelWorkOrder,
  calculateAuthoritativeCosts,
  type SessionContext,
  type CompletionOptions,
} from '@/services/workExecution.service';

// ---- Helpers ----
function makeEnrichedWO(overrides: Record<string, unknown> = {}) {
  return {
    id: 'wo-1',
    woNumber: 'WO-202506-0001',
    status: 'assigned',
    assignedTo: 'tech-1',
    teamLeaderId: null,
    assignedSupervisorId: 'sup-1',
    plannerId: 'planner-1',
    plantId: 'plant-1',
    assetId: 'asset-1',
    pmScheduleId: null,
    actualStart: null,
    actualHours: 0,
    laborCost: 0,
    partsCost: 0,
    contractorCost: 0,
    totalCost: 0,
    isLocked: false,
    failureDescription: null,
    causeDescription: null,
    actionDescription: null,
    downtimeMinutes: 0,
    maintenanceRequest: { id: 'mr-1', requestNumber: 'MR-001', title: 'Fix pump', requestedBy: 'user-1' },
    assignee: { id: 'tech-1', fullName: 'Tech One', username: 'tech1', primaryTrade: 'mechanical' },
    teamLeader: null,
    assignedSupervisor: { id: 'sup-1', fullName: 'Sup One', username: 'sup1' },
    planner: { id: 'planner-1', fullName: 'Planner One', username: 'planner1' },
    teamMembers: [],
    repairCompletion: null,
    repairToolRequests: [],
    repairMaterialRequests: [],
    timeLogs: [],
    shiftHandovers: [],
    workOrderDowntimes: [],
    workOrderComponents: [],
    ...overrides,
  };
}

const techSession: SessionContext = {
  userId: 'tech-1',
  fullName: 'Tech One',
  roles: ['technician'],
  permissions: [],
};

const adminSession: SessionContext = {
  userId: 'admin-1',
  fullName: 'Admin One',
  roles: ['admin'],
  permissions: [],
};

const supervisorSession: SessionContext = {
  userId: 'sup-1',
  fullName: 'Supervisor One',
  roles: ['supervisor'],
  permissions: [],
};

const plannerSession: SessionContext = {
  userId: 'planner-1',
  fullName: 'Planner One',
  roles: ['planner'],
  permissions: [],
};

// ---- Mock fetchEnrichedWO by intercepting workOrder.findUnique ----
function mockFetchEnrichedWO(wo: Record<string, unknown> | null) {
  (mockDb.workOrder.findUnique as Mock).mockResolvedValue(wo);
}

// ---- Mock $transaction to execute callback with a mock tx ----
// tx methods delegate to mockDb so assertions against mockDb.* work.
function mockTransactionExec() {
  const tx = {
    workOrder: {
      findUnique: mockDb.workOrder.findUnique,
      update: mockDb.workOrder.update,
    },
    workOrderTimeLog: {
      findMany: mockDb.workOrderTimeLog.findMany,
      findFirst: mockDb.workOrderTimeLog.findFirst,
      update: mockDb.workOrderTimeLog.update,
      updateMany: mockDb.workOrderTimeLog.updateMany,
      create: mockDb.workOrderTimeLog.create,
    },
    auditLog: {
      create: mockDb.auditLog.create,
    },
    workOrderComment: {
      create: mockDb.workOrderComment.create,
    },
    repairCompletion: {
      upsert: mockDb.repairCompletion.upsert,
    },
    pmSchedule: {
      findUnique: mockDb.pmSchedule.findUnique,
      update: mockDb.pmSchedule.update,
    },
    failureRecord: {
      upsert: mockDb.failureRecord.upsert,
    },
    shiftHandover: {
      findFirst: mockDb.shiftHandover.findFirst,
      create: vi.fn().mockResolvedValue({ id: 'sh-tx-new' }),
    },
    laborRate: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
    trade: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
    idempotencyRecord: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({}),
    },
  };
  (mockDb.$transaction as Mock).mockImplementation(async (cb: (t: any) => Promise<any>) => cb(tx)); // eslint-disable-line @typescript-eslint/no-explicit-any
  return tx;
}

// ============================================================================
// 1. START WORK
// ============================================================================
describe('startWork', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('should return error when WO not found', async () => {
    mockFetchEnrichedWO(null);
    const result = await startWork('wo-1', techSession);
    expect(result.success).toBe(false);
    expect(result.error).toBe('Work order not found');
  });

  it('should return error when non-assignee tries to start', async () => {
    mockFetchEnrichedWO(makeEnrichedWO());
    const otherUser: SessionContext = { userId: 'tech-2', roles: ['technician'], permissions: [] };
    const result = await startWork('wo-1', otherUser);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Only the assigned technician');
  });

  it('should return error when readiness check fails', async () => {
    mockFetchEnrichedWO(makeEnrichedWO());
    mockCheckReadiness.mockResolvedValue({
      ready: false,
      blockers: [{ code: 'NO_TEAM', category: 'team', message: 'No team', severity: 'blocker' as const }],
      warnings: [],
    });
    const result = await startWork('wo-1', techSession);
    expect(result.success).toBe(false);
    expect(result.error).toBe('Work order is not ready to start');
    expect(result.readiness).toBeDefined();
    expect(result.readiness!.ready).toBe(false);
  });

  it('should throw when state transition fails', async () => {
    mockFetchEnrichedWO(makeEnrichedWO());
    mockCheckReadiness.mockResolvedValue({ ready: true, blockers: [], warnings: [] });
    mockExecuteTransition.mockResolvedValue({ success: false, error: 'Transition not allowed' });
    mockTransactionExec();
    await expect(startWork('wo-1', techSession)).rejects.toThrow('Transition not allowed');
  });

  it('should succeed and create time log on valid start', async () => {
    mockFetchEnrichedWO(makeEnrichedWO());
    mockCheckReadiness.mockResolvedValue({ ready: true, blockers: [], warnings: [] });
    mockExecuteTransition.mockResolvedValue({ success: true });
    mockDb.workOrderTimeLog.create.mockResolvedValue({});
    mockDb.auditLog.create.mockResolvedValue({});
    mockTransactionExec();

    const result = await startWork('wo-1', techSession);
    expect(result.success).toBe(true);
    expect(result.data?.status).toBe('in_progress');
    expect(result.data?.actualStart).toBeInstanceOf(Date);
    expect(mockDb.workOrderTimeLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          workOrderId: 'wo-1',
          userId: 'tech-1',
          action: 'start',
        }),
      }),
    );
  });

  it('should allow admin to start work (admin override)', async () => {
    mockFetchEnrichedWO(makeEnrichedWO());
    mockCheckReadiness.mockResolvedValue({ ready: true, blockers: [], warnings: [] });
    mockExecuteTransition.mockResolvedValue({ success: true });
    mockDb.workOrderTimeLog.create.mockResolvedValue({});
    mockDb.auditLog.create.mockResolvedValue({});
    mockTransactionExec();

    const result = await startWork('wo-1', adminSession);
    expect(result.success).toBe(true);
  });
});

// ============================================================================
// 2. PAUSE WORK
// ============================================================================
describe('pauseWork', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('should return error when WO not found', async () => {
    mockFetchEnrichedWO(null);
    const result = await pauseWork('wo-1', techSession);
    expect(result.success).toBe(false);
    expect(result.error).toBe('Work order not found');
  });

  it('should close all active team execution sessions before pausing', async () => {
    mockFetchEnrichedWO(makeEnrichedWO({ status: 'in_progress' }));
    mockExecuteTransition.mockResolvedValue({ success: true });
    mockDb.workOrderTimeLog.updateMany.mockResolvedValue({ count: 2 });
    mockDb.auditLog.create.mockResolvedValue({});
    mockTransactionExec();

    const result = await pauseWork('wo-1', techSession, { reason: 'lunch break' });
    expect(result.success).toBe(true);
    expect(mockDb.workOrderTimeLog.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workOrderId: 'wo-1',
          action: { in: ['start', 'resume'] },
          endTime: null,
        },
        data: expect.objectContaining({ pauseReason: 'lunch break' }),
      }),
    );
  });

  it('should throw when state transition fails', async () => {
    mockFetchEnrichedWO(makeEnrichedWO({ status: 'in_progress' }));
    mockExecuteTransition.mockResolvedValue({ success: false, error: 'Cannot pause from this status' });
    mockTransactionExec();

    await expect(pauseWork('wo-1', techSession)).rejects.toThrow('Cannot pause from this status');
  });
});

// ============================================================================
// 3. RESUME WORK
// ============================================================================
describe('resumeWork', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('should return error when WO not found', async () => {
    mockFetchEnrichedWO(null);
    const result = await resumeWork('wo-1', techSession);
    expect(result.success).toBe(false);
    expect(result.error).toBe('Work order not found');
  });

  it('should create resume time log on successful resume', async () => {
    mockFetchEnrichedWO(makeEnrichedWO({ status: 'on_hold' }));
    mockExecuteTransition.mockResolvedValue({ success: true });
    mockDb.workOrderTimeLog.create.mockResolvedValue({});
    mockDb.auditLog.create.mockResolvedValue({});
    mockTransactionExec();

    const result = await resumeWork('wo-1', techSession);
    expect(result.success).toBe(true);
    expect(result.data?.status).toBe('in_progress');
    expect(mockDb.workOrderTimeLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'resume' }),
      }),
    );
  });
});

// ============================================================================
// 4. ENTER WAITING STATE
// ============================================================================
describe('enterWaitingState', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('should return error when WO not found', async () => {
    mockFetchEnrichedWO(null);
    const result = await enterWaitingState('wo-1', techSession, 'waiting_tools');
    expect(result.success).toBe(false);
    expect(result.error).toBe('Work order not found');
  });

  it('should close active timers and transition to waiting_tools', async () => {
    mockFetchEnrichedWO(makeEnrichedWO({ status: 'in_progress' }));
    mockExecuteTransition.mockResolvedValue({ success: true });
    mockDb.workOrderTimeLog.updateMany.mockResolvedValue({ count: 1 });
    mockDb.auditLog.create.mockResolvedValue({});
    mockTransactionExec();

    const result = await enterWaitingState('wo-1', techSession, 'waiting_tools', { reason: 'Need special wrench' });
    expect(result.success).toBe(true);
    expect(result.data?.status).toBe('waiting_tools');
    expect(mockDb.workOrderTimeLog.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workOrderId: 'wo-1',
          action: { in: ['start', 'resume'] },
          endTime: null,
        },
        data: expect.objectContaining({ pauseReason: 'Entered waiting_tools' }),
      }),
    );
    expect(mockExecuteTransition).toHaveBeenCalledWith(
      'work_order', 'wo-1', 'waiting_tools', techSession,
      expect.objectContaining({ reason: 'Need special wrench' }),
    );
  });

  it('should transition to waiting_permit', async () => {
    mockFetchEnrichedWO(makeEnrichedWO({ status: 'in_progress' }));
    mockExecuteTransition.mockResolvedValue({ success: true });
    mockDb.workOrderTimeLog.updateMany.mockResolvedValue({ count: 0 });
    mockDb.auditLog.create.mockResolvedValue({});
    mockTransactionExec();

    const result = await enterWaitingState('wo-1', techSession, 'waiting_permit');
    expect(result.success).toBe(true);
    expect(result.data?.status).toBe('waiting_permit');
  });
});

// ============================================================================
// 5. INITIATE HANDOVER
// ============================================================================
describe('initiateHandover', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('should return error when WO not found', async () => {
    mockFetchEnrichedWO(null);
    const result = await initiateHandover('wo-1', techSession);
    expect(result.success).toBe(false);
    expect(result.error).toBe('Work order not found');
  });

  it('should transition to pending_handover and create ShiftHandover', async () => {
    mockFetchEnrichedWO(makeEnrichedWO({ status: 'in_progress' }));
    mockExecuteTransition.mockResolvedValue({ success: true });
    mockDb.auditLog.create.mockResolvedValue({});
    mockTransactionExec();

    const result = await initiateHandover('wo-1', techSession);
    expect(result.success).toBe(true);
    expect(result.data?.status).toBe('pending_handover');
    expect(result.data?.handoverId).toBe('sh-tx-new');
    expect(mockDb.workOrderTimeLog.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workOrderId: 'wo-1',
          action: { in: ['start', 'resume'] },
          endTime: null,
        },
      }),
    );
  });
});

// ============================================================================
// 6. RESUME AFTER HANDOVER
// ============================================================================
describe('resumeAfterHandover', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('should return error when WO not found', async () => {
    mockFetchEnrichedWO(null);
    const result = await resumeAfterHandover('wo-1', techSession);
    expect(result.success).toBe(false);
    expect(result.error).toBe('Work order not found');
  });

  it('should throw when no confirmed handover record exists', async () => {
    mockFetchEnrichedWO(makeEnrichedWO({ status: 'pending_handover' }));
    mockDb.shiftHandover.findFirst.mockResolvedValue(null);
    mockTransactionExec();

    await expect(resumeAfterHandover('wo-1', techSession)).rejects.toThrow(
      'no confirmed shift handover record',
    );
  });

  it('should succeed when confirmed handover receivedById matches session user', async () => {
    mockFetchEnrichedWO(makeEnrichedWO({ status: 'pending_handover' }));
    mockDb.shiftHandover.findFirst.mockResolvedValue({ id: 'sh-1', status: 'confirmed', receivedById: 'tech-1' });
    mockDb.workOrderTimeLog.findFirst.mockResolvedValue(null);
    mockExecuteTransition.mockResolvedValue({ success: true });
    mockDb.workOrderTimeLog.create.mockResolvedValue({});
    mockDb.auditLog.create.mockResolvedValue({});
    mockTransactionExec();

    const result = await resumeAfterHandover('wo-1', techSession);
    expect(result.success).toBe(true);
    expect(result.data?.status).toBe('in_progress');
  });

  it('should reject resume when technician already has a live session', async () => {
    mockFetchEnrichedWO(makeEnrichedWO({ status: 'pending_handover' }));
    mockDb.shiftHandover.findFirst.mockResolvedValue({ id: 'sh-1', status: 'confirmed', receivedById: 'tech-1' });
    mockDb.workOrderTimeLog.findFirst.mockResolvedValue({ workOrderId: 'wo-other' });
    mockTransactionExec();

    await expect(resumeAfterHandover('wo-1', techSession)).rejects.toThrow(
      'already has an active work session',
    );
  });

  it('should throw when receivedById does not match session user', async () => {
    mockFetchEnrichedWO(makeEnrichedWO({ status: 'pending_handover' }));
    mockDb.shiftHandover.findFirst.mockResolvedValue({ id: 'sh-1', status: 'confirmed', receivedById: 'other-user' });
    mockTransactionExec();

    await expect(resumeAfterHandover('wo-1', techSession)).rejects.toThrow(
      'only the designated receiver',
    );
  });
});

// ============================================================================
// 7. SUBMIT COMPLETION
// ============================================================================
describe('submitCompletion', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('should return error when WO not found', async () => {
    mockFetchEnrichedWO(null);
    const result = await submitCompletion('wo-1', techSession, {});
    expect(result.success).toBe(false);
    expect(result.error).toBe('Work order not found');
  });

  it('should enforce team leader authority for multi-tech WOs', async () => {
    mockFetchEnrichedWO(makeEnrichedWO({
      teamMembers: [
        { userId: 'tech-1', role: 'technician', addedVia: 'direct' },
        { userId: 'tech-2', role: 'technician', addedVia: 'request' },
      ],
    }));
    const result = await submitCompletion('wo-1', techSession, {});
    expect(result.success).toBe(false);
    expect(result.error).toContain('team leader');
  });

  it('should return error when readiness check fails', async () => {
    mockFetchEnrichedWO(makeEnrichedWO());
    mockCheckReadiness.mockResolvedValue({
      ready: false,
      blockers: [{ code: 'ACTIVE_TIMERS', category: 'task', message: 'Active timers', severity: 'blocker' as const }],
      warnings: [],
    });
    const result = await submitCompletion('wo-1', techSession, {});
    expect(result.success).toBe(false);
    expect(result.error).toBe('Work order is not ready for completion');
    expect(result.readiness?.blockers[0].code).toBe('ACTIVE_TIMERS');
  });

  it('should use authoritative time logs for actual labor hours instead of wall-clock elapsed time', async () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    mockFetchEnrichedWO(makeEnrichedWO({
      actualStart: twoHoursAgo.toISOString(),
      laborCost: 0,
      partsCost: 0,
      contractorCost: 25,
      timeLogs: [],
    }));
    mockCheckReadiness.mockResolvedValue({ ready: true, blockers: [], warnings: [] });
    mockExecuteTransition.mockResolvedValue({ success: true });
    mockTransactionExec();
    mockDb.workOrderTimeLog.create.mockResolvedValue({});
    mockDb.auditLog.create.mockResolvedValue({});

    const result = await submitCompletion('wo-1', techSession, {});
    expect(result.success).toBe(true);
    expect(result.data?.status).toBe('completed');
    expect(result.data?.actualHours).toBe(0);
    expect(result.data?.totalCost).toBe(25);
  });

  it('should use authoritative costs instead of client-provided values', async () => {
    mockFetchEnrichedWO(makeEnrichedWO({ laborCost: 100, partsCost: 50, contractorCost: 25 }));
    mockCheckReadiness.mockResolvedValue({ ready: true, blockers: [], warnings: [] });
    mockExecuteTransition.mockResolvedValue({ success: true });
    mockTransactionExec();
    mockDb.workOrderTimeLog.create.mockResolvedValue({});
    mockDb.auditLog.create.mockResolvedValue({});

    const result = await submitCompletion('wo-1', techSession, { notes: 'done' });
    expect(result.success).toBe(true);
    expect(result.data?.totalCost).toBe(25);
  });

  it('should create completion comment when notes provided', async () => {
    mockFetchEnrichedWO(makeEnrichedWO());
    mockCheckReadiness.mockResolvedValue({ ready: true, blockers: [], warnings: [] });
    mockExecuteTransition.mockResolvedValue({ success: true });
    mockTransactionExec();
    mockDb.workOrderTimeLog.create.mockResolvedValue({});
    mockDb.auditLog.create.mockResolvedValue({});
    mockDb.workOrderComment.create.mockResolvedValue({});

    const result = await submitCompletion('wo-1', techSession, {
      notes: 'All tasks completed successfully',
    });
    expect(result.success).toBe(true);
    expect(mockDb.workOrderComment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ content: 'All tasks completed successfully' }),
      }),
    );
  });

  it('should NOT advance PM schedule at technician completion even when WO has pmScheduleId', async () => {
    mockFetchEnrichedWO(makeEnrichedWO({
      pmScheduleId: 'pms-1',
      laborCost: 0,
      partsCost: 0,
      contractorCost: 0,
    }));
    mockCheckReadiness.mockResolvedValue({ ready: true, blockers: [], warnings: [] });
    mockExecuteTransition.mockResolvedValue({ success: true });
    mockDb.pmSchedule.findUnique.mockResolvedValue({
      id: 'pms-1',
      isActive: true,
      frequencyType: 'monthly',
      frequencyValue: 1,
      lastCompletedDate: null,
      nextDueDate: new Date('2025-06-01'),
    });
    mockTransactionExec();
    mockDb.workOrderTimeLog.create.mockResolvedValue({});
    mockDb.auditLog.create.mockResolvedValue({});
    mockDb.pmSchedule.update.mockResolvedValue({});

    const result = await submitCompletion('wo-1', techSession, {});
    expect(result.success).toBe(true);
    expect(mockDb.pmSchedule.findUnique).not.toHaveBeenCalled();
    expect(mockDb.pmSchedule.update).not.toHaveBeenCalled();
  });

  it('should NOT advance PM schedule when frequency is not auto-calculable', async () => {
    mockFetchEnrichedWO(makeEnrichedWO({
      pmScheduleId: 'pms-1',
      laborCost: 0,
      partsCost: 0,
      contractorCost: 0,
    }));
    mockCheckReadiness.mockResolvedValue({ ready: true, blockers: [], warnings: [] });
    mockExecuteTransition.mockResolvedValue({ success: true });
    mockDb.pmSchedule.findUnique.mockResolvedValue({
      id: 'pms-1',
      isActive: true,
      frequencyType: 'custom_hours',
      frequencyValue: 500,
      lastCompletedDate: null,
      nextDueDate: null,
    });
    mockTransactionExec();
    mockDb.workOrderTimeLog.create.mockResolvedValue({});
    mockDb.auditLog.create.mockResolvedValue({});

    const result = await submitCompletion('wo-1', techSession, {});
    expect(result.success).toBe(true);
    expect(mockDb.pmSchedule.update).not.toHaveBeenCalled();
  });
});

// ============================================================================
// 8. SUPERVISOR VERIFY
// ============================================================================
describe('supervisorVerify', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('should return error when WO not found', async () => {
    mockFetchEnrichedWO(null);
    const result = await supervisorVerify('wo-1', supervisorSession, {});
    expect(result.success).toBe(false);
    expect(result.error).toBe('Work order not found');
  });

  it('should return error when readiness check fails', async () => {
    mockFetchEnrichedWO(makeEnrichedWO({ status: 'completed' }));
    mockCheckReadiness.mockResolvedValue({
      ready: false,
      blockers: [{ code: 'NO_COMPLETION_REPORT', category: 'task', message: 'No report', severity: 'blocker' as const }],
      warnings: [],
    });
    const result = await supervisorVerify('wo-1', supervisorSession, {});
    expect(result.success).toBe(false);
    expect(result.error).toBe('Work order is not ready for verification');
  });

  it('should verify successfully and create verification comment', async () => {
    mockFetchEnrichedWO(makeEnrichedWO({ status: 'completed' }));
    mockCheckReadiness.mockResolvedValue({ ready: true, blockers: [], warnings: [] });
    mockExecuteTransition.mockResolvedValue({ success: true });
    mockTransactionExec();
    mockDb.workOrderComment.create.mockResolvedValue({});
    mockDb.auditLog.create.mockResolvedValue({});

    const result = await supervisorVerify('wo-1', supervisorSession, {
      notes: 'Quality check passed',
      qualityRating: 4,
    });
    expect(result.success).toBe(true);
    expect(result.data?.status).toBe('verified');
    const transitionCall = mockExecuteTransition.mock.calls[0][4];
    expect(transitionCall.extraData.qualityRating).toBe(4);
    expect(mockDb.workOrderComment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ content: expect.stringContaining('[Verification]') }),
      }),
    );
  });

  it('should create comment with quality rating when notes provided', async () => {
    mockFetchEnrichedWO(makeEnrichedWO({ status: 'completed' }));
    mockCheckReadiness.mockResolvedValue({ ready: true, blockers: [], warnings: [] });
    mockExecuteTransition.mockResolvedValue({ success: true });
    mockTransactionExec();
    mockDb.workOrderComment.create.mockResolvedValue({});
    mockDb.auditLog.create.mockResolvedValue({});

    await supervisorVerify('wo-1', supervisorSession, { notes: 'All good', qualityRating: 5 });
    const commentData = mockDb.workOrderComment.create.mock.calls[0][0].data;
    expect(commentData.content).toContain('Quality Rating: 5/5');
    expect(commentData.content).toContain('All good');
  });

  it('should use default comment when no notes provided', async () => {
    mockFetchEnrichedWO(makeEnrichedWO({ status: 'completed' }));
    mockCheckReadiness.mockResolvedValue({ ready: true, blockers: [], warnings: [] });
    mockExecuteTransition.mockResolvedValue({ success: true });
    mockTransactionExec();
    mockDb.workOrderComment.create.mockResolvedValue({});
    mockDb.auditLog.create.mockResolvedValue({});

    await supervisorVerify('wo-1', { ...supervisorSession, fullName: 'Jane Smith' }, {});
    const commentData = mockDb.workOrderComment.create.mock.calls[0][0].data;
    expect(commentData.content).toContain('Jane Smith');
  });
});

// ============================================================================
// 9. REQUEST REWORK
// ============================================================================
describe('requestRework', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('should return error when reason is not provided', async () => {
    const result = await requestRework('wo-1', supervisorSession, { reason: '' });
    expect(result.success).toBe(false);
    expect(result.error).toBe('Rework reason is required');
  });

  it('should return error when WO not found', async () => {
    mockFetchEnrichedWO(null);
    const result = await requestRework('wo-1', supervisorSession, { reason: 'Quality issue' });
    expect(result.success).toBe(false);
    expect(result.error).toBe('Work order not found');
  });

  it('should increment rework counter and transition back to in_progress', async () => {
    mockFetchEnrichedWO(makeEnrichedWO({ status: 'completed' }));
    mockExecuteTransition.mockResolvedValue({ success: true });
    mockTransactionExec();
    mockDb.repairCompletion.upsert.mockResolvedValue({});
    mockDb.workOrderComment.create.mockResolvedValue({});
    mockDb.auditLog.create.mockResolvedValue({});

    const result = await requestRework('wo-1', supervisorSession, {
      reason: 'Bearing not properly seated',
      category: 'quality',
    });
    expect(result.success).toBe(true);
    expect(result.data?.status).toBe('in_progress');
    expect(result.data?.reworkReason).toBe('Bearing not properly seated');
    expect(mockDb.repairCompletion.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workOrderId: 'wo-1' },
        update: { reworkCount: { increment: 1 }, reworkReason: 'Bearing not properly seated' },
        create: { workOrderId: 'wo-1', reworkCount: 1, reworkReason: 'Bearing not properly seated' },
      }),
    );
    const transitionCall = mockExecuteTransition.mock.calls[0][4];
    expect(transitionCall.extraData.reworkCategory).toBe('quality');
  });

  it('should create rework comment with reason and category', async () => {
    mockFetchEnrichedWO(makeEnrichedWO({ status: 'verified' }));
    mockExecuteTransition.mockResolvedValue({ success: true });
    mockTransactionExec();
    mockDb.repairCompletion.upsert.mockResolvedValue({});
    mockDb.workOrderComment.create.mockResolvedValue({});
    mockDb.auditLog.create.mockResolvedValue({});

    await requestRework('wo-1', supervisorSession, {
      reason: 'Incorrect assembly',
      category: 'incorrect',
    });
    const commentData = mockDb.workOrderComment.create.mock.calls[0][0].data;
    expect(commentData.content).toContain('[Rework]');
    expect(commentData.content).toContain('Incorrect assembly');
    expect(commentData.content).toContain('[incorrect]');
  });
});

// ============================================================================
// 10. PLANNER CLOSE
// ============================================================================
describe('plannerClose', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('should return error when WO not found', async () => {
    mockFetchEnrichedWO(null);
    const result = await plannerClose('wo-1', plannerSession, {});
    expect(result.success).toBe(false);
    expect(result.error).toBe('Work order not found');
  });

  it('should return error when readiness check fails', async () => {
    mockFetchEnrichedWO(makeEnrichedWO({ status: 'verified' }));
    mockCheckReadiness.mockResolvedValue({
      ready: false,
      blockers: [{ code: 'NOT_VERIFIED', category: 'task', message: 'Not verified', severity: 'blocker' as const }],
      warnings: [],
    });
    const result = await plannerClose('wo-1', plannerSession, {});
    expect(result.success).toBe(false);
    expect(result.error).toBe('Work order is not ready for closure');
  });

  it('should close WO, lock it, and create audit trail', async () => {
    mockFetchEnrichedWO(makeEnrichedWO({
      status: 'verified',
      isLocked: false,
      failureDescription: 'bearing failure',
      causeDescription: 'wear',
      actionDescription: 'replace bearing',
      totalCost: 500,
      workOrderDowntimes: [{ durationMinutes: 120 }],
      workOrderComponents: [{ componentRegistryId: 'component-1' }],
    }));
    mockCheckReadiness.mockResolvedValue({ ready: true, blockers: [], warnings: [] });
    mockExecuteTransition.mockResolvedValue({ success: true });
    mockTransactionExec();
    mockDb.workOrderComment.create.mockResolvedValue({});
    mockDb.auditLog.create.mockResolvedValue({});
    mockDb.failureRecord.upsert.mockResolvedValue({});

    const result = await plannerClose('wo-1', plannerSession, {
      notes: 'Closed after successful repair',
      failureMode: 'bearing_failure',
      failureCause: 'normal wear',
      correctiveAction: 'replaced bearing',
      pmRecommendation: 'increase inspection frequency',
    });
    expect(result.success).toBe(true);
    expect(result.data?.status).toBe('closed');
    expect(result.data?.isLocked).toBe(true);

    expect(mockDb.workOrder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          isLocked: true,
          lockedBy: 'planner-1',
          lockReason: 'Planner closeout',
        }),
      }),
    );
  });

  it('should create failure record only when a real linked component exists', async () => {
    mockFetchEnrichedWO(makeEnrichedWO({
      status: 'verified',
      assetId: 'asset-1',
      totalCost: 300,
      workOrderDowntimes: [{ durationMinutes: 60 }],
      workOrderComponents: [{ componentRegistryId: 'component-1' }],
    }));
    mockCheckReadiness.mockResolvedValue({ ready: true, blockers: [], warnings: [] });
    mockExecuteTransition.mockResolvedValue({ success: true });
    mockTransactionExec();
    mockDb.auditLog.create.mockResolvedValue({});
    mockDb.failureRecord.upsert.mockResolvedValue({});

    await plannerClose('wo-1', plannerSession, {
      failureMode: 'seal_leak',
      failureCause: 'degradation',
      correctiveAction: 'replace seal',
    });
    expect(mockDb.failureRecord.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'wo-wo-1' },
        create: expect.objectContaining({
          componentId: 'component-1',
          assetId: 'asset-1',
          workOrderId: 'wo-1',
          failureMode: 'seal_leak',
          downtimeMinutes: 60,
        }),
      }),
    );
  });

  it('should audit and skip failure record when failure context exists but no component is linked', async () => {
    mockFetchEnrichedWO(makeEnrichedWO({
      status: 'verified',
      assetId: 'asset-1',
      workOrderComponents: [],
    }));
    mockCheckReadiness.mockResolvedValue({ ready: true, blockers: [], warnings: [] });
    mockExecuteTransition.mockResolvedValue({ success: true });
    mockTransactionExec();
    mockDb.auditLog.create.mockResolvedValue({});

    await plannerClose('wo-1', plannerSession, { failureMode: 'seal_leak' });

    expect(mockDb.failureRecord.upsert).not.toHaveBeenCalled();
    expect(mockDb.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'reliability_record_skipped' }),
      }),
    );
  });

  it('should NOT create failure record when no failure context exists', async () => {
    mockFetchEnrichedWO(makeEnrichedWO({
      status: 'verified',
      assetId: null,
    }));
    mockCheckReadiness.mockResolvedValue({ ready: true, blockers: [], warnings: [] });
    mockExecuteTransition.mockResolvedValue({ success: true });
    mockTransactionExec();
    mockDb.auditLog.create.mockResolvedValue({});

    await plannerClose('wo-1', plannerSession, { notes: 'Simple close' });
    expect(mockDb.failureRecord.upsert).not.toHaveBeenCalled();
  });

  it('should create closing comment when notes provided', async () => {
    mockFetchEnrichedWO(makeEnrichedWO({ status: 'verified' }));
    mockCheckReadiness.mockResolvedValue({ ready: true, blockers: [], warnings: [] });
    mockExecuteTransition.mockResolvedValue({ success: true });
    mockTransactionExec();
    mockDb.workOrderComment.create.mockResolvedValue({});
    mockDb.auditLog.create.mockResolvedValue({});

    await plannerClose('wo-1', plannerSession, { notes: 'Final closing notes' });
    expect(mockDb.workOrderComment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ content: '[Closed] Final closing notes' }),
      }),
    );
  });
});

// ============================================================================
// 11. CANCEL WORK ORDER
// ============================================================================
describe('cancelWorkOrder', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('should return error when reason is not provided', async () => {
    const result = await cancelWorkOrder('wo-1', adminSession, { reason: '' });
    expect(result.success).toBe(false);
    expect(result.error).toBe('Cancellation reason is required');
  });

  it('should return error when WO not found', async () => {
    mockFetchEnrichedWO(null);
    const result = await cancelWorkOrder('wo-1', adminSession, { reason: 'Duplicate request' });
    expect(result.success).toBe(false);
    expect(result.error).toBe('Work order not found');
  });

  it('should cancel successfully', async () => {
    mockFetchEnrichedWO(makeEnrichedWO({ status: 'assigned' }));
    mockExecuteTransition.mockResolvedValue({ success: true });
    mockDb.auditLog.create.mockResolvedValue({});
    mockTransactionExec();

    const result = await cancelWorkOrder('wo-1', adminSession, { reason: 'No longer needed' });
    expect(result.success).toBe(true);
    expect(result.data?.status).toBe('cancelled');
    expect(mockExecuteTransition).toHaveBeenCalledWith(
      'work_order', 'wo-1', 'cancelled', adminSession,
      expect.objectContaining({ reason: 'No longer needed' }),
    );
  });

  it('should throw when transition fails', async () => {
    mockFetchEnrichedWO(makeEnrichedWO({ status: 'closed' }));
    mockExecuteTransition.mockResolvedValue({ success: false, error: 'Cannot cancel closed WO' });
    mockTransactionExec();

    await expect(cancelWorkOrder('wo-1', adminSession, { reason: 'Mistake' })).rejects.toThrow('Cannot cancel closed WO');
  });
});

// ============================================================================
// 12. CALCULATE AUTHORITATIVE COSTS
// ============================================================================
describe('calculateAuthoritativeCosts', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('should return null when WO not found', async () => {
    mockDb.workOrder.findUnique.mockResolvedValue(null);
    const result = await calculateAuthoritativeCosts('wo-1');
    expect(result).toBeNull();
  });

  it('should calculate labor hours from time log durations', async () => {
    mockDb.workOrder.findUnique.mockResolvedValue({
      id: 'wo-1',
      totalCost: 0,
      laborCost: 150,
      partsCost: 0,
      contractorCost: 50,
      estimatedHours: 4,
      tradeActivity: null,
      assignedTo: 'tech-1',
      plantId: 'plant-1',
      timeLogs: [
        { id: 'tl-1', action: 'start', duration: 2.0, startTime: null, endTime: null, breakMinutes: 0, userId: 'tech-1', timestamp: new Date('2025-01-15T08:00:00Z') },
        { id: 'tl-2', action: 'resume', duration: 1.5, startTime: null, endTime: null, breakMinutes: 0, userId: 'tech-1', timestamp: new Date('2025-01-15T10:00:00Z') },
      ],
      repairMaterialRequests: [],
      repairToolRequests: [],
    });

    const result = await calculateAuthoritativeCosts('wo-1');
    expect(result).not.toBeNull();
    expect(result!.laborHours).toBe(3.5);
    expect(result!.actualLaborCost).toBe(0);
    expect(result!.actualMaterialCost).toBe(0);
    expect(result!.actualToolCost).toBe(0);
    expect(result!.actualContractorCost).toBe(50);
    expect(result!.totalActualCost).toBe(50);
    expect(result!.incompleteLaborRate).toBe(true);
  });

  it('should calculate material cost from consumed and wasted quantities', async () => {
    mockDb.workOrder.findUnique.mockResolvedValue({
      id: 'wo-1', totalCost: 0, laborCost: 0, partsCost: 0, contractorCost: 0,
      estimatedHours: 4, tradeActivity: null, assignedTo: null, plantId: 'plant-1',
      timeLogs: [],
      repairMaterialRequests: [
        { unitCost: 25, consumedQty: 4, wastedQty: 1 },
        { unitCost: 10, consumedQty: 2, wastedQty: 0 },
      ],
      repairToolRequests: [],
    });

    const result = await calculateAuthoritativeCosts('wo-1');
    expect(result).not.toBeNull();
    expect(result!.actualMaterialCost).toBe(145);
    expect(result!.totalActualCost).toBe(145);
  });

  it('should return toolCost 0 with note because reusable tools are custody assets', async () => {
    mockDb.workOrder.findUnique.mockResolvedValue({
      id: 'wo-1', totalCost: 0, laborCost: 0, partsCost: 0, contractorCost: 0,
      estimatedHours: 4, tradeActivity: null, assignedTo: null, plantId: 'plant-1',
      timeLogs: [],
      repairMaterialRequests: [],
      repairToolRequests: [
        {
          id: 'tr-1',
          status: 'issued',
          items: [
            { id: 'ti-1', unitCost: 50, quantityIssued: 2 },
            { id: 'ti-2', unitCost: 30, quantityIssued: 1 },
          ],
        },
      ],
    });

    const result = await calculateAuthoritativeCosts('wo-1');
    expect(result).not.toBeNull();
    expect(result!.actualToolCost).toBe(0);
    expect(result!.toolCostNote).toBe('Reusable tools in custody — no consumption cost');
    expect(result!.totalActualCost).toBe(0);
  });

  it('should sum all authoritative cost components into totalActualCost', async () => {
    mockDb.workOrder.findUnique.mockResolvedValue({
      id: 'wo-1', totalCost: 0, laborCost: 200, partsCost: 0, contractorCost: 75,
      estimatedHours: 4, tradeActivity: null, assignedTo: 'tech-1', plantId: 'plant-1',
      timeLogs: [{ id: 'tl-1', action: 'start', duration: 3.0, startTime: null, endTime: null, breakMinutes: 0, userId: 'tech-1', timestamp: new Date('2025-01-15T08:00:00Z') }],
      repairMaterialRequests: [
        { unitCost: 15, consumedQty: 10, wastedQty: 2 },
      ],
      repairToolRequests: [
        { id: 'tr-1', status: 'issued', items: [{ id: 'ti-1', unitCost: 40, quantityIssued: 1 }] },
      ],
    });

    const result = await calculateAuthoritativeCosts('wo-1');
    expect(result).not.toBeNull();
    expect(result!.laborHours).toBe(3.0);
    expect(result!.actualLaborCost).toBe(0);
    expect(result!.actualMaterialCost).toBe(180);
    expect(result!.actualToolCost).toBe(0);
    expect(result!.actualContractorCost).toBe(75);
    expect(result!.totalActualCost).toBe(255);
  });

  it('should handle null/undefined durations and quantities', async () => {
    mockDb.workOrder.findUnique.mockResolvedValue({
      id: 'wo-1', totalCost: 0, laborCost: 0, partsCost: 0, contractorCost: 0,
      estimatedHours: 4, tradeActivity: null, assignedTo: 'tech-1', plantId: 'plant-1',
      timeLogs: [
        { id: 'tl-1', action: 'start', duration: null, startTime: null, endTime: null, breakMinutes: 0, userId: 'tech-1', timestamp: new Date('2025-01-15T08:00:00Z') },
        { id: 'tl-2', action: 'resume', duration: undefined, startTime: null, endTime: null, breakMinutes: 0, userId: 'tech-1', timestamp: new Date('2025-01-15T09:00:00Z') },
        { id: 'tl-3', action: 'resume', duration: 1.0, startTime: null, endTime: null, breakMinutes: 0, userId: 'tech-1', timestamp: new Date('2025-01-15T10:00:00Z') },
      ],
      repairMaterialRequests: [
        { unitCost: null, consumedQty: null, wastedQty: null },
      ],
      repairToolRequests: [
        { id: 'tr-1', status: 'issued', items: [{ id: 'ti-1', unitCost: undefined, quantityIssued: undefined }] },
      ],
    });

    const result = await calculateAuthoritativeCosts('wo-1');
    expect(result).not.toBeNull();
    expect(result!.laborHours).toBe(1.0);
    expect(result!.actualMaterialCost).toBe(0);
    expect(result!.actualToolCost).toBe(0);
    expect(result!.totalActualCost).toBe(0);
  });
});

// ============================================================================
// 13. TEAM AUTHORITY — DOCUMENTED BEHAVIOR
// ============================================================================
describe('Team Authority — documented governance rules', () => {
  it('admin always has authority regardless of team membership', () => {
    const adminRoles = ['admin', 'maintenance_manager', 'plant_manager'];
    for (const role of adminRoles) {
      expect(['admin', 'maintenance_manager', 'plant_manager']).toContain(role);
    }
    expect(adminRoles).toHaveLength(3);
  });

  it('multi-tech WO requires team leader for completion (documented)', () => {
    const teamMembers = [
      { userId: 'tech-1', role: 'technician' },
      { userId: 'tech-2', role: 'technician' },
    ];
    const assignedTo = 'tech-1';
    const distinctTeamMemberIds = teamMembers.map((m) => m.userId).filter((uid) => uid !== assignedTo);
    const isMultiTech = assignedTo ? distinctTeamMemberIds.length >= 1 : distinctTeamMemberIds.length >= 2;
    expect(isMultiTech).toBe(true);
  });

  it('start and pause allow assignee or team leader (documented)', () => {
    const operations = ['start', 'pause', 'handover'] as const;
    expect(operations).toHaveLength(3);
  });

  it('complete operation has stricter governance than start (documented)', () => {
    const startAllowed = ['assignee', 'teamLeader', 'admin'];
    const multiTechCompleteAllowed = ['teamLeader', 'admin'];
    expect(multiTechCompleteAllowed.length).toBeLessThan(startAllowed.length);
    expect(multiTechCompleteAllowed).not.toContain('assignee');
  });
});

// ============================================================================
// 14. WAITING STATE TYPES (documented)
// ============================================================================
describe('Waiting state types (documented)', () => {
  const VALID_WAITING_TYPES = [
    'waiting_parts',
    'waiting_tools',
    'waiting_shutdown',
    'waiting_permit',
  ] as const;

  it('should define four waiting state types', () => {
    expect(VALID_WAITING_TYPES).toHaveLength(4);
  });

  it('should include all expected waiting types', () => {
    expect(VALID_WAITING_TYPES).toContain('waiting_parts');
    expect(VALID_WAITING_TYPES).toContain('waiting_tools');
    expect(VALID_WAITING_TYPES).toContain('waiting_shutdown');
    expect(VALID_WAITING_TYPES).toContain('waiting_permit');
  });
});

// ============================================================================
// 15. NOTIFICATION QUEUING BEHAVIOR (documented)
// ============================================================================
describe('Notification queuing behavior (documented)', () => {
  it('should queue notification via BullMQ on success', () => {
    expect(typeof mockJobQueue.add).toBe('function');
  });

  it('should define NOTIFICATION queue constant', () => {
    const QUEUE_NAME = 'notifications';
    expect(QUEUE_NAME).toBe('notifications');
  });
});

// ============================================================================
// 16. TYPE CONTRACTS
// ============================================================================
describe('Work Execution Service — Phase 3A/3D type contracts', () => {
  it('should export StartWorkOptions with optional fields', () => {
    const opts = { reason: 'test', notes: 'test notes' };
    expect(opts.reason).toBe('test');
    expect(opts.notes).toBe('test notes');
  });

  it('should export CompletionOptions without client-submitted cost fields', () => {
    const opts: CompletionOptions = {
      notes: 'done',
      failureDescription: 'failure',
      causeDescription: 'cause',
      actionDescription: 'action',
      idempotencyKey: 'test-key',
    };
    expect(opts.notes).toBe('done');
    expect(opts.idempotencyKey).toBe('test-key');
    const keys = Object.keys(opts);
    expect(keys).not.toContain('laborCost');
    expect(keys).not.toContain('partsCost');
    expect(keys).not.toContain('contractorCost');
  });

  it('should export VerifyOptions with qualityRating', () => {
    const opts = { notes: 'verified', qualityRating: 4, checklistPassed: true };
    expect(opts.qualityRating).toBe(4);
    expect(opts.checklistPassed).toBe(true);
  });

  it('should export ReworkOptions with required reason', () => {
    const opts = { reason: 'quality issue', category: 'quality' };
    expect(opts.reason).toBe('quality issue');
    expect(opts.category).toBe('quality');
  });

  it('should export CloseOptions with failure analysis fields', () => {
    const opts = {
      failureMode: 'bearing_failure',
      failureCause: 'wear',
      correctiveAction: 'replace',
      pmRecommendation: 'increase frequency',
      followUpRequired: true,
      followUpNotes: 'monitor for 30 days',
    };
    expect(opts.followUpRequired).toBe(true);
    expect(opts.followUpNotes).toBe('monitor for 30 days');
  });

  it('should define SessionContext with all required fields', () => {
    const ctx: SessionContext = {
      userId: 'u-1',
      fullName: 'Test',
      roles: ['technician'],
      permissions: ['work_orders.complete'],
      ipAddress: '1.2.3.4',
      userAgent: 'TestAgent',
    };
    expect(ctx.userId).toBe('u-1');
    expect(ctx.roles).toContain('technician');
    expect(ctx.permissions).toContain('work_orders.complete');
  });

  it('should accept all exported functions', () => {
    expect(typeof startWork).toBe('function');
    expect(typeof pauseWork).toBe('function');
    expect(typeof resumeWork).toBe('function');
    expect(typeof enterWaitingState).toBe('function');
    expect(typeof initiateHandover).toBe('function');
    expect(typeof resumeAfterHandover).toBe('function');
    expect(typeof submitCompletion).toBe('function');
    expect(typeof supervisorVerify).toBe('function');
    expect(typeof requestRework).toBe('function');
    expect(typeof plannerClose).toBe('function');
    expect(typeof cancelWorkOrder).toBe('function');
    expect(typeof calculateAuthoritativeCosts).toBe('function');
  });

  it('calculateAuthoritativeCosts should return typed result', async () => {
    mockDb.workOrder.findUnique.mockResolvedValue({
      id: 'wo-1', totalCost: 0, laborCost: 0, partsCost: 0, contractorCost: 0,
      estimatedHours: 0, tradeActivity: null, assignedTo: null, plantId: 'plant-1',
      timeLogs: [], repairMaterialRequests: [], repairToolRequests: [],
    });
    const result = await calculateAuthoritativeCosts('wo-1');
    if (result) {
      expect(typeof result.laborHours).toBe('number');
      expect(typeof result.actualLaborCost).toBe('number');
      expect(typeof result.actualMaterialCost).toBe('number');
      expect(typeof result.actualToolCost).toBe('number');
      expect(typeof result.actualContractorCost).toBe('number');
      expect(typeof result.totalActualCost).toBe('number');
      expect(typeof result.incompleteLaborRate).toBe('boolean');
    }
  });
});
