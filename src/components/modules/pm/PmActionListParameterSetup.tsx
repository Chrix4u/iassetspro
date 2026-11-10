'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Layers, Loader2, Plus, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { parseInspectionLimits } from '@/lib/pm-inspection';
import { actionListAcceptance } from '@/lib/pm-action-list-parameters';
import { ACTION_LIST_PARAMETER_PRESETS, type ActionListParameterMethod } from '@/lib/pm-action-list-parameters';
import { ResponsiveDialog } from '@/components/shared/ResponsiveDialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

type Part = {
  id: string; name: string; componentCode: string; componentType: string; parentId: string | null;
  taskIds: string[];
  parameters: { parameterKey: string | null; name: string; inspectionType: string; normalRange: string | null }[];
};
type Task = { id: string; taskNumber: number; description: string; assignedPartCount: number };
type ResponseData = {
  machine: { id: string; name: string; assetTag: string }; parts: Part[]; tasks: Task[];
  pagination: { page: number; total: number; pageCount: number };
};
type Draft = {
  rowId: string; key: string; name: string; method: ActionListParameterMethod;
  unit: string; min: string; max: string; acceptance: string;
};
function configuredParameterText(point: Part['parameters'][number]): string {
  if (point.inspectionType === 'visual') {
    return point.name + ': ' + (actionListAcceptance(point.normalRange) || 'Visual criterion not set');
  }
  const limits = parseInspectionLimits(point.normalRange);
  return point.name + ': '
    + (limits.min === null ? '' : 'min ' + limits.min + ' ')
    + (limits.max === null ? 'max NOT SET' : 'max ' + limits.max)
    + (limits.unit ? ' ' + limits.unit : '');
}

const newPreset = (key: string): Draft => {
  const preset = ACTION_LIST_PARAMETER_PRESETS.find(item => item.key === key);
  if (preset) return { rowId: crypto.randomUUID(), key: preset.key,
    name: preset.name, method: preset.method, unit: preset.unit,
    min: '', max: '', acceptance: '' };
  return { rowId: crypto.randomUUID(), key: '', name: '',
    method: 'measurement', unit: '', min: '', max: '', acceptance: '' };
};

