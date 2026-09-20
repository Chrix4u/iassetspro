import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

const { mockDb } = vi.hoisted(() => ({
  mockDb: {
    statusTransition: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
      upsert: vi.fn(),
    },
    workOrder: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
    maintenanceRequest: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
    workOrderStatusHistory: { create: vi.fn() },
    maintenanceRequestComment: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock('@/lib/db', () => ({ db: mockDb }));

import {
  DEFAULT_WO_TRANSITIONS,
  checkTransition,
  executeTransition,
  getAvailableTransitions,
} from '../state-machine';

const adminSession = { userId: 'admin-1', roles: ['admin'], permissions: [] };
const plannerSession = { userId: 'planner-1', roles: ['planner'], permissions: [] };
const operatorSession = { userId: 'op-1', roles: ['operator'], permissions: [] };

function mockTransitionRule(overrides: Record<string, unknown> = {}) {
  return {
    id: 'test-rule',
    entityType: 'work_order',
    fromStatus: 'draft',
    toStatus: 'assigned',
    allowedRoleSlugs: JSON.stringify(['planner', 'admin']),
    requiresReason: false,
    sortOrder: 0,
    ...overrides,
  };
}

function transactionClient(overrides: Record<string, unknown> = {}) {
  return {
    statusTransition: {
      findFirst: vi.fn().mockResolvedValue(mockTransitionRule()),
    },
    workOrder: {
      findUnique: vi.fn()
        .mockResolvedValueOnce({ status: 'draft' })
        .mockResolvedValueOnce({ id: 'wo-1', status: 'assigned' }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    maintenanceRequest: {
      findUnique: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    workOrderStatusHistory: { create: vi.fn().mockResolvedValue({}) },
    maintenanceRequestComment: { create: vi.fn().mockResolvedValue({}) },
    ...overrides,
  };
}

describe('checkTransition', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (mockDb.statusTransition.count as Mock).mockResolvedValue(1);
  });

  it('uses the default DB client when no transaction is supplied', async () => {
    (mockDb.statusTransition.findFirst as Mock).mockResolvedValue(mockTransitionRule());

    const result = await checkTransition('work_order', 'draft', 'assigned', adminSession);

    expect(result.allowed).toBe(true);
    expect(mockDb.statusTransition.findFirst).toHaveBeenCalledTimes(1);
  });

  it('uses the supplied transaction client', async () => {
    const tx = transactionClient();

    const result = await checkTransition(
      'work_order',
      'draft',
      'assigned',
      adminSession,
      tx as any, // eslint-disable-line @typescript-eslint/no-explicit-any
    );

    expect(result.allowed).toBe(true);
    expect(tx.statusTransition.findFirst).toHaveBeenCalledTimes(1);
    expect(mockDb.statusTransition.findFirst).not.toHaveBeenCalled();
  });

  it('rejects a missing persisted rule for a canonical transition', async () => {
    (mockDb.statusTransition.findFirst as Mock).mockResolvedValue(null);

    const result = await checkTransition('work_order', 'draft', 'requested', adminSession);

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('No transition rule found');
  });

  it('rejects persisted lifecycle pairs that are not canonical', async () => {
    (mockDb.statusTransition.findFirst as Mock).mockResolvedValue(
      mockTransitionRule({
        fromStatus: 'completed',
        toStatus: 'closed',
        allowedRoleSlugs: JSON.stringify(['admin']),
      }),
    );

    const result = await checkTransition('work_order', 'completed', 'closed', adminSession);

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('not part of the canonical work_order lifecycle');
    expect(mockDb.statusTransition.findFirst).not.toHaveBeenCalled();
  });

  it('rejects a role that is not allowed by the transition', async () => {
    (mockDb.statusTransition.findFirst as Mock).mockResolvedValue(mockTransitionRule());

    const result = await checkTransition('work_order', 'draft', 'assigned', operatorSession);

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('does not allow this transition');
  });

  it('allows admin to bypass the transition role list', async () => {
    (mockDb.statusTransition.findFirst as Mock).mockResolvedValue(
      mockTransitionRule({ allowedRoleSlugs: JSON.stringify(['planner']) }),
    );

    const result = await checkTransition('work_order', 'draft', 'assigned', adminSession);

    expect(result.allowed).toBe(true);
  });
});

describe('executeTransition compare-and-set boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (mockDb.statusTransition.count as Mock).mockResolvedValue(1);
  });

  it('uses one conditional status claim before writing work-order history', async () => {
    const tx = transactionClient();

    const result = await executeTransition(
      'work_order',
      'wo-1',
      'assigned',
      adminSession,
      { tx: tx as any }, // eslint-disable-line @typescript-eslint/no-explicit-any
    );

    expect(result.success).toBe(true);
    expect(tx.workOrder.updateMany).toHaveBeenCalledWith({
      where: { id: 'wo-1', status: 'draft' },
      data: { status: 'assigned' },
    });
    expect(tx.workOrderStatusHistory.create).toHaveBeenCalledTimes(1);
  });

  it('fails closed when another request changed the state first', async () => {
    const tx = transactionClient({
      workOrder: {
        findUnique: vi.fn().mockResolvedValueOnce({ status: 'draft' }),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    });

    const result = await executeTransition(
      'work_order',
      'wo-1',
      'assigned',
      adminSession,
      { tx: tx as any }, // eslint-disable-line @typescript-eslint/no-explicit-any
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('Transition conflict');
    expect(tx.workOrderStatusHistory.create).not.toHaveBeenCalled();
  });

  it('merges trusted extraData into the conditional transition update', async () => {
    const tx = transactionClient();

    await executeTransition(
      'work_order',
      'wo-1',
      'assigned',
      adminSession,
      {
        tx: tx as any, // eslint-disable-line @typescript-eslint/no-explicit-any
        extraData: { actualEnd: null, notes: 'transition payload' },
      },
    );

    expect(tx.workOrder.updateMany).toHaveBeenCalledWith({
      where: { id: 'wo-1', status: 'draft' },
      data: {
        status: 'assigned',
        actualEnd: null,
        notes: 'transition payload',
      },
    });
  });

  it('creates its own transaction and still performs a conditional claim', async () => {
    (mockDb.statusTransition.findFirst as Mock).mockResolvedValue(mockTransitionRule());
    (mockDb.workOrder.findUnique as Mock)
      .mockResolvedValueOnce({ status: 'draft' })
      .mockResolvedValueOnce({ id: 'wo-1', status: 'assigned' });

    const innerTx = transactionClient();
    (mockDb.$transaction as Mock).mockImplementation(
      async (callback: (tx: typeof innerTx) => Promise<unknown>) => callback(innerTx),
    );

    const result = await executeTransition('work_order', 'wo-1', 'assigned', adminSession);

    expect(result.success).toBe(true);
    expect(mockDb.$transaction).toHaveBeenCalledTimes(1);
    expect(innerTx.workOrder.updateMany).toHaveBeenCalledWith({
      where: { id: 'wo-1', status: 'draft' },
      data: { status: 'assigned' },
    });
  });

  it('enforces required transition reasons before attempting a claim', async () => {
    const tx = transactionClient({
      statusTransition: {
        findFirst: vi.fn().mockResolvedValue(
          mockTransitionRule({ requiresReason: true }),
        ),
      },
    });

    const result = await executeTransition(
      'work_order',
      'wo-1',
      'assigned',
      adminSession,
      { tx: tx as any }, // eslint-disable-line @typescript-eslint/no-explicit-any
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('requires a reason');
    expect(tx.workOrder.updateMany).not.toHaveBeenCalled();
  });

  it('uses the same conditional claim for maintenance-request conversion', async () => {
    const tx = transactionClient({
      statusTransition: {
        findFirst: vi.fn().mockResolvedValue(
          mockTransitionRule({
            entityType: 'maintenance_request',
            fromStatus: 'approved',
            toStatus: 'converted',
            allowedRoleSlugs: JSON.stringify(['planner', 'admin']),
          }),
        ),
      },
      maintenanceRequest: {
        findUnique: vi.fn()
          .mockResolvedValueOnce({ status: 'approved' })
          .mockResolvedValueOnce({ id: 'mr-1', status: 'converted' }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    });

    const result = await executeTransition(
      'maintenance_request',
      'mr-1',
      'converted',
      plannerSession,
      {
        tx: tx as any, // eslint-disable-line @typescript-eslint/no-explicit-any
        extraData: { workOrderId: 'wo-new-1' },
      },
    );

    expect(result.success).toBe(true);
    expect(tx.maintenanceRequest.updateMany).toHaveBeenCalledWith({
      where: { id: 'mr-1', status: 'approved' },
      data: { status: 'converted', workOrderId: 'wo-new-1' },
    });
    expect(tx.maintenanceRequestComment.create).toHaveBeenCalledTimes(1);
  });
});

describe('canonical work-order transition defaults', () => {
  it('matches the audited cancellation and hold contract', () => {
    const transitions = new Map(
      DEFAULT_WO_TRANSITIONS.map((transition) => [
        `${transition.fromStatus ?? 'NULL'}->${transition.toStatus}`,
        transition,
      ]),
    );

    expect(DEFAULT_WO_TRANSITIONS).toHaveLength(38);
    expect(transitions.has('approved->cancelled')).toBe(true);
    expect(transitions.has('planned->cancelled')).toBe(true);
    expect(transitions.has('on_hold->cancelled')).toBe(true);
    expect(transitions.get('in_progress->on_hold')?.requiresReason).toBe(true);
    expect(transitions.has('completed->closed')).toBe(false);
    expect(transitions.has('verified->closed')).toBe(true);
  });
});

describe('getAvailableTransitions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (mockDb.statusTransition.count as Mock).mockResolvedValue(1);
  });

  it('returns only canonical role-filtered transition rows', async () => {
    (mockDb.statusTransition.findMany as Mock).mockResolvedValue([
      mockTransitionRule(),
      mockTransitionRule({
        id: 'stale-rule',
        fromStatus: 'draft',
        toStatus: 'closed',
        allowedRoleSlugs: JSON.stringify(['admin']),
      }),
    ]);

    const transitions = await getAvailableTransitions('work_order', 'draft', adminSession);

    expect(transitions).toEqual([
      {
        fromStatus: 'draft',
        toStatus: 'assigned',
        allowedRoleSlugs: ['planner', 'admin'],
        requiresReason: false,
      },
    ]);
  });
});
