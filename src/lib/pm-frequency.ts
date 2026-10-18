export const PM_FREQUENCY_TYPES = [
  { value: 'time_day', label: 'Time/Day' },
  { value: 'meter', label: 'Meter' },
] as const;

export const PM_TIME_UNITS = [
  { value: 'minutes', label: 'Minutes' },
  { value: 'hours', label: 'Hours' },
  { value: 'days', label: 'Days' },
  { value: 'weeks', label: 'Weeks' },
  { value: 'months', label: 'Months' },
  { value: 'years', label: 'Years' },
] as const;

export type CanonicalPmFrequencyType = (typeof PM_FREQUENCY_TYPES)[number]['value'];
export type PmTimeUnit = (typeof PM_TIME_UNITS)[number]['value'];

const TIME_UNITS = new Set<string>(PM_TIME_UNITS.map((unit) => unit.value));
const CANONICAL_TYPES = new Set<string>(PM_FREQUENCY_TYPES.map((type) => type.value));

export const LEGACY_PM_FREQUENCY_TYPES = [
  'daily',
  'weekly',
  'biweekly',
  'monthly',
  'quarterly',
  'semiannual',
  'annual',
  'annually',
  'yearly',
  'custom',
  'custom_days',
  'custom_hours',
  'meter_based',
] as const;

const LEGACY_TYPES = new Set<string>(LEGACY_PM_FREQUENCY_TYPES);

export interface PmFrequencyInput {
  frequencyType: unknown;
  frequencyValue?: unknown;
  frequencyUnit?: unknown;
  meterName?: unknown;
}

export interface NormalizedPmFrequency {
  frequencyType: CanonicalPmFrequencyType;
  frequencyValue: number;
  frequencyUnit: string;
  meterName: string | null;
}

function positiveWholeNumber(value: unknown, fallback: number): number {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : fallback;
}

function optionalText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

export function isPmTimeUnit(value: unknown): value is PmTimeUnit {
  return typeof value === 'string' && TIME_UNITS.has(value);
}

export function isCanonicalPmFrequencyType(value: unknown): value is CanonicalPmFrequencyType {
  return typeof value === 'string' && CANONICAL_TYPES.has(value);
}

export function isKnownPmFrequencyType(value: unknown): boolean {
  return typeof value === 'string' && (CANONICAL_TYPES.has(value) || LEGACY_TYPES.has(value));
}

/**
 * Normalize persisted legacy schedules into the two canonical planning modes.
 * This function is intentionally non-destructive: callers can present/edit old
 * rows without mutating the database until the planner explicitly saves them.
 */
export function normalizePmFrequency(input: PmFrequencyInput): NormalizedPmFrequency {
  const type = typeof input.frequencyType === 'string' ? input.frequencyType.trim() : '';
  const suppliedUnit = optionalText(input.frequencyUnit);
  const meterName = optionalText(input.meterName);

  if (type === 'time_day') {
    return {
      frequencyType: 'time_day',
      frequencyValue: positiveWholeNumber(input.frequencyValue, 1),
      frequencyUnit: isPmTimeUnit(suppliedUnit) ? suppliedUnit : 'days',
      meterName: null,
    };
  }

  if (type === 'meter') {
    return {
      frequencyType: 'meter',
      frequencyValue: positiveWholeNumber(input.frequencyValue, 1),
      frequencyUnit: suppliedUnit || 'hours',
      meterName,
    };
  }

  const legacyValue = positiveWholeNumber(input.frequencyValue, 1);
  switch (type) {
    case 'daily':
      return { frequencyType: 'time_day', frequencyValue: legacyValue, frequencyUnit: 'days', meterName: null };
    case 'weekly':
      return { frequencyType: 'time_day', frequencyValue: legacyValue, frequencyUnit: 'weeks', meterName: null };
    case 'biweekly':
      return { frequencyType: 'time_day', frequencyValue: legacyValue * 2, frequencyUnit: 'weeks', meterName: null };
    case 'monthly':
      return { frequencyType: 'time_day', frequencyValue: legacyValue, frequencyUnit: 'months', meterName: null };
    case 'quarterly':
      return { frequencyType: 'time_day', frequencyValue: legacyValue * 3, frequencyUnit: 'months', meterName: null };
    case 'semiannual':
      return { frequencyType: 'time_day', frequencyValue: legacyValue * 6, frequencyUnit: 'months', meterName: null };
    case 'annual':
    case 'annually':
    case 'yearly':
      return { frequencyType: 'time_day', frequencyValue: legacyValue, frequencyUnit: 'years', meterName: null };
    case 'custom':
    case 'custom_days':
      return { frequencyType: 'time_day', frequencyValue: legacyValue, frequencyUnit: 'days', meterName: null };
    case 'custom_hours':
      return { frequencyType: 'time_day', frequencyValue: legacyValue, frequencyUnit: 'hours', meterName: null };
    case 'meter_based':
      return {
        frequencyType: 'meter',
        frequencyValue: legacyValue,
        frequencyUnit: suppliedUnit || 'hours',
        meterName,
      };
    default:
      return {
        frequencyType: 'time_day',
        frequencyValue: legacyValue,
        frequencyUnit: isPmTimeUnit(suppliedUnit) ? suppliedUnit : 'days',
        meterName: null,
      };
  }
}

