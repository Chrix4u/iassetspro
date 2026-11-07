'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ClipboardCheck, ClipboardPlus, Gauge, Loader2, RefreshCw, Search, SlidersHorizontal } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ResponsiveDialog } from '@/components/shared/ResponsiveDialog';

type Due = 'overdue' | 'due_soon' | 'scheduled' | 'meter';
type Result = 'pass' | 'fail' | 'conditional' | 'needs_attention';
type Point = {
  id: string; name: string; description: string | null; method: 'instrument' | 'sight';
  parameterKey: string | null; range: { min?: number; max?: number; unit?: string };
  latest: { id: string; value: string | null; result: string; findings: string | null; inspectedAt: string } | null;
};
type Task = {
  assignmentId: string; taskNumber: number; description: string; pmType: string;
  equipmentState: string; nextDueDate: string | null; nextDueReading: number | null;
  currentMeterValue: number | null; meterUnit: string | null; due: Due;
};
type InspectionGroup = {
  key: string; assetId: string; assetName: string; assetTag: string;
  plantId: string; departmentId: string | null; departmentName: string;
  componentId: string | null; componentName: string; componentCode: string | null;
  tasks: Task[]; points: Point[];
};
type InspectionPayload = { items: InspectionGroup[]; totalAssignments: number; truncated: boolean };
type Filters = { search: string; machine: string; department: string; part: string; method: string; due: string; result: string };
const ALL = '__all__';
const emptyFilters: Filters = {
  search: '', machine: ALL, department: ALL, part: ALL, method: ALL, due: ALL, result: ALL,
};
const dateLabel = (value: string | null) => value ? new Date(value).toLocaleString() : '—';
const pointMethod = (value: Point['method']) => value === 'instrument' ? 'Instrument' : 'Sight';
const dueClass = (state: Due) => state === 'overdue' ? 'text-red-600' : state === 'due_soon' ? 'text-amber-700' : 'text-muted-foreground';
const dueLabel = (state: Due) => ({ overdue: 'Overdue / due', due_soon: 'Due soon', scheduled: 'Scheduled', meter: 'Meter-based' })[state];

