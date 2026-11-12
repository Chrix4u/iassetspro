'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ClipboardCheck, Download, Loader2, RefreshCw, Search } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { formatUiDate } from '@/lib/date-display';
import { groupInspectionPoints, type GroupableInspectionPoint } from '@/lib/pm-inspection-grouping';
import { useNavigationStore } from '@/stores/navigationStore';
import { useAuthStore } from '@/stores/authStore';
import { buildPmInspectionPageCsv } from '@/lib/pm-inspection-export';
import { AsyncSearchableSelect, type SearchableOption } from '@/components/ui/searchable-select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ResponsiveDialog } from '@/components/shared/ResponsiveDialog';

type Outcome = 'pass' | 'fail' | 'needs_attention';
type DueState = 'overdue' | 'due_today' | 'upcoming' | 'unscheduled';
interface InspectionPoint extends GroupableInspectionPoint {
  description: string | null;
  normalRange: string | null;
  frequency: string;
  nextInspection: string | null;
  dueState: DueState;
  latestRecord: {
    id: string;
    result: string;
    value: string | null;
    findings: string | null;
    inspectedAt: string;
  } | null;
  openCorrectiveWorkOrder: { id: string; woNumber: string; status: string } | null;
}
interface InspectionApiResponse {
  success: boolean;
  data?: InspectionPoint[];
  pagination?: { total: number; totalPages: number };
  error?: string;
}
const EMPTY = { outcome: 'pass' as Outcome, value: '', findings: '', recommendation: '', requestKey: '' };

function limitsFor(point: InspectionPoint) {
  try {
    const limits = JSON.parse(point.normalRange || '{}') as { min?: number; max?: number; unit?: string };
    return { min: limits.min ?? null, max: limits.max ?? null, unit: limits.unit || '' };
  } catch {
    return { min: null, max: null, unit: '' };
  }
}
function dueBadge(due: DueState) {
  return due === 'overdue' ? 'destructive' as const : due === 'due_today' ? 'secondary' as const : 'outline' as const;
}
function dueText(due: DueState) {
  return ({ overdue: 'Overdue', due_today: 'Due today', upcoming: 'Upcoming', unscheduled: 'Unscheduled' })[due];
}

