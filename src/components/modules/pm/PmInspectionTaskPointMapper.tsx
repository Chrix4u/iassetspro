'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { ResponsiveDialog } from '@/components/shared/ResponsiveDialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { InspectionTaskPointLink } from '@/lib/pm-task-point-scope';

interface Task { id: string; taskNumber: number; description: string }
interface Point { id: string; name: string; inspectionType: string; parameterKey: string | null; normalRange: string | null }
interface MappingData {
  componentId: string;
  assetId: string;
  tasks: Task[];
  points: Point[];
  links: InspectionTaskPointLink[];
  mappingComplete: boolean;
}

/** Explicit, audited planner mapping. Never auto-select all part checks for multiple PM tasks. */
export function PmInspectionTaskPointMapper({
  componentId, componentCode, onClose, onSaved,
}: {
  componentId: string | null;
  componentCode: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [data, setData] = useState<MappingData | null>(null);
  const [selectedTask, setSelectedTask] = useState('');
  const [selection, setSelection] = useState<string[]>([]);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(async (partId: string) => {
    const query = new URLSearchParams({ componentId: partId });
    const response = await api.get<MappingData>('/api/pm-inspections/task-point-links?' + query);
    if (!response.success || !response.data) throw new Error(response.error || 'Could not load task/check links');
    return response.data;
  }, []);
  useEffect(() => {
    let active = true;
    setData(null);
    setSelectedTask('');
    setSelection([]);
    setFilter('');
    setError('');
    if (!componentId) return;
    setLoading(true);
    void load(componentId).then((next) => {
      if (!active) return;
      setData(next);
      const id = next.tasks[0]?.id || '';
      setSelectedTask(id);
      setSelection(next.links.filter((link) => link.pmTaskId === id).map((link) => link.inspectionPointId));
    }).catch((caught) => {
      if (active) setError(caught instanceof Error ? caught.message : 'Unable to load mapping');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [componentId, load]);

  const chooseTask = (taskId: string) => {
    if (saving || !data) return;
    setSelectedTask(taskId);
    setSelection(data.links.filter((link) => link.pmTaskId === taskId).map((link) => link.inspectionPointId));
  };
  const togglePoint = (id: string, checked: boolean) => {
    setSelection((current) => checked ? [...current.filter((value) => value !== id), id]
      : current.filter((value) => value !== id));
  };
  const filtered = useMemo(() => data?.points.filter((point) =>
    [point.name, point.parameterKey || '', point.inspectionType].some((value) =>
      value.toLowerCase().includes(filter.trim().toLowerCase()))) || [], [data, filter]);
  const selected = data?.tasks.find((task) => task.id === selectedTask);
  const mappedTasks = data?.tasks.filter((task) => data.links.some((link) => link.pmTaskId === task.id)).length || 0;

  const save = async () => {
    if (!data || !componentId || !selectedTask || saving) return;
    if (selection.length === 0 && !window.confirm(
      'Save without any inspection checks for this task? It will remain unconfigured on shared parts.'
    )) return;
    setSaving(true);
    try {
      const response = await api.put('/api/pm-inspections/task-point-links', {
        componentId, pmTaskId: selectedTask, pointIds: selection,
      });
      if (!response.success) throw new Error(response.error || 'Could not save inspection check mapping');
      setData((current) => current ? ({
        ...current,
        links: [
          ...current.links.filter((link) => link.pmTaskId !== selectedTask),
          ...selection.map((inspectionPointId) => ({ pmTaskId: selectedTask, inspectionPointId })),
        ],
      }) : current);
      toast.success('Inspection task/check mapping saved and audited');
      onSaved();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : 'Unable to save task/check mapping');
    } finally { setSaving(false); }
  };

  return <ResponsiveDialog open={Boolean(componentId)} size="wide"
    onOpenChange={(open) => { if (!open && !saving) onClose(); }}
    title="Assign actual inspection checks to each PM task"
    description={componentCode ? `Registered part: ${componentCode}. Each task must have the right sight or instrument checks.` : undefined}
    footer={<div className="flex w-full items-center justify-between gap-2">
      <Button variant="outline" onClick={onClose} disabled={saving}>Close</Button>
      <Button onClick={() => void save()} disabled={loading || saving || !selected || !data?.points.length}>
        {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
        Save task/check associations
      </Button>
    </div>}>
    <div className="min-w-0 space-y-4 py-2" data-testid="pm-explicit-task-point-mapper">
      {loading && <p className="text-sm"><Loader2 className="mr-2 inline h-4 w-4 animate-spin"/>Loading part instructions and checks…</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {data && <>
        <p className="rounded-lg border bg-muted/20 p-3 text-sm">
          {mappedTasks} of {data.tasks.length} PM tasks have explicit check associations. A task with no checks
          cannot be assumed to use the other tasks’ measurements.
        </p>
        <div className="space-y-1">
          <Label htmlFor="pm-map-task">Select PM task on this part</Label>
          <Select value={selectedTask} onValueChange={chooseTask} disabled={saving}>
            <SelectTrigger id="pm-map-task" aria-label="Select PM task to map"><SelectValue placeholder="Choose task"/></SelectTrigger>
            <SelectContent>{data.tasks.map((task) =>
              <SelectItem key={task.id} value={task.id}>#{task.taskNumber} · {task.description}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {selected && <>
          <p className="text-sm font-medium">Task #{selected.taskNumber}: {selected.description}</p>
          <div className="space-y-1">
            <Label htmlFor="pm-map-search">Find configured inspection check</Label>
            <Input id="pm-map-search" value={filter} onChange={(e) => setFilter(e.target.value)}
              placeholder="Search temperature, vibration, sound…" />
          </div>
          <p className="text-xs text-muted-foreground">{selection.length} selected · {filtered.length} visible checks</p>
          <div className="max-h-[42vh] space-y-1 overflow-y-auto rounded-lg border p-2">
            {filtered.map((point) => <label key={point.id} className="flex cursor-pointer items-start gap-3 rounded-md p-2 hover:bg-muted/30">
              <Checkbox checked={selection.includes(point.id)} disabled={saving}
                onCheckedChange={(checked) => togglePoint(point.id, checked === true)} aria-label={`Map ${point.name} to PM task`}/>
              <span className="min-w-0 text-sm"><strong>{point.name}</strong>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {point.inspectionType === 'measurement' ? 'Instrument' : 'Sight / sound'}
                  {point.parameterKey ? ' · ' + point.parameterKey : ''}
                  {point.normalRange ? ' · limits configured' : ''}
                </span>
              </span>
            </label>)}
            {!filtered.length && <p className="p-3 text-sm text-muted-foreground">No configured checks match this search.</p>}
          </div>
          {data.tasks.length > 1 && <p className="flex gap-2 rounded-lg border p-2.5 text-xs">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0"/>
            The same measurement can be intentionally linked to multiple tasks, but electronic inspection records
            are saved once per physical check. Do not duplicate measurements just to complete extra task headings.
          </p>}
        </>}
        {!data.points.length && <p className="text-sm text-amber-700">Create sight/instrument inspection points for this part before mapping them.</p>}
        {!data.tasks.length && <p className="text-sm text-amber-700">No active inspection PM task is assigned to this registered part.</p>}
      </>}
    </div>
  </ResponsiveDialog>;
}
