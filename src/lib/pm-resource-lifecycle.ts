/**
 * Actual Repairs request lifecycle evidence for an enterprise PM job pack.
 *
 * A recommendation, submitted request, approval, reservation and issue are
 * different states. Never infer physical stock, tool condition, calibration,
 * technician possession or permit-to-work from a status label.
 */
export type PmResourceKind = 'material' | 'tool';
export type PmResourceStage =
  | 'module_unavailable' | 'not_submitted' | 'requested' | 'supervisor_approved'
  | 'store_approved' | 'stock_reserved' | 'picking' | 'partially_issued'
  | 'issued' | 'issued_unverified' | 'returned' | 'rejected' | 'unverified';
export interface PmMappedResource {
  id?: string | null;
  label: string;
  aliases?: string[];
  quantity?: number | null;
}
export interface PmResourceRequestEvidence {
  id?: string | null;
  label?: string | null;
  status?: string | null;
  source?: string | null;
  quantityIssued?: number | null;
  stockReserved?: boolean | null;
}
export interface PmResourceStageRow {
  label: string;
  quantityRequired: number | null;
  quantityIssued: number | null;
  stage: PmResourceStage;
  recordedStatus: string | null;
  evidence: string;
}
export interface PmResourceLifecycleBucket {
  total: number;
  notSubmitted: number;
  awaitingApproval: number;
  approvedOrReserved: number;
  issuedWithQuantity: number;
  partialOrUnverified: number;
  rejectedOrReturned: number;
  entries: PmResourceStageRow[];
}
const rank: Record<PmResourceStage, number> = {
  module_unavailable: 0, not_submitted: 1, rejected: 2, returned: 3,
  unverified: 4, requested: 5, supervisor_approved: 6,
  store_approved: 7, stock_reserved: 8, picking: 9, issued_unverified: 10,
  partially_issued: 11, issued: 12,
};
function normalize(value: string | null | undefined): string {
  return (value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}
function positiveNumber(value: number | null | undefined): number | null {
  return value != null && Number.isFinite(value) && value > 0 ? value : null;
}
function matches(resource: PmMappedResource, request: PmResourceRequestEvidence): boolean {
  // Authoritative catalog IDs take precedence over similar item names.
  if (resource.id && request.id) return resource.id === request.id;
  const name = normalize(request.label);
  return Boolean(name && [resource.label, ...(resource.aliases || [])]
    .some((label) => normalize(label) === name));
}
function stageForRequest(
  kind: PmResourceKind,
  resource: PmMappedResource,
  request: PmResourceRequestEvidence,
): PmResourceStage {
  const status = normalize(request.status);
  if (status === 'rejected') return 'rejected';
  if (status === 'returned' || status === 'fully_returned' ||
    status === 'partially_returned' || status === 'closed') return 'returned';
  if (normalize(request.source) === 'planner_suggested' && status === 'pending')
    return 'not_submitted';
  if (status === 'pending' || status === 'requested') return 'requested';
  if (status === 'supervisor_approved') return 'supervisor_approved';
  if (status === 'storekeeper_approved' || status === 'store_approved')
    return kind === 'material' && request.stockReserved === true
      ? 'stock_reserved' : 'store_approved';
  if (status === 'picking') return 'picking';
  if (status === 'issued') {
    const needed = positiveNumber(resource.quantity);
    const issued = positiveNumber(request.quantityIssued);
    if (needed === null || issued === null) return 'issued_unverified';
    return issued >= needed ? 'issued' : 'partially_issued';
  }
  return 'unverified';
}
function description(stage: PmResourceStage): string {
  const labels: Record<PmResourceStage, string> = {
    module_unavailable: 'Operational module unavailable; no readiness conclusion',
    not_submitted: 'Recommendation has not entered the Repairs approval workflow',
    requested: 'Request submitted; approval is still outstanding',
    supervisor_approved: 'Supervisor approved; storekeeper approval is outstanding',
    store_approved: 'Storekeeper approved; issue or physical availability is not verified',
    stock_reserved: 'Stock reserved in the Repairs record; material not yet issued',
    picking: 'Warehouse picking recorded; issue not yet confirmed',
    partially_issued: 'Recorded issued quantity is less than the job-plan requirement',
    issued: 'Full required quantity recorded as issued; site handover not verified',
    issued_unverified: 'Issue status recorded but required or issued quantity is unverified',
    returned: 'Previously issued resource was returned or reconciled; not current readiness',
    rejected: 'Request rejected; fresh authorization or resubmission required',
    unverified: 'Unrecognized Repairs request status; review the record manually',
  };
  return labels[stage];
}
export function summarizePmResourceLifecycle(
  kind: PmResourceKind,
  resources: readonly PmMappedResource[],
  requests: readonly PmResourceRequestEvidence[],
  moduleOperational: boolean,
): PmResourceLifecycleBucket {
  const entries: PmResourceStageRow[] = resources.map((resource) => {
    const candidates = requests.filter((request) => matches(resource, request))
      .map((request) => ({ request, stage: stageForRequest(kind, resource, request) }))
      .sort((a, b) => rank[b.stage] - rank[a.stage]);
    const top = candidates[0];
    const stage = !moduleOperational ? 'module_unavailable' as const :
      top?.stage || 'not_submitted';
    const request = top?.request;
    return {
      label: resource.label,
      quantityRequired: positiveNumber(resource.quantity),
      quantityIssued: positiveNumber(request?.quantityIssued),
      stage,
      recordedStatus: request?.status || null,
      evidence: description(stage),
    };
  });
  return {
    total: entries.length,
    notSubmitted: entries.filter((row) => row.stage === 'not_submitted').length,
    awaitingApproval: entries.filter((row) => row.stage === 'requested' ||
      row.stage === 'supervisor_approved').length,
    approvedOrReserved: entries.filter((row) => row.stage === 'store_approved' ||
      row.stage === 'stock_reserved' || row.stage === 'picking').length,
    issuedWithQuantity: entries.filter((row) => row.stage === 'issued').length,
    partialOrUnverified: entries.filter((row) => row.stage === 'partially_issued' ||
      row.stage === 'issued_unverified' || row.stage === 'unverified' ||
      row.stage === 'module_unavailable').length,
    rejectedOrReturned: entries.filter((row) => row.stage === 'rejected' ||
      row.stage === 'returned').length,
    entries,
  };
}
