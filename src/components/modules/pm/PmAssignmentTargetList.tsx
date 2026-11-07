'use client';

import React, { useMemo, useState } from 'react';
import { ClipboardList, Eye, MoreHorizontal, Pencil, RotateCcw, Search, Settings2, Trash2 } from 'lucide-react';
import {
  filterPmAssignmentTargets,
  groupPmAssignmentAssets,
  pmAssignmentFrequencyType,
  type PmAssignmentTargetFilters,
  type PmAssignmentTargetGroup,
} from '@/lib/pm-assignment-target-list';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyState } from '@/components/shared/helpers';

const ALL = '__all__';
const pmLabels: Record<string, string> = { tbm: 'TBM', ubm: 'UBM', cbm: 'CBM', fbm: 'FBM' };
const titleCase = (value: string) => value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
const asDate = (value: string | Date | null) => value ? new Date(value) : null;

function dueSummary(group: PmAssignmentTargetGroup) {
  const now = new Date();
  const frequencies = group.assignments.map(pmAssignmentFrequencyType);
  const overdueMeter = group.assignments.some((row) => pmAssignmentFrequencyType(row) === 'meter' && row.nextDueReading != null && row.assetMeter && Number(row.assetMeter.currentValue) >= Number(row.nextDueReading));
  const dated = group.assignments
    .filter((row) => pmAssignmentFrequencyType(row) === 'time_day')
    .map((row) => asDate(row.nextDueDate))
    .filter((value): value is Date => Boolean(value))
    .sort((a, b) => a.getTime() - b.getTime());
  const first = dated[0];
  if (overdueMeter || (first && first < now)) return { label: 'Overdue', className: 'text-red-600 dark:text-red-400' };
  if (first && first.getTime() <= now.getTime() + 7 * 86400000) return { label: new Intl.DateTimeFormat('en-GB').format(first), sub: 'Due soon', className: 'text-amber-600 dark:text-amber-400' };
  if (first) return { label: new Intl.DateTimeFormat('en-GB').format(first), className: '' };
  if (frequencies.includes('meter')) return { label: 'Meter driven', className: '' };
  return { label: 'Event / condition', className: '' };
}

