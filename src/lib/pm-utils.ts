/**
 * PM Schedule compatibility utilities.
 *
 * New writes accept only the canonical Time/Day or Meter model. Persisted
 * legacy values are normalized explicitly so compatibility never expands the
 * set of frequency types that new API/UI callers are allowed to submit.
 */
import {
  PM_TIME_UNITS,
  calculateTimeDayNextDueDate,
  formatPmFrequencyLabel,
  isKnownPmFrequencyType,
  isPmTimeUnit,
  normalizePmFrequency as normalizePmFrequencyInput,
} from '@/lib/pm-frequency';

export const PM_FREQUENCY_TYPES = ['time_day', 'meter'] as const;
export const TIME_DAY_FREQUENCY_UNITS = PM_TIME_UNITS.map((unit) => unit.value);

export type PmFrequencyType = (typeof PM_FREQUENCY_TYPES)[number];

export function isPmFrequencyType(value: unknown): value is PmFrequencyType {
  return typeof value === 'string' && (PM_FREQUENCY_TYPES as readonly string[]).includes(value);
}

export function isKnownPmFrequency(value: unknown): boolean {
  return isKnownPmFrequencyType(value);
}

export function normalizePmFrequency(
  frequencyType: string,
  frequencyValue: number,
  frequencyUnit?: string | null,
): { type: 'time_day' | 'meter'; value: number; unit: string | null } | null {
  if (!isKnownPmFrequencyType(frequencyType)) return null;
  const normalized = normalizePmFrequencyInput({ frequencyType, frequencyValue, frequencyUnit });
  return {
    type: normalized.frequencyType,
    value: normalized.frequencyValue,
    unit: normalized.frequencyUnit || null,
  };
}

export function calculateNextDueDate(
  fromDate: Date,
  frequencyType: string,
  frequencyValue: number,
  frequencyUnit?: string | null,
): Date | null {
  if (!isKnownPmFrequencyType(frequencyType)) return null;
  const normalized = normalizePmFrequencyInput({ frequencyType, frequencyValue, frequencyUnit });
  if (normalized.frequencyType !== 'time_day' || !isPmTimeUnit(normalized.frequencyUnit)) return null;
  return calculateTimeDayNextDueDate(fromDate, normalized.frequencyValue, normalized.frequencyUnit);
}

export function isAutoCalculableFrequency(
  frequencyType: string,
  frequencyUnit?: string | null,
): boolean {
  if (!isKnownPmFrequencyType(frequencyType)) return false;
  const normalized = normalizePmFrequencyInput({ frequencyType, frequencyValue: 1, frequencyUnit });
  return normalized.frequencyType === 'time_day' && isPmTimeUnit(normalized.frequencyUnit);
}

export function formatFrequencyLabel(
  frequencyType: string,
  frequencyValue: number,
  frequencyUnit?: string | null,
  meterName?: string | null,
): string {
  if (!isKnownPmFrequencyType(frequencyType)) return `${frequencyType}/${frequencyValue}`;
  return formatPmFrequencyLabel({ frequencyType, frequencyValue, frequencyUnit, meterName });
}
