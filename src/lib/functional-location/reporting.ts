import {
  getAssetIdsInFunctionalLocationSubtree,
  getFunctionalLocationSubtreeIds,
} from '@/lib/functional-location/live-location';

export interface FunctionalLocationReportScope {
  locationIds: string[];
  currentAssetIds: string[];
  workOrderFilter: Record<string, unknown>;
}

export async function resolveFunctionalLocationReportScope(
  functionalLocationId: string,
): Promise<FunctionalLocationReportScope> {
  const [locationIds, currentAssetIds] = await Promise.all([
    getFunctionalLocationSubtreeIds(functionalLocationId),
    getAssetIdsInFunctionalLocationSubtree(functionalLocationId),
  ]);

  return {
    locationIds,
    currentAssetIds,
    workOrderFilter: {
      OR: [
        { functionalLocationIdSnapshot: { in: locationIds } },
        {
          AND: [
            { functionalLocationSourceSnapshot: null },
            { functionalLocationIdSnapshot: null },
            { assetId: { in: currentAssetIds } },
          ],
        },
      ],
    },
  };
}
