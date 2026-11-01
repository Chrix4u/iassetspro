'use client';

import React, { useMemo, useState } from 'react';
import { Eye, Pencil, RotateCcw, Search, Trash2 } from 'lucide-react';
import { filterPmAssignmentTargets, type PmAssignmentTargetFilters, type PmAssignmentTargetGroup } from '@/lib/pm-assignment-target-list';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyState } from '@/components/shared/helpers';
import { ClipboardList } from 'lucide-react';

const ALL = '__all__';
const pmLabels: Record<string, string> = { tbm: 'TBM', ubm: 'UBM', cbm: 'CBM', fbm: 'FBM' };
const titleCase = (value: string) => value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
const asDate = (value: string | Date | null) => value ? new Date(value) : null;

function dueSummary(group: PmAssignmentTargetGroup) {
  const now = new Date();
  const overdueMeter = group.assignments.some((row) => row.pmType === 'ubm' && row.nextDueReading != null && row.assetMeter && Number(row.assetMeter.currentValue) >= Number(row.nextDueReading));
  const dated = group.assignments.map((row) => asDate(row.nextDueDate)).filter((value): value is Date => Boolean(value)).sort((a, b) => a.getTime() - b.getTime());
  const first = dated[0];
  if (overdueMeter || (first && first < now)) return { label: 'Overdue', className: 'text-red-600 dark:text-red-400' };
  if (first && first.getTime() <= now.getTime() + 7 * 86400000) return { label: new Intl.DateTimeFormat('en-GB').format(first), sub: 'Due soon', className: 'text-amber-600 dark:text-amber-400' };
  if (first) return { label: new Intl.DateTimeFormat('en-GB').format(first), className: '' };
  if (group.pmTypes.includes('ubm')) return { label: 'Meter driven', className: '' };
  return { label: 'Event / condition', className: '' };
}

