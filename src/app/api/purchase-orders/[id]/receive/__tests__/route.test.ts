import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { mockDb, mockTx, mockGetSession, mockHasAnyPermission, mockIsAdmin, mockGetPlantScope, mockCanAccessPlantStrict } = vi.hoisted(() => {
  const tx = {
    $executeRawUnsafe: vi.fn(),
    purchaseOrder: { findUnique: vi.fn(), updateMany: vi.fn() },
    purchaseOrderItem: { updateMany: vi.fn(), findMany: vi.fn() },
    inventoryItem: { updateMany: vi.fn() },
    stockMovement: { create: vi.fn() },
    receivingRecord: { create: vi.fn() },
    auditLog: { create: vi.fn() },
  };
  return {
    mockTx: tx,
    mockDb: {
      $transaction: vi.fn(),
      purchaseOrder: { findUnique: vi.fn() },
    },
    mockGetSession: vi.fn(),
    mockHasAnyPermission: vi.fn(),
    mockIsAdmin: vi.fn(),
    mockGetPlantScope: vi.fn(),
    mockCanAccessPlantStrict: vi.fn(),
  };
});

vi.mock('@/lib/db', () => ({ db: mockDb }));
vi.mock('@/lib/auth', () => ({
  getSession: mockGetSession,
  hasAnyPermission: mockHasAnyPermission,
  isAdmin: mockIsAdmin,
}));
vi.mock('@/lib/plant-scope', () => ({
  getPlantScope: mockGetPlantScope,
  canAccessPlantStrict: mockCanAccessPlantStrict,
  getPlantFilterWhere: vi.fn(() => ({ plantId: 'plant-a' })),
}));

import { POST } from '../route';

const session = { userId: 'store-1', roles: ['store_keeper'], permissions: ['inventory.stock_in'] };
const plantScope = {
  plantId: 'plant-a', accessiblePlantIds: ['plant-a'], isScoped: true,
  isSystemWide: false, accessLevel: 'write' as const, denyAccess: false,
};

function po(overrides: Record<string, unknown> = {}) {
  return {
    id: 'po-1', poNumber: 'PO-202610-0001', status: 'approved',
    items: [{
      id: 'line-1', itemId: 'item-1', quantity: 10, quantityReceived: 2,
      item: { id: 'item-1', plantId: 'plant-a', isActive: true, currentStock: 20 },
    }],
    ...overrides,
  };
}

function request(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/purchase-orders/po-1/receive', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
}

function installHappyPath(condition = 'good') {
  mockTx.purchaseOrder.findUnique.mockResolvedValue(po());
  mockTx.purchaseOrderItem.updateMany.mockResolvedValue({ count: 1 });
  mockTx.inventoryItem.updateMany.mockResolvedValue({ count: 1 });
  mockTx.purchaseOrderItem.findMany.mockResolvedValue([{ quantity: 10, quantityReceived: 5 }]);
  mockTx.purchaseOrder.updateMany.mockResolvedValue({ count: 1 });
  mockDb.purchaseOrder.findUnique.mockResolvedValue({ id: 'po-1', status: 'partially_received', receivingRecords: [], items: [] });
  return { itemId: 'item-1', quantityReceived: 3, condition };
}

describe('POST /api/purchase-orders/[id]/receive', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockReturnValue(session);
    mockHasAnyPermission.mockReturnValue(true);
    mockIsAdmin.mockReturnValue(false);
    mockGetPlantScope.mockResolvedValue(plantScope);
    mockCanAccessPlantStrict.mockReturnValue(true);
    mockDb.$transaction.mockImplementation(async (callback: (tx: typeof mockTx) => unknown) => callback(mockTx));
    mockTx.$executeRawUnsafe.mockResolvedValue(1);
    mockTx.receivingRecord.create.mockResolvedValue({ id: 'grn-1' });
    mockTx.stockMovement.create.mockResolvedValue({ id: 'mov-1' });
    mockTx.auditLog.create.mockResolvedValue({ id: 'audit-1' });
  });

  it('rejects an over-receipt before any custody mutation', async () => {
    mockTx.purchaseOrder.findUnique.mockResolvedValue(po());
    const response = await POST(request({ itemId: 'item-1', quantityReceived: 9, condition: 'good' }), { params: Promise.resolve({ id: 'po-1' }) });
    expect(response.status).toBe(400);
    expect(mockTx.purchaseOrderItem.updateMany).not.toHaveBeenCalled();
    expect(mockTx.inventoryItem.updateMany).not.toHaveBeenCalled();
  });

  it('credits good receipts into usable inventory and writes one stock ledger movement', async () => {
    const response = await POST(request(installHappyPath('good')), { params: Promise.resolve({ id: 'po-1' }) });
    const json = await response.json();
    expect(response.status).toBe(200);
    expect(json.receipt.stockCredited).toBe(true);
    expect(mockTx.inventoryItem.updateMany).toHaveBeenCalledWith({
      where: { id: 'item-1', currentStock: 20, isActive: true }, data: { currentStock: 23 },
    });
    expect(mockTx.stockMovement.create).toHaveBeenCalledTimes(1);
    expect(mockTx.receivingRecord.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ condition: 'good', custodyStatus: 'stocked' }),
    }));
  });

  it.each(['damaged', 'defective'])('records %s delivery but keeps it out of usable stock', async (condition) => {
    const response = await POST(request(installHappyPath(condition)), { params: Promise.resolve({ id: 'po-1' }) });
    const json = await response.json();
    expect(response.status).toBe(200);
    expect(json.receipt.stockCredited).toBe(false);
    expect(mockTx.inventoryItem.updateMany).not.toHaveBeenCalled();
    expect(mockTx.stockMovement.create).not.toHaveBeenCalled();
    expect(mockTx.receivingRecord.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ condition, custodyStatus: 'quarantined' }),
    }));
  });

  it('rejects an unknown condition instead of silently treating it as good', async () => {
    const response = await POST(request({ itemId: 'item-1', quantityReceived: 2, condition: 'unknown' }), { params: Promise.resolve({ id: 'po-1' }) });
    expect(response.status).toBe(400);
    expect(mockDb.$transaction).not.toHaveBeenCalled();
  });

  it('denies a PO containing lines outside the actor plant scope', async () => {
    mockTx.purchaseOrder.findUnique.mockResolvedValue(po());
    mockCanAccessPlantStrict.mockReturnValue(false);
    const response = await POST(request({ itemId: 'item-1', quantityReceived: 2, condition: 'good' }), { params: Promise.resolve({ id: 'po-1' }) });
    expect(response.status).toBe(403);
    expect(mockTx.purchaseOrderItem.updateMany).not.toHaveBeenCalled();
  });

  it('returns conflict if another receipt changes the PO line first', async () => {
    mockTx.purchaseOrder.findUnique.mockResolvedValue(po());
    mockTx.purchaseOrderItem.updateMany.mockResolvedValue({ count: 0 });
    const response = await POST(request({ itemId: 'item-1', quantityReceived: 2, condition: 'good' }), { params: Promise.resolve({ id: 'po-1' }) });
    expect(response.status).toBe(409);
    expect(mockTx.inventoryItem.updateMany).not.toHaveBeenCalled();
  });
});