export function PmInspectionListPanel({ canRecord, canConfigure }: { canRecord: boolean; canConfigure: boolean }) {
  const [payload, setPayload] = useState<InspectionPayload>({ items: [], totalAssignments: 0, truncated: false });
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [recordTarget, setRecordTarget] = useState<{ group: InspectionGroup; point: Point } | null>(null);
  const [configTarget, setConfigTarget] = useState<InspectionGroup | null>(null);
  const [saving, setSaving] = useState(false);
  const [recordKey, setRecordKey] = useState('');
  const [record, setRecord] = useState({ result: 'pass' as Result, value: '', findings: '', recommendation: '' });
  const [point, setPoint] = useState({ name: '', method: 'sight', description: '', parameterKey: '', min: '', max: '', unit: '' });

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get<InspectionPayload>('/api/pm-inspections');
      if (!response.success || !response.data) throw new Error(response.error || 'Cannot load inspection list');
      setPayload(response.data);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Cannot load inspection list');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const machines = useMemo(
    () => [...new Map(payload.items.map((item) => [item.assetId, item.assetName + ' [' + item.assetTag + ']'])).entries()].sort((a, b) => a[1].localeCompare(b[1])),
    [payload.items],
  );
  const departments = useMemo(
    () => [...new Map(payload.items.filter((item) => item.departmentId).map((item) => [item.departmentId!, item.departmentName])).entries()].sort((a, b) => a[1].localeCompare(b[1])),
    [payload.items],
  );
  const parts = useMemo(
    () => [...new Map(payload.items.filter((item) => item.componentId).map((item) => [item.componentId!, item.componentName])).entries()].sort((a, b) => a[1].localeCompare(b[1])),
    [payload.items],
  );
  const filtered = useMemo(() => payload.items.filter((group) => {
    const search = filters.search.trim().toLowerCase();
    if (filters.machine !== ALL && group.assetId !== filters.machine) return false;
    if (filters.department !== ALL && group.departmentId !== filters.department) return false;
    if (filters.part !== ALL && group.componentId !== filters.part) return false;
    if (filters.method !== ALL && !group.points.some((p) => p.method === filters.method)) return false;
    if (filters.due !== ALL && !group.tasks.some((task) => task.due === filters.due)) return false;
    if (filters.result !== ALL && !group.points.some((p) => filters.result === 'not_recorded'
      ? !p.latest : p.latest?.result === filters.result)) return false;
    if (search && ![group.assetName, group.assetTag, group.departmentName, group.componentName,
      group.componentCode || '', ...group.tasks.map((task) => task.description),
      ...group.points.map((p) => p.name)].some((part) => part.toLowerCase().includes(search))) return false;
    return true;
  }), [filters, payload.items]);

  const openRecord = (group: InspectionGroup, inspectionPoint: Point) => {
    setRecord({ result: 'pass', value: '', findings: '', recommendation: '' });
    // Keep this key stable if a mobile submission needs to be retried.
    setRecordKey('inspect_' + Date.now() + '_' + Math.random().toString(36).slice(2, 14));
    setRecordTarget({ group, point: inspectionPoint });
  };

  const saveRecord = async () => {
    if (!recordTarget) return;
    setSaving(true);
    try {
      const response = await api.post<{ record: unknown; workOrder: { woNumber: string } | null; outsideRange: boolean }>(
        '/api/pm-inspections', {
          action: 'record',
          assignmentId: recordTarget.group.tasks[0]?.assignmentId,
          pointId: recordTarget.point.id,
          requestKey: recordKey,
          ...record,
        },
      );
      if (!response.success) throw new Error(response.error || 'Unable to save inspection');
      const workOrder = response.data?.workOrder;
      toast.success(workOrder
        ? 'Inspection recorded. Corrective WO ' + workOrder.woNumber + ' is awaiting planning.'
        : 'Inspection recorded successfully');
      setRecordTarget(null);
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to save inspection');
    } finally {
      setSaving(false);
    }
  };

  const savePoint = async () => {
    if (!configTarget) return;
    setSaving(true);
    try {
      const response = await api.post('/api/pm-inspections', {
        action: 'configure_point', assignmentId: configTarget.tasks[0]?.assignmentId,
        name: point.name, method: point.method, description: point.description,
        parameterKey: point.parameterKey, min: point.min, max: point.max, unit: point.unit,
      });
      if (!response.success) throw new Error(response.error || 'Unable to configure inspection point');
      toast.success('Inspection point configured for ' + configTarget.componentName);
      setConfigTarget(null);
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to configure inspection point');
    } finally {
      setSaving(false);
    }
  };

  const exportCsv = () => {
    const cells = [['Machine', 'Asset Tag', 'Department', 'Part', 'Part Code', 'PM Task',
      'PM Due Date', 'Meter Due', 'Method', 'Inspection Point', 'Parameter', 'Range',
      'Last Value', 'Last Result', 'Last Inspection', 'Findings']];
    for (const group of filtered) {
      for (const inspectionPoint of group.points) {
        for (const task of group.tasks) {
          const range = inspectionPoint.range;
          cells.push([group.assetName, group.assetTag, group.departmentName,
            group.componentName, group.componentCode || '', task.description,
            task.nextDueDate || '', task.nextDueReading == null ? '' : String(task.nextDueReading),
            pointMethod(inspectionPoint.method), inspectionPoint.name, inspectionPoint.parameterKey || '',
            (range.min == null ? '' : String(range.min)) + '–' + (range.max == null ? '' : String(range.max)) + ' ' + (range.unit || ''),
            inspectionPoint.latest?.value || '', inspectionPoint.latest?.result || '',
            inspectionPoint.latest?.inspectedAt || '', inspectionPoint.latest?.findings || '']);
        }
      }
    }
    const csv = cells.map((row) => row.map((cell) => '"' + String(cell).replace(/"/g, '""') + '"').join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'pm-inspection-list.csv';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return <Card className="border-0 shadow-sm">
    <CardHeader className="pb-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base"><ClipboardCheck className="h-5 w-5 text-emerald-600"/>PM Inspection List</CardTitle>
          <CardDescription>Part-by-part sight and instrument inspections with parameter readings, acceptable limits, findings and corrective follow-up.</CardDescription>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={exportCsv} disabled={filtered.length === 0}>Export CSV</Button>
          <Button size="sm" variant="outline" onClick={() => void refresh()} disabled={loading}>
            <RefreshCw className={'mr-1.5 h-4 w-4 ' + (loading ? 'animate-spin' : '')}/>Refresh
          </Button>
        </div>
      </div>
    </CardHeader>
    <CardContent className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <div className="relative sm:col-span-2">
          <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground"/>
          <Input value={filters.search} className="pl-9" placeholder="Search machine, part, task or parameter"
            aria-label="Search inspections" onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}/>
        </div>
        <Filter label="Machine" value={filters.machine} onChange={(v) => setFilters((f) => ({ ...f, machine: v }))}>
          {machines.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}
        </Filter>
        <Filter label="Department" value={filters.department} onChange={(v) => setFilters((f) => ({ ...f, department: v }))}>
          {departments.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}
        </Filter>
        <Filter label="Part" value={filters.part} onChange={(v) => setFilters((f) => ({ ...f, part: v }))}>
          {parts.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}
        </Filter>
        <Filter label="Method" value={filters.method} onChange={(v) => setFilters((f) => ({ ...f, method: v }))}>
          <SelectItem value="sight">Sight</SelectItem><SelectItem value="instrument">Instrument</SelectItem>
        </Filter>
        <Filter label="PM Due" value={filters.due} onChange={(v) => setFilters((f) => ({ ...f, due: v }))}>
          <SelectItem value="overdue">Due / Overdue</SelectItem><SelectItem value="due_soon">Due soon</SelectItem>
          <SelectItem value="scheduled">Scheduled</SelectItem><SelectItem value="meter">Meter-based</SelectItem>
        </Filter>
        <Filter label="Latest Result" value={filters.result} onChange={(v) => setFilters((f) => ({ ...f, result: v }))}>
          <SelectItem value="pass">Pass</SelectItem><SelectItem value="fail">Fail</SelectItem>
          <SelectItem value="conditional">Conditional</SelectItem>
          <SelectItem value="needs_attention">Needs attention</SelectItem>
          <SelectItem value="not_recorded">Not recorded</SelectItem>
        </Filter>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>{filtered.length} target{filtered.length === 1 ? '' : 's'} · {filtered.reduce((sum, g) => sum + g.points.length, 0)} inspection points</span>
        <Button size="sm" variant="ghost" className="h-7" onClick={() => setFilters(emptyFilters)}><SlidersHorizontal className="mr-1 h-3.5 w-3.5"/>Clear filters</Button>
      </div>
      {payload.truncated && <p className="text-xs text-amber-700">More than 500 PM assignments exist in this scope. Use a narrower plant/machine selection to review the remaining assignments.</p>}
      {loading && <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin"/>Loading inspection lists…</div>}
      {!loading && filtered.length === 0 && <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">No inspections match the selected filters.</p>}
      <div className="space-y-3">
        {filtered.map((group) => <div key={group.key} className="rounded-xl border bg-card">
          <div className="flex flex-wrap items-start justify-between gap-2 border-b p-3">
            <div className="min-w-0">
              <p className="break-words text-sm font-semibold">{group.assetName} <span className="font-normal text-muted-foreground">[{group.assetTag}]</span></p>
              <p className="text-xs text-muted-foreground">{group.componentName}{group.componentCode ? ' · ' + group.componentCode : ''} · {group.departmentName}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {group.tasks.some((task) => task.due === 'overdue') && <Badge variant="destructive">Due / Overdue</Badge>}
              {group.tasks.every((task) => task.due !== 'overdue') && <Badge variant="outline">{dueLabel(group.tasks[0]?.due || 'scheduled')}</Badge>}
              {canConfigure && group.componentId && <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => {
                setPoint({ name: '', method: 'sight', description: '', parameterKey: '', min: '', max: '', unit: '' });
                setConfigTarget(group);
              }}><ClipboardPlus className="mr-1 h-3.5 w-3.5"/>Inspection Point</Button>}
            </div>
          </div>
          <div className="space-y-1 px-3 py-2 text-xs text-muted-foreground">
            {group.tasks.map((task) => <div key={task.assignmentId} className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-foreground">#{task.taskNumber} {task.description}</span>
              <Badge variant="secondary">{task.equipmentState === 'standstill' ? 'Standstill' : 'Running'}</Badge>
              <span className={dueClass(task.due)}>{dueLabel(task.due)}</span>
              <span>{task.nextDueDate ? dateLabel(task.nextDueDate) : task.nextDueReading != null
                ? 'At ' + task.nextDueReading + ' ' + (task.meterUnit || '') + ' (current ' + (task.currentMeterValue ?? '—') + ')' : ''}</span>
            </div>)}
          </div>
          {group.points.length === 0 ? <div className="border-t p-3 text-sm text-muted-foreground">
            {group.componentId
              ? 'No inspection points configured. Define whether this part needs a sight inspection or an instrument reading, then set acceptable parameter limits.'
              : 'Choose a part in the machine hierarchy before configuring inspection points.'}
          </div> : <div className="divide-y border-t">
            {group.points.map((inspectionPoint) => <div key={inspectionPoint.id} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 space-y-1">
                <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                  {inspectionPoint.method === 'instrument' && <Gauge className="h-4 w-4 text-indigo-600"/>}
                  {inspectionPoint.name}
                  <Badge variant="outline">{pointMethod(inspectionPoint.method)}</Badge>
                </p>
                <p className="text-xs text-muted-foreground">{inspectionPoint.description || inspectionPoint.parameterKey || 'Visual condition observation'}</p>
                {inspectionPoint.method === 'instrument' && <p className="text-xs">
                  Parameter: {inspectionPoint.parameterKey || inspectionPoint.name} · Acceptable: {inspectionPoint.range.min ?? '—'} to {inspectionPoint.range.max ?? '—'} {inspectionPoint.range.unit || ''}
                </p>}
                <p className="text-xs">
                  Last reading: <strong>{inspectionPoint.latest?.value ?? '—'}</strong> {inspectionPoint.range.unit || ''}
                  {' · '}Result: <strong>{inspectionPoint.latest?.result?.replace(/_/g, ' ') || 'Not recorded'}</strong>
                  {' · '}{dateLabel(inspectionPoint.latest?.inspectedAt || null)}
                </p>
                {inspectionPoint.latest?.findings && <p className="break-words text-xs text-muted-foreground">Findings: {inspectionPoint.latest.findings}</p>}
              </div>
              {canRecord && <Button variant="outline" size="sm" className="shrink-0" onClick={() => openRecord(group, inspectionPoint)}>Record inspection</Button>}
            </div>)}
          </div>}
        </div>)}
      </div>
    </CardContent>

    <ResponsiveDialog open={Boolean(recordTarget)} onOpenChange={(open) => { if (!open && !saving) setRecordTarget(null); }}
      title={'Record ' + (recordTarget?.point.method === 'instrument' ? 'Instrument' : 'Sight') + ' Inspection'}
      description={recordTarget ? recordTarget.group.assetName + ' / ' + recordTarget.group.componentName + ' / ' + recordTarget.point.name : ''}
      footer={<div className="flex w-full justify-end gap-2"><Button variant="outline" disabled={saving} onClick={() => setRecordTarget(null)}>Cancel</Button>
        <Button onClick={() => void saveRecord()} disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>Save inspection</Button></div>}>
      <div className="space-y-3">
        {recordTarget?.point.method === 'instrument' && <div className="space-y-1"><Label>Parameter value ({recordTarget.point.range.unit || 'unit'})</Label>
          <Input type="number" step="any" inputMode="decimal" value={record.value} onChange={(e) => setRecord((v) => ({ ...v, value: e.target.value }))} placeholder="Enter measured value"/>
          <p className="text-xs text-muted-foreground">Acceptable: {recordTarget.point.range.min ?? '—'} to {recordTarget.point.range.max ?? '—'} {recordTarget.point.range.unit || ''}. Out-of-range readings are always recorded as Fail.</p>
        </div>}
        <Filter label="Inspection result" value={record.result} onChange={(value) => setRecord((v) => ({ ...v, result: value as Result }))} allOption={false}>
          <SelectItem value="pass">Pass</SelectItem><SelectItem value="fail">Fail</SelectItem>
          <SelectItem value="conditional">Conditional</SelectItem><SelectItem value="needs_attention">Needs attention</SelectItem>
        </Filter>
        <div className="space-y-1"><Label>Observed condition / findings</Label>
          <Textarea value={record.findings} rows={3} onChange={(e) => setRecord((v) => ({ ...v, findings: e.target.value }))} placeholder="Leakage, vibration, sound, temperature, wear, damage…"/>
        </div>
        <div className="space-y-1"><Label>Recommendation</Label>
          <Textarea value={record.recommendation} rows={2} onChange={(e) => setRecord((v) => ({ ...v, recommendation: e.target.value }))} placeholder="Recommended maintenance action"/>
        </div>
        <p className="text-xs text-muted-foreground">Fail or Needs attention opens (or reuses) one corrective draft work order for this inspection point. The planner/supervisor retains work-order approval.</p>
      </div>
    </ResponsiveDialog>

    <ResponsiveDialog open={Boolean(configTarget)} onOpenChange={(open) => { if (!open && !saving) setConfigTarget(null); }}
      title="Configure Inspection Point" description={configTarget?.assetName + ' / ' + configTarget?.componentName}
      footer={<div className="flex w-full justify-end gap-2"><Button variant="outline" disabled={saving} onClick={() => setConfigTarget(null)}>Cancel</Button>
        <Button onClick={() => void savePoint()} disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>Add inspection point</Button></div>}>
      <div className="space-y-3">
        <div className="space-y-1"><Label>Inspection point / parameter name</Label>
          <Input value={point.name} onChange={(e) => setPoint((v) => ({ ...v, name: e.target.value }))} placeholder="Bearing temperature, vibration, cracks, oil leakage"/>
        </div>
        <Filter label="Inspection method" allOption={false} value={point.method} onChange={(method) => setPoint((v) => ({ ...v, method }))}>
          <SelectItem value="sight">Sight / visual</SelectItem><SelectItem value="instrument">Instrument / measurement</SelectItem>
        </Filter>
        <div className="space-y-1"><Label>Inspection instructions</Label>
          <Textarea rows={2} value={point.description} onChange={(e) => setPoint((v) => ({ ...v, description: e.target.value }))} placeholder="How to inspect the part safely"/>
        </div>
        {point.method === 'instrument' && <>
          <div className="space-y-1"><Label>Parameter key</Label><Input value={point.parameterKey} onChange={(e) => setPoint((v) => ({ ...v, parameterKey: e.target.value }))} placeholder="temperature / pressure / vibration"/></div>
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1"><Label>Minimum</Label><Input type="number" step="any" value={point.min} onChange={(e) => setPoint((v) => ({ ...v, min: e.target.value }))}/></div>
            <div className="space-y-1"><Label>Maximum</Label><Input type="number" step="any" value={point.max} onChange={(e) => setPoint((v) => ({ ...v, max: e.target.value }))}/></div>
            <div className="space-y-1"><Label>Unit</Label><Input value={point.unit} onChange={(e) => setPoint((v) => ({ ...v, unit: e.target.value }))} placeholder="°C / bar"/></div>
          </div>
        </>}
        <p className="text-xs text-muted-foreground">Inspection points inherit the existing time-based or meter-based PM assignment. No third schedule frequency is added.</p>
      </div>
    </ResponsiveDialog>
  </Card>;
}

function Filter({ label, value, onChange, children, allOption = true }: {
  label: string; value: string; onChange: (value: string) => void;
  children: React.ReactNode; allOption?: boolean;
}) {
  return <div className="min-w-0 space-y-1"><Label className="text-xs">{label}</Label>
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-full min-w-0"><SelectValue/></SelectTrigger>
      <SelectContent>{allOption && <SelectItem value={ALL}>All</SelectItem>}{children}</SelectContent>
    </Select>
  </div>;
}
