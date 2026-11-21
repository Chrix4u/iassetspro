import { formatUiDate } from '@/lib/date-display';

/** Display the report's date-only calendar day without UTC/local timezone shifts.
 * Month, quarter and year period keys stay readable as grouped identifiers.
 */
export function formatProductionPeriodLabel(value: string): string {
  const date = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return value;
  return formatUiDate(date);
}
