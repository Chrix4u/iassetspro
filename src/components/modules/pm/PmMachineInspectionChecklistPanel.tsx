'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ClipboardCheck, Download, Eye, Gauge, Loader2, Printer, RefreshCw, Save } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { parseInspectionLimits } from '@/lib/pm-inspection';
import {
  machineChecklistOutOfRange,
  validateMachineChecklistEntry,
  type MachineChecklistDraft,
  type MachineChecklistGroup,
  type MachineChecklistPoint,
  type MachineChecklistTask,
  type MachineInspectionState,
} from '@/lib/pm-machine-checklist';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PmMachineInspectionPrint } from './PmMachineInspectionPrint';

interface MachineChecklistResponse {
  machine: { id: string; name: string; assetTag: string; plantId: string };
  equipmentState: MachineInspectionState;
  generatedAt: string;
  totalAssignments: number;
  totalConfiguredPoints: number;
  unconfiguredTasks: number;
  groups: MachineChecklistGroup[];
  generalTasks: MachineChecklistTask[];
}

interface EntryState extends MachineChecklistDraft {
  saving?: boolean;
  saved?: boolean;
  error?: string;
  workOrder?: string | null;
  recordedOutcome?: string;
}
const EMPTY_DRAFT: MachineChecklistDraft = {
  value: '', outcome: 'pass', findings: '', recommendation: '', requestKey: '',
};
function dateTime(value: string | Date | null): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : '—';
}
function csvCell(input: unknown): string {
  const raw = String(input ?? '');
  // Plant metadata and inspection remarks are user-controlled. Do not let a
  // CSV spreadsheet interpret text as formulas when exporting this checklist.
  const safe = '=+@-'.includes(raw.trimStart().charAt(0)) ? `'${raw}` : raw;
  return `"${safe.replace(/"/g, '""')}"`;
}

/**
 * Paper-style, on-demand machine checklist with direct value entry.
 * Every row saves through the existing idempotent inspection-record API.
 * This deliberately does NOT auto-complete PM tasks or close corrective WOs.
 */
