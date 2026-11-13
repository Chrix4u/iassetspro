'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarClock, Loader2, RefreshCw } from 'lucide-react';
import { api } from '@/lib/api';
import { formatUiDate } from '@/lib/date-display';
import { useNavigationStore } from '@/stores/navigationStore';
import { AsyncSearchableSelect, type SearchableOption } from '@/components/ui/searchable-select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { ResponsiveDialog } from '@/components/shared/ResponsiveDialog';

interface AssignedTask {
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
  dueState: 'overdue' | 'due_today' | 'upcoming' | 'unscheduled';
}

export function PmScheduledTasksPage() {
  const navigate = useNavigationStore((s) => s.navigate);
  const [machineId, setMachineId] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<AssignedTask[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [selected, setSelected] = useState<AssignedTask | null>(null);

  const fetchMachines = useCallback(async (query: string): Promise<SearchableOption[]> => {
    const params = new URLSearchParams({ search: query, limit: '100' });
    const result = await api.get<{ id: string; name: string; assetTag: string }[]>('/api/assets?' + params.toString());
    return result.success && Array.isArray(result.data)
      ? result.data.map((item) => ({ value: item.id, label: item.name + ' [' + item.assetTag + ']' })) : [];
  }, []);

  useEffect(() => {
    if (!machineId) {
      setRows([]); setTotal(0); setPages(1); setLoading(false); setError('');
      return;
    }
    let alive = true;
    setLoading(true); setError('');
    const params = new URLSearchParams({ assetId: machineId, page: String(page), limit: '50' });
    if (search.trim()) params.set('search', search.trim().slice(0, 120));
    api.get<AssignedTask[]>('/api/pm-inspections/scheduled?' + params.toString()).then((response) => {
      if (!alive) return;
      if (!response.success || !Array.isArray(response.data)) throw new Error(response.error || 'Could not load scheduled tasks');
      setRows(response.data);
      const pagination = (response as typeof response & { pagination?: { total: number; totalPages: number } }).pagination;
      setTotal(pagination?.total ?? response.data.length);
      setPages(Math.max(1, pagination?.totalPages ?? 1));
    }).catch((reason) => {
      if (!alive) return;
      setRows([]); setError(reason instanceof Error ? reason.message : 'Could not load scheduled tasks');
    }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [machineId, search, page, revision]);

  const taskGroups = useMemo(() => {
    const buckets = new Map<string, { key: string; name: string; mode: string; parts: AssignedTask[] }>();
    for (const row of rows) {
      const key = row.pmTask.description.trim().toLowerCase() + '|' + row.pmTask.taskType + '|' + row.equipmentState;
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = { key, name: row.pmTask.description, mode: row.equipmentState, parts: [] };
        buckets.set(key, bucket);
      }
      bucket.parts.push(row);
    }
    return [...buckets.values()].sort((a, b) => a.name.localeCompare(b.name)).map((group) => ({
      ...group, parts: group.parts.slice().sort((a, b) =>
        (a.component?.componentCode || '').localeCompare(b.component?.componentCode || '')),
    }));
  }, [rows]);
  const due = (row: AssignedTask) => row.basis === 'meter'
    ? 'Meter ' + (row.currentReading ?? '—') + ' / ' + (row.nextDueReading ?? '—') + ' ' + (row.meterUnit || '')
    : 'Due ' + (row.nextDueDate ? formatUiDate(row.nextDueDate) : 'not set');

  return <div className="page-content space-y-4">
    <div className="flex flex-wrap justify-between gap-3">
      <div><p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">PM Inspections</p><h1 className="text-2xl font-bold tracking-tight">Scheduled Inspection Tasks</h1><p className="mt-1 max-w-3xl text-sm text-muted-foreground">Review calendar- and meter-based inspection assignments by machine, then task, then part. This page does not repeat the machine for each assignment.</p></div>
      <Button size="sm" variant="outline" onClick={() => navigate('pm-schedules')}><CalendarClock className="mr-1.5 h-4 w-4"/>All PM Schedules</Button>
    </div>
    <Card>
      <CardHeader className="pb-3"><CardTitle className="text-sm">Select machine</CardTitle><CardDescription>Only one machine is loaded at a time for fast browsing across large plants.</CardDescription></CardHeader>
      <CardContent className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_auto] sm:items-end">
        <div className="min-w-0 space-y-1.5"><Label>Machine</Label><AsyncSearchableSelect value={machineId} onValueChange={(value) => { setMachineId(value); setPage(1); }} fetchOptions={fetchMachines} placeholder="Choose machine name or code"/></div>
        <div className="min-w-0 space-y-1.5"><Label>Search task or part</Label><Input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Task name, component or code"/></div>
        <Button variant="outline" size="sm" disabled={!machineId || loading} onClick={() => setRevision((current) => current + 1)}><RefreshCw className="mr-1 h-4 w-4"/>Refresh</Button>
      </CardContent>
    </Card>
    {!machineId ? <div data-testid="pm-scheduled-select-machine" className="rounded-lg border border-dashed p-7 text-center text-sm text-muted-foreground">Select a machine to view its scheduled inspection tasks and assigned components.</div> :
      loading ? <div role="status" className="flex items-center gap-2 p-5 text-sm"><Loader2 className="h-4 w-4 animate-spin"/>Loading assigned tasks…</div> :
      error ? <p role="alert" className="rounded-lg border border-red-200 p-4 text-sm text-red-700">{error}</p> :
      taskGroups.length === 0 ? <div className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">No scheduled inspection assignments match this machine and search.</div> :
      <Card data-testid="pm-scheduled-machine-group" className="overflow-hidden">
        <CardHeader className="border-b bg-muted/30 pb-3">
          <CardTitle className="break-words text-base">{rows[0].asset.name}</CardTitle>
          <CardDescription className="font-mono">{rows[0].asset.assetTag} · {total} scheduled assignments</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 p-2 sm:p-3">
          {taskGroups.map((group) => <section key={group.key} className="rounded-lg border" data-testid="pm-scheduled-task-group">
            <div className="flex flex-wrap justify-between gap-2 border-b bg-muted/20 p-2.5"><h3 className="break-words text-sm font-semibold">{group.name}</h3><Badge variant="outline">{group.mode} · {group.parts.length} part{group.parts.length === 1 ? '' : 's'}</Badge></div>
            {group.parts.map((task) => <div key={task.id} data-testid="pm-scheduled-compact-row" className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-b p-3 last:border-0">
              <div className="min-w-0 flex-1"><p className="break-words text-sm font-medium">{task.component?.name || 'Whole machine'}</p><p className="break-all font-mono text-xs text-muted-foreground">{task.component?.componentCode || 'Machine-level task'}</p><p className="text-xs text-muted-foreground">{due(task)}</p></div>
              <div className="flex shrink-0 gap-2"><Badge variant={task.dueState === 'overdue' ? 'destructive' : 'outline'}>{task.dueState.replaceAll('_', ' ')}</Badge><Button type="button" size="sm" variant="outline" onClick={() => setSelected(task)}>View</Button></div>
            </div>)}
          </section>)}
        </CardContent>
      </Card>}
    {machineId && <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
      <span>{total} assignments · Page {page} of {pages}</span>
      <div className="flex gap-2"><Button size="sm" variant="outline" disabled={loading || page === 1} onClick={() => setPage((v) => Math.max(1, v - 1))}>Previous</Button><Button size="sm" variant="outline" disabled={loading || page >= pages} onClick={() => setPage((v) => v + 1)}>Next</Button></div>
    </div>}
    <ResponsiveDialog open={Boolean(selected)} onOpenChange={(value) => { if (!value) setSelected(null); }}
      title={selected ? selected.pmTask.description : 'PM inspection task'}
      description={selected ? selected.asset.name + ' · ' + (selected.component?.name || 'Whole machine') : ''}
      footer={<Button variant="outline" onClick={() => setSelected(null)}>Close</Button>}>
      {selected && <div className="space-y-2 text-sm">
        <p><strong>Part code:</strong> {selected.component?.componentCode || 'Machine-level'}</p>
        <p><strong>Task number:</strong> {selected.pmTask.taskNumber}</p>
        <p><strong>Method:</strong> {selected.pmTask.taskType}</p>
        <p><strong>Equipment state:</strong> {selected.equipmentState}</p>
        <p><strong>Frequency basis:</strong> {selected.basis}</p>
        <p><strong>Due:</strong> {due(selected)}</p>
        <p><strong>Status:</strong> {selected.dueState.replaceAll('_', ' ')}</p>
        <p className="text-xs text-muted-foreground">To change the assignment or define measured acceptance limits, use PM Schedules or Inspection Readings.</p>
      </div>}
    </ResponsiveDialog>
  </div>;
}
