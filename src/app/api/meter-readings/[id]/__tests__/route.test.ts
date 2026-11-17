import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  mockDb, mockGetSession, mockHasPermission, mockIsAdmin,
  mockGetPlantScope, mockCanAccessPlantStrict,
} = vi.hoisted(() => ({
  mockDb: {
    meterReading: {
      findUnique: vi.fn(), update: vi.fn(), delete: vi.fn(),
    },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(),
  },
  mockGetSession: vi.fn(),
  mockHasPermission: vi.fn(),
  mockIsAdmin: vi.fn(),
  mockGetPlantScope: vi.fn(),
  mockCanAccessPlantStrict: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db: mockDb }));
vi.mock('@/lib/auth', () => ({
  getSession: mockGetSession, hasPermission: mockHasPermission, isAdmin: mockIsAdmin,
}));
vi.mock('@/lib/plant-scope', () => ({
  getPlantScope: mockGetPlantScope, canAccessPlantStrict: mockCanAccessPlantStrict,
}));

import { GET, PUT, DELETE } from '../route';

const params = { params: Promise.resolve({ id: 'reading-1' }) };
const session = { userId: 'operator-1', roles: ['operator'], permissions: ['meters.view', 'meters.update'] };
const reading = (overrides: Record<string, unknown> = {}) => ({
  id: 'reading-1', readingNumber: 'MR-0001', assetId: 'asset-1',
  assetMeterId: 'meter-1', plantId: 'plant-1', value: 100,
  meterName: 'Running Hours', unit: 'hours', readingDate: new Date('2026-11-17T08:00:00Z'),
  notes: 'Observed in shift', ...overrides,
});
const request = (method: string, body?: Record<string, unknown>) => new NextRequest(
  'http://localhost/api/meter-readings/reading-1', {
    method,
    ...(body ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}),
  },
);

describe('legacy meter reading direct-id plant isolation and immutable PM evidence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockReturnValue(session);
    mockHasPermission.mockReturnValue(true);
    mockIsAdmin.mockReturnValue(false);
    mockGetPlantScope.mockResolvedValue({
      isSystemWide: false, isScoped: false, accessiblePlantIds: ['plant-1'], denyAccess: false,
    });
    mockCanAccessPlantStrict.mockImplementation((_scope: unknown, plantId: string | null) => plantId === 'plant-1');
    mockDb.meterReading.findUnique.mockResolvedValue(reading());
    mockDb.meterReading.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ ...reading(), ...data }));
    mockDb.meterReading.delete.mockResolvedValue(reading());
    mockDb.auditLog.create.mockResolvedValue({ id: 'audit-1' });
    mockDb.$transaction.mockImplementation(async (fn: (tx: typeof mockDb) => Promise<unknown>) => fn(mockDb));
  });

  it('requires an authenticated user and meter-read permission before a direct lookup', async () => {
    mockGetSession.mockReturnValueOnce(null);
    expect((await GET(request('GET'), params)).status).toBe(401);
    expect(mockDb.meterReading.findUnique).not.toHaveBeenCalled();
    mockHasPermission.mockReturnValue(false);
    expect((await GET(request('GET'), params)).status).toBe(403);
    expect(mockDb.meterReading.findUnique).not.toHaveBeenCalled();
  });

  it('rejects direct reads from another plant and honors narrower explicit scope', async () => {
    mockDb.meterReading.findUnique.mockResolvedValueOnce(reading({ plantId: 'plant-2' }));
    expect((await GET(request('GET'), params)).status).toBe(403);
    mockGetPlantScope.mockResolvedValueOnce({ isScoped: true, denyAccess: true });
    expect((await GET(request('GET'), params)).status).toBe(403);
    expect(mockCanAccessPlantStrict).toHaveBeenCalledTimes(1);
  });

  it('rejects unauthorized edit and delete before mutating any reading or audit record', async () => {
    mockDb.meterReading.findUnique.mockResolvedValue(reading({ plantId: 'plant-2' }));
    expect((await PUT(request('PUT', { notes: 'Attempted cross-plant edit' }), params)).status).toBe(403);
    mockIsAdmin.mockReturnValue(true);
    expect((await DELETE(request('DELETE'), params)).status).toBe(403);
    expect(mockDb.meterReading.update).not.toHaveBeenCalled();
    expect(mockDb.meterReading.delete).not.toHaveBeenCalled();
    expect(mockDb.auditLog.create).not.toHaveBeenCalled();
  });

  it('rejects historical value edits and deletion of asset-linked PM evidence, including for admins', async () => {
    expect((await PUT(request('PUT', { value: 5 }), params)).status).toBe(409);
    mockIsAdmin.mockReturnValue(true);
    expect((await DELETE(request('DELETE'), params)).status).toBe(409);
    expect(mockDb.$transaction).not.toHaveBeenCalled();
  });

  it('permits a notes-only correction and writes the change and audit atomically', async () => {
    const response = await PUT(request('PUT', { notes: 'Verified by supervisor' }), params);
    expect(response.status).toBe(200);
    expect(mockDb.meterReading.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'reading-1' }, data: { notes: 'Verified by supervisor' },
    }));
    expect(mockDb.auditLog.create).toHaveBeenCalledTimes(1);
    expect(mockDb.$transaction).toHaveBeenCalledTimes(1);
    expect((await response.json()).data.value).toBe(100);
  });

  it('allows only an authorized admin to delete an unlinked legacy reading with audit in one transaction', async () => {
    mockDb.meterReading.findUnique.mockResolvedValue(reading({
      assetId: null, assetMeterId: null, plantId: 'plant-1',
    }));
    mockIsAdmin.mockReturnValue(true);
    expect((await DELETE(request('DELETE'), params)).status).toBe(200);
    expect(mockDb.meterReading.delete).toHaveBeenCalledWith({ where: { id: 'reading-1' } });
    expect(mockDb.auditLog.create).toHaveBeenCalledTimes(1);
    expect(mockDb.$transaction).toHaveBeenCalledTimes(1);
  });

  it('rejects invalid legacy meter values and dates without writes', async () => {
    mockDb.meterReading.findUnique.mockResolvedValue(reading({
      assetId: null, assetMeterId: null,
    }));
    for (const payload of [{ value: '' }, { value: -1 }, { value: 'NaN' }, { readingDate: 'invalid' }]) {
      expect((await PUT(request('PUT', payload), params)).status).toBe(400);
    }
    expect(mockDb.$transaction).not.toHaveBeenCalled();
  });
});