/** Scalable machine-first inspection history. Nothing is fetched until a machine is selected. */
export function PmGroupedReadingsPage() {
  const navigate = useNavigationStore((s) => s.navigate);
  const { hasPermission, isAdmin } = useAuthStore();
  const canRecord = isAdmin() || hasPermission('pm_schedules.update') ||
    hasPermission('work_orders.update') || hasPermission('digital_twin.manage');

  const [assetId, setAssetId] = useState('');
  const [search, setSearch] = useState('');
  const [method, setMethod] = useState('all');
  const [dueState, setDueState] = useState('all');
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<InspectionPoint[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [recordPoint, setRecordPoint] = useState<InspectionPoint | null>(null);
  const [record, setRecord] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  const fetchAssets = useCallback(async (query: string): Promise<SearchableOption[]> => {
    const params = new URLSearchParams({ search: query, limit: '100' });
    const response = await api.get<{ id: string; name: string; assetTag: string }[]>('/api/assets?' + params.toString());
    return response.success && Array.isArray(response.data)
      ? response.data.map((asset) => ({ value: asset.id, label: asset.name + ' [' + asset.assetTag + ']' }))
      : [];
  }, []);

  useEffect(() => {
    if (!assetId) {
      setRows([]); setTotal(0); setTotalPages(1); setLoading(false); setError('');
      return;
    }
    let active = true;
    setLoading(true); setError('');
    const params = new URLSearchParams({ assetId, page: String(page), limit: '100' });
    if (search.trim()) params.set('search', search.trim().slice(0, 120));
    if (method !== 'all') params.set('method', method);
    if (dueState !== 'all') params.set('dueState', dueState);
    api.get<InspectionPoint[]>('/api/pm-inspections?' + params.toString()).then((response) => {
      if (!active) return;
      const result = response as InspectionApiResponse;
      if (!result.success || !Array.isArray(result.data)) throw new Error(result.error || 'Inspections could not be loaded');
      setRows(result.data);
      setTotal(result.pagination?.total ?? result.data.length);
      setTotalPages(Math.max(1, result.pagination?.totalPages ?? 1));
    }).catch((cause) => {
      if (!active) return;
      setRows([]); setError(cause instanceof Error ? cause.message : 'Could not load inspection readings');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [assetId, page, search, method, dueState, reload]);

  const machines = useMemo(() => groupInspectionPoints(rows), [rows]);
  const updateMachine = (value: string) => { setAssetId(value); setPage(1); };
  const updateSearch = (value: string) => { setSearch(value); setPage(1); };
  const updateMethod = (value: string) => { setMethod(value); setPage(1); };
  const updateDue = (value: string) => { setDueState(value); setPage(1); };
  const beginRecord = (point: InspectionPoint) => { setRecordPoint(point); setRecord(EMPTY); };

  const save = async () => {
    if (!recordPoint || saving) return;
    if (recordPoint.inspectionType === 'measurement' && record.value.trim() === '') {
      toast.error('Enter the actual instrument measurement'); return;
    }
    setSaving(true);
    const requestKey = record.requestKey || crypto.randomUUID();
    if (!record.requestKey) setRecord((current) => ({ ...current, requestKey }));
    try {
      const response = await api.post<{ record: { id: string }; workOrder: { woNumber: string } | null; duplicate?: boolean }>(
        '/api/pm-inspections/' + encodeURIComponent(recordPoint.id) + '/records', { ...record, requestKey });
      if (!response.success) throw new Error(response.error || 'Inspection could not be saved');
      toast.success(response.data?.duplicate ? 'Inspection already saved' :
        response.data?.workOrder ? 'Inspection saved; corrective ' + response.data.workOrder.woNumber + ' requires review' :
          'Inspection saved and next due date updated');
      setRecordPoint(null); setRecord(EMPTY); setReload((value) => value + 1);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not save inspection');
    } finally { setSaving(false); }
  };

  const exportPage = () => {
    if (!rows.length) return;
    const csv = buildPmInspectionPageCsv(rows);
    const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = 'pm-inspection-readings-' + page + '.csv';
    document.body.appendChild(anchor); anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return <div className="page-content space-y-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">PM Inspections</p>
        <h1 className="text-2xl font-bold tracking-tight">Inspection Readings</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">One machine, then each inspection task with all assigned parts underneath. Review acceptance, cadence, latest measurements, recorded date and overdue state independently.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => navigate('pm-action-lists')}><ClipboardCheck className="mr-1 h-4 w-4" />Action Lists</Button>
        <Button size="sm" variant="outline" onClick={() => navigate('pm-inspection-exceptions')}><AlertTriangle className="mr-1 h-4 w-4" />Exceptions</Button>
      </div>
    </div>
    <Card>
      <CardHeader className="pb-3"><CardTitle className="text-sm">Machine & inspection filters</CardTitle><CardDescription>Search for one machine before loading its parts; suitable for large multi-plant portfolios.</CardDescription></CardHeader>
      <CardContent className="space-y-3">
        <div data-testid="pm-readings-filter-grid" className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1.2fr)_minmax(0,.8fr)_minmax(0,.8fr)]">
          <div className="min-w-0"><Label>Machine</Label><AsyncSearchableSelect value={assetId} onValueChange={updateMachine} fetchOptions={fetchAssets} placeholder="Choose machine name or code" /></div>
          <div className="min-w-0"><Label>Task or part</Label><Input value={search} onChange={(e) => updateSearch(e.target.value)} placeholder="Search task, component or code" /></div>
          <div className="min-w-0"><Label>Method</Label><Select value={method} onValueChange={updateMethod}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All methods</SelectItem><SelectItem value="measurement">Instrument</SelectItem><SelectItem value="visual">Sight</SelectItem></SelectContent></Select></div>
          <div className="min-w-0"><Label>Due status</Label><Select value={dueState} onValueChange={updateDue}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All states</SelectItem><SelectItem value="overdue">Overdue</SelectItem><SelectItem value="due_today">Due today</SelectItem><SelectItem value="upcoming">Upcoming</SelectItem><SelectItem value="unscheduled">Unscheduled</SelectItem></SelectContent></Select></div>
        </div>
        {assetId && <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
          <span>{total.toLocaleString()} matching inspection points · Page {page} of {totalPages}</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setReload((value) => value + 1)} disabled={loading}><RefreshCw className="mr-1 h-3.5 w-3.5"/>Refresh</Button>
            <Button size="sm" variant="outline" onClick={exportPage} disabled={!rows.length}><Download className="mr-1 h-3.5 w-3.5"/>Export page</Button>
          </div>
        </div>}
      </CardContent>
    </Card>

    {!assetId ? <div data-testid="pm-select-machine" className="rounded-xl border border-dashed p-7 text-center text-sm text-muted-foreground">Select a machine to show its inspection tasks and assigned parts. Machines are not repeated across hundreds of individual cards.</div>
      : loading ? <div role="status" className="flex items-center gap-2 p-5 text-sm"><Loader2 className="h-4 w-4 animate-spin"/>Loading inspection points…</div>
      : error ? <p role="alert" className="rounded-lg border border-red-200 p-4 text-sm text-red-700">{error}</p>
      : machines.length === 0 ? <p className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">No inspection points match these filters. You can plan a new inspection from the Action Lists workspace.</p>
      : machines.map((machine) => <Card key={machine.id} data-testid="pm-inspection-machine-group" className="overflow-hidden">
        <CardHeader className="border-b bg-muted/30 pb-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0"><CardTitle className="break-words text-base">{machine.name}</CardTitle><CardDescription className="break-all font-mono">{machine.code}</CardDescription></div>
            <Badge variant="outline">{machine.tasks.length} inspection task{machine.tasks.length === 1 ? '' : 's'} on this page</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 p-2 sm:p-3">
          {machine.tasks.map((task) => <section key={task.key} data-testid="pm-inspection-task-group" className="overflow-hidden rounded-lg border">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/20 p-3">
              <h3 className="break-words text-sm font-semibold">{task.name}</h3>
              <div className="flex gap-2"><Badge variant="outline">{task.method === 'measurement' ? 'Instrument' : task.method === 'visual' ? 'Sight' : task.method}</Badge><Badge variant="outline">{task.points.length} parts</Badge></div>
            </div>
            <div className="hidden gap-2 border-b p-2 text-xs font-semibold text-muted-foreground lg:grid lg:grid-cols-[1.5fr_1.5fr_1fr_1fr_.8fr_.7fr_auto]">
              <span>Part / code</span><span>Parameter / acceptance</span><span>Schedule / due</span><span>Latest result</span><span>Recorded</span><span>Due status</span><span>Action</span>
            </div>
            {task.points.map((point) => {
              const range = limitsFor(point);
              const result = point.latestRecord;
              return <div key={point.id} data-testid="pm-inspection-point" className="grid min-w-0 gap-2 border-b p-3 text-xs last:border-0 sm:grid-cols-2 lg:grid-cols-[1.5fr_1.5fr_1fr_1fr_.8fr_.7fr_auto] lg:items-center">
                <div className="min-w-0"><p className="break-words font-medium">{point.component.name}</p><p className="break-all font-mono text-muted-foreground">{point.component.componentCode}</p></div>
                <div className="min-w-0"><span className="text-muted-foreground lg:hidden">Acceptance: </span><span className="break-words">{point.inspectionType === 'measurement' ? (point.parameterKey || 'Value') + ': ' + (range.min ?? '—') + ' to ' + (range.max ?? '—') + ' ' + range.unit : 'Visual condition / defects'}</span></div>
                <div className="min-w-0"><span className="text-muted-foreground lg:hidden">Schedule: </span>{point.frequency}<p className="text-muted-foreground">Next {point.nextInspection ? formatUiDate(point.nextInspection) : 'not set'}</p></div>
                <div className="min-w-0"><span className="text-muted-foreground lg:hidden">Latest: </span><span className="font-medium">{result ? result.result.replaceAll('_', ' ') + (result.value == null ? '' : ' · ' + result.value + ' ' + range.unit) : 'Not inspected'}</span>{point.openCorrectiveWorkOrder && <p className="break-words text-amber-700 dark:text-amber-300">Corrective {point.openCorrectiveWorkOrder.woNumber}</p>}</div>
                <div className="min-w-0"><span className="text-muted-foreground lg:hidden">Recorded: </span>{result ? formatUiDate(result.inspectedAt) : '—'}</div>
                <div><Badge variant={dueBadge(point.dueState)}>{dueText(point.dueState)}</Badge></div>
                <div>{canRecord && ['measurement', 'visual'].includes(point.inspectionType) && <Button type="button" variant="outline" size="sm" onClick={() => beginRecord(point)}>Record</Button>}</div>
              </div>;
            })}
          </section>)}
        </CardContent>
      </Card>)}
    {assetId && <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
      <span>Page {page} of {totalPages} · Select this machine to view every page of its tasks</span>
      <div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => setPage((v) => Math.max(1, v - 1))} disabled={loading || page === 1}>Previous</Button><Button size="sm" variant="outline" onClick={() => setPage((v) => v + 1)} disabled={loading || page >= totalPages}>Next</Button></div>
    </div>}

    <ResponsiveDialog open={Boolean(recordPoint)} onOpenChange={(open) => { if (!open && !saving) setRecordPoint(null); }}
      title={recordPoint ? 'Record ' + recordPoint.name : 'Record Inspection'}
      description={recordPoint ? recordPoint.component.name + ' · ' + recordPoint.component.componentCode : ''}
      footer={<div className="flex justify-end gap-2"><Button variant="outline" disabled={saving} onClick={() => setRecordPoint(null)}>Cancel</Button><Button disabled={saving} onClick={() => void save()}>{saving ? 'Saving…' : 'Save Inspection'}</Button></div>}>
      {recordPoint && <div className="space-y-3">
        {recordPoint.inspectionType === 'measurement' && <div><p className="mb-2 rounded-lg bg-muted/30 p-2 text-xs">Acceptable: {String(limitsFor(recordPoint).min ?? '—')} to {String(limitsFor(recordPoint).max ?? '—')} {limitsFor(recordPoint).unit}</p><Label>Measured value *</Label><Input type="number" step="any" value={record.value} onChange={(event) => setRecord({ ...record, value: event.target.value, requestKey: '' })}/></div>}
        <div><Label>Outcome</Label><Select value={record.outcome} onValueChange={(value) => setRecord({ ...record, outcome: value as Outcome, requestKey: '' })}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="pass">Pass</SelectItem><SelectItem value="needs_attention">Needs Attention</SelectItem><SelectItem value="fail">Fail</SelectItem></SelectContent></Select></div>
        <div><Label>Findings / defects</Label><Textarea value={record.findings} onChange={(event) => setRecord({ ...record, findings: event.target.value, requestKey: '' })} placeholder="Record the actual observation"/></div>
        <div><Label>Recommended corrective action</Label><Textarea value={record.recommendation} onChange={(event) => setRecord({ ...record, recommendation: event.target.value, requestKey: '' })}/></div>
        <p className="text-xs text-muted-foreground">Abnormal results may create or reuse a corrective work order. An overdue schedule remains due until the required maintenance is verified.</p>
      </div>}
    </ResponsiveDialog>
  </div>;
}
