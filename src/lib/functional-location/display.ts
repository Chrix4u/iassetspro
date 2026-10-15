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
