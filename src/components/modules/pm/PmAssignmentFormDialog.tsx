'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Gauge, Loader2, Plus, Wrench } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { AssetMetersPanel, type AssetMeterRecord } from '@/components/assets/AssetMetersPanel';
import { PmTargetTreePicker, type PmTargetAsset } from '@/components/modules/pm/PmTargetTreePicker';
import { ResponsiveDialog } from '@/components/shared/ResponsiveDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AsyncSearchableSelect } from '@/components/ui/searchable-select';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuthStore } from '@/stores/authStore';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

type PmTaskOption = { id: string; taskNumber: number; description: string; taskType: string };
type ConditionOption = { sourceType: string; sourceId: string; metric: string; unit: string; label: string; currentValue?: number | null };

const TIME_UNITS = ['minutes', 'hours', 'days', 'weeks', 'months', 'years'] as const;
const ACTIVITY_MODES = [
  ['inspection', 'Inspection'], ['lubrication', 'Lubrication'], ['servicing', 'Servicing'], ['replacement', 'Replacement'],
] as const;

export function PmAssignmentFormDialog({ open, onOpenChange, onSaved }: Props) {
  const hasPermission = useAuthStore((state) => state.hasPermission);
  const isAdmin = useAuthStore((state) => state.isAdmin);
  const canCreateMeter = isAdmin() || hasPermission('meters.create');
  const canRecordMeterReading = isAdmin() || hasPermission('meters.update') || canCreateMeter;
  const canManageMeter = canCreateMeter || canRecordMeterReading;
  const [assetId, setAssetId] = useState('');
  const [assetCache, setAssetCache] = useState<Record<string, PmTargetAsset>>({});
  const [componentId, setComponentId] = useState<string | null>(null);
  const [technicalPath, setTechnicalPath] = useState<Array<{ id: string; name: string; componentCode?: string | null }>>([]);
  const [pmTaskId, setPmTaskId] = useState('');
  const [pmType, setPmType] = useState<'tbm' | 'ubm' | 'cbm' | 'fbm'>('tbm');
  const [activityMode, setActivityMode] = useState('inspection');
  const [inspectionType, setInspectionType] = useState<'running' | 'standstill'>('standstill');
  const [value, setValue] = useState('1');
  const [unit, setUnit] = useState('months');
  const [assetMeterId, setAssetMeterId] = useState('');
  const [nextDueDate, setNextDueDate] = useState('');
  const [estimatedMinutes, setEstimatedMinutes] = useState('0');
  const [leadDays, setLeadDays] = useState('3');
  const [meters, setMeters] = useState<AssetMeterRecord[]>([]);
  const [metersLoading, setMetersLoading] = useState(false);
  const [showMeterManager, setShowMeterManager] = useState(false);
  const [conditions, setConditions] = useState<ConditionOption[]>([]);
  const [conditionKey, setConditionKey] = useState('');
  const [conditionOperator, setConditionOperator] = useState('>=');
  const [conditionThreshold, setConditionThreshold] = useState('');
  const [saving, setSaving] = useState(false);

  const asset = assetCache[assetId] || null;
  const selectedMeter = meters.find((meter) => meter.id === assetMeterId) || null;
  const selectedCondition = conditions.find((item) => `${item.sourceType}|||${item.sourceId}|||${item.metric}` === conditionKey) || null;
  const usesSubDayTime = pmType === 'tbm' && (unit === 'minutes' || unit === 'hours');

  const reset = useCallback(() => {
    setAssetId(''); setComponentId(null); setTechnicalPath([]); setPmTaskId('');
    setPmType('tbm'); setActivityMode('inspection'); setInspectionType('standstill');
    setValue('1'); setUnit('months'); setAssetMeterId(''); setNextDueDate('');
    setEstimatedMinutes('0'); setLeadDays('3'); setMeters([]); setShowMeterManager(false);
    setConditions([]); setConditionKey(''); setConditionOperator('>='); setConditionThreshold('');
  }, []);

  useEffect(() => { if (!open) reset(); }, [open, reset]);

  const fetchAssets = async (query: string) => {
    const response = await api.get(`/api/assets?search=${encodeURIComponent(query)}&limit=100`);
    if (!response.success || !Array.isArray(response.data)) return [];
    const next: Record<string, PmTargetAsset> = {};
    for (const item of response.data as any[]) {
      next[item.id] = {
        id: item.id, name: item.name, assetTag: item.assetTag, location: item.location,
        functionalLocation: item.functionalLocation, description: item.description, imageUrl: item.imageUrl,
        manufacturer: item.manufacturer, model: item.model, criticality: item.criticality,
        status: item.status, specification: item.specification,
      };
    }
    setAssetCache((current) => ({ ...current, ...next }));
    return (response.data as any[]).map((item) => ({ value: item.id, label: `${item.name} [${item.assetTag}]`, badge: item.status }));
  };

  const fetchTasks = async (query: string) => {
    const params = new URLSearchParams({ active: 'true' });
    if (query.trim()) params.set('search', query.trim());
    const response = await api.get<PmTaskOption[]>(`/api/pm-tasks?${params.toString()}`);
    if (!response.success || !Array.isArray(response.data)) return [];
    return response.data.map((task) => ({ value: task.id, label: `Task #${task.taskNumber} · ${task.description}`, badge: task.taskType }));
  };

  const loadMeters = useCallback(async () => {
    if (!assetId) { setMeters([]); return; }
    setMetersLoading(true);
    try {
      const response = await api.get<AssetMeterRecord[]>(`/api/assets/${encodeURIComponent(assetId)}/meters`);
      const rows = response.success && Array.isArray(response.data) ? response.data.filter((meter) => meter.isActive !== false) : [];
      setMeters(rows);
      setAssetMeterId((current) => current && rows.some((meter) => meter.id === current) ? current : (rows.length === 1 ? rows[0].id : ''));
    } catch { setMeters([]); }
    finally { setMetersLoading(false); }
  }, [assetId]);

  useEffect(() => { void loadMeters(); }, [loadMeters]);

  useEffect(() => {
    if (!assetId || pmType !== 'cbm') { setConditions([]); return; }
    const params = new URLSearchParams({ assetId });
    if (componentId) params.set('componentId', componentId);
    void api.get<ConditionOption[]>(`/api/pm-schedules/condition-sources?${params.toString()}`)
      .then((response) => setConditions(response.success && Array.isArray(response.data) ? response.data : []))
      .catch(() => setConditions([]));
  }, [assetId, componentId, pmType]);

  const dueState = useMemo(() => {
    const interval = Number(value);
    if (pmType === 'tbm') return nextDueDate ? `Calendar due ${nextDueDate.replace('T', ' ')}` : 'Calendar due date not set';
    if (pmType === 'ubm') return selectedMeter && interval > 0 ? `Meter due at ${Number(selectedMeter.currentValue) + interval} ${selectedMeter.unit}` : 'Select a meter and Value';
    if (pmType === 'cbm') return selectedCondition ? `Condition driven · ${selectedCondition.label}` : 'Condition driven';
    return 'Failure/event driven';
  }, [nextDueDate, pmType, selectedCondition, selectedMeter, value]);

  const save = async () => {
    if (!assetId || !pmTaskId) { toast.error('Asset and Task Library task are required'); return; }
    const numericValue = Number(value);
    const minutes = Number(estimatedMinutes || 0);
    const leads = usesSubDayTime ? 0 : Number(leadDays || 0);
    if (!Number.isInteger(minutes) || minutes < 0 || !Number.isInteger(leads) || leads < 0) { toast.error('Est. Minutes and Lead Days must be non-negative whole numbers'); return; }
    if (pmType === 'tbm' && (!Number.isInteger(numericValue) || numericValue <= 0 || !nextDueDate)) { toast.error('TBM requires a positive whole Value and Next Due Date'); return; }
    if (pmType === 'ubm' && (!(numericValue > 0) || !assetMeterId)) { toast.error('UBM requires a positive Value and an assigned asset meter'); return; }
    if (pmType === 'cbm' && selectedCondition && !Number.isFinite(Number(conditionThreshold))) { toast.error('CBM threshold must be numeric'); return; }

    const payload: Record<string, unknown> = {
      assetId, componentId, pmTaskId, pmType, activityMode, inspectionType,
      estimatedMinutes: minutes, leadDays: leads,
      value: pmType === 'tbm' || pmType === 'ubm' ? numericValue : null,
      unit: pmType === 'tbm' ? unit : null,
      assetMeterId: pmType === 'ubm' ? assetMeterId : null,
      nextDueDate: pmType === 'tbm' ? nextDueDate : null,
      isActive: true,
    };
    if (pmType === 'cbm' && selectedCondition) {
      Object.assign(payload, {
        conditionSourceType: selectedCondition.sourceType,
        conditionSourceId: selectedCondition.sourceId,
        conditionMetric: selectedCondition.metric,
        conditionUnit: selectedCondition.unit,
        conditionOperator,
        conditionThreshold: Number(conditionThreshold),
      });
    }

    setSaving(true);
    try {
      const response = await api.post('/api/pm-assignments', payload);
      if (!response.success) throw new Error(response.error || 'Failed to create PM assignment');
      toast.success('PM assignment created');
      onOpenChange(false);
      onSaved?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create PM assignment');
    } finally { setSaving(false); }
  };

  const basisLabel = pmType === 'tbm' ? 'Calendar' : pmType === 'ubm' ? 'Meter' : pmType === 'cbm' ? 'Condition' : 'Failure';

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      size="extra-wide"
      title="New PM Assignment"
      description="Assign one Task Library task directly to a machine or exact maintainable node. No schedule title is required."
      footer={<div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="button" onClick={save} disabled={saving}>{saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}Create PM Assignment</Button></div>}
    >
      <div className="space-y-4 py-1">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1.5"><Label className="text-xs font-semibold">Asset *</Label><AsyncSearchableSelect value={assetId} onValueChange={(id) => { setAssetId(id); setComponentId(null); setTechnicalPath([]); setAssetMeterId(''); }} fetchOptions={fetchAssets} placeholder="Select machine / asset..." searchPlaceholder="Search asset name or tag..." /></div>
          <div className="space-y-1.5"><Label className="text-xs font-semibold">Task Library *</Label><AsyncSearchableSelect value={pmTaskId} onValueChange={setPmTaskId} fetchOptions={fetchTasks} placeholder="Select Task Library task..." searchPlaceholder="Search Task # or description..." /></div>
        </div>

        <div><Label className="mb-1.5 block text-xs font-semibold">PM Target</Label><PmTargetTreePicker asset={asset} componentId={componentId} technicalPath={technicalPath} onChange={(id, path) => { setComponentId(id); setTechnicalPath(path); }} /></div>

        <div className="grid gap-2 rounded-lg border bg-muted/10 p-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1"><Label className="text-[10px] font-semibold uppercase text-muted-foreground">PM Type</Label><Select value={pmType} onValueChange={(next) => { setPmType(next as typeof pmType); if (next !== 'tbm') setNextDueDate(''); if (next !== 'ubm') setAssetMeterId(''); }}><SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="tbm">TBM · Time Based</SelectItem><SelectItem value="ubm">UBM · Usage Based</SelectItem><SelectItem value="cbm">CBM · Condition Based</SelectItem><SelectItem value="fbm">FBM · Failure Based</SelectItem></SelectContent></Select></div>
          <div className="space-y-1"><Label className="text-[10px] font-semibold uppercase text-muted-foreground">Basis</Label><div className="flex h-8 items-center rounded-md border bg-background px-2.5 text-xs font-medium">{basisLabel}</div></div>
          <div className="space-y-1"><Label className="text-[10px] font-semibold uppercase text-muted-foreground">Activity Mode</Label><Select value={activityMode} onValueChange={setActivityMode}><SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger><SelectContent>{ACTIVITY_MODES.map(([id, label]) => <SelectItem key={id} value={id}>{label}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1"><Label className="text-[10px] font-semibold uppercase text-muted-foreground">Inspection Type</Label><Select value={inspectionType} onValueChange={(next) => setInspectionType(next as typeof inspectionType)}><SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="running">Running</SelectItem><SelectItem value="standstill">Standstill</SelectItem></SelectContent></Select></div>
        </div>

        {(pmType === 'tbm' || pmType === 'ubm') && (
          <div className="grid gap-2 rounded-lg border p-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1"><Label className="text-[10px] font-semibold uppercase text-muted-foreground">Value</Label><Input className="h-8 text-xs" type="number" min="0.000001" step={pmType === 'tbm' ? '1' : 'any'} value={value} onChange={(event) => setValue(event.target.value)} /></div>
            {pmType === 'tbm' ? <div className="space-y-1"><Label className="text-[10px] font-semibold uppercase text-muted-foreground">Unit</Label><Select value={unit} onValueChange={(next) => { setUnit(next); if (next === 'minutes' || next === 'hours') setLeadDays('0'); }}><SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger><SelectContent>{TIME_UNITS.map((item) => <SelectItem key={item} value={item}>{item[0].toUpperCase() + item.slice(1)}</SelectItem>)}</SelectContent></Select></div> : <div className="space-y-1"><Label className="text-[10px] font-semibold uppercase text-muted-foreground">Asset Meter / Unit</Label><Select value={assetMeterId} onValueChange={setAssetMeterId} disabled={metersLoading || meters.length === 0}><SelectTrigger className="h-8 text-xs"><SelectValue placeholder={metersLoading ? 'Loading…' : 'Select meter'} /></SelectTrigger><SelectContent>{meters.map((meter) => <SelectItem key={meter.id} value={meter.id}>{meter.name} · {meter.unit}</SelectItem>)}</SelectContent></Select>{selectedMeter && <p className="text-[9px] text-muted-foreground">Current {Number(selectedMeter.currentValue)} {selectedMeter.unit} · Unit inherited: {selectedMeter.unit}</p>}</div>}
            {pmType === 'tbm' ? <div className="space-y-1"><Label className="text-[10px] font-semibold uppercase text-muted-foreground">Next Due Date</Label><Input className="h-8 text-xs" type={usesSubDayTime ? 'datetime-local' : 'date'} value={nextDueDate} onChange={(event) => setNextDueDate(event.target.value)} /></div> : <div className="space-y-1"><Label className="text-[10px] font-semibold uppercase text-muted-foreground">Meter Action</Label>{canManageMeter ? <Button type="button" variant="outline" size="sm" className="h-8 w-full text-xs" onClick={() => setShowMeterManager((current) => !current)} disabled={!assetId}><Plus className="mr-1 h-3.5 w-3.5" />{canCreateMeter ? 'Add Meter' : 'Manage Meter'}</Button> : <div className="flex h-8 items-center rounded-md border bg-muted/20 px-2 text-[10px] text-muted-foreground">Read-only meter access</div>}</div>}
            <div className="space-y-1"><Label className="text-[10px] font-semibold uppercase text-muted-foreground">Lead Days</Label><Input className="h-8 text-xs" type="number" min="0" step="1" value={usesSubDayTime ? '0' : leadDays} disabled={usesSubDayTime} onChange={(event) => setLeadDays(event.target.value)} /></div>
          </div>
        )}

        {pmType === 'cbm' && <div className="grid gap-2 rounded-lg border p-3 sm:grid-cols-2 lg:grid-cols-3"><div className="space-y-1 lg:col-span-2"><Label className="text-[10px] font-semibold uppercase text-muted-foreground">Condition Source</Label><Select value={conditionKey} onValueChange={(key) => { setConditionKey(key); const source = conditions.find((item) => `${item.sourceType}|||${item.sourceId}|||${item.metric}` === key); if (source?.currentValue != null) setConditionThreshold(String(source.currentValue)); }}><SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select available signal" /></SelectTrigger><SelectContent>{conditions.map((item) => { const key = `${item.sourceType}|||${item.sourceId}|||${item.metric}`; return <SelectItem key={key} value={key}>{item.label} · {item.unit}</SelectItem>; })}</SelectContent></Select></div><div className="grid grid-cols-[8rem_minmax(0,1fr)] gap-2"><div className="space-y-1"><Label className="text-[10px] font-semibold uppercase text-muted-foreground">Operator</Label><Select value={conditionOperator} onValueChange={setConditionOperator}><SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger><SelectContent>{['>','>=','<','<=','='].map((op) => <SelectItem key={op} value={op}>{op}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1"><Label className="text-[10px] font-semibold uppercase text-muted-foreground">Threshold</Label><Input className="h-8 text-xs" type="number" step="any" value={conditionThreshold} onChange={(event) => setConditionThreshold(event.target.value)} /></div></div></div>}

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1"><Label className="text-[10px] font-semibold uppercase text-muted-foreground">Est. Minutes</Label><Input className="h-8 text-xs" type="number" min="0" step="1" value={estimatedMinutes} onChange={(event) => setEstimatedMinutes(event.target.value)} /></div>
          <div className="rounded-md border bg-muted/15 p-2 sm:col-span-1 lg:col-span-2"><p className="text-[10px] font-semibold uppercase text-muted-foreground">Due State</p><p className="mt-1 text-xs font-medium">{dueState}</p></div>
        </div>

        {pmType === 'ubm' && meters.length === 0 && !metersLoading && <div className="rounded-md border border-amber-300 bg-amber-50/60 p-2 text-xs text-amber-800">No first-class meter is assigned to this asset. {canCreateMeter ? 'Use Add Meter to define one before saving UBM.' : 'A meter-authorized user must define one before this UBM assignment can be saved.'}</div>}
        {showMeterManager && assetId && canManageMeter && <AssetMetersPanel assetId={assetId} compact canCreate={canCreateMeter} canRecordReading={canRecordMeterReading} onChanged={() => void loadMeters()} />}
        <div className="flex items-start gap-2 rounded-lg border bg-muted/15 p-2.5 text-[10px] text-muted-foreground"><Wrench className="mt-0.5 h-3.5 w-3.5 shrink-0" /><p>Each assignment owns its recurrence and exact technical target. Work-order priority, team and materials remain execution planning concerns.</p></div>
      </div>
    </ResponsiveDialog>
  );
}