/** Reuse one approved parameter set across selected parts of the SAME machine and PM task. */
export function PmActionListParameterSetup({ assetId, equipmentState, open, onClose, onSaved }: {
  assetId: string; equipmentState: 'running' | 'standstill'; open: boolean; onClose: () => void; onSaved: () => void;
}) {
  const [data, setData] = useState<ResponseData | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selectedTask, setSelectedTask] = useState('');
  const [partIds, setPartIds] = useState<string[]>([]);
  const [rows, setRows] = useState<Draft[]>([]);
  const [frequency, setFrequency] = useState('monthly');
  const [addKey, setAddKey] = useState('temperature');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reviseUnused, setReviseUnused] = useState(false);
  const [error, setError] = useState('');
  const [savedSummary, setSavedSummary] = useState('');
  const load = useCallback(async () => {
    if (!open || !assetId) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ assetId, equipmentState, page: String(page) });
      if (search.trim()) params.set('search', search.trim());
      const response = await api.get<ResponseData>(`/api/pm-inspections/parameter-assignments?${params}`);
      if (!response.success || !response.data) throw new Error(response.error || 'Unable to load registered parts');
      setData(response.data);
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load registered parts');
    } finally { setLoading(false); }
  }, [assetId, equipmentState, open, page, search]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!open) {
      setSelectedTask(''); setPartIds([]); setRows([]); setSearch('');
      setPage(1); setSavedSummary(''); setError(''); setReviseUnused(false);
    }
  }, [open]);

  const eligible = useMemo(() =>
    data?.parts.filter(part => Boolean(selectedTask) && part.taskIds.includes(selectedTask)) || [],
  [data, selectedTask]);
  const eligibleIds = eligible.map(part => part.id);
  const selectedOnPage = eligibleIds.filter(id => partIds.includes(id));
  const changeDraft = (id: string, patch: Partial<Draft>) =>
    setRows(current => current.map(row => row.rowId === id ? { ...row, ...patch } : row));
  const add = () => {
    if (rows.length >= 12) { setError('You can assign at most 12 different parameters per batch'); return; }
    const value = addKey === 'custom' ? newPreset('') : newPreset(addKey);
    if (value.key && rows.some(row => row.key === value.key)) {
      setError(value.name + ' is already selected'); return;
    }
    setRows(current => [...current, value]);
    setError('');
  };
  const apply = async () => {
    if (!selectedTask || !partIds.length || !rows.length) {
      setError('Select the exact PM task, at least one of its parts and a parameter'); return;
    }
    setSaving(true); setError('');
    try {
      const response = await api.post<{
        created: number; reused: number; updated: number; mapped: number; conflicted: number; conflicts: string[];
      }>('/api/pm-inspections/parameter-assignments', {
        assetId, equipmentState, pmTaskId: selectedTask, componentIds: partIds, frequency, reviseUnused,
        parameters: rows.map(row => ({
          key: row.key.trim().toLowerCase(), name: row.name.trim(), method: row.method,
          unit: row.method === 'measurement' ? row.unit.trim() : '',
          min: row.method === 'measurement' && row.min.trim() ? Number(row.min) : null,
          max: row.method === 'measurement' && row.max.trim() ? Number(row.max) : null,
          acceptance: row.method === 'visual' ? row.acceptance.trim() : '',
        })),
      });
      if (!response.success || !response.data) throw new Error(response.error || 'Could not assign parameters');
      const { created, reused, updated, conflicted, conflicts } = response.data;
      setSavedSummary(`${created} new checkpoints configured; ${reused} reused; ${updated} reviewed limits updated; ${conflicted} conflicts skipped.`);
      if (conflicts.length) setError('Existing limits were not overwritten: ' + conflicts.slice(0, 5).join('; '));
      await load();
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to assign parameters');
    } finally { setSaving(false); }
  };

  return <ResponsiveDialog open={open} onOpenChange={(next) => { if (!next && !saving) onClose(); }}
    title="Assign Action List parameters to machine parts"
    description="Select an existing PM task and the exact parts it covers. Apply approved instrument limits or visual acceptance criteria to many common parts together."
    footer={<div className="flex flex-wrap justify-end gap-2">
      <Button variant="outline" onClick={onClose} disabled={saving}>Close</Button>
      <Button onClick={() => void apply()} disabled={saving || !selectedTask || !partIds.length || !rows.length}>
        {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin"/> : <Layers className="mr-1 h-4 w-4"/>}
        Assign to {partIds.length} part{partIds.length === 1 ? '' : 's'}
      </Button>
    </div>}>
    <div className="max-h-[68vh] min-w-0 space-y-4 overflow-y-auto p-1" data-testid="pm-action-list-parameter-setup">
      {error && <p role="alert" className="rounded-md border border-amber-400 p-2 text-sm text-amber-700 dark:text-amber-300">{error}</p>}
      {savedSummary && <p role="status" className="rounded-md border p-2 text-sm">{savedSummary}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label>Assigned inspection task</Label>
          <Select value={selectedTask} onValueChange={(taskId) => { setSelectedTask(taskId); setPartIds([]); }}>
            <SelectTrigger aria-label="PM task for parameter assignment"><SelectValue placeholder="Choose the PM inspection task"/></SelectTrigger>
            <SelectContent>{data?.tasks.map(task => <SelectItem key={task.id} value={task.id}>
              #{task.taskNumber} {task.description} ({task.assignedPartCount} parts)
            </SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1"><Label>Checkpoint review interval</Label>
          <Select value={frequency} onValueChange={setFrequency}>
            <SelectTrigger aria-label="Checkpoint review interval"><SelectValue/></SelectTrigger>
            <SelectContent>{['daily','weekly','monthly','quarterly','annually','hourly'].map(item =>
              <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Only parts already assigned to the selected PM task can be linked. A common parameter can be reused across selected parts,
        but each part retains its own checkpoint and inspection history. Checkpoint dates follow the PM assignment;
        this configuration does not change PM schedules.
      </p>
      <div className="space-y-2 rounded-lg border p-2.5">
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[190px] flex-1 space-y-1"><Label>Find machine parts (name or code)</Label>
            <Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Bearing, shaft, motor..."/></div>
          <Button variant="outline" size="sm" disabled={!eligible.length} onClick={() =>
            setPartIds(current => [...new Set([...current, ...eligibleIds])])}>Select eligible on page</Button>
          <Button variant="outline" size="sm" onClick={() =>
            setPartIds(current => current.filter(id => !eligibleIds.includes(id)))}>Clear page</Button>
        </div>
        <div className="max-h-48 space-y-1 overflow-y-auto" aria-label="Registered machine parts">
          {loading && <p className="text-xs">Loading machine parts…</p>}
          {!loading && data?.parts.map(part => {
            const allowed = Boolean(selectedTask && part.taskIds.includes(selectedTask));
            return <label key={part.id} className="flex cursor-pointer items-start gap-2 rounded p-1.5 text-xs hover:bg-muted/50">
              <Checkbox checked={partIds.includes(part.id)} disabled={!allowed}
                onCheckedChange={(checked) => setPartIds(current => checked
                  ? [...new Set([...current, part.id])] : current.filter(id => id !== part.id))}/>
              <span className="min-w-0 flex-1 break-words">
                <strong>{part.componentCode}</strong> · {part.name} <span className="text-muted-foreground">({part.componentType})</span>
                {!allowed && <span className="ml-1 text-amber-700">PM task not assigned</span>}
                {part.parameters.length > 0 && <span className="block text-muted-foreground">
                  Configured parameters / approved limits: {part.parameters.map(configuredParameterText).join('; ')}
                </span>}
              </span>
            </label>;
          })}
          {!loading && !data?.parts.length && <p className="text-xs">No registered machine parts match this search.</p>}
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{partIds.length} parts selected · {selectedOnPage.length} on current page</span>
          {data && <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
            <span>{page}/{Math.max(1, data.pagination.pageCount)}</span>
            <Button variant="outline" size="sm" disabled={page >= data.pagination.pageCount} onClick={() => setPage(p => p + 1)}>Next</Button>
          </div>}
        </div>
      </div>
      <div className="space-y-2 rounded-lg border p-2.5">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div><h4 className="text-sm font-semibold">Inspection parameters and approved limits</h4>
            <p className="text-xs text-muted-foreground">No suggested numerical limits: use the machine manufacturer's approved values.</p></div>
          <div className="flex gap-2">
            <Select value={addKey} onValueChange={setAddKey}>
              <SelectTrigger className="min-w-[140px]" aria-label="Parameter preset"><SelectValue/></SelectTrigger>
              <SelectContent>{ACTION_LIST_PARAMETER_PRESETS.map(preset => <SelectItem key={preset.key} value={preset.key}>{preset.name}</SelectItem>)}
                <SelectItem value="custom">Custom parameter</SelectItem></SelectContent>
            </Select>
            <Button size="sm" variant="outline" onClick={add}><Plus className="mr-1 h-4 w-4"/>Add</Button>
          </div>
        </div>
        {!rows.length && <p className="text-xs text-muted-foreground">Add Temperature, Vibration, Sound, Corrosion or another approved parameter.</p>}
        {rows.map(row => <div key={row.rowId} className="grid gap-2 rounded-lg border p-2 sm:grid-cols-2" data-testid="pm-action-list-parameter-row">
          <div className="flex items-end gap-2">
            <div className="min-w-0 flex-1 space-y-1"><Label>Parameter key</Label>
              <Input value={row.key} onChange={e => changeDraft(row.rowId, { key:e.target.value.toLowerCase().replace(/\s+/g,'_') })}
                placeholder="e.g. corrosion"/></div>
            <Button size="icon" variant="ghost" aria-label="Remove parameter" onClick={() =>
              setRows(current => current.filter(item => item.rowId !== row.rowId))}><Trash2 className="h-4 w-4"/></Button>
          </div>
          <div className="space-y-1"><Label>Parameter name</Label>
            <Input value={row.name} onChange={e => changeDraft(row.rowId,{name:e.target.value})} placeholder="Temperature"/></div>
          <div className="space-y-1"><Label>Inspection type</Label>
            <Select value={row.method} onValueChange={value => changeDraft(row.rowId,{
              method: value as ActionListParameterMethod, unit:'', min:'', max:'', acceptance:'',
            })}><SelectTrigger><SelectValue/></SelectTrigger>
              <SelectContent><SelectItem value="measurement">Instrument</SelectItem><SelectItem value="visual">Visual</SelectItem></SelectContent>
            </Select>
          </div>
          {row.method === 'measurement' ? <>
            <div className="space-y-1"><Label>Instrument unit</Label><Input value={row.unit}
              onChange={e => changeDraft(row.rowId,{unit:e.target.value})} placeholder="°C, mm/s, dB(A)"/></div>
            <div className="space-y-1"><Label>Approved minimum (optional)</Label>
              <Input type="number" step="any" value={row.min} onChange={e => changeDraft(row.rowId,{min:e.target.value})}/></div>
            <div className="space-y-1"><Label>Approved maximum (required if min blank)</Label>
              <Input type="number" step="any" value={row.max} onChange={e => changeDraft(row.rowId,{max:e.target.value})}
                placeholder="Enter engineer-approved maximum"/></div>
          </> : <div className="space-y-1 sm:col-span-2"><Label>Acceptable visual condition / maximum severity</Label>
            <Textarea value={row.acceptance} onChange={e => changeDraft(row.rowId,{acceptance:e.target.value})}
              placeholder="E.g. no visible rust, pitting, or coating loss; describe location and severity of any corrosion"/></div>}
        </div>)}
        <label className="flex cursor-pointer items-start gap-2 rounded-md border p-2 text-xs">
          <Checkbox checked={reviseUnused} onCheckedChange={checked => setReviseUnused(checked === true)}/>
          <span>Allow an explicit limit/criterion revision only for checkpoints with <strong>no saved inspection readings</strong>.
            Existing historic readings and their original outcomes remain protected.</span>
        </label>
        <div className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-300">
          <AlertTriangle className="h-4 w-4 shrink-0"/>
          If an existing part has different limits, its values are preserved and reported as a conflict, not silently overwritten.
          Use a reviewed revision to change a calibrated threshold.
        </div>
      </div>
    </div>
  </ResponsiveDialog>;
}
