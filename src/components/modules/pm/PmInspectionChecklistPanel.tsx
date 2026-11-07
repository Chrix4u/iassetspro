'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ClipboardCheck, Gauge, Eye, AlertTriangle, RefreshCw, Settings2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { ResponsiveDialog } from '@/components/shared/ResponsiveDialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type Result = 'pass' | 'conditional' | 'needs_attention' | 'fail';
type Row = {
  key: string;
  assignmentId: string;
  assetId: string;
  assetName: string;
  assetTag: string;
  departmentId: string | null;
  departmentName: string;
  componentId: string | null;
  componentName: string;
  componentCode: string;
  taskNumber: number;
  task: string;
  equipmentState: string;
  inspectionPointId: string | null;
  inspectionPointName: string;
  method: string;
  parameterKey: string | null;
  normalRange: { min: number | null; max: number | null; unit: string } | null;
  nextDueDate: string | null;
  nextDueReading: number | null;
  currentMeterValue: number | null;
  meterUnit: string | null;
  dueState: string;
  lastResult: string | null;
  lastValue: string | null;
  lastInspectedAt: string | null;
  latestFindings: string | null;
  openCorrective: { id: string; woNumber: string; status: string } | null;
};
type Payload = { rows: Row[]; truncated: boolean; summary: { total: number; overdue: number; unconfigured: number; attention: number; openCorrective: number } };
type Filters = { search: string; departmentId: string; assetId: string; componentId: string; method: string; dueState: string; result: string };
const EMPTY_FILTERS: Filters = { search: '', departmentId: '', assetId: '', componentId: '', method: '', dueState: '', result: '' };
const METHODS = [
  { value: 'visual', label: 'Sight / Visual' },
  { value: 'measurement', label: 'Instrument / Measurement' },
  { value: 'functional', label: 'Functional test' },
  { value: 'dimensional', label: 'Dimensional instrument' },
  { value: 'ndt', label: 'Non-destructive test' },
];
const methodLabel = (value: string) => METHODS.find((method) => method.value === value)?.label || 'Not configured';
const dueLabel = (value: string) => ({
  overdue: 'Overdue', due_soon: 'Due in 7 days', scheduled: 'Scheduled',
  meter_due: 'Meter due', meter_waiting: 'Meter pending', unplanned: 'No due point',
}[value] || value);
const outcomeLabel = (value: string) => ({
  pass: 'Pass', conditional: 'Conditional', needs_attention: 'Needs attention', fail: 'Fail',
}[value] || value);
const isInstrument = (method: string) => method === 'measurement' || method === 'dimensional';

