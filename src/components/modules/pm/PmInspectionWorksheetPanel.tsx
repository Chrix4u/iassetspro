'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ClipboardCheck, Download, Gauge, Eye, Loader2, Plus, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { buildPmInspectionPageCsv } from '@/lib/pm-inspection-export';
import { PmMachineInspectionChecklistPanel } from './PmMachineInspectionChecklistPanel';
import { PmInspectionExceptionsPanel } from './PmInspectionExceptionsPanel';
import type { MachineChecklistTask, MachineInspectionState } from '@/lib/pm-machine-checklist';
import { useAuthStore } from '@/stores/authStore';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AsyncSearchableSelect, type SearchableOption } from '@/components/ui/searchable-select';
import { ResponsiveDialog } from '@/components/shared/ResponsiveDialog';

type InspectionMethod = 'visual' | 'measurement';
type Result = 'pass' | 'fail' | 'needs_attention';

interface InspectionPoint {
  id: string;
  name: string;
  description: string | null;
  inspectionType: string;
  parameterKey: string | null;
  normalRange: string | null;
  frequency: string;
  nextInspection: string | null;
  lastInspected: string | null;
  dueState: 'overdue' | 'due_today' | 'upcoming' | 'unscheduled';
  component: {
    id: string; name: string; componentCode: string; componentType: string;
    asset: { id: string; name: string; assetTag: string; plantId: string } | null;
  };
  latestRecord: {
    id: string; result: Result | 'not_measured'; value: string | null; findings: string | null; inspectedAt: string;
    workOrder: { id: string; woNumber: string; status: string } | null;
  } | null;
  openCorrectiveWorkOrder: { id: string; woNumber: string; status: string } | null;
}

interface ScheduledInspection {
  id: string;
  asset: { id: string; name: string; assetTag: string };
  component: { id: string; name: string; componentCode: string } | null;
  pmTask: { taskNumber: number; description: string; taskType: string };
  pmType: string;
  basis: 'calendar' | 'meter';
  nextDueDate: string | null;
  nextDueReading: number | null;
  currentReading: number | null;
  meterUnit: string | null;
  equipmentState: string;
  dueState: InspectionPoint['dueState'];
}

interface InspectionResponse {
  success: boolean;
  data?: InspectionPoint[];
  pagination?: { page: number; limit: number; total: number; totalPages: number };
  error?: string;
}

const emptyFilters = { search: '', departmentId: '', assetId: '', componentId: '', method: 'all', dueState: 'all', result: 'all', followUp: 'all' };
const DEFAULT_PLAN = { name: '', description: '', method: 'visual' as InspectionMethod, frequency: 'monthly', parameterKey: '', unit: '', min: '', max: '', nextInspection: '' };
const emptyRecord = { outcome: 'pass' as Result, value: '', findings: '', recommendation: '', requestKey: '' };

function readLimits(point: InspectionPoint) {
  try {
    const obj = JSON.parse(point.normalRange || '{}') as { min?: number; max?: number; unit?: string };
    return { min: obj.min ?? null, max: obj.max ?? null, unit: obj.unit || 'unit' };
  } catch {
    return { min: null, max: null, unit: 'unit' };
  }
}
function displayDue(value: string | null): string {
  if (!value) return 'Not scheduled';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('en-GB');
}
function badgeVariant(dueState: InspectionPoint['dueState']) {
  return dueState === 'overdue' ? 'destructive' as const : dueState === 'due_today' ? 'secondary' as const : 'outline' as const;
}
function dueLabel(value: InspectionPoint['dueState']) {
  return ({ overdue: 'Overdue', due_today: 'Due today', upcoming: 'Upcoming', unscheduled: 'Unscheduled' } as const)[value];
}

