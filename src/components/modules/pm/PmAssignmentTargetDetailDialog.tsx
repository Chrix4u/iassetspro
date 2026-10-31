'use client';

import React from 'react';
import type { PmAssignmentTargetGroup, PmAssignmentTargetListRecord } from '@/lib/pm-assignment-target-list';
import { pmAssignmentFrequencyType } from '@/lib/pm-assignment-target-list';
import { ResponsiveDialog } from '@/components/shared/ResponsiveDialog';
import { Badge } from '@/components/ui/badge';

const pmLabel: Record<string, string> = { tbm: 'TBM · Time Based', ubm: 'UBM · Usage Based', cbm: 'CBM · Condition Based', fbm: 'FBM · Failure Based' };
const frequencyLabel = (row: PmAssignmentTargetListRecord) => ({ time_day: 'Time / Day', meter: 'Meter Based', event: 'Event / Condition' }[pmAssignmentFrequencyType(row)]);
const dateTime = (value: string | Date | null) => value ? new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—';

export function PmAssignmentTargetDetailDialog({ open, onOpenChange, group }: { open: boolean; onOpenChange: (open: boolean) => void; group: PmAssignmentTargetGroup | null }) {
  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange} size="extra-wide" desktopMaxWidth="sm:max-w-[94vw] 2xl:max-w-[82rem]" title={group ? `PM Schedule · ${group.targetName}` : 'PM Schedule'} description={group ? `${group.asset.name}${group.asset.assetTag ? ` [${group.asset.assetTag}]` : ''} · ${group.taskCount} task${group.taskCount === 1 ? '' : 's'}` : undefined}>
      {!group ? null : <div className="space-y-3 py-1">
        {group.assignments.map((row) => (
          <div key={row.id} className="rounded-lg border bg-card p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0"><p className="font-mono text-[11px] text-muted-foreground">Task #{row.pmTask.taskNumber}</p><p className="font-semibold">{row.pmTask.description}</p></div>
              <div className="flex flex-wrap gap-1"><Badge variant="outline">{pmLabel[row.pmType || ''] || String(row.pmType || '—').toUpperCase()}</Badge><Badge variant="secondary">{String(row.activityMode || 'inspection').replace(/_/g, ' ')}</Badge></div>
            </div>
            <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-4">
              <Detail label="PM Type" value={pmLabel[row.pmType || ''] || row.pmType || '—'} />
              <Detail label="Activity Mode" value={String(row.activityMode || '—').replace(/_/g, ' ')} />
              <Detail label="Inspection Type" value={String(row.equipmentState || '—').replace(/_/g, ' ')} />
              <Detail label="Frequency Type" value={frequencyLabel(row)} />
              <Detail label="Interval" value={row.pmType === 'ubm' ? `${row.frequencyInterval ?? '—'} ${row.assetMeter?.unit || row.frequencyUnit || ''}` : row.pmType === 'tbm' ? `${row.frequencyInterval ?? '—'} ${row.frequencyUnit || ''}` : 'Event driven'} />
              <Detail label="Next Due" value={row.pmType === 'ubm' ? (row.nextDueReading == null ? 'Meter driven' : `${row.nextDueReading} ${row.assetMeter?.unit || row.frequencyUnit || ''}`) : dateTime(row.nextDueDate)} />
              <Detail label="Estimated Minutes" value={`${row.estimatedMinutes ?? 0} min`} />
              <Detail label="Lead Days" value={String(row.leadDays ?? 0)} />
              {row.pmType === 'ubm' && <Detail label="Meter" value={row.assetMeter ? `${row.assetMeter.name} · ${row.assetMeter.currentValue} ${row.assetMeter.unit}` : '—'} />}
              {row.pmType === 'cbm' && <>
                <Detail label="Condition Source" value={[row.conditionSourceType, row.conditionMetric].filter(Boolean).join(' · ') || '—'} />
                <Detail label="Operator" value={row.conditionOperator || '—'} />
                <Detail label="Threshold" value={row.conditionOperator === 'outside_range' ? `${row.conditionThreshold ?? '—'} – ${row.conditionThresholdMax ?? '—'} ${row.conditionUnit || ''}` : `${row.conditionThreshold ?? '—'} ${row.conditionUnit || ''}`} />
                <Detail label="Evaluation Cadence" value={row.evaluationCadenceMinutes ? `${row.evaluationCadenceMinutes} min` : '—'} />
              </>}
            </div>
          </div>
        ))}
      </div>}
    </ResponsiveDialog>
  );
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="min-w-0 rounded-md bg-muted/35 px-2.5 py-2"><p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-0.5 break-words font-medium capitalize">{value}</p></div>;
}
