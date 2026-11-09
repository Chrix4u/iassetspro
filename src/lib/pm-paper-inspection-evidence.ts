/** Paper-origin inspection evidence must never overwrite the identity of the
 * authenticated user who typed a returned worksheet into the system.
 * Legacy/digital captures keep null paper evidence fields.
 */
export interface InspectionCaptureEvidence {
  captureSource: 'digital' | 'paper';
  fieldInspectedAt: Date | null;
  fieldInspectorName: string | null;
  paperReference: string | null;
}
const exactDateTime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;
export function parseInspectionCaptureEvidence(
  input: Record<string, unknown>,
  now = new Date(),
): InspectionCaptureEvidence {
  const source = input.captureSource === undefined || input.captureSource === null
    ? 'digital' : input.captureSource;
  if (source !== 'digital' && source !== 'paper') {
    throw new Error('Invalid inspection capture source');
  }
  const provided = [input.fieldInspectedAt, input.fieldInspectorName, input.paperReference]
    .some(value => value !== undefined && value !== null && value !== '');
  if (source === 'digital') {
    if (provided) throw new Error('Paper inspection fields require Paper worksheet mode');
    return {
      captureSource: 'digital', fieldInspectedAt: null,
      fieldInspectorName: null, paperReference: null,
    };
  }
  const fieldInspectorName = typeof input.fieldInspectorName === 'string'
    ? input.fieldInspectorName.trim() : '';
  const paperReference = typeof input.paperReference === 'string'
    ? input.paperReference.trim() : '';
  if (fieldInspectorName.length < 2 || fieldInspectorName.length > 160) {
    throw new Error('Enter the paper worksheet field inspector name (2–160 characters)');
  }
  if (paperReference.length < 2 || paperReference.length > 120) {
    throw new Error('Enter the paper worksheet reference (2–120 characters)');
  }
  const rawTime = input.fieldInspectedAt;
  if (typeof rawTime !== 'string' || !exactDateTime.test(rawTime)) {
    throw new Error('Enter a valid field inspection date and time with timezone');
  }
  const fieldInspectedAt = new Date(rawTime);
  // Date.parse can normalize impossible calendar dates such as February 30.
  // Reconstruct the source-local time from its explicit timezone offset.
  const zone = rawTime.match(/([+-])(\d{2}):(\d{2})$/);
  const offsetMinutes = zone
    ? (zone[1] === '+' ? 1 : -1) * (Number(zone[2]) * 60 + Number(zone[3]))
    : 0;
  const actualLocal = Number.isFinite(fieldInspectedAt.getTime())
    ? new Date(fieldInspectedAt.getTime() + offsetMinutes * 60_000).toISOString().slice(0, 19)
    : '';
  if (actualLocal !== rawTime.slice(0, 19)) {
    throw new Error('Field inspection date/time is not a real calendar date');
  }
  if (!Number.isFinite(fieldInspectedAt.getTime())
    || fieldInspectedAt.getTime() < Date.UTC(2000, 0, 1)
    || fieldInspectedAt.getTime() > now.getTime() + 5 * 60_000) {
    throw new Error('Field inspection time must be a real past date, not a future time');
  }
  return { captureSource: 'paper', fieldInspectedAt, fieldInspectorName, paperReference };
}

export function mayAdvanceInspectionDue(
  lastInspected: Date | null,
  inspectedOn: Date,
): boolean {
  // Back-entering older paper measurements must not overwrite a newer
  // verified inspection cycle's last-inspected date or next due.
  return lastInspected === null || inspectedOn.getTime() >= lastInspected.getTime();
}

/** Paper transcription must never shorten an already planned / verified
 * next-due date. Direct readings retain the existing recurrence rules.
 */
export function safeInspectionNextDue(
  computed: Date,
  existing: Date | null,
  source: 'digital' | 'paper',
): Date {
  if (source === 'paper' && existing && existing.getTime() > computed.getTime()) {
    return existing;
  }
  return computed;
}
