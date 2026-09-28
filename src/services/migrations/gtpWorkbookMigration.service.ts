export type GtpLegacyPriority = 1 | 2 | 3 | 5 | number;

export type GtpAuditIssueSeverity = 'warning' | 'error';

export interface GtpAuditIssue {
  code: string;
  severity: GtpAuditIssueSeverity;
  message: string;
}

export interface GtpLegacyJobRow {
  rowNumber?: number;
  workOrderNo?: string | number | null;
  workOrderType?: string | null;
  workRequestNo?: string | number | null;
  reportedAt?: Date | string | number | null;
  description?: string | null;
  equipmentCode?: string | null;
  equipmentDescription?: string | null;
  trade?: string | null;
  workStartedAt?: Date | string | number | null;
  workStatus?: string | null;
  workCompletedAt?: Date | string | number | null;
  technicianReport?: string | null;
  plannedBy?: string | null;
  assignedTo?: string | null;
  requestedBy?: string | null;
  department?: string | null;
  priority?: GtpLegacyPriority | null;
}

export interface GtpMachineMasterRow {
  code: string;
  name: string;
  priority?: GtpLegacyPriority | null;
  order?: number | null;
}

export interface GtpAuditedJob {
  legacyRowNumber?: number;
  legacyWorkOrderNo: string;
  mappedType: string;
  mappedStatus: string | null;
  canonicalTrade: string | null;
  equipmentCode: string;
  equipmentName: string;
  mappedPriority: 'critical' | 'high' | 'medium' | null;
  importReady: boolean;
  issues: GtpAuditIssue[];
}

export interface GtpWorkbookAuditSummary {
  totalRows: number;
  importReadyRows: number;
  blockedRows: number;
  breakdownRows: number;
  missingStatusRows: number;
  missingStartRows: number;
  missingCompletionRows: number;
  unmatchedMachineRows: number;
  duplicateMachineCodes: string[];
  tradeAliasesNormalized: number;
  issueCounts: Record<string, number>;
}

const TRADE_ALIASES: Record<string, string> = {
  'carpentery': 'Carpentery',
  'carpenter': 'Carpentery',
  'carpentry': 'Carpentery',
  'machnist': 'Machnist',
  'machinist': 'Machnist',
  'pipe fitting': 'Pipe fitting',
  'pipe fitter': 'Pipe fitting',
  'electrical & instrument': 'Electrical & Instrument',
  'electrical and instrument': 'Electrical & Instrument',
  'welding & fabrication': 'Welding & Fabrication',
  'welding and fabrication': 'Welding & Fabrication',
  'refrigeration': 'Refrigeration',
  'mechanical': 'Mechanical',
  'masonry': 'Masonry',
  'painting': 'Painting',
  'plumbing': 'Plumbing',
  'tech drawing': 'Tech Drawing',
  'contractor': 'Contractor',
};

export function canonicalizeGtpTrade(value?: string | null): string | null {
  const raw = String(value || '').trim();
  if (!raw) return null;
  return TRADE_ALIASES[raw.toLowerCase()] || raw;
}

export function mapGtpPriority(value?: GtpLegacyPriority | null): 'critical' | 'high' | 'medium' | null {
  const n = Number(value);
  if (n === 1) return 'critical';
  if (n === 2) return 'high';
  if (n === 3) return 'medium';
  // The workbook uses 5 as VLOOKUP fallback when the machine code is not found.
  return null;
}

export function mapGtpWorkOrderType(value?: string | null): string {
  switch (String(value || '').trim().toLowerCase()) {
    case 'breakdown': return 'breakdown';
    case 'corrective': return 'corrective';
    case 'preventive': return 'preventive';
    case 'others':
    case 'other': return 'other';
    default: return 'other';
  }
}

export function mapGtpWorkStatus(value?: string | null): string | null {
  const normalized = String(value || '').trim().toLowerCase().replace(/[- ]+/g, '_');
  if (!normalized) return null;
  if (normalized === 'completed') return 'closed';
  if (normalized === 'in_progress' || normalized === 'inprogress') return 'in_progress';
  if (normalized === 'pending') return 'requested';
  return null;
}

function hasValue(value: unknown): boolean {
  return value !== null && value !== undefined && String(value).trim() !== '';
}

export function findDuplicateMachineCodes(machines: GtpMachineMasterRow[]): string[] {
  const counts = new Map<string, number>();
  for (const machine of machines) {
    const code = String(machine.code || '').trim();
    if (!code) continue;
    counts.set(code, (counts.get(code) || 0) + 1);
  }
  return [...counts.entries()].filter(([, count]) => count > 1).map(([code]) => code).sort();
}

