import { db } from '@/lib/db';
import type { Prisma } from '@prisma/client';

export class ToolTransferConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ToolTransferConflictError';
  }
}

export class ToolTransferNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ToolTransferNotFoundError';
  }
}

type Tx = Prisma.TransactionClient;
type AcceptanceParty = 'from' | 'to';

type CreateTransferInput = {
  toolId: string;
  fromUserId: string;
  toUserId: string;
  reason: string;
  notes?: string | null;
  requestedById: string;
};

const transferInclude = {
  tool: { select: { id: true, toolCode: true, name: true, plantId: true } },
  fromUser: { select: { id: true, fullName: true } },
  toUser: { select: { id: true, fullName: true } },
  requestedBy: { select: { id: true, fullName: true } },
} satisfies Prisma.ToolTransferRequestInclude;

async function resolveOriginatingRequestItem(tx: Tx, toolId: string, fromUserId: string) {
  const requests = await tx.repairToolRequest.findMany({
    where: {
      requestedById: fromUserId,
      status: 'issued',
      OR: [{ toolId }, { items: { some: { toolId } } }],
    },
    include: { items: true },
  });

  const matches: { request: (typeof requests)[number]; item: (typeof requests)[number]['items'][number] | null }[] = [];
  for (const request of requests) {
    if (request.items.length === 0 && request.toolId === toolId) {
      matches.push({ request, item: null });
      continue;
    }
    for (const item of request.items) {
      if (item.toolId === toolId && item.quantityIssued > item.quantityReturned + item.quantityTransferred) {
        matches.push({ request, item });
      }
    }
  }

  if (matches.length === 0) {
    throw new ToolTransferConflictError('No active originating tool request with outstanding custody was found');
  }
  if (matches.length > 1) {
    throw new ToolTransferConflictError('Ambiguous originating tool request; transfer cannot be completed safely');
  }
  return matches[0];
}

async function assertEligibleTransferRecipient(
  tx: Tx,
  toUserId: string,
  plantId: string | null,
) {
  if (!plantId) {
    throw new ToolTransferConflictError('Tool must belong to a plant before transfer');
  }

  const recipient = await tx.user.findUnique({
    where: { id: toUserId },
    select: {
      status: true,
      plantAccess: { where: { plantId }, select: { id: true } },
      userRoles: {
        where: { role: { slug: 'maintenance_technician' } },
        select: { id: true },
      },
    },
  });

  if (!recipient || recipient.status !== 'active') {
    throw new ToolTransferConflictError('Receiving technician is not active');
  }
  if (recipient.plantAccess.length === 0) {
    throw new ToolTransferConflictError('Receiving technician does not have access to the tool plant');
  }
  if (recipient.userRoles.length === 0) {
    throw new ToolTransferConflictError('Receiving user must be a maintenance technician');
  }
}

async function closeOriginatingRequestIfComplete(tx: Tx, requestId: string, now: Date) {
  const request = await tx.repairToolRequest.findUnique({
    where: { id: requestId },
    select: { status: true },
  });
  if (!request || request.status === 'pending_return') return;

  const items = await tx.repairToolRequestItem.findMany({ where: { repairToolRequestId: requestId } });
  if (items.length === 0) return;

  const allDone = items.every((item) => item.quantityReturned + item.quantityTransferred >= item.quantityIssued);
  if (!allDone) return;

  const hasTransfers = items.some((item) => item.quantityTransferred > 0);
  const hasReturns = items.some((item) => item.quantityReturned > 0);
  const status = hasTransfers && !hasReturns ? 'transferred' : 'returned';

  await tx.repairToolRequest.updateMany({
    where: { id: requestId, status: 'issued' },
    data: { status, returnedAt: now },
  });
}

