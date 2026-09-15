import { beforeEach, describe, expect, it, vi } from 'vitest';

const { db, tx } = vi.hoisted(() => {
  const tx = {
    repairMaterialRequest: {
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      updateMany: vi.fn(),
    },
    inventoryItem: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
    stockMovement: { create: vi.fn() },
    sparePartReturn: {
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      updateMany: vi.fn(),
      create: vi.fn(),
    },
  };
  return {
    tx,
    db: {
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    },
  };
});

vi.mock('@/lib/db', () => ({ db }));

import {
  createSparePartReturnWithCustody,
  issueMaterialRequest,
  MaterialCustodyConflictError,
  MaterialCustodyValidationError,
  reconcileMaterialRequest,
  recordMaterialConsumption,
  recordMaterialReturn,
  reserveMaterialRequest,
  returnSparePartToStore,
} from '../materialCustody.service';

function material(overrides: Record<string, unknown> = {}) {
  return {
    id: 'mat-1', workOrderId: 'wo-1', plantId: 'plant-1', itemId: 'inv-1', itemName: 'Bearing', unit: 'pcs',
    status: 'issued', quantityRequested: 10, quantityApproved: 10, quantityIssued: 10, quantityReturned: 0,
    consumedQty: null, wastedQty: null, stockReserved: false, notes: null, returnedById: null, returnedAt: null,
    requestedById: 'tech-1', workOrder: { id: 'wo-1', woNumber: 'WO-1', title: 'Repair', plantId: 'plant-1', plannerId: 'p-1', assignedSupervisorId: 's-1' },
    requestedBy: { id: 'tech-1', fullName: 'Tech' }, item: { id: 'inv-1', itemCode: 'B-1', name: 'Bearing', currentStock: 20, plantId: 'plant-1' },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  tx.repairMaterialRequest.updateMany.mockResolvedValue({ count: 1 });
  tx.inventoryItem.updateMany.mockResolvedValue({ count: 1 });
  tx.sparePartReturn.updateMany.mockResolvedValue({ count: 1 });
  tx.stockMovement.create.mockResolvedValue({});
});

