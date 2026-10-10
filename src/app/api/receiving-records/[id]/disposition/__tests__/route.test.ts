import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { mockDb, mockTx, mockGetSession, mockHasAnyPermission, mockIsAdmin, mockGetPlantScope, mockCanAccessPlantStrict } = vi.hoisted(() => {
  const tx = {
    $executeRawUnsafe: vi.fn(),
    receivingRecord: { findUnique: vi.fn(), updateMany: vi.fn(), findUniqueOrThrow: vi.fn() },
    purchaseOrderItem: { findFirst: vi.fn(), updateMany: vi.fn(), findMany: vi.fn() },
    purchaseOrder: { updateMany: vi.fn() },
    inventoryItem: { updateMany: vi.fn() },
    stockMovement: { create: vi.fn() },
    auditLog: { create: vi.fn() },
  };
  return {
    mockTx: tx,
    mockDb: { $transaction: vi.fn() },
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
}));

import { POST } from '../route';

const session = { userId: 'store-1', roles: ['store_keeper'], permissions: ['inventory.stock_in'] };
const plantScope = {
  plantId: 'plant-a', accessiblePlantIds: ['plant-a'], isScoped: true,
  isSystemWide: false, accessLevel: 'write' as const, denyAccess: false,
};

const baseRecord = {
  id: 'grn-1', poId: 'po-1', itemId: 'item-1', quantityReceived: 3,
  condition: 'defective', custodyStatus: 'quarantined',
  item: { id: 'item-1', plantId: 'plant-a', isActive: true, currentStock: 20 },
  po: { id: 'po-1', poNumber: 'PO-202610-0001', status: 'received' },
};

function request(action: string, notes?: string) {
  return new NextRequest('http://localhost/api/receiving-records/grn-1/disposition', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, notes }),
  });
}

