import { beforeEach, describe, expect, it, vi } from 'vitest';

const { db, tx } = vi.hoisted(() => {
  const tx = {
    $queryRaw: vi.fn(),
    tool: { findUnique: vi.fn(), updateMany: vi.fn() },
    user: { findUnique: vi.fn() },
    toolTransferRequest: { findFirst: vi.fn(), findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
    repairToolRequest: { findMany: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn() },
    repairToolRequestItem: { findMany: vi.fn(), updateMany: vi.fn() },
    toolTransaction: { create: vi.fn() },
  };
  return { tx, db: { $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)) } };
});

vi.mock('@/lib/db', () => ({ db }));

import {
  acceptToolTransfer,
  completeToolTransfer,
  createToolTransferRequest,
  ToolTransferConflictError,
} from '../toolTransfer.service';

function transfer(overrides: Record<string, unknown> = {}) {
  return {
    id: 'xfer-1', toolId: 'tool-1', fromUserId: 'tech-1', toUserId: 'tech-2', requestedById: 'tech-1',
    reason: 'Shift handover', status: 'awaiting_handover', transferredAt: null,
    fromUserAcceptedAt: new Date('2026-09-14T10:00:00Z'), toUserAcceptedAt: new Date('2026-09-14T10:01:00Z'),
    toolConditionAtTransfer: 'good', tool: { id: 'tool-1', assignedToId: 'tech-1' },
    ...overrides,
  };
}

function sourceRequest(itemOverrides: Record<string, unknown> = {}) {
  return {
    id: 'req-1', workOrderId: 'wo-1', requestedById: 'tech-1', status: 'issued',
    items: [{ id: 'item-1', toolId: 'tool-1', quantityIssued: 1, quantityReturned: 0, quantityTransferred: 0, ...itemOverrides }],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  tx.$queryRaw.mockResolvedValue([]);
  tx.tool.updateMany.mockResolvedValue({ count: 1 });
  tx.toolTransferRequest.updateMany.mockResolvedValue({ count: 1 });
  tx.repairToolRequestItem.updateMany.mockResolvedValue({ count: 1 });
  tx.repairToolRequest.updateMany.mockResolvedValue({ count: 1 });
  tx.repairToolRequestItem.findMany.mockResolvedValue([{ quantityIssued: 1, quantityReturned: 0, quantityTransferred: 1 }]);
  tx.toolTransaction.create.mockResolvedValue({});
  tx.repairToolRequest.findMany.mockResolvedValue([sourceRequest()]);
  tx.user.findUnique.mockResolvedValue({
    id: 'tech-2',
    status: 'active',
    userRoles: [{ role: { slug: 'maintenance_technician' } }],
    plantAccess: [{ id: 'up-1' }],
  });
});

describe('createToolTransferRequest', () => {
  it('requires the declared sender to be the actual current custodian', async () => {
    tx.tool.findUnique.mockResolvedValue({ id: 'tool-1', assignedToId: 'other-tech', plantId: 'plant-1' });
    await expect(createToolTransferRequest({
      toolId: 'tool-1', fromUserId: 'tech-1', toUserId: 'tech-2', reason: 'handover', requestedById: 'admin-1',
    })).rejects.toBeInstanceOf(ToolTransferConflictError);
    expect(tx.toolTransferRequest.create).not.toHaveBeenCalled();
  });

  it('rejects an inactive transfer recipient', async () => {
    tx.tool.findUnique.mockResolvedValue({ id: 'tool-1', assignedToId: 'tech-1', plantId: 'plant-1' });
    tx.user.findUnique.mockResolvedValue({
      id: 'tech-2',
      status: 'inactive',
      userRoles: [{ role: { slug: 'maintenance_technician' } }],
      plantAccess: [{ id: 'up-1' }],
    });

    await expect(createToolTransferRequest({
      toolId: 'tool-1', fromUserId: 'tech-1', toUserId: 'tech-2', reason: 'handover', requestedById: 'tech-1',
    })).rejects.toThrow('Transfer recipient is not active');
    expect(tx.toolTransferRequest.create).not.toHaveBeenCalled();
  });

  it('rejects a recipient who is not a maintenance technician', async () => {
    tx.tool.findUnique.mockResolvedValue({ id: 'tool-1', assignedToId: 'tech-1', plantId: 'plant-1' });
    tx.user.findUnique.mockResolvedValue({
      id: 'user-2',
      status: 'active',
      userRoles: [{ role: { slug: 'production_operator' } }],
      plantAccess: [{ id: 'up-1' }],
    });

    await expect(createToolTransferRequest({
      toolId: 'tool-1', fromUserId: 'tech-1', toUserId: 'user-2', reason: 'handover', requestedById: 'tech-1',
    })).rejects.toThrow('Transfer recipient must be an active maintenance technician');
    expect(tx.toolTransferRequest.create).not.toHaveBeenCalled();
  });

  it('rejects a technician without access to the tool plant', async () => {
    tx.tool.findUnique.mockResolvedValue({ id: 'tool-1', assignedToId: 'tech-1', plantId: 'plant-1' });
    tx.user.findUnique.mockResolvedValue({
      id: 'tech-2',
      status: 'active',
      userRoles: [{ role: { slug: 'maintenance_technician' } }],
      plantAccess: [],
    });

    await expect(createToolTransferRequest({
      toolId: 'tool-1', fromUserId: 'tech-1', toUserId: 'tech-2', reason: 'handover', requestedById: 'tech-1',
    })).rejects.toThrow('Transfer recipient is not authorized for the tool plant');
    expect(tx.toolTransferRequest.create).not.toHaveBeenCalled();
  });

  it('rejects a second active transfer for the same physical tool', async () => {
    tx.tool.findUnique.mockResolvedValue({ id: 'tool-1', assignedToId: 'tech-1', plantId: 'plant-1' });
    tx.toolTransferRequest.findFirst.mockResolvedValue({ id: 'existing' });
    await expect(createToolTransferRequest({
      toolId: 'tool-1', fromUserId: 'tech-1', toUserId: 'tech-2', reason: 'handover', requestedById: 'tech-1',
    })).rejects.toBeInstanceOf(ToolTransferConflictError);
  });

  it('creates pending transfer without touching quantityTransferred', async () => {
    tx.tool.findUnique.mockResolvedValue({ id: 'tool-1', assignedToId: 'tech-1', plantId: 'plant-1' });
    tx.toolTransferRequest.findFirst.mockResolvedValue(null);
    tx.toolTransferRequest.create.mockResolvedValue({ id: 'xfer-1', status: 'pending' });
    await createToolTransferRequest({
      toolId: 'tool-1', fromUserId: 'tech-1', toUserId: 'tech-2', reason: 'handover', requestedById: 'tech-1',
    });
    expect(tx.repairToolRequestItem.updateMany).not.toHaveBeenCalled();
    expect(tx.toolTransaction.create).not.toHaveBeenCalled();
  });
});