export function auditGtpWorkbookRows(
  jobs: GtpLegacyJobRow[],
  machines: GtpMachineMasterRow[],
): { rows: GtpAuditedJob[]; summary: GtpWorkbookAuditSummary } {
  const duplicateMachineCodes = findDuplicateMachineCodes(machines);
  const duplicateSet = new Set(duplicateMachineCodes);
  const machineMap = new Map<string, GtpMachineMasterRow>();
  for (const machine of machines) {
    const code = String(machine.code || '').trim();
    if (code && !machineMap.has(code)) machineMap.set(code, machine);
  }

  let tradeAliasesNormalized = 0;
  const issueCounts: Record<string, number> = {};

  const rows = jobs.map((job): GtpAuditedJob => {
    const issues: GtpAuditIssue[] = [];
    const add = (code: string, severity: GtpAuditIssueSeverity, message: string) => {
      issues.push({ code, severity, message });
      issueCounts[code] = (issueCounts[code] || 0) + 1;
    };

    const legacyWorkOrderNo = String(job.workOrderNo ?? '').trim();
    const equipmentCode = String(job.equipmentCode ?? '').trim();
    const machine = machineMap.get(equipmentCode);
    const equipmentName = String(job.equipmentDescription || machine?.name || '').trim();
    const rawTrade = String(job.trade || '').trim();
    const canonicalTrade = canonicalizeGtpTrade(rawTrade);
    if (rawTrade && canonicalTrade && rawTrade !== canonicalTrade) tradeAliasesNormalized += 1;

    const prioritySource = machine?.priority ?? job.priority;
    const mappedPriority = mapGtpPriority(prioritySource);
    const mappedStatus = mapGtpWorkStatus(job.workStatus);
    const mappedType = mapGtpWorkOrderType(job.workOrderType);

    if (!legacyWorkOrderNo) add('missing_work_order_no', 'error', 'Legacy Work Order No is missing.');
    if (!equipmentCode) add('missing_machine_code', 'error', 'Equipment code is missing.');
    else if (!machine) add('unmatched_machine_code', 'error', `Equipment code ${equipmentCode} is not in the machine master.`);
    else if (duplicateSet.has(equipmentCode)) add('duplicate_machine_code', 'error', `Equipment code ${equipmentCode} occurs more than once in the machine master and needs reconciliation.`);

    if (!mappedPriority) {
      add(
        Number(prioritySource) === 5 ? 'unmapped_priority_fallback' : 'invalid_priority',
        'warning',
        Number(prioritySource) === 5
          ? 'Priority 5 is the legacy VLOOKUP fallback and must not be imported as a normal priority.'
          : 'Legacy priority could not be mapped.',
      );
    }
    if (!mappedStatus) add('missing_or_unknown_status', 'warning', 'Work status is blank or cannot be mapped safely.');
    if (!hasValue(job.reportedAt)) add('missing_reported_time', 'error', 'Reported date/time is required for historical timeline calculations.');
    if (mappedType === 'breakdown' && !hasValue(job.workStartedAt)) add('missing_breakdown_start', 'warning', 'Breakdown has no work-start timestamp; response time cannot be reconstructed.');
    if (mappedType === 'breakdown' && !hasValue(job.workCompletedAt)) add('missing_breakdown_completion', 'warning', 'Breakdown has no completion timestamp; restoration time cannot be reconstructed.');
    if (!canonicalTrade) add('missing_trade', 'warning', 'Trade is missing.');

    return {
      legacyRowNumber: job.rowNumber,
      legacyWorkOrderNo,
      mappedType,
      mappedStatus,
      canonicalTrade,
      equipmentCode,
      equipmentName,
      mappedPriority,
      importReady: !issues.some((issue) => issue.severity === 'error'),
      issues,
    };
  });

  return {
    rows,
    summary: {
      totalRows: rows.length,
      importReadyRows: rows.filter((row) => row.importReady).length,
      blockedRows: rows.filter((row) => !row.importReady).length,
      breakdownRows: rows.filter((row) => row.mappedType === 'breakdown').length,
      missingStatusRows: rows.filter((row) => row.issues.some((i) => i.code === 'missing_or_unknown_status')).length,
      missingStartRows: rows.filter((row) => row.issues.some((i) => i.code === 'missing_breakdown_start')).length,
      missingCompletionRows: rows.filter((row) => row.issues.some((i) => i.code === 'missing_breakdown_completion')).length,
      unmatchedMachineRows: rows.filter((row) => row.issues.some((i) => i.code === 'unmatched_machine_code')).length,
      duplicateMachineCodes,
      tradeAliasesNormalized,
      issueCounts,
    },
  };
}