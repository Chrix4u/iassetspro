import type { CommissioningParameter } from '@/lib/asset-onboarding';

/** A calibrated point is immutable after field evidence or a PM task link exists. */
export type ExistingPoint = {
  id: string;
  name: string;
  parameterKey: string | null;
  inspectionType: string;
  normalRange: string | null;
  description: string | null;
  _count: { records: number; pmTaskLinks: number };
};

export function parameterRange(param: CommissioningParameter): string {
  return JSON.stringify({ min: param.min, max: param.max, unit: param.unit });
}

function canonicalRange(raw: string | null): string {
  try {
    const v = JSON.parse(raw || '{}') as Record<string, unknown>;
    return JSON.stringify({ min: v.min ?? null, max: v.max ?? null, unit: v.unit ?? '' });
  } catch {
    return raw || '';
  }
}

export function pointChanges(current: ExistingPoint, next: CommissioningParameter): boolean {
  return current.name !== next.name
    || current.inspectionType !== next.inspectionType
    || (current.parameterKey !== null && current.parameterKey !== next.key)
    || canonicalRange(current.normalRange) !== parameterRange(next)
    || (current.description || '') !== next.reference;
}

export function hasPermanentPointEvidence(current: ExistingPoint): boolean {
  return current._count.records > 0 || current._count.pmTaskLinks > 0;
}

export function assertPointRevisionAllowed(
  current: ExistingPoint,
  next?: CommissioningParameter,
): void {
  if (!hasPermanentPointEvidence(current)) return;
  if (!next) {
    throw new Error('Cannot retire '+current.name+': it has inspection readings or PM task links');
  }
  if (pointChanges(current, next)) {
    throw new Error('Cannot change '+current.name+': it has inspection readings or PM task links. A controlled engineering revision is required');
  }
}
