import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getFunctionalLocationSubtreeIds: vi.fn(),
  getAssetIdsInFunctionalLocationSubtree: vi.fn(),
}));

vi.mock('@/lib/functional-location/live-location', () => ({
  getFunctionalLocationSubtreeIds: mocks.getFunctionalLocationSubtreeIds,
  getAssetIdsInFunctionalLocationSubtree: mocks.getAssetIdsInFunctionalLocationSubtree,
}));

import { resolveFunctionalLocationReportScope } from '@/lib/functional-location/reporting';

describe('resolveFunctionalLocationReportScope', () => {
  beforeEach(() => vi.clearAllMocks());

  it('builds a snapshot-first work-order filter with current-location fallback', async () => {
    mocks.getFunctionalLocationSubtreeIds.mockResolvedValue(['loc-parent', 'loc-child']);
    mocks.getAssetIdsInFunctionalLocationSubtree.mockResolvedValue(['asset-live']);

    const scope = await resolveFunctionalLocationReportScope('loc-parent');

    expect(scope.locationIds).toEqual(['loc-parent', 'loc-child']);
    expect(scope.currentAssetIds).toEqual(['asset-live']);
    expect(scope.workOrderFilter).toEqual({
      OR: [
        { functionalLocationIdSnapshot: { in: ['loc-parent', 'loc-child'] } },
        {
          AND: [
            { functionalLocationSourceSnapshot: null },
            { functionalLocationIdSnapshot: null },
            { assetId: { in: ['asset-live'] } },
          ],
        },
      ],
    });
  });

  it('fails closed when the selected subtree has no matching locations or assets', async () => {
    mocks.getFunctionalLocationSubtreeIds.mockResolvedValue([]);
    mocks.getAssetIdsInFunctionalLocationSubtree.mockResolvedValue([]);

    const scope = await resolveFunctionalLocationReportScope('loc-empty');

    expect(scope.workOrderFilter).toEqual({
      OR: [
        { functionalLocationIdSnapshot: { in: [] } },
        {
          AND: [
            { functionalLocationSourceSnapshot: null },
            { functionalLocationIdSnapshot: null },
            { assetId: { in: [] } },
          ],
        },
      ],
    });
  });
});