describe('POST /api/receiving-records/[id]/disposition', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockReturnValue(session);
    mockHasAnyPermission.mockReturnValue(true);
    mockIsAdmin.mockReturnValue(false);
    mockGetPlantScope.mockResolvedValue(plantScope);
    mockCanAccessPlantStrict.mockReturnValue(true);
    mockDb.$transaction.mockImplementation(async (callback: (tx: typeof mockTx) => unknown) => callback(mockTx));
    mockTx.$executeRawUnsafe.mockResolvedValue(1);
    mockTx.receivingRecord.findUnique.mockResolvedValue(baseRecord);
    mockTx.receivingRecord.updateMany.mockResolvedValue({ count: 1 });
    mockTx.purchaseOrderItem.findFirst.mockResolvedValue({ id: 'line-1', quantity: 10, quantityReceived: 10 });
    mockTx.purchaseOrderItem.updateMany.mockResolvedValue({ count: 1 });
    mockTx.purchaseOrderItem.findMany.mockResolvedValue([{ quantity: 10, quantityReceived: 7 }]);
    mockTx.purchaseOrder.updateMany.mockResolvedValue({ count: 1 });
    mockTx.inventoryItem.updateMany.mockResolvedValue({ count: 1 });
    mockTx.receivingRecord.findUniqueOrThrow.mockResolvedValue({ ...baseRecord, custodyStatus: 'stocked', resolution: 'stock_as_is' });
  });

  it('releases quarantined stock exactly once when accepted as-is', async () => {
    const response = await POST(request('stock_as_is', 'QC accepted after inspection'), { params: Promise.resolve({ id: 'grn-1' }) });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.stockCredited).toBe(true);
    expect(mockTx.inventoryItem.updateMany).toHaveBeenCalledWith({
      where: { id: 'item-1', currentStock: 20, isActive: true }, data: { currentStock: 23 },
    });
    expect(mockTx.stockMovement.create).toHaveBeenCalledTimes(1);
    expect(mockTx.receivingRecord.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'grn-1', custodyStatus: 'quarantined' },
      data: expect.objectContaining({ custodyStatus: 'stocked', resolution: 'stock_as_is', dispositionedById: 'store-1' }),
    }));
  });

  it('sends quarantined stock for repair without increasing usable inventory', async () => {
    const response = await POST(request('send_for_repair'), { params: Promise.resolve({ id: 'grn-1' }) });
    expect(response.status).toBe(200);
    expect(mockTx.inventoryItem.updateMany).not.toHaveBeenCalled();
    expect(mockTx.stockMovement.create).not.toHaveBeenCalled();
    expect(mockTx.receivingRecord.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ custodyStatus: 'in_repair', resolution: 'send_for_repair' }),
    }));
  });

  it('credits a repaired receipt when it returns to stock', async () => {
    mockTx.receivingRecord.findUnique.mockResolvedValue({ ...baseRecord, custodyStatus: 'in_repair' });
    const response = await POST(request('return_from_repair'), { params: Promise.resolve({ id: 'grn-1' }) });
    expect(response.status).toBe(200);
    expect(mockTx.inventoryItem.updateMany).toHaveBeenCalledTimes(1);
    expect(mockTx.stockMovement.create).toHaveBeenCalledTimes(1);
    expect(mockTx.receivingRecord.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'grn-1', custodyStatus: 'in_repair' },
      data: expect.objectContaining({ custodyStatus: 'stocked', resolution: 'return_from_repair' }),
    }));
  });

  it('returns rejected quantity to the supplier and reopens the PO for replacement receipt', async () => {
    const response = await POST(request('return_to_supplier', 'Supplier return reference'), { params: Promise.resolve({ id: 'grn-1' }) });
    const json = await response.json();
    expect(response.status).toBe(200);
    expect(json.poStatus).toBe('partially_received');
    expect(mockTx.inventoryItem.updateMany).not.toHaveBeenCalled();
    expect(mockTx.stockMovement.create).not.toHaveBeenCalled();
    expect(mockTx.purchaseOrderItem.updateMany).toHaveBeenCalledWith({
      where: { id: 'line-1', quantityReceived: 10 }, data: { quantityReceived: 7 },
    });
    expect(mockTx.purchaseOrder.updateMany).toHaveBeenCalledWith({
      where: { id: 'po-1', status: 'received' }, data: { status: 'partially_received' },
    });
  });

  it('scraps quarantined stock without reopening the purchase order', async () => {
    const response = await POST(request('scrap'), { params: Promise.resolve({ id: 'grn-1' }) });
    expect(response.status).toBe(200);
    expect(mockTx.inventoryItem.updateMany).not.toHaveBeenCalled();
    expect(mockTx.purchaseOrderItem.updateMany).not.toHaveBeenCalled();
  });

  it('returns conflict if supplier-return PO quantity changed concurrently', async () => {
    mockTx.purchaseOrderItem.updateMany.mockResolvedValue({ count: 0 });
    const response = await POST(request('return_to_supplier'), { params: Promise.resolve({ id: 'grn-1' }) });
    expect(response.status).toBe(409);
    expect(mockTx.purchaseOrder.updateMany).not.toHaveBeenCalled();
  });

  it('rejects invalid transitions before mutating custody or stock', async () => {
    mockTx.receivingRecord.findUnique.mockResolvedValue({ ...baseRecord, custodyStatus: 'stocked' });
    const response = await POST(request('scrap'), { params: Promise.resolve({ id: 'grn-1' }) });
    expect(response.status).toBe(400);
    expect(mockTx.receivingRecord.updateMany).not.toHaveBeenCalled();
    expect(mockTx.inventoryItem.updateMany).not.toHaveBeenCalled();
  });

  it('rejects an action outside the supported disposition vocabulary', async () => {
    const response = await POST(request('make_available'), { params: Promise.resolve({ id: 'grn-1' }) });
    expect(response.status).toBe(400);
    expect(mockDb.$transaction).not.toHaveBeenCalled();
  });

  it('allows non-stock final disposition even when the inventory item is inactive', async () => {
    mockTx.receivingRecord.findUnique.mockResolvedValue({
      ...baseRecord,
      item: { ...baseRecord.item, isActive: false },
    });
    const response = await POST(request('scrap'), { params: Promise.resolve({ id: 'grn-1' }) });
    expect(response.status).toBe(200);
    expect(mockTx.inventoryItem.updateMany).not.toHaveBeenCalled();
  });

  it('blocks release to usable stock when the inventory item is inactive', async () => {
    mockTx.receivingRecord.findUnique.mockResolvedValue({
      ...baseRecord,
      item: { ...baseRecord.item, isActive: false },
    });
    const response = await POST(request('stock_as_is'), { params: Promise.resolve({ id: 'grn-1' }) });
    expect(response.status).toBe(400);
    expect(mockTx.inventoryItem.updateMany).not.toHaveBeenCalled();
  });

  it('enforces plant scope before custody mutation', async () => {
    mockCanAccessPlantStrict.mockReturnValue(false);
    const response = await POST(request('scrap'), { params: Promise.resolve({ id: 'grn-1' }) });
    expect(response.status).toBe(403);
    expect(mockTx.receivingRecord.updateMany).not.toHaveBeenCalled();
  });

  it('returns conflict if custody state changes concurrently', async () => {
    mockTx.receivingRecord.updateMany.mockResolvedValue({ count: 0 });
    const response = await POST(request('scrap'), { params: Promise.resolve({ id: 'grn-1' }) });
    expect(response.status).toBe(409);
    expect(mockTx.inventoryItem.updateMany).not.toHaveBeenCalled();
  });
});
