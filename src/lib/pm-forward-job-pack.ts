import type { PmResourceLifecycleBucket } from '@/lib/pm-resource-lifecycle';

/**
 * Presentation-only summary of the existing, authorized work-order PM readiness
 * endpoint. An approval, stock reservation, or picking record is NOT proof
 * that a required quantity was issued or the job is safe to start.
 */
export interface PmForwardJobPackData {
  readyForPlanning: boolean;
  blockingIssues: Array<{ code: string; label: string }>;
  warnings: Array<{ code: string; label: string }>;
  checklist: { taskCount: number; estimatedMinutes: number };
  resources: {
    unresolvedPartLabels: string[];
    unresolvedToolLabels: string[];
    lifecycle?: {
      materials: PmResourceLifecycleBucket;
      tools: PmResourceLifecycleBucket;
    };
  };
  modules: { repairs: boolean; inventory: boolean; tools: boolean };
}

export interface PmForwardResourceEvidence {
  total: number;
  issued: number;
  outstanding: number;
  verified: boolean;
  message: string;
}

function summarizeResource(
  bucket: PmResourceLifecycleBucket | undefined,
  operational: boolean,
  unresolvedCount: number,
  noun: string,
): PmForwardResourceEvidence {
  if (!operational || !bucket) {
    return {
      total: bucket?.total ?? 0, issued: 0, outstanding: bucket?.total ?? 0,
      verified: false, message: noun + ' evidence unavailable; no issue conclusion',
    };
  }

  // The lifecycle contains the canonical per-item quantity comparison. Never
  // substitute "approved", "reserved", "picking", or "issued_unverified".
  const total = bucket.total;
  const issued = Math.min(total, Math.max(0, bucket.issuedWithQuantity));
  const outstanding = total - issued;
  const verified = total > 0 && outstanding === 0 && unresolvedCount === 0;
  const message = total === 0
    ? 'No mapped ' + noun.toLowerCase() + '; verify the job requirements'
    : issued + '/' + total + ' mapped ' + noun.toLowerCase()
      + ' have sufficient recorded issued quantity'
      + (unresolvedCount > 0 ? '; ' + unresolvedCount + ' unmapped requirements' : '');
  return { total, issued, outstanding, verified, message };
}

export function summarizePmForwardJobPack(data: PmForwardJobPackData) {
  const materials = summarizeResource(
    data.resources.lifecycle?.materials,
    data.modules.repairs && data.modules.inventory,
    data.resources.unresolvedPartLabels.length,
    'Materials',
  );
  const tools = summarizeResource(
    data.resources.lifecycle?.tools,
    data.modules.repairs && data.modules.tools,
    data.resources.unresolvedToolLabels.length,
    'Tools',
  );

  return {
    planningAssignmentsComplete: data.readyForPlanning && data.blockingIssues.length === 0,
    materials,
    tools,
    // No combination of request/issue data can prove PTW, actual handover,
    // workforce attendance, equipment isolation, or shutdown authorization.
    executionAuthorized: false as const,
  };
}
