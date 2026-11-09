/**
 * Prevent a retried form submission from replaying a different inspection.
 * The request key identifies the write; all normalized form fields and the
 * logged-in inspector must still match the original.
 */
export interface InspectionSubmissionSnapshot {
  inspectionPointId: string;
  inspectorId: string;
  result: string;
  value: string | null;
  findings: string | null;
  recommendation: string | null;
  equipmentState?: string | null;
  captureSource?: 'digital' | 'paper';
  fieldInspectedAt?: Date | string | null;
  fieldInspectorName?: string | null;
  paperReference?: string | null;
}

const normalized = (value: string | null | undefined): string => value ?? '';
const normalizedInstant = (value: Date | string | null | undefined): string =>
  value === null || value === undefined ? '' : new Date(value).toISOString();

/** A completed or cancelled corrective WO must not appear as pending on retry. */
export function isPendingCorrectiveWorkOrder(order: { status: string } | null | undefined): boolean {
  return Boolean(order && order.status !== 'closed' && order.status !== 'cancelled');
}

export function isSameInspectionSubmission(
  original: InspectionSubmissionSnapshot,
  incoming: InspectionSubmissionSnapshot,
): boolean {
  return original.inspectionPointId === incoming.inspectionPointId
    && original.inspectorId === incoming.inspectorId
    && original.result === incoming.result
    && normalized(original.value) === normalized(incoming.value)
    && normalized(original.findings) === normalized(incoming.findings)
    && normalized(original.recommendation) === normalized(incoming.recommendation)
    && normalized(original.equipmentState ?? null) === normalized(incoming.equipmentState ?? null)
    && (original.captureSource || 'digital') === (incoming.captureSource || 'digital')
    && normalizedInstant(original.fieldInspectedAt) === normalizedInstant(incoming.fieldInspectedAt)
    && normalized(original.fieldInspectorName) === normalized(incoming.fieldInspectorName)
    && normalized(original.paperReference) === normalized(incoming.paperReference);
}
