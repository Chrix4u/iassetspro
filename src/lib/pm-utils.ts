/**
 * PM Schedule utility functions for calculating next due dates
 * and determining if meter-based/custom_hours schedules need readings.
 */

export const PM_FREQUENCY_TYPES = [
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

export function isPmFrequencyType(value: unknown): value is PmFrequencyType {
  return typeof value === 'string' && (PM_FREQUENCY_TYPES as readonly string[]).includes(value);
}

/**
 * Calculate the next due date from a given date based on frequency type and value.
 * Returns null for meter_based and custom_hours (these need external triggers).
 */
export function calculateNextDueDate(
  fromDate: Date,
  frequencyType: string,
  frequencyValue: number,
): Date | null {
  if (!isPmFrequencyType(frequencyType)) return null;

  // meter_based and custom_hours need meter/time readings — skip auto-calculation
  if (frequencyType === 'meter_based' || frequencyType === 'custom_hours') {
    return null;
  }

  const next = new Date(fromDate);
  const val = Math.max(1, frequencyValue); // at least 1

  switch (frequencyType) {
    case 'daily':
      next.setDate(next.getDate() + val);
      break;
    case 'weekly':
      next.setDate(next.getDate() + val * 7);
      break;
    case 'biweekly':
      next.setDate(next.getDate() + val * 14);
      break;
    case 'monthly':
      next.setMonth(next.getMonth() + val);
      break;
    case 'quarterly':
      next.setMonth(next.getMonth() + val * 3);
      break;
    case 'semiannual':
      next.setMonth(next.getMonth() + val * 6);
      break;
    case 'annual':
      next.setMonth(next.getMonth() + val * 12);
      break;
    case 'custom_days':
      next.setDate(next.getDate() + val);
      break;
    default:
      return null;
  }

  return next;
}

/**
 * Check if a frequency type can be auto-calculated (doesn't need meter readings).
 */
export function isAutoCalculableFrequency(frequencyType: string): boolean {
  return isPmFrequencyType(frequencyType) && frequencyType !== 'meter_based' && frequencyType !== 'custom_hours';
}

/**
 * Generate a human-readable frequency label.
 */
export function formatFrequencyLabel(frequencyType: string, frequencyValue: number): string {
  const val = frequencyValue;
  switch (frequencyType) {
    case 'daily':
      return `Every ${val} day${val > 1 ? 's' : ''}`;
    case 'weekly':
      return `Every ${val} week${val > 1 ? 's' : ''}`;
    case 'biweekly':
      return `Every ${val * 2} weeks`;
    case 'monthly':
      return `Every ${val} month${val > 1 ? 's' : ''}`;
    case 'quarterly':
      return `Every ${val * 3} months`;
    case 'semiannual':
      return `Every ${val * 6} months`;
    case 'annual':
      return `Every ${val} year${val > 1 ? 's' : ''}`;
    case 'custom_hours':
      return `Every ${val} hour${val > 1 ? 's' : ''}`;
    case 'custom_days':
      return `Every ${val} day${val > 1 ? 's' : ''}`;
    case 'meter_based':
      return `Every ${val} units`;
    default:
      return `${frequencyType}/${val}`;
  }
}