function MiniFilter({ label, value, options, onChange }: {
  label: string; value: string; options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="min-w-[9.5rem] flex-1 space-y-1">
      <Label className="text-xs font-medium">{label}</Label>
      <Select value={value || '__all__'} onValueChange={(selected) => onChange(selected === '__all__' ? '' : selected)}>
        <SelectTrigger className="h-9 w-full text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">All</SelectItem>
          {options.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

export function PmInspectionChecklistPanel() {
  const { hasPermission, isAdmin } = useAuthStore();
  const canRecord = isAdmin() || ['pm_schedules.update', 'pm_schedules.run', 'work_orders.create', 'work_orders.update'].some(hasPermission);
  const canConfigure = isAdmin() || hasPermission('pm_schedules.update');
  const [payload, setPayload] = useState<Payload | null>(null);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState<Row | null>(null);
  const [mode, setMode] = useState<'record' | 'configure'>('record');
  const [saving, setSaving] = useState(false);
  const [submissionId, setSubmissionId] = useState('');
  const [result, setResult] = useState<Result>('pass');
  const [value, setValue] = useState('');
  const [findings, setFindings] = useState('');
  const [recommendation, setRecommendation] = useState('');
  const [pointName, setPointName] = useState('');
  const [method, setMethod] = useState('visual');
  const [parameter, setParameter] = useState('');
  const [minimum, setMinimum] = useState('');
  const [maximum, setMaximum] = useState('');
  const [unit, setUnit] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get<Payload>('/api/pm-inspections');
      if (!response.success || !response.data) throw new Error(response.error || 'Failed to load PM inspection checklist');
      setPayload(response.data);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not load PM inspection checklist');
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const rows = payload?.rows || [];
  const departments = useMemo(() => [...new Map(rows.filter((row) => row.departmentId).map((row) => [row.departmentId!, { value: row.departmentId!, label: row.departmentName }])).values()], [rows]);
  const machines = useMemo(() => [...new Map(rows.map((row) => [row.assetId, { value: row.assetId, label: row.assetName + ' [' + row.assetTag + ']' }])).values()], [rows]);
  const parts = useMemo(() => [...new Map(rows.filter((row) => row.componentId && (!filters.assetId || row.assetId === filters.assetId)).map((row) =>
    [row.componentId!, { value: row.componentId!, label: row.componentName + (row.componentCode ? ' [' + row.componentCode + ']' : '') }]
  )).values()], [rows, filters.assetId]);
  const filtered = useMemo(() => rows.filter((row) =>
    (!filters.departmentId || row.departmentId === filters.departmentId)
    && (!filters.assetId || row.assetId === filters.assetId)
    && (!filters.componentId || row.componentId === filters.componentId)
    && (!filters.method || row.method === filters.method)
    && (!filters.dueState || row.dueState === filters.dueState)
    && (!filters.result || (filters.result === 'pending' ? !row.lastResult : row.lastResult === filters.result))
    && (!filters.search || [
      row.assetName, row.assetTag, row.componentName, row.componentCode,
      row.task, row.inspectionPointName, row.parameterKey || '',
    ].some((part) => part.toLowerCase().includes(filters.search.toLowerCase())))
  ), [rows, filters]);

  const openRecord = (row: Row) => {
    setMode('record'); setActive(row); setSubmissionId('pmir_' + crypto.randomUUID());
    setResult('pass'); setValue(''); setFindings(''); setRecommendation('');
  };
  const openConfigure = (row: Row) => {
    setMode('configure'); setActive(row);
    setPointName(row.inspectionPointName || row.task);
    setMethod(row.method === 'unconfigured' ? 'visual' : row.method);
    setParameter(row.parameterKey || '');
    setMinimum(row.normalRange?.min?.toString() || '');
    setMaximum(row.normalRange?.max?.toString() || '');
    setUnit(row.normalRange?.unit || '');
  };

  const save = async () => {
    if (!active || saving) return;
    setSaving(true);
    try {
      const body = mode === 'configure'
        ? {
            action: 'configure', assignmentId: active.assignmentId,
            inspectionPointId: active.inspectionPointId,
            name: pointName, method, parameterKey: parameter, min: minimum, max: maximum, unit,
          }
        : {
            action: 'record', assignmentId: active.assignmentId, inspectionPointId: active.inspectionPointId,
            submissionId, result, value: isInstrument(active.method) ? value : null,
            findings, recommendation,
          };
      const response = await api.post('/api/pm-inspections', body);
      if (!response.success) throw new Error(response.error || 'Could not save inspection');
      const wo = response.data?.workOrder;
      toast.success(mode === 'configure'
        ? 'Inspection point configured'
        : wo?.woNumber
          ? 'Inspection recorded. Corrective WO ' + wo.woNumber + ' is available for planning.'
          : 'Inspection recorded; the PM next due point is unchanged.');
      setActive(null);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save inspection');
    } finally { setSaving(false); }
  };

  const updateFilter = (key: keyof Filters, newValue: string) => setFilters((current) =>
    key === 'assetId' ? { ...current, assetId: newValue, componentId: '' } : { ...current, [key]: newValue });

  return (
    <>
      <Card className="border-0 shadow-sm" data-testid="pm-inspection-checklist">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base"><ClipboardCheck className="h-5 w-5 text-emerald-600" />Machine-Part PM Inspection List</CardTitle>
              <CardDescription className="mt-1">Inspection tasks derived from active PM assignments. Record instrument readings and sight observations before requesting corrective work.</CardDescription>
            </div>
            <Button type="button" variant="outline" size="sm" disabled={loading} onClick={() => void load()}>
              <RefreshCw className={'mr-2 h-4 w-4 ' + (loading ? 'animate-spin' : '')} />Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {payload && <div className="flex flex-wrap gap-2 text-xs">
            <Badge variant="secondary">{payload.summary.total} inspection points</Badge>
            <Badge variant="outline">{payload.summary.overdue} due / overdue</Badge>
            <Badge variant="outline">{payload.summary.unconfigured} need setup</Badge>
            <Badge variant="outline">{payload.summary.attention} with findings</Badge>
            <Badge variant="outline">{payload.summary.openCorrective || 0} linked open corrective WOs</Badge>
          </div>}
          <div className="flex items-end gap-2 overflow-x-auto pb-2">
            <div className="min-w-[11rem] flex-[2] space-y-1">
              <Label className="text-xs font-medium">Search</Label>
              <Input className="h-9 text-xs" placeholder="Machine, part, parameter..." value={filters.search} onChange={(event) => updateFilter('search', event.target.value)} />
            </div>
            <MiniFilter label="Department" value={filters.departmentId} options={departments} onChange={(value) => updateFilter('departmentId', value)} />
            <MiniFilter label="Machine" value={filters.assetId} options={machines} onChange={(value) => updateFilter('assetId', value)} />
            <MiniFilter label="Part" value={filters.componentId} options={parts} onChange={(value) => updateFilter('componentId', value)} />
            <MiniFilter label="Inspection Method" value={filters.method} options={[...METHODS, { value: 'unconfigured', label: 'Needs configuration' }]} onChange={(value) => updateFilter('method', value)} />
            <MiniFilter label="Due State" value={filters.dueState} options={['overdue', 'due_soon', 'scheduled', 'meter_due', 'meter_waiting', 'unplanned'].map((value) => ({ value, label: dueLabel(value) }))} onChange={(value) => updateFilter('dueState', value)} />
            <MiniFilter label="Outcome" value={filters.result} options={[{ value: 'pending', label: 'Not yet inspected' }, ...(['pass', 'conditional', 'needs_attention', 'fail'] as Result[]).map((value) => ({ value, label: outcomeLabel(value) }))]} onChange={(value) => updateFilter('result', value)} />
            <Button variant="ghost" size="sm" className="shrink-0" onClick={() => setFilters(EMPTY_FILTERS)}>Clear</Button>
          </div>
          {payload?.truncated && <p className="text-xs text-amber-700">The inspection list is limited to 500 PM assignments. Narrow the plant scope or apply filters for a complete inspection run.</p>}
          {loading && !payload ? <div className="py-8 text-center text-sm text-muted-foreground"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Loading inspections...</div>
            : filtered.length === 0 ? <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">No PM inspection points match these filters. Inspection tasks must first be assigned to a machine or part.</p>
            : <div className="space-y-2">
                {filtered.map((row) => <div key={row.key} className="flex flex-col gap-3 rounded-lg border p-3 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0 space-y-1">
                    <p className="break-words text-sm font-semibold">{row.assetName} · {row.componentName}</p>
                    <p className="break-words text-xs text-muted-foreground">{row.componentCode ? row.componentCode + ' · ' : ''}Task #{row.taskNumber}: {row.task}</p>
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <Badge variant="secondary">{row.method === 'visual' ? <Eye className="mr-1 h-3 w-3" /> : <Gauge className="mr-1 h-3 w-3" />}{methodLabel(row.method)}</Badge>
                      <Badge variant="outline">{dueLabel(row.dueState)}</Badge>
                      {row.lastResult && <Badge variant={row.lastResult === 'pass' ? 'secondary' : 'destructive'}>{outcomeLabel(row.lastResult)}</Badge>}
                      {row.openCorrective && <Badge variant="outline">Corrective {row.openCorrective.woNumber} · {row.openCorrective.status}</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {row.equipmentState === 'standstill' ? 'Standstill / Shutdown' : 'Running'} · {row.departmentName}
                      {row.nextDueDate ? ' · Due ' + new Date(row.nextDueDate).toLocaleDateString() : ''}
                      {row.nextDueReading != null ? ' · Meter ' + (row.currentMeterValue ?? '—') + ' / ' + row.nextDueReading + ' ' + (row.meterUnit || '') : ''}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {row.inspectionPointName || 'Inspection point not configured'}
                      {row.parameterKey ? ' · ' + row.parameterKey : ''}
                      {row.normalRange ? ' · Acceptable ' + (row.normalRange.min ?? '—') + ' to ' + (row.normalRange.max ?? '—') + ' ' + row.normalRange.unit : ''}
                    </p>
                    {row.lastInspectedAt && <p className="text-xs text-muted-foreground">Last: {new Date(row.lastInspectedAt).toLocaleString()} {row.lastValue ? ' · ' + row.lastValue : ''}</p>}
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    {canConfigure && row.componentId && <Button variant="outline" size="sm" onClick={() => openConfigure(row)}><Settings2 className="mr-1 h-4 w-4" />{row.inspectionPointId ? 'Configure' : 'Set up'}</Button>}
                    {canRecord && row.inspectionPointId && <Button size="sm" onClick={() => openRecord(row)}><ClipboardCheck className="mr-1 h-4 w-4" />Record</Button>}
                    {!row.componentId && <span className="text-xs text-muted-foreground">Assign the inspection to a part first</span>}
                  </div>
                </div>)}
              </div>}
        </CardContent>
      </Card>
      <ResponsiveDialog open={Boolean(active)} onOpenChange={(open) => { if (!open && !saving) setActive(null); }}
        title={mode === 'configure' ? 'Configure Inspection Point' : 'Record PM Inspection'}
        description={active ? active.assetName + ' / ' + active.componentName : ''}
        footer={<div className="flex justify-end gap-2">
          <Button variant="outline" disabled={saving} onClick={() => setActive(null)}>Cancel</Button>
          <Button disabled={saving} onClick={() => void save()}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{mode === 'configure' ? 'Save Point' : 'Submit Inspection'}</Button>
        </div>}>
        {mode === 'configure' ? <div className="grid gap-3 py-2">
          <div><Label>Inspection Point / Location</Label><Input value={pointName} onChange={(event) => setPointName(event.target.value)} placeholder="e.g. Impeller bearing housing" /></div>
          <div><Label>Inspection Method</Label><Select value={method} onValueChange={setMethod}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{METHODS.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select></div>
          <div><Label>Parameter</Label><Input value={parameter} onChange={(event) => setParameter(event.target.value)} placeholder="e.g. Temperature, pressure, vibration" /></div>
          {isInstrument(method) && <div className="grid grid-cols-3 gap-2">
            <div><Label>Min</Label><Input type="number" value={minimum} onChange={(event) => setMinimum(event.target.value)} /></div>
            <div><Label>Max</Label><Input type="number" value={maximum} onChange={(event) => setMaximum(event.target.value)} /></div>
            <div><Label>Unit</Label><Input value={unit} onChange={(event) => setUnit(event.target.value)} placeholder="°C, bar, mm/s" /></div>
          </div>}
          <p className="text-xs text-muted-foreground">This inspection point inherits its PM calendar or meter interval. It does not create another frequency type.</p>
        </div> : <div className="grid gap-3 py-2">
          <p className="text-sm font-medium">{active?.inspectionPointName} · {methodLabel(active?.method || '')}</p>
          {active?.parameterKey && <p className="text-sm">Parameter: <strong>{active.parameterKey}</strong></p>}
          {isInstrument(active?.method || '') && <div><Label>Actual Instrument Reading</Label><Input type="number" step="any" inputMode="decimal" value={value} onChange={(event) => setValue(event.target.value)} required />{active?.normalRange && <p className="mt-1 text-xs text-muted-foreground">Normal: {active.normalRange.min ?? '—'} – {active.normalRange.max ?? '—'} {active.normalRange.unit}. An out-of-range reading is automatically marked Fail.</p>}</div>}
          <div><Label>Inspection Outcome</Label><Select value={result} onValueChange={(selected) => setResult(selected as Result)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>
            <SelectItem value="pass">Pass</SelectItem><SelectItem value="conditional">Conditional / Monitor</SelectItem>
            <SelectItem value="needs_attention">Needs Attention</SelectItem><SelectItem value="fail">Fail</SelectItem>
          </SelectContent></Select></div>
          <div><Label>Findings / Visual Observation</Label><Textarea value={findings} onChange={(event) => setFindings(event.target.value)} placeholder="Noise, leaks, wear, temperature, reading anomaly..." /></div>
          <div><Label>Recommendation</Label><Textarea value={recommendation} onChange={(event) => setRecommendation(event.target.value)} placeholder="Recommended next action for planner" /></div>
          {(result === 'fail' || result === 'needs_attention') && <div className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800"><AlertTriangle className="h-4 w-4 shrink-0" /><span>Submitting a defect opens or updates a draft corrective work order for planning. This inspection will not advance the PM due date.</span></div>}
        </div>}
      </ResponsiveDialog>
    </>
  );
}