export function validateCanonicalPmFrequency(input: PmFrequencyInput): { ok: true } | { ok: false; error: string } {
  if (!isCanonicalPmFrequencyType(input.frequencyType)) {
    return { ok: false, error: 'Frequency type must be Time/Day or Meter' };
  }

  const value = Number(input.frequencyValue);
  if (!Number.isInteger(value) || value <= 0) {
    return { ok: false, error: 'Frequency value must be a positive whole number' };
  }

  if (input.frequencyType === 'time_day') {
    if (!isPmTimeUnit(input.frequencyUnit)) {
      return {
        ok: false,
        error: 'Time/Day frequency unit must be minutes, hours, days, weeks, months, or years',
      };
    }
    return { ok: true };
  }

  if (!optionalText(input.meterName) || !optionalText(input.frequencyUnit)) {
    return { ok: false, error: 'Meter frequency requires a configured asset meter and unit' };
  }
  return { ok: true };
}

function utcDaysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

function addMonthsClamped(fromDate: Date, months: number): Date {
  const next = new Date(fromDate);
  const day = next.getUTCDate();
  next.setUTCDate(1);
  next.setUTCMonth(next.getUTCMonth() + months);
  next.setUTCDate(Math.min(day, utcDaysInMonth(next.getUTCFullYear(), next.getUTCMonth())));
  return next;
}

function addYearsClamped(fromDate: Date, years: number): Date {
  const next = new Date(fromDate);
  const month = next.getUTCMonth();
  const day = next.getUTCDate();
  next.setUTCDate(1);
  next.setUTCFullYear(next.getUTCFullYear() + years);
  next.setUTCMonth(month);
  next.setUTCDate(Math.min(day, utcDaysInMonth(next.getUTCFullYear(), month)));
  return next;
}

export function calculateTimeDayNextDueDate(fromDate: Date, frequencyValue: number, frequencyUnit: PmTimeUnit): Date {
  const value = positiveWholeNumber(frequencyValue, 1);
  const next = new Date(fromDate);

  switch (frequencyUnit) {
    case 'minutes':
      next.setUTCMinutes(next.getUTCMinutes() + value);
      return next;
    case 'hours':
      next.setUTCHours(next.getUTCHours() + value);
      return next;
    case 'days':
      next.setUTCDate(next.getUTCDate() + value);
      return next;
    case 'weeks':
      next.setUTCDate(next.getUTCDate() + value * 7);
      return next;
    case 'months':
      return addMonthsClamped(next, value);
    case 'years':
      return addYearsClamped(next, value);
  }
}

export function formatPmFrequencyLabel(input: PmFrequencyInput): string {
  const normalized = normalizePmFrequency(input);
  const value = normalized.frequencyValue;
  if (normalized.frequencyType === 'meter') {
    const meter = normalized.meterName ? `${normalized.meterName} · ` : '';
    return `Every ${value} ${meter}${normalized.frequencyUnit}`;
  }
  const singular = value === 1 ? normalized.frequencyUnit.replace(/s$/, '') : normalized.frequencyUnit;
  return `Every ${value} ${singular}`;
}