export function PmMachineInspectionChecklistPanel({
  assetId,
  equipmentState,
  canRecord,
  canPlan,
  onConfigure,
  onClose,
  onRecorded,
  reloadKey,
}: {
  assetId: string;
  equipmentState: MachineInspectionState;
  canRecord: boolean;
  canPlan: boolean;
  onConfigure: (task: MachineChecklistTask) => void;
  onClose: () => void;
  onRecorded: () => void;
  reloadKey: number;
}) {
  const [data, setData] = useState<MachineChecklistResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [entries, setEntries] = useState<Record<string, EntryState>>({});
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const [saveProgress, setSaveProgress] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ assetId, equipmentState });
      const result = await api.get<MachineChecklistResponse>(`/api/pm-inspections/checklist?${params}`);
      if (!result.success || !result.data) throw new Error(result.error || 'Could not generate machine checklist');
      setData(result.data);
    } catch (caught) {
      setData(null);
      setError(caught instanceof Error ? caught.message : 'Could not generate machine checklist');
    } finally {
      setLoading(false);
    }
  }, [assetId, equipmentState]);

  useEffect(() => { void load(); }, [load, reloadKey, reload]);
  useEffect(() => {
    // A previous machine's unsaved readings must NEVER be silently submitted
    // against a newly selected machine or another inspection state.
    setEntries({});
    setSaveProgress('');
  }, [assetId, equipmentState]);

  const points = useMemo(() => data?.groups.flatMap((group) => group.points) || [], [data]);
  const getDraft = (id: string): EntryState => entries[id] || EMPTY_DRAFT;
  const edit = (id: string, patch: Partial<EntryState>) => {
    setEntries((current) => ({
      ...current,
      [id]: { ...EMPTY_DRAFT, ...current[id], ...patch, requestKey: '', saved: false, error: '', workOrder: null },
    }));
  };
  const hasInput = (point: MachineChecklistPoint, entry: EntryState) => (
    point.inspectionType === 'visual'
      ? Boolean(entry.findings.trim())
      : Boolean(entry.value.trim() || entry.findings.trim() || entry.recommendation.trim() || entry.outcome !== 'pass')
  );

  const save = async (selected: MachineChecklistPoint[]) => {
    if (busy || !canRecord || selected.length === 0) return;
    const snapshot = selected.map((point) => ({ point, entry: { ...getDraft(point.id) } }));
    const invalid = snapshot.find(({ point, entry }) => validateMachineChecklistEntry(point, entry));
    if (invalid) {
      const reason = validateMachineChecklistEntry(invalid.point, invalid.entry) || 'Incomplete record';
      setEntries((current) => ({
        ...current, [invalid.point.id]: { ...EMPTY_DRAFT, ...current[invalid.point.id], error: reason },
      }));
      toast.error(`${invalid.point.name}: ${reason}`);
      return;
    }

    setBusy(true);
    let succeeded = 0;
    let failed = 0;
    const failures: string[] = [];
    try {
      // Sequential writes preserve a clear per-row audit trail; completed rows
      // stay completed if a later request fails. Keys persist for safe retries.
      for (const { point, entry } of snapshot) {
        const requestKey = entry.requestKey || crypto.randomUUID();
        setSaveProgress(`Recording ${succeeded + failed + 1} / ${snapshot.length}`);
        setEntries((current) => ({
          ...current,
          [point.id]: { ...EMPTY_DRAFT, ...current[point.id], requestKey, saving: true, error: '' },
        }));
        try {
          const result = await api.post<{
            record: { id: string; result: string };
            workOrder: { woNumber: string; status: string } | null;
            duplicate?: boolean;
          }>(`/api/pm-inspections/${encodeURIComponent(point.id)}/records`, {
            outcome: entry.outcome,
            value: point.inspectionType === 'measurement' ? entry.value : '',
            findings: entry.findings.trim(),
            recommendation: entry.recommendation.trim(),
            requestKey,
            equipmentState,
          });
          if (!result.success || !result.data) throw new Error(result.error || 'Inspection could not be saved');
          succeeded += 1;
          setEntries((current) => ({
            ...current,
            [point.id]: {
              ...EMPTY_DRAFT, ...current[point.id], requestKey,
              saving: false, saved: true, error: '',
              workOrder: result.data?.workOrder?.woNumber || null,
              recordedOutcome: result.data?.record.result,
            },
          }));
        } catch (caught) {
          failed += 1;
          const message = caught instanceof Error ? caught.message : 'Submission failed';
          failures.push(`${point.name}: ${message}`);
          setEntries((current) => ({
            ...current,
            [point.id]: { ...EMPTY_DRAFT, ...current[point.id], requestKey, saving: false, error: message },
          }));
        }
      }
      if (succeeded) {
        toast.success(`${succeeded} inspection reading${succeeded === 1 ? '' : 's'} saved. Abnormal readings are sent to corrective WO planning.`);
        // Reload the authoritative latest readings and outstanding WO numbers.
        setReload((value) => value + 1);
        onRecorded();
      }
      if (failed) toast.error(`${failed} item${failed === 1 ? '' : 's'} not saved. Fix and retry; already saved rows will not be repeated.`);
      setSaveProgress(failures.length ? failures[0] : `${succeeded} entries saved`);
    } finally {
      setBusy(false);
    }
  };

  const ready = points.filter((point) => {
    const draft = getDraft(point.id);
    return !draft.saved && hasInput(point, draft);
  });
  const exportCsv = () => {
    if (!data) return;
    const rows: unknown[][] = [
      ['Machine', data.machine.name, 'Asset code', data.machine.assetTag, 'Inspection state', data.equipmentState, 'Generated', data.generatedAt],
      ['Part code', 'Part description', 'PM tasks', 'Inspection / parameter', 'Method', 'Normal min', 'Normal max', 'Unit', 'Latest recorded value', 'Latest result', 'Latest remark', 'Latest time', 'Outstanding corrective WO'],
    ];
    for (const group of data.groups) {
      const tasks = group.tasks.map((item) => `#${item.pmTask.taskNumber} ${item.pmTask.description}`).join('; ');
      if (!group.points.length) rows.push([group.component.componentCode, group.component.name, tasks, 'UNCONFIGURED']);
      for (const point of group.points) {
        const limits = parseInspectionLimits(point.normalRange);
        rows.push([
          group.component.componentCode, group.component.name, tasks, point.name,
          point.inspectionType, limits.min ?? '', limits.max ?? '', limits.unit || '',
          point.latestRecord?.value || '', point.latestRecord?.result || '',
          point.latestRecord?.findings || '', point.latestRecord ? dateTime(point.latestRecord.inspectedAt) : '',
          point.openCorrectiveWorkOrder?.woNumber || '',
        ]);
      }
    }
    for (const task of data.generalTasks) rows.push(['UNASSIGNED', 'Whole machine', `#${task.pmTask.taskNumber} ${task.pmTask.description}`, 'Assign a part first']);
    const csv = '\uFEFF' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
    const blobUrl = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = `inspection-${data.machine.assetTag}-${data.equipmentState}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
  };

  return (
    <section aria-label="Machine running or standstill inspection checklist" data-testid="pm-machine-checklist" className="min-w-0 space-y-3 rounded-xl border p-2.5 sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <h3 className="break-words text-base font-bold">Machine Inspection Checklist — {equipmentState === 'running' ? 'Running' : 'Standstill'}</h3>
          {data && <>
            <p className="break-words text-sm font-semibold">{data.machine.name}</p>
            <p className="break-all text-xs text-muted-foreground">{data.machine.assetTag} · Generated {dateTime(data.generatedAt)}</p>
          </>}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Button size="sm" variant="outline" onClick={() => setReload((v) => v + 1)} disabled={busy || loading}><RefreshCw className="mr-1 h-3.5 w-3.5"/>Refresh</Button>
          <Button size="sm" variant="outline" onClick={exportCsv} disabled={!data || busy}><Download className="mr-1 h-3.5 w-3.5"/>Export CSV</Button>
          <Button type="button" size="sm" variant="outline" onClick={() => window.print()} disabled={!data || busy || loading} aria-label="Print saved machine inspection checklist"><Printer className="mr-1 h-3.5 w-3.5"/>Print / Save PDF</Button>
          <Button size="sm" variant="outline" onClick={onClose} disabled={busy}>Close List</Button>
        </div>
      </div>
      {loading && <p className="flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin"/>Generating the machine's assigned inspection checklist…</p>}
      {error && <p role="alert" className="rounded-md border border-destructive/30 p-3 text-sm text-destructive">{error}</p>}
      {data && !loading && <>
        <div className="flex flex-wrap gap-1.5 text-xs">
          <Badge variant="outline">{data.totalAssignments} assigned tasks</Badge>
          <Badge variant="outline">{data.groups.length} registered parts</Badge>
          <Badge variant="outline">{data.totalConfiguredPoints} configured checks</Badge>
          {data.unconfiguredTasks > 0 && <Badge variant="secondary">{data.unconfiguredTasks} tasks need part/check configuration</Badge>}
        </div>
        <p className="text-xs text-muted-foreground">
          Record measured temperature, vibration, pressure or sound in their configured units; for sight and qualitative sound checks, describe what you observed.
          The server validates limits and drafts corrective work orders for abnormalities. Saving readings does not close PM work orders.
        </p>
        {!data.totalAssignments && <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          No active {equipmentState} inspection tasks are assigned to this machine. Configure them in PM Planning before capturing a checklist.
        </p>}
        {data.generalTasks.length > 0 && (
          <div className="rounded-lg border border-amber-200 p-3 dark:border-amber-900">
            <p className="text-sm font-semibold">General machine checks — part assignment required</p>
            <p className="mb-2 text-xs text-muted-foreground">These PM tasks were assigned to the whole machine. Select the exact part or instrument in PM Planning before entering check values.</p>
            {data.generalTasks.map((task) => <p key={task.id} className="break-words py-1 text-xs">Task #{task.pmTask.taskNumber}: {task.pmTask.description}</p>)}
          </div>
        )}
        {data.groups.map((group) => (
          <div key={group.component.id} className="min-w-0 space-y-2 rounded-lg border" data-testid="pm-machine-checklist-part">
            <div className="rounded-t-lg bg-muted/40 p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <h4 className="break-words text-sm font-bold">{group.component.name}</h4>
                  <p className="break-all text-xs text-muted-foreground">{group.component.componentCode} · {group.component.componentType}</p>
                </div>
                <Badge variant="outline">{group.points.length} inspection checks</Badge>
              </div>
              {group.tasks.map((task) => <p key={task.id} className="mt-1 break-words text-xs text-muted-foreground">
                <span className="font-semibold">Task #{task.pmTask.taskNumber}:</span> {task.pmTask.description}
              </p>)}
            </div>
            {group.points.length === 0 ? (
              <div className="flex flex-wrap items-center justify-between gap-2 p-3">
                <p className="text-xs text-amber-700 dark:text-amber-300">No sight or instrument point configured on this part. Do not enter or infer readings.</p>
                {canPlan && <Button size="sm" variant="outline" onClick={() => onConfigure(group.tasks[0])}>Configure Check</Button>}
              </div>
            ) : (
              <div className="min-w-0 space-y-2 p-2 sm:p-3">
                {group.points.map((point) => {
                  const limits = parseInspectionLimits(point.normalRange);
                  const entry = getDraft(point.id);
                  const outOfRange = machineChecklistOutOfRange(point, entry.value);
                  const supported = point.inspectionType === 'measurement' || point.inspectionType === 'visual';
                  return (
                    <div key={point.id} className="min-w-0 space-y-2 rounded-lg border p-2.5 sm:p-3" data-testid="pm-machine-checklist-row">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            {point.inspectionType === 'measurement' ? <Gauge className="h-4 w-4 shrink-0 text-emerald-600"/> : <Eye className="h-4 w-4 shrink-0 text-emerald-600"/>}
                            <p className="break-words text-sm font-semibold">{point.name}</p>
                          </div>
                          {point.description && <p className="break-words text-xs text-muted-foreground">{point.description}</p>}
                          <p className="text-xs text-muted-foreground">
                            {point.inspectionType === 'measurement'
                              ? `Instrument · ${point.parameterKey || 'Unconfigured parameter'} · Accepted ${limits.min ?? '—'} to ${limits.max ?? '—'} ${limits.unit || ''}`
                              : point.inspectionType === 'visual' ? 'Sight / qualitative observation' : `Legacy ${point.inspectionType}: needs configuration`}
                          </p>
                          {point.inspectionType === 'measurement' && limits.min === null && limits.max === null && (
                            <p className="text-xs text-amber-700 dark:text-amber-300">
                              No numeric acceptance limits configured. Automatic out-of-range detection is unavailable;
                              the technician must assess the reading and the planner should set valid limits.
                            </p>
                          )}
                        </div>
                        <Badge variant={point.dueState === 'overdue' ? 'destructive' : 'outline'}>{point.dueState.replace('_', ' ')}</Badge>
                      </div>
                      {supported && canRecord && <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_10rem] sm:items-start">
                        <div className="min-w-0 space-y-1">
                          {point.inspectionType === 'measurement' ? <>
                            <Label className="text-xs">Actual reading ({limits.unit || 'unit'})</Label>
                            <Input inputMode="decimal" type="number" step="any" aria-label={`Actual reading: ${point.name}`}
                              value={entry.value} disabled={busy} placeholder="Enter measured value"
                              onChange={(e) => edit(point.id, { value: e.target.value })}/>
                            {outOfRange && <p className="flex items-center gap-1 text-[11px] text-destructive"><AlertTriangle className="h-3 w-3 shrink-0"/>Outside configured limits — corrective review required</p>}
                          </> : <>
                            <Label className="text-xs">Actual sight / sound observation</Label>
                            <Textarea rows={2} aria-label={`Observed condition: ${point.name}`}
                              value={entry.findings} disabled={busy} placeholder="E.g. no leaks; regular sound, no unusual vibration"
                              onChange={(e) => edit(point.id, { findings: e.target.value })}/>
                          </>}
                        </div>
                        <div className="min-w-0 space-y-1">
                          {point.inspectionType === 'measurement' && <>
                            <Label className="text-xs">Observations / remarks</Label>
                            <Textarea rows={2} aria-label={`Inspection remarks: ${point.name}`} value={entry.findings} disabled={busy}
                              placeholder="What did you see or hear? Describe abnormal conditions."
                              onChange={(e) => edit(point.id, { findings: e.target.value })}/>
                          </>}
                          <Label className="text-xs">Recommended action (optional)</Label>
                          <Input value={entry.recommendation} disabled={busy} placeholder="What should be inspected or repaired?"
                            aria-label={`Recommended action: ${point.name}`}
                            onChange={(e) => edit(point.id, { recommendation: e.target.value })}/>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Technician assessment</Label>
                          <Select value={entry.outcome} disabled={busy} onValueChange={(value) => edit(point.id, { outcome: value as MachineChecklistDraft['outcome'] })}>
                            <SelectTrigger aria-label={`Assessment: ${point.name}`}><SelectValue/></SelectTrigger>
                            <SelectContent><SelectItem value="pass">Normal</SelectItem><SelectItem value="needs_attention">Needs attention</SelectItem><SelectItem value="fail">Defect / Fail</SelectItem></SelectContent>
                          </Select>
                          <Button size="sm" className="w-full" variant="outline" disabled={busy || entry.saved}
                            onClick={() => void save([point])}><Save className="mr-1.5 h-3.5 w-3.5"/>{entry.saved ? 'Saved' : 'Save reading'}</Button>
                        </div>
                      </div>}
                      {!supported && <p className="text-xs text-amber-700 dark:text-amber-300">This legacy check needs a new sight or instrument point before it can be recorded.</p>}
                      {entry.error && <p role="alert" className="text-xs text-destructive">{entry.error}</p>}
                      {entry.saved && <p role="status" className="text-xs text-emerald-700 dark:text-emerald-300">
                        Recorded: {entry.recordedOutcome?.replace('_', ' ') || 'saved'}{entry.workOrder ? ` · Corrective ${entry.workOrder} awaiting planner workflow` : ''}
                      </p>}
                      {point.openCorrectiveWorkOrder && <p className="break-words text-xs text-amber-700 dark:text-amber-300">
                        Existing corrective {point.openCorrectiveWorkOrder.woNumber} ({point.openCorrectiveWorkOrder.status}) — next due remains pending verified closeout.
                      </p>}
                      <p className="text-[11px] text-muted-foreground">
                        Latest: {point.latestRecord
                          ? `${point.latestRecord.result.replace('_', ' ')} · ${point.latestRecord.value ?? point.latestRecord.findings ?? 'observation'} · ${dateTime(point.latestRecord.inspectedAt)}`
                          : 'Not yet recorded'}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
          <div className="min-w-0 text-xs text-muted-foreground">
            <p>{points.length} configured part checks · {ready.length} entered and unsaved</p>
            {saveProgress && <p role="status" className="break-words">{saveProgress}</p>}
          </div>
          {canRecord && <Button size="sm" disabled={busy || ready.length === 0}
            onClick={() => void save(ready)}>
            {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin"/> : <ClipboardCheck className="mr-1.5 h-4 w-4"/>}
            Save Entered Readings ({ready.length})
          </Button>}
        </div>
      </>}
      {data && !loading && <PmMachineInspectionPrint data={data} />}
    </section>
  );
}