describe('material custody CAS', () => {
  it('reserves stock once and writes one matching ledger movement', async () => {
    const req = material({ status: 'supervisor_approved', quantityApproved: 6, quantityIssued: 0 });
    tx.repairMaterialRequest.findUnique.mockResolvedValue(req);
    tx.inventoryItem.findUnique.mockResolvedValue({ id: 'inv-1', currentStock: 8 });
    tx.repairMaterialRequest.findUniqueOrThrow.mockResolvedValue({ ...req, status: 'storekeeper_approved', stockReserved: true });

    await reserveMaterialRequest('mat-1', 'store-1', 6);

    expect(tx.inventoryItem.updateMany).toHaveBeenCalledWith({
      where: { id: 'inv-1', currentStock: 8 }, data: { currentStock: 2 },
    });
    expect(tx.stockMovement.create).toHaveBeenCalledTimes(1);
    expect(tx.stockMovement.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ previousStock: 8, newStock: 2, quantity: 6 }) }));
  });

  it('does not allow store approval above the supervisor-approved quantity', async () => {
    tx.repairMaterialRequest.findUnique.mockResolvedValue(material({ status: 'supervisor_approved', quantityApproved: 4, quantityIssued: 0 }));

    await expect(reserveMaterialRequest('mat-1', 'store-1', 5)).rejects.toBeInstanceOf(MaterialCustodyValidationError);
    expect(tx.repairMaterialRequest.updateMany).not.toHaveBeenCalled();
    expect(tx.inventoryItem.updateMany).not.toHaveBeenCalled();
  });

  it('does not touch stock when duplicate reservation loses the request CAS', async () => {
    tx.repairMaterialRequest.findUnique.mockResolvedValue(material({ status: 'supervisor_approved', quantityIssued: 0 }));
    tx.repairMaterialRequest.updateMany.mockResolvedValue({ count: 0 });

    await expect(reserveMaterialRequest('mat-1', 'store-1', 5)).rejects.toBeInstanceOf(MaterialCustodyConflictError);
    expect(tx.inventoryItem.updateMany).not.toHaveBeenCalled();
    expect(tx.stockMovement.create).not.toHaveBeenCalled();
  });

  it('issues reserved stock without a second stock mutation or fake movement', async () => {
    const req = material({ status: 'storekeeper_approved', stockReserved: true, quantityIssued: 0 });
    tx.repairMaterialRequest.findUnique.mockResolvedValue(req);
    tx.repairMaterialRequest.findUniqueOrThrow.mockResolvedValue({ ...req, status: 'issued', quantityIssued: 10 });

    await issueMaterialRequest('mat-1', 'store-1', 10);

    expect(tx.inventoryItem.updateMany).not.toHaveBeenCalled();
    expect(tx.stockMovement.create).not.toHaveBeenCalled();
  });

  it('does not allow a partial issue to orphan previously reserved stock', async () => {
    tx.repairMaterialRequest.findUnique.mockResolvedValue(material({ status: 'storekeeper_approved', stockReserved: true, quantityApproved: 10, quantityIssued: 0 }));

    await expect(issueMaterialRequest('mat-1', 'store-1', 8)).rejects.toBeInstanceOf(MaterialCustodyValidationError);
    expect(tx.repairMaterialRequest.updateMany).not.toHaveBeenCalled();
    expect(tx.inventoryItem.updateMany).not.toHaveBeenCalled();
  });

  it('issues unreserved stock with exact observed-stock CAS', async () => {
    const req = material({ status: 'storekeeper_approved', stockReserved: false, quantityIssued: 0, quantityApproved: 4 });
    tx.repairMaterialRequest.findUnique.mockResolvedValue(req);
    tx.inventoryItem.findUnique.mockResolvedValue({ id: 'inv-1', currentStock: 5 });
    tx.repairMaterialRequest.findUniqueOrThrow.mockResolvedValue({ ...req, status: 'issued', quantityIssued: 4 });

    await issueMaterialRequest('mat-1', 'store-1', 4);

    expect(tx.inventoryItem.updateMany).toHaveBeenCalledWith({ where: { id: 'inv-1', currentStock: 5 }, data: { currentStock: 1 } });
    expect(tx.stockMovement.create).toHaveBeenCalledTimes(1);
  });

  it('prevents duplicate/concurrent return credit when custody CAS loses', async () => {
    tx.repairMaterialRequest.findUnique.mockResolvedValue(material());
    tx.repairMaterialRequest.updateMany.mockResolvedValue({ count: 0 });

    await expect(recordMaterialReturn('mat-1', 'store-1', 2)).rejects.toBeInstanceOf(MaterialCustodyConflictError);
    expect(tx.inventoryItem.updateMany).not.toHaveBeenCalled();
    expect(tx.stockMovement.create).not.toHaveBeenCalled();
  });

  it('enforces consumed+wasted+returned <= issued', async () => {
    tx.repairMaterialRequest.findUnique.mockResolvedValue(material({ quantityIssued: 10, consumedQty: 7, wastedQty: 1, quantityReturned: 1 }));
    await expect(recordMaterialReturn('mat-1', 'store-1', 2)).rejects.toBeInstanceOf(MaterialCustodyValidationError);
    expect(tx.repairMaterialRequest.updateMany).not.toHaveBeenCalled();
  });

  it('turns a stale consumption write into a conflict', async () => {
    tx.repairMaterialRequest.findUnique.mockResolvedValue(material({ consumedQty: 2 }));
    tx.repairMaterialRequest.updateMany.mockResolvedValue({ count: 0 });
    await expect(recordMaterialConsumption('mat-1', 1)).rejects.toBeInstanceOf(MaterialCustodyConflictError);
  });
});