/** A generated, filterable technician inspection list sourced from approved machine-part points. */
export function PmInspectionWorksheetPanel() {
  const { hasPermission, isAdmin } = useAuthStore();
  const canPlan = isAdmin() || hasPermission('pm_schedules.create') || hasPermission('work_orders.create');
  const canRecord = isAdmin() || hasPermission('pm_schedules.update') || hasPermission('work_orders.update') || hasPermission('digital_twin.manage');
  const [filters, setFilters] = useState(emptyFilters);
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<InspectionPoint[]>([]);
  const [scheduledRows, setScheduledRows] = useState<ScheduledInspection[]>([]);
  const [scheduledDetail, setScheduledDetail] = useState<ScheduledInspection | null>(null);
  const [machineChecklistOpen, setMachineChecklistOpen] = useState(false);
  const [exceptionsOpen, setExceptionsOpen] = useState(false);
  const [machineInspectionState, setMachineInspectionState] = useState<MachineInspectionState>('running');
  const [machineChecklistRevision, setMachineChecklistRevision] = useState(0);
  const [scheduledWarning, setScheduledWarning] = useState('');
  const [total, setTotal] = useState(0);
  const [pageCount, setPageCount] = useState(1);
  const [loading, setLoading] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const [plan, setPlan] = useState(DEFAULT_PLAN);
  const [planAssetId, setPlanAssetId] = useState('');
  const [planComponentId, setPlanComponentId] = useState('');
  const [savingPlan, setSavingPlan] = useState(false);
  const [recordPoint, setRecordPoint] = useState<InspectionPoint | null>(null);
  const [record, setRecord] = useState(emptyRecord);
  const [savingRecord, setSavingRecord] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '50' });
      for (const [key, value] of Object.entries(filters)) {
        if (value && value !== 'all') params.set(key, value);
      }
      const response = await api.get<InspectionPoint[]>(`/api/pm-inspections?${params.toString()}`) as InspectionResponse;
      if (!response.success) throw new Error(response.error || 'Could not generate PM inspection list');
      setRows(Array.isArray(response.data) ? response.data : []);
      setTotal(response.pagination?.total || 0);
      setPageCount(response.pagination?.totalPages || 1);
      // Bring existing direct PM inspection assignments into this worksheet,
      // including those that have not yet had instrument/sight points configured.
      const scheduledParams = new URLSearchParams();
      if (filters.departmentId) scheduledParams.set('departmentId', filters.departmentId);
       if (filters.assetId) scheduledParams.set('assetId', filters.assetId);
      if (filters.componentId) scheduledParams.set('componentId', filters.componentId);
      if (filters.search) scheduledParams.set('search', filters.search);
      const scheduled = await api.get<ScheduledInspection[]>(`/api/pm-inspections/scheduled?${scheduledParams.toString()}`);
      if (scheduled.success && Array.isArray(scheduled.data)) {
        setScheduledRows(scheduled.data);
        setScheduledWarning('');
      } else {
        setScheduledRows([]);
        setScheduledWarning(scheduled.error || 'Scheduled PM tasks could not be loaded');
      }
    } catch (error) {
      setRows([]);
      setScheduledRows([]);
      toast.error(error instanceof Error ? error.message : 'Could not generate PM inspection list');
    } finally {
      setLoading(false);
    }
  }, [filters, page]);

  useEffect(() => { void refresh(); }, [refresh]);
  const updateFilters = (patch: Partial<typeof filters>) => {
    setPage(1);
    setFilters((current) => ({
       ...current, ...patch,
       ...('departmentId' in patch ? { assetId: '', componentId: '' } : 'assetId' in patch ? { componentId: '' } : {}),
     }));
  };

  const fetchDepartments = useCallback(async (search: string): Promise<SearchableOption[]> => {
    const response = await api.get<{ id: string; name: string; code: string }[]>('/api/departments');
    return response.success && Array.isArray(response.data)
      ? response.data.filter((department) => `${department.name} ${department.code}`.toLowerCase().includes(search.toLowerCase()))
        .slice(0, 100).map((department) => ({ value: department.id, label: `${department.name} [${department.code}]` })) : [];
  }, []);
  const fetchAssets = useCallback(async (search: string): Promise<SearchableOption[]> => {
    const params = new URLSearchParams({ limit: '100', search });
    if (filters.departmentId) params.set('departmentId', filters.departmentId);
    const response = await api.get<{ id: string; name: string; assetTag: string }[]>(`/api/assets?${params.toString()}`);
    return response.success && Array.isArray(response.data)
      ? response.data.map((asset) => ({ value: asset.id, label: `${asset.name} [${asset.assetTag}]` })) : [];
  }, [filters.departmentId]);
  const fetchFilterComponents = useCallback(async (search: string): Promise<SearchableOption[]> => {
    if (!filters.assetId) return [];
    const response = await api.get<{ id: string; name: string; componentCode: string }[]>(
      `/api/component-registry?assetId=${encodeURIComponent(filters.assetId)}&search=${encodeURIComponent(search)}&limit=100`);
    return response.success && Array.isArray(response.data)
      ? response.data.map((component) => ({ value: component.id, label: `${component.name} [${component.componentCode}]` })) : [];
  }, [filters.assetId]);
  const fetchComponents = useCallback(async (search: string): Promise<SearchableOption[]> => {
    if (!planAssetId) return [];
    const response = await api.get<{ id: string; name: string; componentCode: string }[]>(
      `/api/component-registry?assetId=${encodeURIComponent(planAssetId)}&search=${encodeURIComponent(search)}&limit=100`);
    return response.success && Array.isArray(response.data)
      ? response.data.map((component) => ({ value: component.id, label: `${component.name} [${component.componentCode}]` })) : [];
  }, [planAssetId]);

  const savePlan = async () => {
    if (!planComponentId || !plan.name.trim()) {
      toast.error('Choose a machine part and inspection description');
      return;
    }
    setSavingPlan(true);
    try {
      const response = await api.post('/api/pm-inspections', {
        componentId: planComponentId,
        name: plan.name.trim(),
        description: plan.description,
        inspectionType: plan.method,
        frequency: plan.frequency,
        parameterKey: plan.method === 'measurement' ? plan.parameterKey.trim() : null,
        unit: plan.method === 'measurement' ? plan.unit.trim() : null,
        min: plan.min.trim() ? Number(plan.min) : null,
        max: plan.max.trim() ? Number(plan.max) : null,
        nextInspection: plan.nextInspection || undefined,
      });
      if (!response.success) throw new Error(response.error || 'Could not save inspection plan');
      toast.success('Inspection point added to the generated inspection list');
      setPlanOpen(false);
      setPlan(DEFAULT_PLAN);
      setPlanAssetId('');
      setPlanComponentId('');
      await refresh();
      setMachineChecklistRevision((current) => current + 1);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save inspection plan');
    } finally { setSavingPlan(false); }
  };

  const saveRecord = async () => {
    if (!recordPoint) return;
    setSavingRecord(true);
    // Keep this key across network failures; regenerate it whenever the form changes.
    const requestKey = record.requestKey || crypto.randomUUID();
    if (!record.requestKey) setRecord((current) => ({ ...current, requestKey }));
    try {
      const response = await api.post<{
        record: { id: string; result: Result };
        workOrder: { id: string; woNumber: string; status: string } | null;
        reusedWorkOrder: boolean;
        nextInspection: string | null;
        awaitingCloseout: boolean;
        duplicate?: boolean;
      }>(`/api/pm-inspections/${encodeURIComponent(recordPoint.id)}/records`, { ...record, requestKey });
      if (!response.success) throw new Error(response.error || 'Could not record inspection');
      const wo = response.data?.workOrder;
      toast.success(response.data?.duplicate
        ? 'This inspection was already saved; no duplicate record was created.'
        : wo
          ? `Inspection recorded. ${wo.woNumber} ${response.data?.reusedWorkOrder ? 'remains open pending corrective closeout' : 'drafted for planner review'}.`
          : 'Inspection passed and next inspection date updated.');
      setRecordPoint(null);
      setRecord(emptyRecord);
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not record inspection');
    } finally { setSavingRecord(false); }
  };

  const exportVisiblePage = () => {
    if (rows.length === 0) return;
    try {
      const csv = buildPmInspectionPageCsv(rows);
      const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `pm-inspections-page-${page}-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      toast.error('Could not export this inspection page');
    }
  };

  const visibleScheduled = useMemo(
    () => scheduledRows.filter((task) => filters.dueState === 'all' || task.dueState === filters.dueState),
    [scheduledRows, filters.dueState],
  );
  const stats = useMemo(() => ({
    overdue: rows.filter((row) => row.dueState === 'overdue').length,
    due: rows.filter((row) => row.dueState === 'due_today').length,
    instrument: rows.filter((row) => row.inspectionType === 'measurement').length,
    openCorrective: rows.filter((row) => Boolean(row.openCorrectiveWorkOrder)).length,
  }), [rows]);

  return (
    <Card className="border-0 shadow-sm" data-testid="pm-inspection-worksheet">
      <CardHeader className="space-y-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base"><ClipboardCheck className="h-4 w-4 text-emerald-600"/>Action Lists & Inspection Readings</CardTitle>
            <CardDescription>Select a machine, print the inspection tasks and all their assigned parts, then enter the technician's measured values or written observations.</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => void refresh()} disabled={loading}>
              <RefreshCw className={`mr-1.5 h-4 w-4 ${loading ? 'animate-spin' : ''}`}/>Generate List
            </Button>
            <Button type="button" size="sm" variant={exceptionsOpen ? 'default' : 'outline'}
              aria-pressed={exceptionsOpen} onClick={() => {
                setExceptionsOpen((current) => !current);
                setMachineChecklistOpen(false);
              }}>
              <AlertTriangle className="mr-1.5 h-4 w-4"/>{exceptionsOpen ? 'Back to Inspection List' : 'Review Exceptions'}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={exportVisiblePage} disabled={loading || rows.length === 0} title="Export only the filtered inspection points shown on this page">
              <Download className="mr-1.5 h-4 w-4"/>Export Page CSV
            </Button>
            {canPlan && <Button size="sm" onClick={() => setPlanOpen(true)}><Plus className="mr-1 h-4 w-4"/>Plan Inspection</Button>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          <Badge variant="outline">{total} inspection points</Badge>
          <Badge variant="outline">{scheduledRows.length} scheduled PM inspection tasks</Badge>
          <Badge variant="outline">{stats.overdue} overdue on page</Badge>
          <Badge variant="outline">{stats.due} due today on page</Badge>
          <Badge variant="outline">{stats.instrument} instrument checks on page</Badge>
          <Badge variant="outline">{stats.openCorrective} open corrective WOs on page</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-lg border bg-muted/20 p-3 sm:p-4" data-testid="pm-inspection-generate-machine">
          <h3 className="text-sm font-semibold">Generate an inspection sheet for one machine</h3>
          <p className="mb-3 text-xs text-muted-foreground">
            1. Choose the machine. 2. Choose Running or Standstill. 3. Generate the sheet,
            then click Print Blank Action List. Every assigned part appears beneath its inspection task, with approved parameter limits.
          </p>
          <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,11rem)_auto] sm:items-end">
            <div className="min-w-0 space-y-1">
              <Label className="text-xs">Machine (name or code)</Label>
              <AsyncSearchableSelect value={filters.assetId} onValueChange={(assetId) => {
                setMachineChecklistOpen(false);
                updateFilters({ assetId });
              }} fetchOptions={fetchAssets} placeholder="Select machine..." />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Inspection type</Label>
              <Select value={machineInspectionState} onValueChange={(value) => {
                setMachineChecklistOpen(false);
                setMachineInspectionState(value as MachineInspectionState);
              }}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="running">Running</SelectItem>
                  <SelectItem value="standstill">Standstill / Stopped</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button type="button" className="h-9" disabled={!filters.assetId}
              onClick={() => { setExceptionsOpen(false); setMachineChecklistOpen(true); }}>
              <ClipboardCheck className="mr-1.5 h-4 w-4" />Generate Machine Sheet
            </Button>
          </div>
        </div>
        <div className={machineChecklistOpen ? 'hidden' : 'grid grid-cols-2 gap-2 xl:grid-cols-8'}>
          <div className="col-span-2 xl:col-span-1"><Label className="text-xs">Search</Label><Input className="mt-1 h-9" placeholder="Machine, part, parameter..." value={filters.search} onChange={(event) => updateFilters({ search: event.target.value })}/></div>
          <div className="col-span-2 xl:col-span-1"><Label className="text-xs">Department</Label><div className="mt-1"><AsyncSearchableSelect value={filters.departmentId} onValueChange={(departmentId) => updateFilters({ departmentId })} fetchOptions={fetchDepartments} placeholder="All departments"/></div></div>
          <div className="col-span-2 xl:col-span-1"><Label className="text-xs">Machine</Label><div className="mt-1"><AsyncSearchableSelect value={filters.assetId} onValueChange={(assetId) => updateFilters({ assetId })} fetchOptions={fetchAssets} placeholder="All machines"/></div></div>
          <div className="col-span-2 xl:col-span-1"><Label className="text-xs">Part / Instrument</Label><div className="mt-1"><AsyncSearchableSelect value={filters.componentId} onValueChange={(componentId) => updateFilters({ componentId })} fetchOptions={fetchFilterComponents} placeholder={filters.assetId ? 'All parts' : 'Select machine first'} disabled={!filters.assetId}/></div></div>
          <div><Label className="text-xs">Method</Label><Select value={filters.method} onValueChange={(method) => updateFilters({ method })}><SelectTrigger className="mt-1 h-9"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">All methods</SelectItem><SelectItem value="visual">Sight / Visual</SelectItem><SelectItem value="measurement">Instrument / Reading</SelectItem></SelectContent></Select></div>
          <div><Label className="text-xs">Due</Label><Select value={filters.dueState} onValueChange={(dueState) => updateFilters({ dueState })}><SelectTrigger className="mt-1 h-9"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">All due states</SelectItem><SelectItem value="overdue">Overdue</SelectItem><SelectItem value="due_today">Due Today</SelectItem><SelectItem value="upcoming">Upcoming</SelectItem><SelectItem value="unscheduled">Unscheduled</SelectItem></SelectContent></Select></div>
          <div className="col-span-2 xl:col-span-1"><Label className="text-xs">Recorded outcome (history)</Label><Select value={filters.result} onValueChange={(result) => updateFilters({ result })}><SelectTrigger className="mt-1 h-9"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">All outcomes</SelectItem><SelectItem value="not_inspected">Never inspected</SelectItem><SelectItem value="pass">Has passed</SelectItem><SelectItem value="fail">Has failed</SelectItem><SelectItem value="needs_attention">Needs attention</SelectItem><SelectItem value="not_measured">Not measurable — follow-up</SelectItem></SelectContent></Select></div>
          <div className="col-span-2 xl:col-span-1"><Label className="text-xs">Corrective follow-up</Label><Select value={filters.followUp} onValueChange={(followUp) => updateFilters({ followUp })}><SelectTrigger className="mt-1 h-9"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">All follow-ups</SelectItem><SelectItem value="open">Open corrective WO</SelectItem><SelectItem value="none">No open corrective WO</SelectItem></SelectContent></Select></div>
        </div>

        {exceptionsOpen && <PmInspectionExceptionsPanel
          assetId={filters.assetId}
          departmentId={filters.departmentId}
          reloadKey={machineChecklistRevision}
          onClose={() => setExceptionsOpen(false)}
        />}
        {!exceptionsOpen && <>
        {!machineChecklistOpen && (
          <p className="text-xs text-muted-foreground">
            The filters below also let you review individual inspection points and their saved history.
            For a full printable machine sheet, use the machine selector above.
          </p>
        )}

        {machineChecklistOpen && filters.assetId && (
          <PmMachineInspectionChecklistPanel
            key={`${filters.assetId}:${machineInspectionState}`}
            assetId={filters.assetId}
            equipmentState={machineInspectionState}
            canRecord={canRecord}
            canPlan={canPlan}
            reloadKey={machineChecklistRevision}
            onClose={() => setMachineChecklistOpen(false)}
            onRecorded={() => { void refresh(); }}
            onConfigure={(task: MachineChecklistTask) => {
              if (!task.componentId) return;
              setPlanAssetId(filters.assetId);
              setPlanComponentId(task.componentId);
              setPlan({
                ...DEFAULT_PLAN,
                name: task.pmTask.description,
                method: task.pmTask.taskType === 'measure' ? 'measurement' : 'visual',
              });
              setPlanOpen(true);
            }}
          />
        )}
        {!machineChecklistOpen && <>

        {loading && rows.length === 0 ? <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin"/>Generating inspection list…</div> : rows.length === 0 ?
          <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">No inspection points match these filters. Use <strong>Plan Inspection</strong> to define sight or instrument checks for a machine part.</div> :
          <div className="grid gap-2">
            {rows.map((point) => {
              const limits = readLimits(point);
              const latest = point.latestRecord;
              return (
                <div key={point.id} className="rounded-lg border p-3" data-testid="pm-inspection-point">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold">{point.component.asset?.name || 'Unassigned machine'}</span>
                        <span className="text-xs text-muted-foreground">{point.component.asset?.assetTag}</span>
                      </div>
                      <p className="break-words text-sm">{point.component.name} <span className="text-muted-foreground">({point.component.componentCode})</span> · <strong>{point.name}</strong></p>
                      {point.description && <p className="text-xs text-muted-foreground">{point.description}</p>}
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-1">
                      <Badge variant="outline">{point.inspectionType === 'measurement' ? <Gauge className="mr-1 h-3 w-3"/> : point.inspectionType === 'visual' ? <Eye className="mr-1 h-3 w-3"/> : <AlertTriangle className="mr-1 h-3 w-3"/>}{point.inspectionType === 'measurement' ? 'Instrument' : point.inspectionType === 'visual' ? 'Sight' : `Legacy (${point.inspectionType})`}</Badge>
                      <Badge variant={badgeVariant(point.dueState)}>{dueLabel(point.dueState)}</Badge>
                      {point.openCorrectiveWorkOrder && <Badge variant="secondary">Corrective pending</Badge>}
                    </div>
                  </div>
                  <div className="mt-2 grid gap-2 rounded-md bg-muted/30 p-2 text-xs sm:grid-cols-3">
                    <div><span className="text-muted-foreground">Parameter / acceptance</span><p className="font-medium">{point.inspectionType === 'measurement'
                      ? `${point.parameterKey}: ${limits.min ?? '—'} to ${limits.max ?? '—'} ${limits.unit}`
                      : point.inspectionType === 'visual' ? 'Observe condition, leaks, wear, noise or other visible defects' : 'Legacy method: configure a sight or instrument check to record here'}</p></div>
                    <div><span className="text-muted-foreground">Schedule</span><p className="font-medium">{point.frequency} · next {displayDue(point.nextInspection)}</p></div>
                    <div><span className="text-muted-foreground">Latest result</span><p className="font-medium">{latest
                      ? `${latest.result.replace('_', ' ')}${latest.value !== null ? ` · ${latest.value} ${limits.unit}` : ''}`
                      : 'Not inspected yet'}</p>
                      {point.openCorrectiveWorkOrder
                        ? <p className="break-words text-amber-700 dark:text-amber-300" role="status">
                            Outstanding corrective: {point.openCorrectiveWorkOrder.woNumber} · {point.openCorrectiveWorkOrder.status}.
                            Next inspection remains due until verified planner closeout.
                          </p>
                        : latest?.workOrder && <p className="text-muted-foreground">{latest.workOrder.woNumber} · {latest.workOrder.status}</p>}</div>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground">{latest ? `Recorded ${new Date(latest.inspectedAt).toLocaleDateString('en-GB')}` : 'Awaiting first inspection'}</span>
                    {point.inspectionType === 'visual' || point.inspectionType === 'measurement'
                      ? canRecord && <Button size="sm" variant="outline" onClick={() => { setRecordPoint(point); setRecord(emptyRecord); }}><ClipboardCheck className="mr-1.5 h-4 w-4"/>Record Inspection</Button>
                      : <div className="flex flex-wrap items-center justify-end gap-2">
                          <span className="text-xs text-amber-700 dark:text-amber-300">This legacy method cannot be recorded in the sight/instrument worksheet.</span>
                          {canPlan && point.component.asset && <Button size="sm" variant="outline" onClick={() => {
                            setPlanAssetId(point.component.asset!.id);
                            setPlanComponentId(point.component.id);
                            setPlan({ ...DEFAULT_PLAN, name: point.name, description: point.description || '' });
                            setPlanOpen(true);
                          }}>Configure Sight / Instrument</Button>}
                        </div>}
                  </div>
                </div>
              );
            })}
          </div>
        }
        <section className="space-y-2 border-t pt-4" aria-label="Scheduled inspection assignments">
          <div>
            <p className="text-sm font-semibold">Scheduled PM inspection tasks</p>
            <p className="text-xs text-muted-foreground">
              These are generated from active calendar- and meter-based PM assignments. Configure a sight or instrument point for the exact part before capturing readings.
            </p>
          </div>
          {scheduledWarning && <p className="text-xs text-amber-700">{scheduledWarning}</p>}
          {!scheduledWarning && visibleScheduled.length === 0 && <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">No scheduled inspection tasks match the machine/due filters.</p>}
          <div className="grid min-w-0 gap-2">
            {visibleScheduled.map((task) => (
              <div key={task.id} className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-lg border p-2.5 sm:p-3" data-testid="pm-scheduled-compact-row">
                <div className="min-w-0 space-y-1">
                  <p className="truncate text-sm font-semibold" title={task.asset.name}>{task.asset.name}</p>
                  <p className="truncate text-xs text-muted-foreground" title={`${task.component?.name || 'Whole machine'} · Task #${task.pmTask.taskNumber}: ${task.pmTask.description}`}>
                    {task.component?.name || 'Whole machine'} · Task #{task.pmTask.taskNumber}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {task.basis === 'meter'
                      ? `Meter ${task.currentReading ?? '—'} / ${task.nextDueReading ?? '—'} ${task.meterUnit || ''}`
                      : `Due ${displayDue(task.nextDueDate)}`}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <Badge variant={badgeVariant(task.dueState)}>{dueLabel(task.dueState)}</Badge>
                  <Button type="button" size="sm" variant="outline" className="h-8 px-3" onClick={() => setScheduledDetail(task)}>View</Button>
                </div>
              </div>
            ))}
          </div>
        </section>
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>Page {page} of {pageCount} · {total} matching points</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={page <= 1 || loading} onClick={() => setPage((p) => Math.max(1, p - 1))}>Previous</Button>
            <Button size="sm" variant="outline" disabled={page >= pageCount || loading} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        </div>
        </>}
        </>}
      </CardContent>

      <ResponsiveDialog
        open={Boolean(scheduledDetail)}
        onOpenChange={(open) => { if (!open) setScheduledDetail(null); }}
        title={scheduledDetail ? `PM task #${scheduledDetail.pmTask.taskNumber} · ${scheduledDetail.component?.name || 'Whole machine'}` : 'Scheduled PM inspection task'}
        description={scheduledDetail ? scheduledDetail.asset.name : ''}
        footer={<div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => setScheduledDetail(null)}>Close</Button>
          {canPlan && scheduledDetail?.component && <Button type="button" onClick={() => {
            setPlanAssetId(scheduledDetail.asset.id);
            setPlanComponentId(scheduledDetail.component!.id);
            setPlan({ ...DEFAULT_PLAN, name: scheduledDetail.pmTask.description, method: scheduledDetail.pmTask.taskType === 'measure' ? 'measurement' : 'visual' });
            setScheduledDetail(null);
            setPlanOpen(true);
          }}>Configure Check</Button>}
        </div>}>
        {scheduledDetail && (
          <div className="min-w-0 space-y-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={badgeVariant(scheduledDetail.dueState)}>{dueLabel(scheduledDetail.dueState)}</Badge>
              <Badge variant="outline">{scheduledDetail.basis === 'meter' ? 'Meter-based' : 'Calendar-based'}</Badge>
            </div>
            <dl className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
              <div><dt className="text-xs text-muted-foreground">Machine</dt><dd className="break-words font-medium">{scheduledDetail.asset.name}</dd><dd className="break-all text-xs text-muted-foreground">{scheduledDetail.asset.assetTag}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Part / component</dt><dd className="break-words font-medium">{scheduledDetail.component?.name || 'Whole machine'}</dd>{scheduledDetail.component && <dd className="break-all text-xs text-muted-foreground">{scheduledDetail.component.componentCode}</dd>}</div>
              <div><dt className="text-xs text-muted-foreground">PM type</dt><dd className="font-medium">{scheduledDetail.pmType.toUpperCase()}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Equipment state</dt><dd className="font-medium capitalize">{scheduledDetail.equipmentState.replace(/_/g, ' ')}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Next due</dt><dd className="font-medium">{scheduledDetail.basis === 'meter'
                ? `${scheduledDetail.nextDueReading ?? '—'} ${scheduledDetail.meterUnit || ''} (current: ${scheduledDetail.currentReading ?? '—'})`
                : displayDue(scheduledDetail.nextDueDate)}</dd></div>
            </dl>
            <div className="rounded-md bg-muted/30 p-3">
              <p className="text-xs font-semibold">Task #{scheduledDetail.pmTask.taskNumber} · {scheduledDetail.pmTask.taskType}</p>
              <p className="mt-1 break-words">{scheduledDetail.pmTask.description}</p>
            </div>
            {!scheduledDetail.component && <p className="rounded-md border border-amber-200 p-2 text-xs text-amber-700 dark:text-amber-300">Assign this PM task to a specific machine part before configuring sight or instrument readings.</p>}
          </div>
        )}
      </ResponsiveDialog>

      <ResponsiveDialog open={planOpen} onOpenChange={setPlanOpen} title="Plan a machine-part inspection"
        description="Define whether the inspector will use sight or an instrument, what to check, acceptable readings, and the next inspection date."
        footer={<div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setPlanOpen(false)} disabled={savingPlan}>Cancel</Button><Button onClick={() => void savePlan()} disabled={savingPlan}>{savingPlan ? 'Saving…' : 'Save Inspection Point'}</Button></div>}>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2"><Label>Machine</Label><AsyncSearchableSelect value={planAssetId} onValueChange={(value) => { setPlanAssetId(value); setPlanComponentId(''); }} fetchOptions={fetchAssets} placeholder="Choose parent machine" /></div>
          <div className="sm:col-span-2"><Label>Part / instrument</Label><AsyncSearchableSelect value={planComponentId} onValueChange={setPlanComponentId} fetchOptions={fetchComponents} placeholder={planAssetId ? 'Choose machine part' : 'Select machine first'} disabled={!planAssetId}/></div>
          <div className="sm:col-span-2"><Label>Inspection description</Label><Input value={plan.name} onChange={(e) => setPlan({ ...plan, name: e.target.value })} placeholder="Check pump seal for leaks"/></div>
          <div><Label>Inspection Method</Label><Select value={plan.method} onValueChange={(v) => setPlan({ ...plan, method: v as InspectionMethod })}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="visual">Sight / Visual</SelectItem><SelectItem value="measurement">Instrument / Reading</SelectItem></SelectContent></Select></div>
          <div><Label>Inspection interval</Label><Select value={plan.frequency} onValueChange={(frequency) => setPlan({ ...plan, frequency })}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{['hourly','daily','weekly','monthly','quarterly','annually'].map((frequency) => <SelectItem key={frequency} value={frequency}>{frequency}</SelectItem>)}</SelectContent></Select></div>
          {plan.method === 'measurement' && <>
            <div><Label>Parameter</Label><Input value={plan.parameterKey} onChange={(e) => setPlan({ ...plan, parameterKey: e.target.value })} placeholder="Pressure"/></div>
            <div><Label>Unit</Label><Input value={plan.unit} onChange={(e) => setPlan({ ...plan, unit: e.target.value })} placeholder="bar"/></div>
            <div><Label>Minimum acceptable</Label><Input type="number" step="any" value={plan.min} onChange={(e) => setPlan({ ...plan, min: e.target.value })}/></div>
            <div><Label>Maximum acceptable</Label><Input type="number" step="any" value={plan.max} onChange={(e) => setPlan({ ...plan, max: e.target.value })}/></div>
          </>}
          <div className="sm:col-span-2"><Label>First inspection due</Label><Input type="date" value={plan.nextInspection} onChange={(e) => setPlan({ ...plan, nextInspection: e.target.value })}/></div>
          <div className="sm:col-span-2"><Label>Instructions / sight-check criteria</Label><Textarea value={plan.description} onChange={(e) => setPlan({ ...plan, description: e.target.value })} placeholder="Where to inspect and what an acceptable condition looks like"/></div>
        </div>
      </ResponsiveDialog>

      <ResponsiveDialog open={Boolean(recordPoint)} onOpenChange={(open) => { if (!open && !savingRecord) setRecordPoint(null); }}
        title={recordPoint ? `Record: ${recordPoint.name}` : 'Record PM inspection'}
        description={recordPoint ? `${recordPoint.component.name} · ${recordPoint.inspectionType === 'measurement' ? 'Instrument reading' : 'Sight inspection'}` : ''}
        footer={<div className="flex justify-end gap-2"><Button variant="outline" disabled={savingRecord} onClick={() => setRecordPoint(null)}>Cancel</Button><Button disabled={savingRecord} onClick={() => void saveRecord()}>{savingRecord ? 'Recording…' : 'Save Inspection'}</Button></div>}>
        {recordPoint && <div className="space-y-3">
          {recordPoint.inspectionType === 'measurement' ? <>
            <p className="rounded-md bg-muted/40 p-2 text-xs">Parameter: <strong>{recordPoint.parameterKey}</strong> · Allowed range: {readLimits(recordPoint).min ?? '—'} to {readLimits(recordPoint).max ?? '—'} {readLimits(recordPoint).unit}</p>
            <div><Label>Measured value ({readLimits(recordPoint).unit})</Label><Input type="number" step="any" value={record.value} onChange={(e) => setRecord({ ...record, value: e.target.value, requestKey: '' })} placeholder="Enter instrument reading"/></div>
          </> : <p className="flex items-center gap-2 text-sm"><Eye className="h-4 w-4"/>Confirm the condition you observed visually.</p>}
          <div><Label>Inspection outcome</Label><Select value={record.outcome} onValueChange={(outcome) => setRecord({ ...record, outcome: outcome as Result, requestKey: '' })}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="pass">Pass</SelectItem><SelectItem value="needs_attention">Needs Attention</SelectItem><SelectItem value="fail">Fail</SelectItem></SelectContent></Select></div>
          <div><Label>Findings / defects</Label><Textarea value={record.findings} onChange={(e) => setRecord({ ...record, findings: e.target.value, requestKey: '' })} placeholder="Describe leakage, worn bearing, abnormal vibration or other findings"/></div>
          <div><Label>Recommended action</Label><Textarea value={record.recommendation} onChange={(e) => setRecord({ ...record, recommendation: e.target.value, requestKey: '' })} placeholder="Suggested corrective action for the planner"/></div>
          {record.outcome !== 'pass' && <p className="flex items-start gap-2 rounded-md border border-amber-200 p-2 text-xs text-amber-800 dark:text-amber-200"><AlertTriangle className="h-4 w-4 shrink-0"/>Defects create a draft corrective work order (or reuse an open one). The inspection remains due until verified closure.</p>}
        </div>}
      </ResponsiveDialog>
    </Card>
  );
}
