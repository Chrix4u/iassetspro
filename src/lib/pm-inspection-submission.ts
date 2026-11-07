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
}

const normalized = (value: string | null): string => value ?? '';

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
    && normalized(original.recommendation) === normalized(incoming.recommendation);
}
