/** Early/on-demand inspections are evidence, not completion of the PM due cycle. */
export type InspectionPurpose = 'routine' | 'early_check';

export function inspectionPurpose(value: unknown): InspectionPurpose {
  if (value === undefined || value === null) return 'routine'; // legacy clients
  if (value !== 'routine' && value !== 'early_check') throw new Error('Invalid inspection purpose');
  return value;
}

export function plannedFieldDate(value: unknown, now = new Date()): string {
  const input = value === undefined || value === null ? now.toISOString().slice(0, 10) : value;
  if (typeof input !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    throw new Error('Choose a valid planned field inspection date');
  }
  const timestamp = Date.parse(input + 'T00:00:00.000Z');
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== input
    || Math.abs(timestamp - now.getTime()) > 366 * 86400_000) {
    throw new Error('Planned inspection date must be within one year of today');
  }
  return input;
}

export function pmAssignmentDueLabel(item: {
  basis: string | null; nextDueDate: string | Date | null;
  nextDueReading: number | null; frequencyUnit?: string | null;
}): string {
  if (item.basis === 'meter') {
    return item.nextDueReading == null ? 'Meter due not configured'
      : 'Meter ≥ ' + item.nextDueReading.toLocaleString('en-GH')
        + (item.frequencyUnit ? ' ' + item.frequencyUnit : '');
  }
  if (!item.nextDueDate) return 'Date not configured';
  const date = new Date(item.nextDueDate);
  return Number.isFinite(date.getTime())
    ? date.toISOString().slice(0, 10) : 'Date not configured';
}

/** Do not advance checkpoint due dates for an early check or an unavailable measurement. */
export function inspectionMayAdvanceDue(purpose: InspectionPurpose, outcome: string): boolean {
  return purpose === 'routine' && outcome !== 'not_measured';
}