export function PmAssignmentTargetList({ groups, loading, canEdit, canDelete, onView, onEdit, onDelete }: {
  groups: PmAssignmentTargetGroup[]; loading: boolean; canEdit: boolean; canDelete: boolean;
  onView: (group: PmAssignmentTargetGroup) => void; onEdit: (group: PmAssignmentTargetGroup) => void; onDelete: (group: PmAssignmentTargetGroup) => void;
}) {
  const [filters, setFilters] = useState<PmAssignmentTargetFilters>({});
  const filtered = useMemo(() => filterPmAssignmentTargets(groups, filters), [filters, groups]);
  const assets = useMemo(() => [...new Map(groups.map((group) => [group.assetId, group.asset])).values()].sort((a, b) => a.name.localeCompare(b.name)), [groups]);
  const targets = useMemo(() => groups.filter((group) => !filters.assetId || group.assetId === filters.assetId), [filters.assetId, groups]);
  const hasWholeMachineTarget = useMemo(() => targets.some((group) => group.componentId === null), [targets]);
  const componentTargets = useMemo(() => [...new Map(targets.filter((group) => group.componentId).map((group) => [group.componentId!, group])).values()], [targets]);
  const set = (patch: Partial<PmAssignmentTargetFilters>) => setFilters((current) => ({ ...current, ...patch }));
  const selectValue = (value: string) => value === ALL ? '' : value;
  const hasFilters = Object.values(filters).some(Boolean);

  return <div className="space-y-3">
    <div className="rounded-xl border bg-card p-3">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
        <div className="sm:col-span-2 xl:col-span-2"><Label className="text-[10px] font-semibold uppercase text-muted-foreground">Search</Label><div className="relative mt-1"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground"/><Input className="h-9 pl-8 text-xs" value={filters.search || ''} onChange={(e) => set({ search: e.target.value })} placeholder="Search part, asset or task…"/></div></div>
        <FilterSelect label="Asset" value={filters.assetId || ALL} onChange={(v) => set({ assetId: selectValue(v), componentId: '' })}>{assets.map((asset) => <SelectItem key={asset.id} value={asset.id}>{asset.name}{asset.assetTag ? ` [${asset.assetTag}]` : ''}</SelectItem>)}</FilterSelect>
        <FilterSelect label="Part / Target" value={filters.componentId || ALL} onChange={(v) => set({ componentId: selectValue(v) })}>{hasWholeMachineTarget && <SelectItem value="__machine__">Whole machine</SelectItem>}{componentTargets.map((group) => <SelectItem key={group.componentId!} value={group.componentId!}>{group.targetName}</SelectItem>)}</FilterSelect>
        <FilterSelect label="PM Type" value={filters.pmType || ALL} onChange={(v) => set({ pmType: selectValue(v) })}><SelectItem value="tbm">TBM · Time Based</SelectItem><SelectItem value="ubm">UBM · Usage Based</SelectItem><SelectItem value="cbm">CBM · Condition Based</SelectItem><SelectItem value="fbm">FBM · Failure Based</SelectItem></FilterSelect>
        <FilterSelect label="Activity Mode" value={filters.activityMode || ALL} onChange={(v) => set({ activityMode: selectValue(v) })}><SelectItem value="inspection">Inspection</SelectItem><SelectItem value="lubrication">Lubrication</SelectItem><SelectItem value="servicing">Servicing</SelectItem><SelectItem value="replacement">Replacement</SelectItem></FilterSelect>
        <FilterSelect label="Inspection Type" value={filters.inspectionType || ALL} onChange={(v) => set({ inspectionType: selectValue(v) })}><SelectItem value="running">Running</SelectItem><SelectItem value="standstill">Standstill</SelectItem></FilterSelect>
        <FilterSelect label="Frequency Type" value={filters.frequencyType || ALL} onChange={(v) => set({ frequencyType: selectValue(v) as PmAssignmentTargetFilters['frequencyType'] })}><SelectItem value="time_day">Time / Day</SelectItem><SelectItem value="meter">Meter Based</SelectItem><SelectItem value="event">Event / Condition</SelectItem></FilterSelect>
        <FilterSelect label="Due State" value={filters.dueState || ALL} onChange={(v) => set({ dueState: selectValue(v) as PmAssignmentTargetFilters['dueState'] })}><SelectItem value="overdue">Overdue</SelectItem><SelectItem value="due_soon">Due Soon · 7 days</SelectItem><SelectItem value="scheduled">Scheduled</SelectItem><SelectItem value="meter">Meter Driven</SelectItem><SelectItem value="event">Condition / Event</SelectItem></FilterSelect>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2"><p className="text-[11px] text-muted-foreground">{filtered.length} of {groups.length} PM target{groups.length === 1 ? '' : 's'}</p>{hasFilters && <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setFilters({})}><RotateCcw className="mr-1 h-3.5 w-3.5"/>Clear Filters</Button>}</div>
    </div>

    <div className="overflow-hidden rounded-xl border bg-card">
      <Table>
        <TableHeader><TableRow><TableHead>Part / Target</TableHead><TableHead>Asset</TableHead><TableHead>Tasks</TableHead><TableHead className="hidden md:table-cell">PM Coverage</TableHead><TableHead>Next Due</TableHead><TableHead className="hidden lg:table-cell">Est. Time</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
        <TableBody>
          {loading ? Array.from({ length: 4 }).map((_, i) => <TableRow key={i}>{Array.from({ length: 7 }).map((__, j) => <TableCell key={j}><Skeleton className="h-4 w-20"/></TableCell>)}</TableRow>) : filtered.length === 0 ? <TableRow><TableCell colSpan={7}><EmptyState icon={ClipboardList} title="No PM schedules found" description={hasFilters ? 'No part or machine matches the selected filters.' : 'Create a PM assignment for a machine or exact part.'}/></TableCell></TableRow> : filtered.map((group) => {
            const due = dueSummary(group);
            return <TableRow key={group.key}>
              <TableCell><p className="text-sm font-semibold">{group.targetName}</p><p className="text-[10px] text-muted-foreground">{group.component ? `${titleCase(group.targetType)}${group.targetCode ? ` · ${group.targetCode}` : ''}` : 'Whole machine'}</p></TableCell>
              <TableCell><p className="text-xs font-medium">{group.asset.name}</p><p className="text-[10px] text-muted-foreground">{group.asset.assetTag || '—'}</p></TableCell>
              <TableCell><Badge variant="secondary">{group.taskCount} task{group.taskCount === 1 ? '' : 's'}</Badge></TableCell>
              <TableCell className="hidden md:table-cell"><div className="flex flex-wrap gap-1">{group.pmTypes.map((type) => <Badge key={type} variant="outline" className="text-[10px]">{pmLabels[type] || type.toUpperCase()}</Badge>)}</div></TableCell>
              <TableCell><p className={`text-xs font-semibold ${due.className}`}>{due.label}</p>{due.sub && <p className="text-[10px] text-muted-foreground">{due.sub}</p>}</TableCell>
              <TableCell className="hidden lg:table-cell text-xs">{group.totalEstimatedMinutes} min</TableCell>
              <TableCell><div className="flex justify-end gap-1"><Button variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={() => onView(group)}><Eye className="mr-1 h-3.5 w-3.5"/>View</Button>{canEdit && <Button variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={() => onEdit(group)}><Pencil className="mr-1 h-3.5 w-3.5"/>Edit</Button>}{canDelete && <Button variant="ghost" size="sm" className="h-8 px-2 text-xs text-red-600 hover:text-red-700" onClick={() => onDelete(group)}><Trash2 className="mr-1 h-3.5 w-3.5"/>Delete</Button>}</div></TableCell>
            </TableRow>;
          })}
        </TableBody>
      </Table>
    </div>
  </div>;
}

function FilterSelect({ label, value, onChange, children }: { label: string; value: string; onChange: (value: string) => void; children: React.ReactNode }) {
  return <div><Label className="text-[10px] font-semibold uppercase text-muted-foreground">{label}</Label><Select value={value} onValueChange={onChange}><SelectTrigger className="mt-1 h-9 text-xs"><SelectValue/></SelectTrigger><SelectContent><SelectItem value={ALL}>All</SelectItem>{children}</SelectContent></Select></div>;
}
