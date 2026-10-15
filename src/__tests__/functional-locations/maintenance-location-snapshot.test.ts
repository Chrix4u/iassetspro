import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockDb } = vi.hoisted(() => ({
  mockDb: {
    functionalLocation: { findMany: vi.fn(), findUnique: vi.fn() },
    assetFunctionalLocationAssignment: { findMany: vi.fn() },
  },
}));

vi.mock('@/lib/db', () => ({ db: mockDb }));

import {
  buildMaintenanceLocationSnapshot,
  getMaintenanceLocationSnapshot,
} from '@/lib/functional-location/maintenance-snapshot';
import { getFunctionalLocationSubtreeIds } from '@/lib/functional-location/live-location';

const structuredProjection = {
  id: 'loc-position',
  name: 'Position 03',
  locationCode: 'TEMA-PRT-L01-P03',
  path: 'Tema Factory > Printing > Line 01 > Position 03',
  pathCode: 'TEMA-PRT-L01-P03 — Tema Factory > Printing > Line 01 > Position 03',
  source: 'structured' as const,
  legacyPath: 'Tema Factory > Printing > Legacy Position',
};

const legacyProjection = {
  id: null,
  name: 'Legacy Position',
  locationCode: null,
  path: 'Tema Factory > Printing > Legacy Position',
  pathCode: 'Tema Factory > Printing > Legacy Position',
  source: 'legacy' as const,
  legacyPath: 'Tema Factory > Printing > Legacy Position',
};

describe('maintenance functional-location snapshots', () => {
  it('freezes all structured projection fields into queryable snapshot columns', () => {
    expect(buildMaintenanceLocationSnapshot(structuredProjection)).toEqual({
      functionalLocationIdSnapshot: 'loc-position',
      functionalLocationNameSnapshot: 'Position 03',
      functionalLocationCodeSnapshot: 'TEMA-PRT-L01-P03',
      functionalLocationPathSnapshot: 'Tema Factory > Printing > Line 01 > Position 03',
      functionalLocationPathCodeSnapshot: 'TEMA-PRT-L01-P03 — Tema Factory > Printing > Line 01 > Position 03',
      functionalLocationSourceSnapshot: 'structured',
    });
  });

  it('freezes a legacy projection without inventing a structured location id or code', () => {
    expect(buildMaintenanceLocationSnapshot(legacyProjection)).toEqual({
      functionalLocationIdSnapshot: null,
      functionalLocationNameSnapshot: 'Legacy Position',
      functionalLocationCodeSnapshot: null,
      functionalLocationPathSnapshot: 'Tema Factory > Printing > Legacy Position',
      functionalLocationPathCodeSnapshot: 'Tema Factory > Printing > Legacy Position',
      functionalLocationSourceSnapshot: 'legacy',
    });
  });

  it('returns null snapshot columns when no location projection exists', () => {
    expect(buildMaintenanceLocationSnapshot(null)).toEqual({
      functionalLocationIdSnapshot: null,
      functionalLocationNameSnapshot: null,
      functionalLocationCodeSnapshot: null,
      functionalLocationPathSnapshot: null,
      functionalLocationPathCodeSnapshot: null,
      functionalLocationSourceSnapshot: null,
    });
  });

  it('prefers frozen snapshot fields over a later live projection', () => {
    const frozen = buildMaintenanceLocationSnapshot(structuredProjection);
    const movedLive = {
      ...structuredProjection,
      id: 'loc-new',
      name: 'Position 99',
      locationCode: 'TEMA-PRT-L02-P99',
      path: 'Tema Factory > Printing > Line 02 > Position 99',
      pathCode: 'TEMA-PRT-L02-P99 — Tema Factory > Printing > Line 02 > Position 99',
    };

    expect(getMaintenanceLocationSnapshot(frozen, movedLive)).toEqual({
      ...structuredProjection,
      legacyPath: null,
    });
  });

  it('falls back to the live projection only when the record has no frozen snapshot', () => {
    const empty = buildMaintenanceLocationSnapshot(null);
    expect(getMaintenanceLocationSnapshot(empty, structuredProjection)).toEqual(structuredProjection);
  });
});

describe('historical functional-location subtree ids', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.functionalLocation.findUnique.mockResolvedValue({
      id: 'loc-area',
      hierarchySystemId: 'system-primary',
      hierarchySystem: { isPrimary: true, isActive: true },
    });
    mockDb.functionalLocation.findMany.mockResolvedValue([
      { id: 'loc-area', parentId: 'loc-plant' },
      { id: 'loc-line', parentId: 'loc-area' },
      { id: 'loc-position', parentId: 'loc-line' },
      { id: 'loc-other', parentId: 'loc-plant' },
    ]);
  });

  it('returns the selected node and descendants without querying asset assignments', async () => {
    await expect(getFunctionalLocationSubtreeIds('loc-area')).resolves.toEqual([
      'loc-area',
      'loc-line',
      'loc-position',
    ]);
    expect(mockDb.assetFunctionalLocationAssignment.findMany).not.toHaveBeenCalled();
  });

  it('rejects secondary or inactive hierarchy roots', async () => {
    mockDb.functionalLocation.findUnique.mockResolvedValue({
      id: 'loc-secondary',
      hierarchySystemId: 'system-secondary',
      hierarchySystem: { isPrimary: false, isActive: true },
    });
    await expect(getFunctionalLocationSubtreeIds('loc-secondary')).resolves.toEqual([]);
    expect(mockDb.functionalLocation.findMany).not.toHaveBeenCalled();
  });
});
