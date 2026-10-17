/**
 * PM Schedule frequency domain.
 *
 * New schedules use a canonical two-mode UI model:
 * - Time/Day with an explicit calendar unit
 * - Meter with a supported meter unit/source
 *
 * Legacy persisted cadence values remain accepted so existing schedules can be
 * read and edited without a destructive data migration.
 */

export const PM_FREQUENCY_MODES = ['time_day', 'meter'] as const;
export type PmFrequencyMode = (typeof PM_FREQUENCY_MODES)[number];

export const PM_TIME_UNITS = [
  'minutes',
  'hours',
  'days',
  'weeks',
  'months',
  'years',
] as const;
export type PmTimeUnit = (typeof PM_TIME_UNITS)[number];

export const PM_METER_UNITS = ['hours'] as const;
export type PmMeterUnit = (typeof PM_METER_UNITS)[number];

export const PM_FREQUENCY_TYPES = [
  'time_minutes',
  'time_hours',
  'time_days',
  'time_weeks',
  'time_months',
  'time_years',
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

export type PmFrequencyType = (typeof PM_FREQUENCY_TYPES)[number];

export interface NormalizedPmFrequency {
  frequencyMode: PmFrequencyMode;
  frequencyUnit: PmTimeUnit | PmMeterUnit;
  frequencyValue: number;
}

export interface SerializedPmFrequency {
  frequencyType: PmFrequencyType;
  frequencyValue: number;
}

const TIME_UNIT_TO_FREQUENCY_TYPE: Record<PmTimeUnit, PmFrequencyType> = {
  minutes: 'time_minutes',
  hours: 'time_hours',
  days: 'time_days',
  weeks: 'time_weeks',
  months: 'time_months',
  years: 'time_years',
};

export function isPmFrequencyType(value: unknown): value is PmFrequencyType {
  return typeof value === 'string' && (PM_FREQUENCY_TYPES as readonly string[]).includes(value);
}

export function isPmFrequencyMode(value: unknown): value is PmFrequencyMode {
  return typeof value === 'string' && (PM_FREQUENCY_MODES as readonly string[]).includes(value);
}

export function isPmTimeUnit(value: unknown): value is PmTimeUnit {
  return typeof value === 'string' && (PM_TIME_UNITS as readonly string[]).includes(value);
}

export function isPmMeterUnit(value: unknown): value is PmMeterUnit {
  return typeof value === 'string' && (PM_METER_UNITS as readonly string[]).includes(value);
}

export function validatePmFrequencySelection(
  frequencyMode: unknown,
  frequencyUnit: unknown,
  frequencyValue: unknown,
): string | null {
  if (!isPmFrequencyMode(frequencyMode)) {
    return 'Select a valid frequency type';
  }

  if (typeof frequencyValue !== 'number' || !Number.isFinite(frequencyValue) || frequencyValue <= 0) {
    return 'Frequency value must be greater than 0';
  }

  if (frequencyMode === 'time_day' && !isPmTimeUnit(frequencyUnit)) {
    return 'Select a valid Time/Day unit';
  }

  if (frequencyMode === 'meter' && !isPmMeterUnit(frequencyUnit)) {
    return 'Select a supported meter unit';
  }

  return null;
}

export function serializePmFrequency(
  frequencyMode: unknown,
  frequencyUnit: unknown,
  frequencyValue: number,
): SerializedPmFrequency {
  const validationError = validatePmFrequencySelection(frequencyMode, frequencyUnit, frequencyValue);
  if (validationError) {
    throw new Error(validationError);
  }

  if (frequencyMode === 'meter') {
    return {
      frequencyType: 'meter_based',
      frequencyValue,
    };
  }

  return {
    frequencyType: TIME_UNIT_TO_FREQUENCY_TYPE[frequencyUnit as PmTimeUnit],
    frequencyValue,
  };
}

export function normalizePmFrequency(
  frequencyType: string,
  frequencyValue: number,
): NormalizedPmFrequency {
  const value = Number.isFinite(frequencyValue) && frequencyValue > 0 ? frequencyValue : 1;

  switch (frequencyType) {
    case 'time_minutes':
      return { frequencyMode: 'time_day', frequencyUnit: 'minutes', frequencyValue: value };
    case 'time_hours':
      return { frequencyMode: 'time_day', frequencyUnit: 'hours', frequencyValue: value };
    case 'time_days':
    case 'daily':
    case 'custom_days':
      return { frequencyMode: 'time_day', frequencyUnit: 'days', frequencyValue: value };
    case 'time_weeks':
    case 'weekly':
      return { frequencyMode: 'time_day', frequencyUnit: 'weeks', frequencyValue: value };
    case 'biweekly':
      return { frequencyMode: 'time_day', frequencyUnit: 'weeks', frequencyValue: value * 2 };
    case 'time_months':
    case 'monthly':
      return { frequencyMode: 'time_day', frequencyUnit: 'months', frequencyValue: value };
    case 'quarterly':
      return { frequencyMode: 'time_day', frequencyUnit: 'months', frequencyValue: value * 3 };
    case 'semiannual':
      return { frequencyMode: 'time_day', frequencyUnit: 'months', frequencyValue: value * 6 };
    case 'time_years':
    case 'annual':
      return { frequencyMode: 'time_day', frequencyUnit: 'years', frequencyValue: value };
    case 'custom_hours':
    case 'meter_based':
      return { frequencyMode: 'meter', frequencyUnit: 'hours', frequencyValue: value };
    default:
      return { frequencyMode: 'time_day', frequencyUnit: 'days', frequencyValue: value };
  }
}

export function calculateNextDueDate(
  fromDate: Date,
  frequencyType: string,
  frequencyValue: number,
): Date | null {
  if (!isPmFrequencyType(frequencyType)) return null;

  if (frequencyType === 'meter_based' || frequencyType === 'custom_hours') {
    return null;
  }

  const next = new Date(fromDate);
  const val = Math.max(1, frequencyValue);

  switch (frequencyType) {
    case 'time_minutes':
      next.setMinutes(next.getMinutes() + val);
      break;
    case 'time_hours':
      next.setHours(next.getHours() + val);
      break;
    case 'time_days':
    case 'daily':
    case 'custom_days':
      next.setDate(next.getDate() + val);
      break;
    case 'time_weeks':
    case 'weekly':
      next.setDate(next.getDate() + val * 7);
      break;
    case 'biweekly':
      next.setDate(next.getDate() + val * 14);
      break;
    case 'time_months':
    case 'monthly':
      next.setMonth(next.getMonth() + val);
      break;
    case 'quarterly':
      next.setMonth(next.getMonth() + val * 3);
      break;
    case 'semiannual':
      next.setMonth(next.getMonth() + val * 6);
      break;
    case 'time_years':
      next.setFullYear(next.getFullYear() + val);
      break;
    case 'annual':
      next.setMonth(next.getMonth() + val * 12);
      break;
    default:
      return null;
  }

  return next;
}

export function isAutoCalculableFrequency(frequencyType: string): boolean {
  return isPmFrequencyType(frequencyType) && frequencyType !== 'meter_based' && frequencyType !== 'custom_hours';
}

export function formatFrequencyLabel(frequencyType: string, frequencyValue: number): string {
  const normalized = normalizePmFrequency(frequencyType, frequencyValue);
  const val = normalized.frequencyValue;

  if (normalized.frequencyMode === 'meter') {
    return `Every ${val} operating hour${val === 1 ? '' : 's'}`;
  }

  const singularUnit: Record<PmTimeUnit, string> = {
    minutes: 'minute',
    hours: 'hour',
    days: 'day',
    weeks: 'week',
    months: 'month',
    years: 'year',
  };
  const unit = singularUnit[normalized.frequencyUnit as PmTimeUnit];
  return `Every ${val} ${unit}${val === 1 ? '' : 's'}`;
}
