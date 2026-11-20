import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { db, getSession, hasPermission, isAdmin, getPlantScope, canAccessPlantStrict } = vi.hoisted(() => ({
  db: {
    meterReading: { findFirst: vi.fn(), create: vi.fn(), findMany: vi.fn(), count: vi.fn() },
    asset: { findUnique: vi.fn() },
    assetMeter: { findFirst: vi.fn() },
    plant: { findUnique: vi.fn() },
    userPlant: { findUnique: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(),
  },
  getSession: vi.fn(),
  hasPermission: vi.fn(),
  isAdmin: vi.fn(),
  getPlantScope: vi.fn(),
  canAccessPlantStrict: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db }));
vi.mock('@/lib/auth', () => ({ getSession, hasPermission, isAdmin }));
vi.mock('@/lib/plant-scope', () => ({ getPlantScope, canAccessPlantStrict, getPlantFilterWhere: () => ({ plantId: 'plant-1' }) }));

import { GET, POST } from './route';

const normalScope = {
  plantId: null, accessiblePlantIds: ['plant-1'], isScoped: false,
  isSystemWide: false, accessLevel: null, denyAccess: false,
};
const makePost = (body: unknown, selectedPlant?: string) => new NextRequest(
  'http://localhost/api/meter-readings',
  { method: 'POST', headers: { 'Content-Type': 'application/json', ...(selectedPlant ? { 'X-Plant-ID': selectedPlant } : {}) }, body: JSON.stringify(body) },
);
const payload = (overrides: Record<string, unknown> = {}) => ({
  meterName: 'Main Power', unit: 'kWh', value: 120, readingDate: '2026-11-18', ...overrides,
});

describe('legacy meter readings — authorized, plant-scoped and auditable collection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSession.mockReturnValue({ userId: 'operator-1', roles: ['operator'] });
    hasPermission.mockReturnValue(true);
    isAdmin.mockReturnValue(false);
    getPlantScope.mockResolvedValue(normalScope);
    canAccessPlantStrict.mockImplementation((scope: typeof normalScope, plantId: string) =>
      !scope.denyAccess && (scope.isSystemWide
        || (scope.accessiblePlantIds.includes(plantId) && (!scope.isScoped || scope.plantId === plantId))));
    db.asset.findUnique.mockResolvedValue({ id: 'asset-1', plantId: 'plant-1' });
    db.assetMeter.findFirst.mockResolvedValue(null);
    db.plant.findUnique.mockResolvedValue({ id: 'plant-1', isActive: true });
    db.userPlant.findUnique.mockResolvedValue({ accessLevel: 'write' });
    db.meterReading.findFirst.mockResolvedValue(null);
    db.meterReading.create.mockResolvedValue({ id: 'reading-1', value: 120, plantId: 'plant-1' });
    db.auditLog.create.mockResolvedValue({ id: 'audit-1' });
    db.$transaction.mockImplementation(async (fn: (tx: typeof db) => Promise<unknown>) => fn(db));
  });

  it('does not read or create data when unauthenticated or missing the right permission', async () => {
    getSession.mockReturnValueOnce(null);
    expect((await POST(makePost(payload()))).status).toBe(401);
    hasPermission.mockReturnValueOnce(false);
    expect((await POST(makePost(payload()))).status).toBe(403);
    expect(db.meterReading.findFirst).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('requires view rights and bounded paging for listing readings', async () => {
    getSession.mockReturnValueOnce(null);
    expect((await GET(new NextRequest('http://localhost/api/meter-readings'))).status).toBe(401);
    hasPermission.mockReturnValueOnce(false);
    expect((await GET(new NextRequest('http://localhost/api/meter-readings'))).status).toBe(403);
    db.meterReading.findMany.mockResolvedValue([]);
    db.meterReading.count.mockResolvedValue(0);
    const result = await GET(new NextRequest('http://localhost/api/meter-readings?page=-4&limit=50000'));
    expect(result.status).toBe(200);
    expect(db.meterReading.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 0, take: 200 }));
  });

  it('rejects blank, negative and nonfinite readings; explicitly observed zero is valid', async () => {
    for (const value of ['', '  ', null, -1, 'NaN', 'Infinity', false]) {
      expect((await POST(makePost(payload({ value })))).status).toBe(400);
    }
    expect(db.$transaction).not.toHaveBeenCalled();
    expect((await POST(makePost(payload({ value: 0 })))).status).toBe(201);
    expect(db.meterReading.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ value: 0, plantId: 'plant-1' }),
    }));
  });

  it('rejects invalid dates, arbitrary types and future observations', async () => {
    for (const body of [
      payload({ readingDate: 'invalid' }),
      payload({ readingDate: '2099-01-01' }),
      payload({ meterName: [] }),
      payload({ plantId: {} }),
      payload({ notes: 'x'.repeat(2001) }),
      payload({ assetMeterId: 'meter-1' }),
    ]) {
      expect([400, 409]).toContain((await POST(makePost(body))).status);
    }
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('requires an actual, write-enabled plant; never saves orphan records', async () => {
    getPlantScope.mockResolvedValueOnce({ ...normalScope, isSystemWide: true, accessiblePlantIds: [] });
    isAdmin.mockReturnValueOnce(true);
    expect((await POST(makePost(payload()))).status).toBe(400); // admin must select a plant

    getPlantScope.mockResolvedValueOnce({ ...normalScope, accessiblePlantIds: ['plant-1', 'plant-2'] });
    expect((await POST(makePost(payload()))).status).toBe(400);

    db.userPlant.findUnique.mockResolvedValueOnce({ accessLevel: 'read' });
    expect((await POST(makePost(payload()))).status).toBe(403);

    db.plant.findUnique.mockResolvedValueOnce(null);
    expect((await POST(makePost(payload()))).status).toBe(400);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('rejects a supplied foreign plant even with a valid meters.create role', async () => {
    expect((await POST(makePost(payload({ plantId: 'plant-2' })))).status).toBe(403);
    expect(db.plant.findUnique).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('honors narrowed plant selection for a multi-plant operator', async () => {
    getPlantScope.mockResolvedValueOnce({
      ...normalScope, plantId: 'plant-1', isScoped: true,
      accessiblePlantIds: ['plant-1', 'plant-2'], accessLevel: 'write',
    });
    expect((await POST(makePost(payload({ plantId: 'plant-2' }), 'plant-1'))).status).toBe(403);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('does not disclose a registered meter in another plant before authorization', async () => {
    db.asset.findUnique.mockResolvedValueOnce({ id: 'asset-2', plantId: 'plant-2' });
    expect((await POST(makePost(payload({ assetId: 'asset-2' })))).status).toBe(403);
    expect(db.assetMeter.findFirst).not.toHaveBeenCalled();
  });

  it('rejects mismatched asset plant, and redirects canonical meters to the proper workflow', async () => {
    expect((await POST(makePost(payload({ assetId: 'asset-1', plantId: 'plant-2' })))).status).toBe(403);
    db.assetMeter.findFirst.mockResolvedValueOnce({ id: 'meter-1' });
    expect((await POST(makePost(payload({ assetId: 'asset-1' })))).status).toBe(409);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('never uses other plants or assets for the prior meter baseline', async () => {
    const response = await POST(makePost(payload({ assetId: 'asset-1' })));
    expect(response.status).toBe(201);
    expect(db.meterReading.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { plantId: 'plant-1', assetId: 'asset-1', meterName: 'Main Power', unit: 'kWh' },
    }));
    expect(db.auditLog.create).toHaveBeenCalledTimes(1);
    expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'Serializable' });
  });

  it('rejects rollback or older observation date before writing an audit or reading', async () => {
    db.meterReading.findFirst.mockImplementation(async (args: { where: Record<string, unknown> }) =>
      'readingNumber' in args.where ? null : { value: 100, readingDate: new Date('2026-11-17T00:00:00.000Z') });
    expect((await POST(makePost(payload({ value: 95 })))).status).toBe(409);
    expect((await POST(makePost(payload({ readingDate: '2026-11-16' })))).status).toBe(409);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('fails on audit persistence errors instead of reporting that a reading succeeded', async () => {
    db.auditLog.create.mockRejectedValueOnce(new Error('audit unavailable'));
    expect((await POST(makePost(payload()))).status).toBe(500);
    expect(db.$transaction).toHaveBeenCalledTimes(1);
  });

  it('returns conflict for a concurrent unique-number or serialization collision', async () => {
    db.$transaction.mockRejectedValueOnce({ code: 'P2002' });
    expect((await POST(makePost(payload()))).status).toBe(409);
    db.$transaction.mockRejectedValueOnce({ code: 'P2034' });
    expect((await POST(makePost(payload()))).status).toBe(409);
  });
});
