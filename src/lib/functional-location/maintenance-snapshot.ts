import type { AssetLiveLocationProjection } from './live-location';

export interface MaintenanceLocationSnapshotFields {
  functionalLocationIdSnapshot: string | null;
  functionalLocationNameSnapshot: string | null;
  functionalLocationCodeSnapshot: string | null;
  functionalLocationPathSnapshot: string | null;
  functionalLocationPathCodeSnapshot: string | null;
  functionalLocationSourceSnapshot: 'structured' | 'legacy' | null;
}

export type MaintenanceLocationSnapshotRecord = {
  functionalLocationIdSnapshot?: string | null;
  functionalLocationNameSnapshot?: string | null;
  functionalLocationCodeSnapshot?: string | null;
  functionalLocationPathSnapshot?: string | null;
  functionalLocationPathCodeSnapshot?: string | null;
  functionalLocationSourceSnapshot?: string | null;
};

export function buildMaintenanceLocationSnapshot(
  projection: AssetLiveLocationProjection | null | undefined,
): MaintenanceLocationSnapshotFields {
  return {
    functionalLocationIdSnapshot: projection?.id ?? null,
    functionalLocationNameSnapshot: projection?.name ?? null,
    functionalLocationCodeSnapshot: projection?.locationCode ?? null,
    functionalLocationPathSnapshot: projection?.path || null,
    functionalLocationPathCodeSnapshot: projection?.pathCode || projection?.path || null,
    functionalLocationSourceSnapshot: projection?.source ?? null,
  };
}

export function getMaintenanceLocationSnapshot(
  record: MaintenanceLocationSnapshotRecord,
  liveFallback: AssetLiveLocationProjection | null | undefined,
): AssetLiveLocationProjection | null {
  const source = record.functionalLocationSourceSnapshot;
  const hasFrozenSnapshot = Boolean(
    source
      || record.functionalLocationIdSnapshot
      || record.functionalLocationNameSnapshot
      || record.functionalLocationCodeSnapshot
      || record.functionalLocationPathSnapshot
      || record.functionalLocationPathCodeSnapshot,
  );
  if (!hasFrozenSnapshot) return liveFallback ?? null;

  const path = record.functionalLocationPathSnapshot
    || record.functionalLocationPathCodeSnapshot
    || record.functionalLocationNameSnapshot
    || '';
  const pathCode = record.functionalLocationPathCodeSnapshot || path;
  const normalizedSource: 'structured' | 'legacy' = source === 'structured' ? 'structured' : 'legacy';

  return {
    id: record.functionalLocationIdSnapshot ?? null,
    name: record.functionalLocationNameSnapshot ?? null,
    locationCode: record.functionalLocationCodeSnapshot ?? null,
    path,
    pathCode,
    source: normalizedSource,
    legacyPath: normalizedSource === 'legacy' ? path || null : null,
  };
}
