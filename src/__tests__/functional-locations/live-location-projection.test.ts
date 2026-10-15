import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockDb } = vi.hoisted(() => ({
  mockDb: {
    asset: { findMany: vi.fn() },
    assetFunctionalLocationAssignment: { findMany: vi.fn() },
    functionalLocation: { findMany: vi.fn(), findUnique: vi.fn() },
    hierarchySystem: { findFirst: vi.fn() },
  },
}));

vi.mock('@/lib/db', () => ({ db: mockDb }));

import {
  findAssetIdsByLiveLocationSearch,
  getAssetIdsInFunctionalLocationSubtree,
  getAssetLiveLocationMap,
} from '@/lib/functional-location/live-location';

const primarySystem = {
  id: 'system-primary',
  name: 'Primary Functional Location',
  code: 'PRIMARY',
  isPrimary: true,
  isActive: true,
};

const nodes = [
  { id: 'loc-plant', hierarchySystemId: 'system-primary', parentId: null, name: 'Tema Factory', locationCode: 'TEMA' },
  { id: 'loc-area', hierarchySystemId: 'system-primary', parentId: 'loc-plant', name: 'Printing', locationCode: 'TEMA-PRT' },
  { id: 'loc-line', hierarchySystemId: 'system-primary', parentId: 'loc-area', name: 'Line 01', locationCode: 'TEMA-PRT-L01' },
  { id: 'loc-position', hierarchySystemId: 'system-primary', parentId: 'loc-line', name: 'Position 03', locationCode: 'TEMA-PRT-L01-P03' },
];

function assetRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'asset-1',
    location: 'Legacy Position',
    building: 'Legacy Building',
    floor: 'Legacy Floor',
    area: 'Legacy Area',
    plant: { id: 'plant-a', name: 'Tema Factory', code: 'TEMA' },
    department: { id: 'dept-a', name: 'Printing', code: 'PRT' },
    ...overrides,
  };
}

function assignment(overrides: Record<string, unknown> = {}) {
  return {
    id: 'assignment-1',
    assetId: 'asset-1',
    hierarchySystemId: 'system-primary',
    functionalLocationId: 'loc-position',
    assignedAt: new Date('2026-10-15T10:00:00Z'),
    endedAt: null,
    hierarchySystem: primarySystem,
    functionalLocation: {
      id: 'loc-position',
      hierarchySystemId: 'system-primary',
      parentId: 'loc-line',
      name: 'Position 03',
      locationCode: 'TEMA-PRT-L01-P03',
    },
    ...overrides,
  };
}

describe('live functional-location projection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.asset.findMany.mockResolvedValue([assetRow()]);
    mockDb.assetFunctionalLocationAssignment.findMany.mockResolvedValue([assignment()]);
    mockDb.functionalLocation.findMany.mockResolvedValue(nodes);
  });

  it('projects the current primary assignment as the authoritative coded breadcrumb', async () => {
    const result = await getAssetLiveLocationMap(['asset-1']);
    expect(result.get('asset-1')).toEqual(expect.objectContaining({
      id: 'loc-position',
      name: 'Position 03',
      locationCode: 'TEMA-PRT-L01-P03',
      path: 'Tema Factory > Printing > Line 01 > Position 03',
      pathCode: 'TEMA-PRT-L01-P03 — Tema Factory > Printing > Line 01 > Position 03',
      source: 'structured',
    }));
  });

  it('queries only current assignments from the active primary hierarchy', async () => {
    await getAssetLiveLocationMap(['asset-1']);
    expect(mockDb.assetFunctionalLocationAssignment.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        assetId: { in: ['asset-1'] },
        endedAt: null,
        hierarchySystem: { isPrimary: true, isActive: true },
      }),
    }));
  });

  it('deduplicates asset ids before querying', async () => {
    await getAssetLiveLocationMap(['asset-1', ' asset-1 ', '', 'asset-1']);
    expect(mockDb.asset.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: { in: ['asset-1'] } },
    }));
  });

  it('falls back to legacy plant/department/building/floor/area/location when no structured assignment exists', async () => {
    mockDb.assetFunctionalLocationAssignment.findMany.mockResolvedValue([]);
    const result = await getAssetLiveLocationMap(['asset-1']);
    expect(result.get('asset-1')).toEqual(expect.objectContaining({
      id: null,
      locationCode: null,
      path: 'Tema Factory > Printing > Legacy Building > Legacy Floor > Legacy Area > Legacy Position',
      pathCode: 'Tema Factory > Printing > Legacy Building > Legacy Floor > Legacy Area > Legacy Position',
      source: 'legacy',
    }));
  });

  it('returns an empty map without querying when no usable asset ids are supplied', async () => {
    const result = await getAssetLiveLocationMap(['', '   ']);
    expect(result.size).toBe(0);
    expect(mockDb.asset.findMany).not.toHaveBeenCalled();
    expect(mockDb.assetFunctionalLocationAssignment.findMany).not.toHaveBeenCalled();
  });
});