export function PmAssignmentTargetList({ groups, loading, canEdit, canDelete, onView, onEdit, onConfigureTriggers, onDelete }: {
  groups: PmAssignmentTargetGroup[]; loading: boolean; canEdit: boolean; canDelete: boolean;
  onView: (group: PmAssignmentTargetGroup) => void; onEdit: (group: PmAssignmentTargetGroup) => void; onConfigureTriggers: (group: PmAssignmentTargetGroup) => void; onDelete: (group: PmAssignmentTargetGroup) => void;
}) {
  const [filters, setFilters] = useState<PmAssignmentTargetFilters>({});
  const filtered = useMemo(() => filterPmAssignmentTargets(groups, filters), [filters, groups]);
  const machineGroups = useMemo(() => groupPmAssignmentAssets(filtered), [filtered]);
  const assets = useMemo(() => [...new Map(groups.map((group) => [group.assetId, group.asset])).values()].sort((a, b) => a.name.localeCompare(b.name)), [groups]);
  const targets = useMemo(() => groups.filter((group) => !filters.assetId || group.assetId === filters.assetId), [filters.assetId, groups]);
  const hasWholeMachineTarget = useMemo(() => targets.some((group) => group.componentId === null), [targets]);
  const componentTargets = useMemo(() => [...new Map(targets.filter((group) => group.componentId).map((group) => [group.componentId!, group])).values()], [targets]);
  const set = (patch: Partial<PmAssignmentTargetFilters>) => setFilters((current) => ({ ...current, ...patch }));
  const selectValue = (value: string) => value === ALL ? '' : value;
  const hasFilters = Object.values(filters).some(Boolean);

  return <div className="space-y-3">
    <div className="rounded-xl border bg-card p-3">
      <div className="grid items-end gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
        <div className="sm:col-span-2 xl:col-span-2 self-end"><Label className="text-[10px] font-semibold uppercase text-muted-foreground">Search</Label><div className="relative mt-1"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground"/><Input className="h-9 pl-8 text-xs" value={filters.search || ''} onChange={(e) => set({ search: e.target.value })} placeholder="Search part, asset or task…"/></div></div>
        <FilterSelect label="Asset" className="xl:col-span-2" value={filters.assetId || ALL} onChange={(v) => set({ assetId: selectValue(v), componentId: '' })}>{assets.map((asset) => <SelectItem key={asset.id} value={asset.id}>{asset.name}{asset.assetTag ? ` [${asset.assetTag}]` : ''}</SelectItem>)}</FilterSelect>
        <FilterSelect label="Part / Target" className="xl:col-span-2" value={filters.componentId || ALL} onChange={(v) => set({ componentId: selectValue(v) })}>{hasWholeMachineTarget && <SelectItem value="__machine__">Whole machine</SelectItem>}{componentTargets.map((group) => <SelectItem key={group.componentId!} value={group.componentId!}>{group.targetName}</SelectItem>)}</FilterSelect>
        <FilterSelect label="PM Type" value={filters.pmType || ALL} onChange={(v) => set({ pmType: selectValue(v) })}><SelectItem value="tbm">TBM</SelectItem><SelectItem value="ubm">UBM</SelectItem><SelectItem value="cbm">CBM</SelectItem><SelectItem value="fbm">FBM</SelectItem></FilterSelect>
        <FilterSelect label="Activity Mode" value={filters.activityMode || ALL} onChange={(v) => set({ activityMode: selectValue(v) })}><SelectItem value="inspection">Inspection</SelectItem><SelectItem value="lubrication">Lubrication</SelectItem><SelectItem value="servicing">Servicing</SelectItem><SelectItem value="replacement">Replacement</SelectItem></FilterSelect>
        <FilterSelect label="Inspection Type" value={filters.inspectionType || ALL} onChange={(v) => set({ inspectionType: selectValue(v) })}><SelectItem value="running">Running</SelectItem><SelectItem value="standstill">Standstill</SelectItem></FilterSelect>
        <FilterSelect label="Frequency Type" value={filters.frequencyType || ALL} onChange={(v) => set({ frequencyType: selectValue(v) as PmAssignmentTargetFilters['frequencyType'] })}><SelectItem value="time_day">Time / Day</SelectItem><SelectItem value="meter">Meter Based</SelectItem></FilterSelect>
        <FilterSelect label="Due State" className="xl:col-span-2" value={filters.dueState || ALL} onChange={(v) => set({ dueState: selectValue(v) as PmAssignmentTargetFilters['dueState'] })}><SelectItem value="overdue">Overdue</SelectItem><SelectItem value="due_soon">Due Soon · 7 days</SelectItem><SelectItem value="scheduled">Scheduled</SelectItem><SelectItem value="meter">Meter Driven</SelectItem><SelectItem value="event">Condition / Event</SelectItem></FilterSelect>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2"><p className="text-[11px] text-muted-foreground">{machineGroups.length} machine{machineGroups.length === 1 ? '' : 's'} · {filtered.length} scheduled target{filtered.length === 1 ? '' : 's'} shown</p>{hasFilters && <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setFilters({})}><RotateCcw className="mr-1 h-3.5 w-3.5"/>Clear Filters</Button>}</div>
    </div>

    {loading ? (
      <div className="space-y-2">{Array.from({ length: 4 }).map((_, index) => <div key={index} className="rounded-xl border bg-card p-4"><Skeleton className="h-5 w-56"/><Skeleton className="mt-2 h-4 w-80"/></div>)}</div>
    ) : machineGroups.length === 0 ? (
      <div className="rounded-xl border bg-card"><EmptyState icon={ClipboardList} title="No PM schedules found" description={hasFilters ? 'No machine or scheduled part matches the selected filters.' : 'Create a PM assignment for a machine or exact part.'}/></div>
    ) : (
      <Accordion type="multiple" className="space-y-2" data-testid="pm-machine-accordion">
        {machineGroups.map((machine) => (
          <AccordionItem key={machine.assetId} value={machine.assetId} className="overflow-hidden rounded-xl border bg-card px-0">
            <AccordionTrigger className="px-4 py-3 text-left hover:no-underline">
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 pr-2">
                <div className="min-w-0 flex-1 basis-56">
                  <p className="truncate text-sm font-semibold">{machine.asset.name}</p>
                  <p className="text-[10px] text-muted-foreground">{machine.asset.assetTag || 'No asset tag'} · Parent machine</p>
                </div>
                <Badge variant="secondary">{machine.targetCount} target{machine.targetCount === 1 ? '' : 's'}</Badge>
                <Badge variant="secondary">{machine.taskCount} task{machine.taskCount === 1 ? '' : 's'}</Badge>
                <div className="hidden flex-wrap gap-1 md:flex">{machine.pmTypes.map((type) => <Badge key={type} variant="outline" className="text-[10px]">{pmLabels[type] || type.toUpperCase()}</Badge>)}</div>
                <span className="hidden text-xs text-muted-foreground lg:inline">{machine.totalEstimatedMinutes} min</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="border-t px-0 pb-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader><TableRow><TableHead>Part / Target</TableHead><TableHead>Tasks</TableHead><TableHead className="hidden md:table-cell">PM Coverage</TableHead><TableHead>Next Due</TableHead><TableHead className="hidden lg:table-cell">Est. Time</TableHead><TableHead className="w-12 px-2 text-right">Actions</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {machine.targets.map((group) => {
                      const due = dueSummary(group);
                      const openOrderMap = new Map<string, { id: string; woNumber: string; status: string }>();
                      for (const assignment of group.assignments) {
                        for (const execution of assignment.taskExecutions || []) {
                          openOrderMap.set(execution.workOrder.id, execution.workOrder);
                        }
                      }
                      const openOrders = [...openOrderMap.values()];
                      return <TableRow key={group.key}>
                        <TableCell className="max-w-[10rem] whitespace-normal px-2 sm:max-w-none"><p className="break-words text-sm font-semibold">{group.targetName}</p><p className="text-[10px] text-muted-foreground">{group.component ? `${titleCase(group.targetType)}${group.targetCode ? ` · ${group.targetCode}` : ''}` : 'Whole machine'}</p></TableCell>
                        <TableCell><Badge variant="secondary">{group.taskCount} task{group.taskCount === 1 ? '' : 's'}</Badge></TableCell>
                        <TableCell className="hidden md:table-cell"><div className="flex flex-wrap gap-1">{group.pmTypes.map((type) => <Badge key={type} variant="outline" className="text-[10px]">{pmLabels[type] || type.toUpperCase()}</Badge>)}</div></TableCell>
                        <TableCell className="max-w-40 whitespace-normal"><p className={`text-xs font-semibold ${due.className}`}>{due.label}</p>{due.sub && <p className="text-[10px] text-muted-foreground">{due.sub}</p>}
                          {openOrders.slice(0, 2).map((order) => <p key={order.id} className="mt-1 break-words text-[10px] text-muted-foreground">
                            <span className="font-semibold text-foreground">{order.woNumber}</span> · {titleCase(order.status)}
                          </p>)}
                          {openOrders.length > 2 && <p className="text-[10px] text-muted-foreground">+{openOrders.length - 2} more active WO{openOrders.length - 2 === 1 ? '' : 's'}</p>}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell text-xs">{group.totalEstimatedMinutes} min</TableCell>
                        <TableCell className="w-12 px-2 text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button type="button" variant="outline" size="icon" className="h-9 w-9 shrink-0" aria-label={`Actions for ${group.targetName}`} title="Schedule actions">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" sideOffset={4} className="min-w-48">
                              <DropdownMenuItem onSelect={() => onView(group)}>
                                <Eye className="h-4 w-4" />View
                              </DropdownMenuItem>
                              {canEdit && <DropdownMenuItem onSelect={() => onConfigureTriggers(group)}>
                                <Settings2 className="h-4 w-4" />Configure Triggers
                              </DropdownMenuItem>}
                              {canEdit && <DropdownMenuItem onSelect={() => onEdit(group)}>
                                <Pencil className="h-4 w-4" />Edit
                              </DropdownMenuItem>}
                              {canDelete && <DropdownMenuSeparator />}
                              {canDelete && <DropdownMenuItem variant="destructive" onSelect={() => onDelete(group)}>
                                <Trash2 className="h-4 w-4" />Delete
                              </DropdownMenuItem>}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>;
                    })}
                  </TableBody>
                </Table>
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    )}
  </div>;
}

function FilterSelect({ label, value, onChange, children, className = '' }: { label: string; value: string; onChange: (value: string) => void; children: React.ReactNode; className?: string }) {
  return <div className={`min-w-0 self-end ${className}`}><Label className="text-[10px] font-semibold uppercase text-muted-foreground">{label}</Label><Select value={value} onValueChange={onChange}><SelectTrigger className="mt-1 h-9 w-full min-w-0 overflow-hidden text-xs [&>span]:truncate"><SelectValue/></SelectTrigger><SelectContent><SelectItem value={ALL}>All</SelectItem>{children}</SelectContent></Select></div>;
}