describe('material reconciliation delta', () => {
  it('credits only the incremental return delta', async () => {
    const req = material({ quantityIssued: 10, consumedQty: 3, wastedQty: 1, quantityReturned: 2 });
    tx.repairMaterialRequest.findUnique.mockResolvedValue(req);
    tx.inventoryItem.findUnique.mockResolvedValue({ id: 'inv-1', currentStock: 20 });
    tx.repairMaterialRequest.findUniqueOrThrow.mockResolvedValue({ ...req, consumedQty: 4, wastedQty: 1, quantityReturned: 5, status: 'closed' });

    const result = await reconcileMaterialRequest('mat-1', 'store-1', 4, 1);

    expect(result.additionalReturn).toBe(3);
    expect(tx.inventoryItem.updateMany).toHaveBeenCalledWith({ where: { id: 'inv-1', currentStock: 20 }, data: { currentStock: 23 } });
    expect(tx.stockMovement.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ quantity: 3, previousStock: 20, newStock: 23 }) }));
  });

  it('makes exact closed reconciliation replay a no-op', async () => {
    const req = material({ status: 'closed', quantityIssued: 10, consumedQty: 4, wastedQty: 1, quantityReturned: 5 });
    tx.repairMaterialRequest.findUnique.mockResolvedValue(req);

    const result = await reconcileMaterialRequest('mat-1', 'store-1', 4, 1);

    expect(result.replay).toBe(true);
    expect(result.additionalReturn).toBe(0);
    expect(tx.repairMaterialRequest.updateMany).not.toHaveBeenCalled();
    expect(tx.inventoryItem.updateMany).not.toHaveBeenCalled();
    expect(tx.stockMovement.create).not.toHaveBeenCalled();
  });

  it('rejects retroactive reduction of already physically returned stock', async () => {
    tx.repairMaterialRequest.findUnique.mockResolvedValue(material({ quantityIssued: 10, consumedQty: 2, wastedQty: 0, quantityReturned: 6 }));
    await expect(reconcileMaterialRequest('mat-1', 'store-1', 5, 0)).rejects.toBeInstanceOf(MaterialCustodyValidationError);
  });
});

describe('spare-part custody accounting', () => {
  it('consumed spare increments consumedQty without fabricating quantityReturned', async () => {
    const req = material({ consumedQty: 2, quantityReturned: 1, quantityIssued: 10 });
    tx.repairMaterialRequest.findUnique.mockResolvedValue(req);
    tx.sparePartReturn.create.mockResolvedValue({ id: 'spr-1', status: 'disposed' });

    const result = await createSparePartReturnWithCustody({
      returnNumber: 'SPR-1', workOrderId: 'wo-1', materialRequestId: 'mat-1', itemName: 'Bearing', quantity: 2,
      plantId: 'plant-1', requestedById: 'tech-1', refurbishmentNeeded: false, isConsumed: true,
    });

    expect(tx.repairMaterialRequest.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ consumedQty: 4 }),
    }));
    const update = tx.repairMaterialRequest.updateMany.mock.calls[0][0];
    expect(update.data).not.toHaveProperty('quantityReturned');
    expect(result.materialAccounting).toEqual(expect.objectContaining({ quantityReturned: 1 }));
  });

  it('reusable spare return updates custody without adding store inventory', async () => {
    tx.repairMaterialRequest.findUnique.mockResolvedValue(material({ quantityIssued: 5, quantityReturned: 1 }));
    tx.sparePartReturn.create.mockResolvedValue({ id: 'spr-1', status: 'pending' });

    await createSparePartReturnWithCustody({
      returnNumber: 'SPR-1', workOrderId: 'wo-1', materialRequestId: 'mat-1', itemName: 'Bearing', quantity: 2,
      plantId: 'plant-1', requestedById: 'tech-1', refurbishmentNeeded: true, isConsumed: false,
    });

    expect(tx.repairMaterialRequest.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ quantityReturned: 3 }) }));
    expect(tx.inventoryItem.updateMany).not.toHaveBeenCalled();
    expect(tx.stockMovement.create).not.toHaveBeenCalled();
  });

  it('returns refurbished spare to store exactly once', async () => {
    tx.sparePartReturn.findUnique.mockResolvedValue({
      id: 'spr-1', returnNumber: 'SPR-1', status: 'refurbished', returnedToStoreAt: null, itemId: 'inv-1', quantity: 2,
      workOrder: { woNumber: 'WO-1' }, item: { id: 'inv-1', currentStock: 9 },
    });
    tx.inventoryItem.findUnique.mockResolvedValue({ id: 'inv-1', currentStock: 9 });
    tx.sparePartReturn.findUniqueOrThrow.mockResolvedValue({ id: 'spr-1', status: 'returned_to_store' });

    await returnSparePartToStore('spr-1', 'store-1');
    expect(tx.inventoryItem.updateMany).toHaveBeenCalledWith({ where: { id: 'inv-1', currentStock: 9 }, data: { currentStock: 11 } });
    expect(tx.stockMovement.create).toHaveBeenCalledTimes(1);

    tx.sparePartReturn.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(returnSparePartToStore('spr-1', 'store-1')).rejects.toBeInstanceOf(MaterialCustodyConflictError);
  });
});