describe('live functional-location search and subtree resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.hierarchySystem.findFirst.mockResolvedValue({ id: 'system-primary' });
    mockDb.functionalLocation.findMany.mockResolvedValue(nodes);
    mockDb.functionalLocation.findUnique.mockResolvedValue({
      id: 'loc-area',
      hierarchySystemId: 'system-primary',
      hierarchySystem: { isPrimary: true, isActive: true },
    });
    mockDb.assetFunctionalLocationAssignment.findMany.mockResolvedValue([
      { assetId: 'asset-1' },
      { assetId: 'asset-2' },
      { assetId: 'asset-1' },
    ]);
    mockDb.asset.findMany.mockResolvedValue([{ id: 'asset-legacy' }]);
  });

  it('matches a Location Code or ancestor path segment and includes assets assigned below that match', async () => {
    const result = await findAssetIdsByLiveLocationSearch('PRT');
    expect(result).toEqual(['asset-1', 'asset-2', 'asset-legacy']);
    expect(mockDb.assetFunctionalLocationAssignment.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        endedAt: null,
        hierarchySystemId: 'system-primary',
        functionalLocationId: { in: expect.arrayContaining(['loc-area', 'loc-line', 'loc-position']) },
      }),
    }));
  });

  it('searches legacy location fields as fallback and deduplicates structured and legacy matches', async () => {
    mockDb.asset.findMany.mockResolvedValue([{ id: 'asset-1' }, { id: 'asset-legacy' }]);
    const result = await findAssetIdsByLiveLocationSearch('PRT');
    expect(result).toEqual(['asset-1', 'asset-2', 'asset-legacy']);
    expect(mockDb.asset.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ OR: expect.any(Array) }),
      select: { id: true },
    }));
  });

  it('returns no search matches without querying for blank input', async () => {
    const result = await findAssetIdsByLiveLocationSearch('   ');
    expect(result).toEqual([]);
    expect(mockDb.hierarchySystem.findFirst).not.toHaveBeenCalled();
    expect(mockDb.asset.findMany).not.toHaveBeenCalled();
  });

  it('returns assets at a selected primary location and all descendants in the same hierarchy system', async () => {
    const result = await getAssetIdsInFunctionalLocationSubtree('loc-area');
    expect(result).toEqual(['asset-1', 'asset-2']);
    expect(mockDb.functionalLocation.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { hierarchySystemId: 'system-primary' },
    }));
    expect(mockDb.assetFunctionalLocationAssignment.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        endedAt: null,
        hierarchySystemId: 'system-primary',
        functionalLocationId: { in: expect.arrayContaining(['loc-area', 'loc-line', 'loc-position']) },
      },
      select: { assetId: true },
    }));
  });

  it('rejects subtree resolution for a secondary or inactive hierarchy system', async () => {
    mockDb.functionalLocation.findUnique.mockResolvedValue({
      id: 'loc-secondary',
      hierarchySystemId: 'system-secondary',
      hierarchySystem: { isPrimary: false, isActive: true },
    });
    const result = await getAssetIdsInFunctionalLocationSubtree('loc-secondary');
    expect(result).toEqual([]);
    expect(mockDb.assetFunctionalLocationAssignment.findMany).not.toHaveBeenCalled();
  });
});
