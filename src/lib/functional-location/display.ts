import type { FunctionalLocationProjection } from '@/types';

export interface FunctionalLocationDisplayInput {
  location?: string | null;
  functionalLocation?: FunctionalLocationProjection | null;
}

export interface FunctionalLocationDisplay {
  path: string;
  code: string | null;
  compact: string;
  source: 'structured' | 'legacy';
}

export function formatFunctionalLocationDisplay(
  asset: FunctionalLocationDisplayInput | null | undefined,
): FunctionalLocationDisplay {
  const functionalLocation = asset?.functionalLocation ?? null;
  const path = functionalLocation?.path?.trim() || asset?.location?.trim() || '—';
  const code = functionalLocation?.locationCode?.trim() || null;
  const source = functionalLocation?.source === 'structured' ? 'structured' : 'legacy';

  return {
    path,
    code,
    compact: code ? `${code} · ${path}` : path,
    source,
  };
}

export interface MaintenanceLocationDisplayInput {
  functionalLocationIdSnapshot?: string | null;
  functionalLocationNameSnapshot?: string | null;
  functionalLocationCodeSnapshot?: string | null;
  functionalLocationPathSnapshot?: string | null;
  functionalLocationPathCodeSnapshot?: string | null;
  functionalLocationSourceSnapshot?: string | null;
  asset?: FunctionalLocationDisplayInput | null;
}

export interface MaintenanceLocationDisplay {
  maintenancePath: string;
  maintenanceCode: string | null;
  currentPath: string;
  currentCode: string | null;
  hasFrozenSnapshot: boolean;
  differsFromCurrent: boolean;
}

function normalizedLocationValue(value: string | null | undefined): string {
  return (value || '').trim().toLocaleLowerCase();
}

export function formatMaintenanceLocationDisplay(
  record: MaintenanceLocationDisplayInput | null | undefined,
): MaintenanceLocationDisplay {
  const current = formatFunctionalLocationDisplay(record?.asset);
  const frozenPath = record?.functionalLocationPathSnapshot?.trim() || '';
  const frozenCode = record?.functionalLocationCodeSnapshot?.trim() || null;
  const hasFrozenSnapshot = Boolean(
    record?.functionalLocationSourceSnapshot
      || record?.functionalLocationIdSnapshot
      || record?.functionalLocationNameSnapshot
      || frozenCode
      || frozenPath
      || record?.functionalLocationPathCodeSnapshot,
  );

  const maintenancePath = hasFrozenSnapshot ? (frozenPath || current.path) : current.path;
  const maintenanceCode = hasFrozenSnapshot ? frozenCode : current.code;
  const pathDiffers = normalizedLocationValue(maintenancePath) !== normalizedLocationValue(current.path);
  const codeDiffers = Boolean(
    maintenanceCode
      && current.code
      && normalizedLocationValue(maintenanceCode) !== normalizedLocationValue(current.code),
  );

  return {
    maintenancePath,
    maintenanceCode,
    currentPath: current.path,
    currentCode: current.code,
    hasFrozenSnapshot,
    differsFromCurrent: hasFrozenSnapshot && (pathDiffers || codeDiffers),
  };
}
