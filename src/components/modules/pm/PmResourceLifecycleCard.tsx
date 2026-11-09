'use client';

import type { PmResourceLifecycleBucket, PmResourceStage } from '@/lib/pm-resource-lifecycle';
import { AlertTriangle, PackageCheck, Wrench } from 'lucide-react';

const labels: Record<PmResourceStage, string> = {
  module_unavailable: 'Module unavailable',
  not_submitted: 'Not submitted',
  requested: 'Submitted — approval pending',
  supervisor_approved: 'Supervisor approved',
  store_approved: 'Storekeeper approved — not issued',
  stock_reserved: 'Reserved — not issued',
  picking: 'Being picked',
  partially_issued: 'Partially issued',
  issued: 'Required quantity issued',
  issued_unverified: 'Issue quantity unverified',
  returned: 'Returned / reconciled',
  rejected: 'Rejected',
  unverified: 'Status needs review',
};
type Props = {
  lifecycle: { materials: PmResourceLifecycleBucket; tools: PmResourceLifecycleBucket };
  inventoryOperational: boolean;
  toolsOperational: boolean;
};
/**
 * Read-only status evidence. Does not replace warehouse issue, tool handover,
 * calibrations, PTW, supervisor signoff or equipment isolation.
 */
export function PmResourceLifecycleCard({
  lifecycle, inventoryOperational, toolsOperational,
}: Props) {
  const buckets = [
    { kind: 'materials' as const, title: 'Materials', operational: inventoryOperational, Icon: PackageCheck },
    { kind: 'tools' as const, title: 'Tools', operational: toolsOperational, Icon: Wrench },
  ];
  if (!lifecycle.materials.total && !lifecycle.tools.total) return null;
  return (
    <section className="space-y-2 rounded-lg border p-3" data-testid="pm-resource-lifecycle">
      <div className="space-y-1">
        <h4 className="text-sm font-semibold">PM resource approval and issue evidence</h4>
        <p className="text-xs text-muted-foreground">
          A recommendation, submitted request, supervisor/store approval, reservation and physical
          issue are different steps. Recorded issue quantity does not verify delivery to the job site,
          tool calibration, safe isolation or authority to start work.
        </p>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {buckets.map(({ kind, title, operational, Icon }) => {
          const bucket = lifecycle[kind];
          return (
            <div key={kind} className="min-w-0 space-y-2 rounded-lg border p-2.5"
              data-testid={'pm-resource-' + kind}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h5 className="flex items-center gap-1.5 text-xs font-semibold">
                  <Icon className="h-4 w-4" /> {title}
                </h5>
                <span className="text-xs text-muted-foreground">
                  {bucket.issuedWithQuantity}/{bucket.total} quantity-verified issued
                </span>
              </div>
              {!operational && (
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  The operational {title.toLowerCase()} module is unavailable; no readiness
                  conclusion is possible.
                </p>
              )}
              <div className="flex flex-wrap gap-1.5 text-[11px]">
                <span className="rounded border px-2 py-1">{bucket.notSubmitted} not submitted</span>
                <span className="rounded border px-2 py-1">{bucket.awaitingApproval} awaiting approval</span>
                <span className="rounded border px-2 py-1">{bucket.approvedOrReserved} approved / reserved</span>
                <span className="rounded border px-2 py-1">{bucket.partialOrUnverified} partial / unverified</span>
                {bucket.rejectedOrReturned > 0 && (
                  <span className="rounded border border-amber-300 px-2 py-1">
                    {bucket.rejectedOrReturned} rejected / returned
                  </span>
                )}
              </div>
              {bucket.entries.length === 0 ? (
                <p className="text-xs text-muted-foreground">No mapped {title.toLowerCase()} on this job plan.</p>
              ) : (
                <div className="max-h-52 space-y-1.5 overflow-y-auto">
                  {bucket.entries.map((entry, index) => (
                    <div key={kind + '-' + entry.label + '-' + index} className="rounded bg-muted/30 p-2 text-xs">
                      <p className="font-medium break-words">{entry.label}</p>
                      <p className="text-muted-foreground">{labels[entry.stage]}</p>
                      <p className="text-muted-foreground">
                        Required: {entry.quantityRequired ?? 'not quantified'} · Issued:
                        {' '}{entry.quantityIssued ?? 'unverified'}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-300">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        This is planning evidence, not permission to execute. Storekeeper reconciliation,
        tool condition, crew capability, shutdown authorization and safety permits require separate verification.
      </p>
    </section>
  );
}
