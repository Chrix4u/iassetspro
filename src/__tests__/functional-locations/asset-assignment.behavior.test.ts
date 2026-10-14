import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockDb } = vi.hoisted(() => {
  const db = {
    asset: { findUnique: vi.fn() },
    functionalLocation: { findUnique: vi.fn() },
    assetFunctionalLocationAssignment: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(),
  };
  return { mockDb: db };
});

vi.mock('@/lib/db', () => ({ db: mockDb }));

import { assignAssetToFunctionalLocation } from '@/lib/functional-location/asset-assignment';

const asset = { id: 'asset-1', name: 'Printer', assetTag: 'PR-001', plantId: 'plant-a' };
const system = { id: 'system-1', name: 'Primary', code: 'PRIMARY', purpose: 'functional_location', isPrimary: true, isActive: true };
const level = { id: 'level-1', hierarchySystemId: 'system-1', label: 'Position', order: 4, allowAssetAssignment: true, isActive: true };
const target = {
  id: 'loc-new', hierarchySystemId: 'system-1', hierarchyLevelId: 'level-1',
  locationCode: 'TEMA-PRT-L01-P03', name: 'Position 03', status: 'active', plantId: 'plant-a',
  hierarchySystem: system, hierarchyLevel: level,
};
const current = {
  id: 'assignment-old', assetId: 'asset-1', hierarchySystemId: 'system-1', functionalLocationId: 'loc-old',
  assignedAt: new Date('2026-10-01T10:00:00Z'), endedAt: null, reason: null, assignedById: 'user-old', endedById: null,
  createdAt: new Date('2026-10-01T10:00:00Z'),
  hierarchySystem: system,
  functionalLocation: {
    id: 'loc-old', locationCode: 'TEMA-PRT-L01-P02', name: 'Position 02', plantId: 'plant-a',
    hierarchyLevel: level, plant: { id: 'plant-a', name: 'Tema', code: 'TEMA' },
  },
  assignedBy: { id: 'user-old', fullName: 'Old User', username: 'old' }, endedBy: null,
};
const created = {
  ...current,
  id: 'assignment-new', functionalLocationId: 'loc-new', assignedById: 'user-1',
  functionalLocation: { ...current.functionalLocation, id: 'loc-new', locationCode: target.locationCode, name: target.name },
};

function assign() {
  return assignAssetToFunctionalLocation({
    assetId: 'asset-1', functionalLocationId: 'loc-new', actorId: 'user-1', reason: 'Moved with production line',
  });
}

describe('functional-location asset assignment behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.$transaction.mockImplementation(async (callback: (tx: typeof mockDb) => Promise<unknown>) => callback(mockDb));
    mockDb.asset.findUnique.mockResolvedValue(asset);
    mockDb.functionalLocation.findUnique.mockResolvedValue(target);
    mockDb.assetFunctionalLocationAssignment.findFirst.mockResolvedValue(null);
    mockDb.assetFunctionalLocationAssignment.create.mockResolvedValue(created);
    mockDb.assetFunctionalLocationAssignment.update.mockResolvedValue(current);
    mockDb.auditLog.create.mockResolvedValue({});
  });

  it('creates an initial assignment and audit atomically', async () => {
    const result = await assign();
    expect(result.id).toBe('assignment-new');
    expect(mockDb.assetFunctionalLocationAssignment.update).not.toHaveBeenCalled();
    expect(mockDb.assetFunctionalLocationAssignment.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        assetId: 'asset-1', hierarchySystemId: 'system-1', functionalLocationId: 'loc-new', assignedById: 'user-1',
      }),
    }));
    expect(mockDb.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'assign', entityType: 'asset_functional_location', plantId: 'plant-a' }),
    }));
  });

  it('closes the previous row and creates the relocation in the same transaction', async () => {
    mockDb.assetFunctionalLocationAssignment.findFirst.mockResolvedValue(current);
    await assign();
    expect(mockDb.assetFunctionalLocationAssignment.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'assignment-old' }, data: expect.objectContaining({ endedAt: expect.any(Date), endedById: 'user-1' }),
    }));
    expect(mockDb.assetFunctionalLocationAssignment.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ functionalLocationId: 'loc-new', assignedAt: expect.any(Date) }),
    }));
    expect(mockDb.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'relocate' }),
    }));
  });

  it('returns the current row without writing when assigning the same location again', async () => {
    const same = { ...current, functionalLocationId: 'loc-new', functionalLocation: created.functionalLocation };
    mockDb.assetFunctionalLocationAssignment.findFirst.mockResolvedValue(same);
    const result = await assign();
    expect(result).toBe(same);
    expect(mockDb.assetFunctionalLocationAssignment.update).not.toHaveBeenCalled();
    expect(mockDb.assetFunctionalLocationAssignment.create).not.toHaveBeenCalled();
    expect(mockDb.auditLog.create).not.toHaveBeenCalled();
  });

  it('normalizes the target id before applying the idempotency check', async () => {
    const same = { ...current, functionalLocationId: 'loc-new', functionalLocation: created.functionalLocation };
    mockDb.assetFunctionalLocationAssignment.findFirst.mockResolvedValue(same);
    const result = await assignAssetToFunctionalLocation({
      assetId: 'asset-1', functionalLocationId: '  loc-new  ', actorId: 'user-1',
    });
    expect(result).toBe(same);
    expect(mockDb.functionalLocation.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'loc-new' } }));
    expect(mockDb.assetFunctionalLocationAssignment.update).not.toHaveBeenCalled();
    expect(mockDb.assetFunctionalLocationAssignment.create).not.toHaveBeenCalled();
  });

  it('rejects assigning an asset to a functional location in another plant', async () => {
    mockDb.functionalLocation.findUnique.mockResolvedValue({ ...target, plantId: 'plant-b' });
    await expect(assign()).rejects.toThrow('same plant');
    expect(mockDb.assetFunctionalLocationAssignment.create).not.toHaveBeenCalled();
    expect(mockDb.auditLog.create).not.toHaveBeenCalled();
  });

  it('rejects hierarchy levels that do not allow asset assignment', async () => {
    mockDb.functionalLocation.findUnique.mockResolvedValue({ ...target, hierarchyLevel: { ...level, allowAssetAssignment: false } });
    await expect(assign()).rejects.toThrow('cannot be assigned');
    expect(mockDb.assetFunctionalLocationAssignment.create).not.toHaveBeenCalled();
    expect(mockDb.auditLog.create).not.toHaveBeenCalled();
  });
});
