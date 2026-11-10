'use client';

import { useCallback, useState } from 'react';
import { AlertTriangle, ClipboardCheck, Loader2, RefreshCw } from 'lucide-react';
import { api } from '@/lib/api';
import {
  summarizePmForwardJobPack, type PmForwardJobPackData,
} from '@/lib/pm-forward-job-pack';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';

interface Props { workOrderId: string; workOrderNumber: string }

/**
 * Uses the existing WO-authorized endpoint only after the planner asks.
 * The plant-wide forecast never prefetches other users' WO resource records.
 */
export function PmForwardWorkOrderReadiness({ workOrderId, workOrderNumber }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState<PmForwardJobPackData | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    setData(null);
    try {
      const res = await api.get<PmForwardJobPackData>(
        '/api/work-orders/' + encodeURIComponent(workOrderId) + '/pm-planning-readiness',
      );
      if (!res.success || !res.data) {
        throw new Error(res.error || 'PM job-pack evidence could not be loaded');
      }
      setData(res.data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load job-pack readiness');
    } finally {
      setLoading(false);
    }
  }, [workOrderId]);

  const snapshot = data ? summarizePmForwardJobPack(data) : null;
  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) void load();
  };

  return <>
    <Button type="button" variant="outline" size="sm" className="mt-2 h-7 px-2 text-xs"
      onClick={() => onOpenChange(true)} aria-label={'Review PM job-pack for ' + workOrderNumber}>
      <ClipboardCheck className="mr-1 h-3.5 w-3.5" />Review job-pack
    </Button>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl" data-testid="pm-forward-job-pack">
        <DialogHeader>
          <DialogTitle>PM job-pack review · {workOrderNumber}</DialogTitle>
          <DialogDescription>
            Read-only, live work-order evidence. Planning accountability, material requests,
            physical issue and safe release are separate decisions.
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-end">
          <Button type="button" variant="outline" size="sm" disabled={loading}
            onClick={() => void load()}>
            {loading ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> :
              <RefreshCw className="mr-1 h-3.5 w-3.5" />}Refresh evidence
          </Button>
        </div>
        {loading && <p role="status" className="text-sm text-muted-foreground">
          Checking current work-order planning and resource records…
        </p>}
        {error && <p role="alert" className="rounded-md border border-destructive/50 p-3 text-sm text-destructive">
          {error}. This work-order record may require separate execution access.
        </p>}
        {data && snapshot && <>
          <div className="rounded-md border p-3">
            <div className="flex flex-wrap items-center gap-2">
              <strong className="text-sm">Planning assignments</strong>
              <Badge variant={snapshot.planningAssignmentsComplete ? 'outline' : 'destructive'}>
                {snapshot.planningAssignmentsComplete ? 'Accountabilities recorded' : 'Action required'}
              </Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {data.checklist.taskCount} task(s) · {data.checklist.estimatedMinutes} estimated minutes.
              A complete assignment does not authorize execution.
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {(['materials', 'tools'] as const).map((kind) => {
              const status = snapshot[kind];
              const bucket = data.resources.lifecycle?.[kind];
              return <section key={kind} className="min-w-0 rounded-md border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold capitalize">{kind}</h3>
                  <Badge variant="outline">
                    {status.verified ? 'Quantity evidence complete' : 'Review needed'}
                  </Badge>
                </div>
                <p className="mt-2 text-xs">{status.message}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {bucket ? [
                    bucket.notSubmitted + ' not submitted',
                    bucket.awaitingApproval + ' awaiting approval',
                    bucket.approvedOrReserved + ' approved/reserved',
                    bucket.partialOrUnverified + ' partial/unverified',
                    bucket.rejectedOrReturned + ' rejected/returned',
                  ].join(' · ') : 'No accessible lifecycle evidence'}
                </p>
                {bucket?.entries?.length ? <ul className="mt-2 space-y-1.5">
                  {bucket.entries.slice(0, 8).map((entry, index) =>
                    <li key={entry.label + index} className="rounded bg-muted/40 p-2 text-xs">
                      <strong className="break-words">{entry.label}</strong>
                      <p className="text-muted-foreground">
                        {entry.stage.replaceAll('_', ' ')}
                        {' · '}Required: {entry.quantityRequired ?? 'unknown'}
                        {' · '}Issued: {entry.quantityIssued ?? 'unverified'}
                      </p>
                    </li>)}
                  {bucket.entries.length > 8 && <li className="text-xs text-muted-foreground">
                    +{bucket.entries.length - 8} additional mapped items; open WO details for full evidence
                  </li>}
                </ul> : null}
              </section>;
            })}
          </div>
          {(data.blockingIssues.length > 0 || data.warnings.length > 0) && (
            <section className="rounded-md border border-amber-300/70 p-3">
              <h3 className="flex items-center gap-1.5 text-sm font-semibold">
                <AlertTriangle className="h-4 w-4 text-amber-600" />Outstanding planning observations
              </h3>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
                {[...data.blockingIssues, ...data.warnings].map((item, index) =>
                  <li key={item.code + index}>{item.label}</li>)}
              </ul>
            </section>
          )}
          <p role="note" className="text-xs text-amber-700 dark:text-amber-300">
            Recorded issued quantities do not verify technician handover, item condition,
            permits to work, lockout/isolation, shutdown approval or technician availability.
            Use the work-order approval and safety processes before dispatch.
          </p>
        </>}
      </DialogContent>
    </Dialog>
  </>;
}
