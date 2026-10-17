/**
 * PM Schedule utility functions.
 *
 * New schedules use exactly two frequency types:
 * - time_day: a calendar/clock interval with an explicit unit
 * - meter: a threshold interval evaluated by a meter trigger
 *
 * Legacy cadence names remain readable through normalizePmFrequency so existing
 * schedules can be migrated without losing their original recurrence semantics.
 */

export const PM_FREQUENCY_TYPES = ['time_day', 'meter'] as const;
export type PmFrequencyType = (typeof PM_FREQUENCY_TYPES)[number];

export const TIME_DAY_FREQUENCY_UNITS = [
  'minutes',
  'hours',
  'days',
  'weeks',
  'months',
  'years',
] as const;
export type TimeDayFrequencyUnit = (typeof TIME_DAY_FREQUENCY_UNITS)[number];

export const LEGACY_PM_FREQUENCY_TYPES = [
  'daily',
  'weekly',
  'biweekly',
  'monthly',
  'quarterly',
  'semiannual',
  'annual',
  'custom_hours',
  'custom_days',
  'meter_based',
] as const;
export type LegacyPmFrequencyType = (typeof LEGACY_PM_FREQUENCY_TYPES)[number];

export interface NormalizedPmFrequency {
  type: PmFrequencyType;
  value: number;
  unit: TimeDayFrequencyUnit | string | null;
}

export function isPmFrequencyType(value: unknown): value is PmFrequencyType {
  return typeof value === 'string' && (PM_FREQUENCY_TYPES as readonly string[]).includes(value);
}

export function isTimeDayFrequencyUnit(value: unknown): value is TimeDayFrequencyUnit {
  return typeof value === 'string' && (TIME_DAY_FREQUENCY_UNITS as readonly string[]).includes(value);
}

export function isLegacyPmFrequencyType(value: unknown): value is LegacyPmFrequencyType {
  return typeof value === 'string' && (LEGACY_PM_FREQUENCY_TYPES as readonly string[]).includes(value);
}

/**
 * Convert legacy recurrence names to the canonical two-mode representation.
 * Unknown inputs and canonical Time/Day values without a supported unit are
 * rejected instead of silently falling back to a different cadence.
 */
export function normalizePmFrequency(
  frequencyType: string,
  frequencyValue: number,
  frequencyUnit?: string | null,
): NormalizedPmFrequency | null {
  const value = Number(frequencyValue);
  if (!Number.isFinite(value) || value <= 0) return null;

  if (frequencyType === 'time_day') {
    if (!isTimeDayFrequencyUnit(frequencyUnit)) return null;
    return { type: 'time_day', value, unit: frequencyUnit };
  }

  if (frequencyType === 'meter') {
    return {
      type: 'meter',
      value,
      unit: typeof frequencyUnit === 'string' && frequencyUnit.trim() ? frequencyUnit.trim() : null,
    };
  }

  switch (frequencyType) {
    case 'daily':
      return { type: 'time_day', value, unit: 'days' };
    case 'weekly':
      return { type: 'time_day', value, unit: 'weeks' };
    case 'biweekly':
      return { type: 'time_day', value: value * 2, unit: 'weeks' };
    case 'monthly':
      return { type: 'time_day', value, unit: 'months' };
    case 'quarterly':
      return { type: 'time_day', value: value * 3, unit: 'months' };
    case 'semiannual':
      return { type: 'time_day', value: value * 6, unit: 'months' };
    case 'annual':
      return { type: 'time_day', value, unit: 'years' };
    case 'custom_hours':
      return { type: 'time_day', value, unit: 'hours' };
    case 'custom_days':
      return { type: 'time_day', value, unit: 'days' };
    case 'meter_based':
      return {
        type: 'meter',
        value,
        unit: typeof frequencyUnit === 'string' && frequencyUnit.trim() ? frequencyUnit.trim() : null,
      };
    default:
      return null;
  }
}

/**
 * Calculate the next calendar due date from a given date.
 * Meter schedules deliberately return null; their due state is driven by a
 * meter threshold rather than a fabricated date.
 */
export function calculateNextDueDate(
  fromDate: Date,
  frequencyType: string,
  frequencyValue: number,
  frequencyUnit?: string | null,
): Date | null {
  const normalized = normalizePmFrequency(frequencyType, frequencyValue, frequencyUnit);
  if (!normalized || normalized.type === 'meter' || !isTimeDayFrequencyUnit(normalized.unit)) {
    return null;
  }

  const next = new Date(fromDate);
  const val = normalized.value;

  switch (normalized.unit) {
    case 'minutes':
      next.setMinutes(next.getMinutes() + val);
      break;
    case 'hours':
      next.setHours(next.getHours() + val);
      break;
    case 'days':
      next.setDate(next.getDate() + val);
      break;
    case 'weeks':
      next.setDate(next.getDate() + val * 7);
      break;
    case 'months':
      next.setMonth(next.getMonth() + val);
      break;
    case 'years':
      next.setFullYear(next.getFullYear() + val);
      break;
    default:
      return null;
  }

  return next;
}

/**
 * Calendar/clock schedules can be calculated automatically; meter schedules
 * require their configured reading source to cross a threshold.
 */
export function isAutoCalculableFrequency(
  frequencyType: string,
  frequencyUnit?: string | null,
): boolean {
  const normalized = normalizePmFrequency(frequencyType, 1, frequencyUnit);
  return normalized?.type === 'time_day' && isTimeDayFrequencyUnit(normalized.unit);
}

function singularizeUnit(unit: string, value: number): string {
  if (value !== 1) return unit;
  return unit.endsWith('s') ? unit.slice(0, -1) : unit;
}

/** Generate a human-readable recurrence label. */
export function formatFrequencyLabel(
  frequencyType: string,
  frequencyValue: number,
  frequencyUnit?: string | null,
): string {
  const normalized = normalizePmFrequency(frequencyType, frequencyValue, frequencyUnit);
  if (!normalized) return `${frequencyType}/${frequencyValue}`;

  const unit = normalized.unit || 'units';
  return `Every ${normalized.value} ${singularizeUnit(unit, normalized.value)}`;
}