describe('completeToolTransfer', () => {
  it('moves custody and increments the exact originating request once', async () => {
    tx.toolTransferRequest.findUnique.mockResolvedValue(transfer());
    tx.repairToolRequest.findMany.mockResolvedValue([sourceRequest()]);
    tx.toolTransferRequest.findUniqueOrThrow.mockResolvedValue({ id: 'xfer-1', status: 'transferred' });

    const result = await completeToolTransfer('xfer-1');
    expect(result.completedNow).toBe(true);
    expect(tx.tool.updateMany).toHaveBeenCalledWith({
      where: { id: 'tool-1', assignedToId: 'tech-1' },
      data: { assignedToId: 'tech-2', status: 'checked_out' },
    });
    expect(tx.repairToolRequestItem.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.toolTransaction.create).toHaveBeenCalledTimes(1);
  });

  it('blocks completion when physical custodian changed', async () => {
    tx.toolTransferRequest.findUnique.mockResolvedValue(transfer({ tool: { id: 'tool-1', assignedToId: 'someone-else' } }));
    await expect(completeToolTransfer('xfer-1')).rejects.toBeInstanceOf(ToolTransferConflictError);
    expect(tx.toolTransaction.create).not.toHaveBeenCalled();
  });

  it('fails safely when originating custody is ambiguous', async () => {
    tx.toolTransferRequest.findUnique.mockResolvedValue(transfer());
    tx.repairToolRequest.findMany.mockResolvedValue([sourceRequest(), { ...sourceRequest(), id: 'req-2', items: [{ ...sourceRequest().items[0], id: 'item-2' }] }]);
    await expect(completeToolTransfer('xfer-1')).rejects.toBeInstanceOf(ToolTransferConflictError);
    expect(tx.tool.updateMany).not.toHaveBeenCalled();
  });

  it('completes legacy single-tool custody by closing the originating request', async () => {
    tx.toolTransferRequest.findUnique.mockResolvedValue(transfer());
    tx.repairToolRequest.findMany.mockResolvedValue([{
      id: 'req-legacy', workOrderId: 'wo-legacy', requestedById: 'tech-1', status: 'issued', toolId: 'tool-1', items: [],
    }]);
    tx.toolTransferRequest.findUniqueOrThrow.mockResolvedValue({ id: 'xfer-1', status: 'transferred' });

    const result = await completeToolTransfer('xfer-1');
    expect(result.completedNow).toBe(true);
    expect(tx.repairToolRequest.updateMany).toHaveBeenCalledWith({
      where: { id: 'req-legacy', status: 'issued', toolId: 'tool-1' },
      data: { status: 'transferred', returnedAt: expect.any(Date) },
    });
    expect(tx.repairToolRequestItem.updateMany).not.toHaveBeenCalled();
  });

  it('is idempotent after transfer already completed', async () => {
    tx.toolTransferRequest.findUnique.mockResolvedValue(transfer({ status: 'transferred', transferredAt: new Date() }));
    const result = await completeToolTransfer('xfer-1');
    expect(result.completedNow).toBe(false);
    expect(tx.repairToolRequestItem.updateMany).not.toHaveBeenCalled();
    expect(tx.toolTransaction.create).not.toHaveBeenCalled();
  });
});

describe('acceptToolTransfer', () => {
  it('does not release custody until both parties have accepted', async () => {
    tx.toolTransferRequest.updateMany.mockResolvedValue({ count: 1 });
    tx.toolTransferRequest.findUnique.mockResolvedValue(transfer({ toUserAcceptedAt: null }));
    const result = await acceptToolTransfer('xfer-1', 'from');
    expect(result.completedNow).toBe(false);
    expect(tx.tool.updateMany).not.toHaveBeenCalled();
    expect(tx.repairToolRequestItem.updateMany).not.toHaveBeenCalled();
  });
});