async function completeToolTransferTx(tx: Tx, transferId: string, now: Date) {
  const transfer = await tx.toolTransferRequest.findUnique({
    where: { id: transferId },
    include: { tool: true },
  });

  if (!transfer) throw new ToolTransferNotFoundError('Transfer request not found');
  if (transfer.status === 'transferred') return { transfer, completedNow: false };
  if (transfer.status !== 'awaiting_handover') {
    throw new ToolTransferConflictError(`Cannot complete transfer from status '${transfer.status}'`);
  }
  if (!transfer.fromUserAcceptedAt || !transfer.toUserAcceptedAt) {
    return { transfer, completedNow: false };
  }
  if (transfer.tool.assignedToId !== transfer.fromUserId) {
    throw new ToolTransferConflictError('Tool custodian changed before transfer completion');
  }
  if (transfer.toUserId === transfer.fromUserId) {
    throw new ToolTransferConflictError('Cannot transfer tool to the same person');
  }

  // Re-check recipient eligibility at physical handover completion in case the
  // user's status, role, or plant access changed after the request was created.
  await assertEligibleTransferRecipient(tx, transfer.toUserId, transfer.tool.plantId);

  const origin = await resolveOriginatingRequestItem(tx, transfer.toolId, transfer.fromUserId);

  const claimed = await tx.toolTransferRequest.updateMany({
    where: {
      id: transferId,
      status: 'awaiting_handover',
      transferredAt: null,
      fromUserAcceptedAt: { not: null },
      toUserAcceptedAt: { not: null },
    },
    data: { status: 'transferred', transferredAt: now },
  });
  if (claimed.count !== 1) {
    const current = await tx.toolTransferRequest.findUnique({ where: { id: transferId } });
    if (current?.status === 'transferred') return { transfer: current, completedNow: false };
    throw new ToolTransferConflictError('Transfer was claimed concurrently');
  }

  const moved = await tx.tool.updateMany({
    where: { id: transfer.toolId, assignedToId: transfer.fromUserId },
    data: { assignedToId: transfer.toUserId, status: 'checked_out' },
  });
  if (moved.count !== 1) {
    throw new ToolTransferConflictError('Tool custodian changed before transfer completion');
  }

  if (origin.item) {
    const custodyUpdated = await tx.repairToolRequestItem.updateMany({
      where: {
        id: origin.item.id,
        quantityIssued: origin.item.quantityIssued,
        quantityReturned: origin.item.quantityReturned,
        quantityTransferred: origin.item.quantityTransferred,
      },
      data: { quantityTransferred: { increment: 1 } },
    });
    if (custodyUpdated.count !== 1) {
      throw new ToolTransferConflictError('Originating tool custody changed concurrently');
    }
  } else {
    const legacyClaim = await tx.repairToolRequest.updateMany({
      where: { id: origin.request.id, status: 'issued', toolId: transfer.toolId },
      data: { status: 'transferred', returnedAt: now },
    });
    if (legacyClaim.count !== 1) {
      throw new ToolTransferConflictError('Legacy tool custody changed concurrently');
    }
  }

  await tx.toolTransaction.create({
    data: {
      toolId: transfer.toolId,
      type: 'transfer',
      fromUserId: transfer.fromUserId,
      toUserId: transfer.toUserId,
      notes: `Transfer completed: ${transfer.reason}${transfer.toolConditionAtTransfer ? ` (condition: ${transfer.toolConditionAtTransfer})` : ''}`,
      performedById: transfer.requestedById,
      workOrderId: origin.request.workOrderId,
    },
  });

  if (origin.item) await closeOriginatingRequestIfComplete(tx, origin.request.id, now);
  const completed = await tx.toolTransferRequest.findUniqueOrThrow({ where: { id: transferId } });
  return { transfer: completed, completedNow: true };
}

export async function createToolTransferRequest(input: CreateTransferInput) {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM tools WHERE id = ${input.toolId} FOR UPDATE`;

    const tool = await tx.tool.findUnique({ where: { id: input.toolId } });
    if (!tool) throw new ToolTransferNotFoundError('Tool not found');
    if (!tool.plantId) {
      throw new ToolTransferConflictError('Tool must belong to a plant before transfer');
    }
    if (tool.assignedToId !== input.fromUserId) {
      throw new ToolTransferConflictError('Tool is not currently assigned to the specified user');
    }
    if (input.toUserId === input.fromUserId) {
      throw new ToolTransferConflictError('Cannot transfer tool to the same person');
    }

    await assertEligibleTransferRecipient(tx, input.toUserId, tool.plantId);

    const active = await tx.toolTransferRequest.findFirst({
      where: {
        toolId: input.toolId,
        status: { in: ['pending', 'storekeeper_approved', 'awaiting_handover'] },
      },
      select: { id: true },
    });
    if (active) {
      throw new ToolTransferConflictError('An active transfer already exists for this tool');
    }

    await resolveOriginatingRequestItem(tx, input.toolId, input.fromUserId);

    return tx.toolTransferRequest.create({
      data: {
        toolId: input.toolId,
        fromUserId: input.fromUserId,
        toUserId: input.toUserId,
        reason: input.reason,
        notes: input.notes || null,
        status: 'pending',
        requestedById: input.requestedById,
        plantId: tool.plantId,
      },
      include: transferInclude,
    });
  });
}

export async function acceptToolTransfer(transferId: string, party: AcceptanceParty) {
  const now = new Date();
  return db.$transaction(async (tx) => {
    const field = party === 'from' ? 'fromUserAcceptedAt' : 'toUserAcceptedAt';
    const accepted = await tx.toolTransferRequest.updateMany({
      where: {
        id: transferId,
        status: 'awaiting_handover',
        [field]: null,
      },
      data: { [field]: now },
    });

    if (accepted.count === 0) {
      const current = await tx.toolTransferRequest.findUnique({ where: { id: transferId } });
      if (!current) throw new ToolTransferNotFoundError('Transfer request not found');
      if (current.status !== 'awaiting_handover' && current.status !== 'transferred') {
        throw new ToolTransferConflictError(`Cannot accept transfer from status '${current.status}'`);
      }
    }

    return completeToolTransferTx(tx, transferId, now);
  });
}

export async function completeToolTransfer(transferId: string) {
  const now = new Date();
  return db.$transaction((tx) => completeToolTransferTx(tx, transferId, now));
}
