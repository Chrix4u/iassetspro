'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, CalendarRange, Loader2, Network, PackageCheck, PlayCircle, Power, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { buildPmComplianceKpis, sortPmComplianceCycles } from '@/lib/pm-compliance-view';
import { PmPortfolioCompliancePanel } from '@/components/modules/pm/PmPortfolioCompliancePanel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { AsyncSearchableSelect } from '@/components/ui/searchable-select';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface RollupAssignment {
  id: string;
  assetId: string;
  componentId: string | null;
  targetKind: 'machine' | 'component';
  technicalPathLabel: string;
  pmTask: { taskNumber: number; description: string; taskType: string };
  pmType: string;
  activityMode: string;
  inspectionType: 'running' | 'standstill';
  estimatedMinutes: number;
  frequencyInterval: number | null;
  frequencyUnit: string | null;
  nextDueDate: string | null;
  nextDueReading: number | null;
  currentValue: number | null;
  dueStatus: 'due' | 'near_due' | 'not_due';
  dueReason: string;
  planningAt: string | null;
  isBundleEligible: boolean;
}

interface BundleGroup {
  key: string;
  assetId: string;
  inspectionType: 'running' | 'standstill';
  assignmentIds: string[];
  planningStart: string | null;
  planningEnd: string | null;
  totalEstimatedMinutes: number;
}

interface RollupResponse {
  machine: { id: string; name: string; assetTag: string; plantId: string };
  planningWindowDays: number;
  planningWindow: { start: string; end: string };
  summary: { total: number; due: number; nearDue: number; later: number; running: number; standstill: number };
  assignments: RollupAssignment[];
  bundleGroups: BundleGroup[];
}

interface ComplianceCycle {
  identity: string;
  pmScheduleTaskId: string;
  pmDueCycleKey: string | null;
  taskNumber: number;
  description: string;
  pmType: string;
  maintenanceMode: string;
  dueAt: string;
  outcome: 'completed' | 'overdue_open' | 'missed';
  completedAt: string | null;
  delayMinutes: number | null;
  workOrderId: string;
  workOrderNumber: string;
  workOrderStatus: string;
}

interface ComplianceResponse {
  window: { days: number; start: string; end: string };
  summary: {
    maturedCycles: number;
    completed: number;
    openOverdue: number;
    missed: number;
    completionCompliancePct: number | null;
  };
  cycles: ComplianceCycle[];
}

function formatDateTime(value: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}

function formatDelay(minutes: number | null) {
  if (minutes == null) return '—';
  if (minutes >= 1440) return `${Math.round((minutes / 1440) * 10) / 10} d`;
  if (minutes >= 60) return `${Math.round((minutes / 60) * 10) / 10} h`;
  return `${minutes} min`;
}

function dueBadge(status: RollupAssignment['dueStatus']) {
  if (status === 'due') return <Badge className="bg-red-100 text-red-700 hover:bg-red-100 dark:bg-red-950/40 dark:text-red-300">Due</Badge>;
  if (status === 'near_due') return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-300">Near Due</Badge>;
  return <Badge variant="outline">Later</Badge>;
}

function complianceOutcomeBadge(outcome: ComplianceCycle['outcome']) {
  if (outcome === 'completed') return <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300">Completed</Badge>;
  if (outcome === 'overdue_open') return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-300">Open Overdue</Badge>;
  return <Badge className="bg-red-100 text-red-700 hover:bg-red-100 dark:bg-red-950/40 dark:text-red-300">Missed</Badge>;
}

export function PmMachineRollupPanel() {
  const [assetId, setAssetId] = useState('');
  const [planningWindowDays, setPlanningWindowDays] = useState('7');
  const [data, setData] = useState<RollupResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [bundlingKey, setBundlingKey] = useState<string | null>(null);
  const [complianceWindowDays, setComplianceWindowDays] = useState('30');
  const [complianceData, setComplianceData] = useState<ComplianceResponse | null>(null);
  const [complianceLoading, setComplianceLoading] = useState(false);
  const [complianceError, setComplianceError] = useState<string | null>(null);

  const fetchAssets = async (query: string) => {
    const response = await api.get(`/api/assets?search=${encodeURIComponent(query)}&limit=100`);
    if (!response.success || !Array.isArray(response.data)) return [];
    return (response.data as any[]).map((asset) => ({
      value: asset.id,
      label: `${asset.name} [${asset.assetTag}]`,
      badge: asset.status,
    }));
  };

  const load = useCallback(async () => {
    if (!assetId) { setData(null); return; }
    setLoading(true);
    try {
      const params = new URLSearchParams({ assetId, planningWindowDays });
      const response = await api.get<RollupResponse>(`/api/pm-assignments/rollup?${params.toString()}`);
      if (!response.success) throw new Error(response.error || 'Failed to load machine PM roll-up');
      setData(response.data || null);
    } catch (error) {
      setData(null);
      toast.error(error instanceof Error ? error.message : 'Failed to load machine PM roll-up');
    } finally {
      setLoading(false);
    }
  }, [assetId, planningWindowDays]);

  const loadCompliance = useCallback(async () => {
    if (!assetId) {
      setComplianceData(null);
      setComplianceError(null);
      return;
    }
    setComplianceLoading(true);
    setComplianceError(null);
    try {
      const params = new URLSearchParams({ assetId, windowDays: complianceWindowDays });
      const response = await api.get<ComplianceResponse>(`/api/pm-assignments/compliance?${params.toString()}`);
      if (!response.success) throw new Error(response.error || 'Failed to load PM compliance');
      setComplianceData(response.data || null);
    } catch (error) {
      setComplianceData(null);
      setComplianceError(error instanceof Error ? error.message : 'Failed to load PM compliance');
    } finally {
      setComplianceLoading(false);
    }
  }, [assetId, complianceWindowDays]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { void loadCompliance(); }, [loadCompliance]);

  const createBundle = async (group: BundleGroup) => {
    if (!assetId) return;
    setBundlingKey(group.key);
    try {
      const response = await api.post('/api/pm-assignments/bundle', {
        assetId,
        assignmentIds: group.assignmentIds,
        planningWindowDays: Number(planningWindowDays),
      });
      if (!response.success) throw new Error(response.error || 'Failed to create PM work bundle');
      const woNumber = (response.data as any)?.workOrder?.woNumber;
      toast.success(woNumber ? `PM work bundle ${woNumber} created` : 'PM work bundle created');
      await load();
      await loadCompliance();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create PM work bundle');
    } finally {
      setBundlingKey(null);
    }
  };

  const refreshAll = () => {
    void load();
    void loadCompliance();
  };

  const recentComplianceCycles = complianceData ? sortPmComplianceCycles(complianceData.cycles).slice(0, 10) : [];

  return (
    <div className="space-y-4">
      <PmPortfolioCompliancePanel />
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-sm"><Network className="h-4 w-4 text-emerald-600" />Machine PM Roll-up</CardTitle>
              <CardDescription>See whole-machine and descendant PM together, then bundle compatible due work without mixing Running and Standstill.</CardDescription>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={refreshAll} disabled={!assetId || loading || complianceLoading}>
              <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading || complianceLoading ? 'animate-spin' : ''}`} />Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_12rem]">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Machine / Asset</Label>
              <AsyncSearchableSelect value={assetId} onValueChange={setAssetId} fetchOptions={fetchAssets} placeholder="Select machine..." searchPlaceholder="Search machine name or tag..." />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Planning Window</Label>
              <Select value={planningWindowDays} onValueChange={setPlanningWindowDays}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="0">Due now only</SelectItem><SelectItem value="7">7 days</SelectItem><SelectItem value="14">14 days</SelectItem><SelectItem value="30">30 days</SelectItem></SelectContent>
              </Select>
            </div>
          </div>

          {!assetId ? (
            <div className="rounded-lg border border-dashed p-6 text-center text-xs text-muted-foreground">Select a machine to load its PM roll-up.</div>
          ) : loading && !data ? (
            <div className="flex min-h-32 items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading PM roll-up…</div>
          ) : data ? (
            <>
              <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                <div className="rounded-lg border p-3"><p className="text-[10px] uppercase text-muted-foreground">Due</p><p className="mt-1 text-lg font-bold text-red-600">{data.summary.due}</p></div>
                <div className="rounded-lg border p-3"><p className="text-[10px] uppercase text-muted-foreground">Near Due</p><p className="mt-1 text-lg font-bold text-amber-600">{data.summary.nearDue}</p></div>
                <div className="rounded-lg border p-3"><p className="flex items-center gap-1 text-[10px] uppercase text-muted-foreground"><PlayCircle className="h-3 w-3" />Running</p><p className="mt-1 text-lg font-bold">{data.summary.running}</p></div>
                <div className="rounded-lg border p-3"><p className="flex items-center gap-1 text-[10px] uppercase text-muted-foreground"><Power className="h-3 w-3" />Standstill</p><p className="mt-1 text-lg font-bold">{data.summary.standstill}</p></div>
              </div>

              <div className="rounded-lg border bg-muted/10 p-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div><p className="flex items-center gap-1.5 text-xs font-semibold"><CalendarRange className="h-3.5 w-3.5" />Planning Window</p><p className="text-[10px] text-muted-foreground">{formatDateTime(data.planningWindow.start)} → {formatDateTime(data.planningWindow.end)}</p></div>
                  <Badge variant="outline">{data.machine.name} · {data.machine.assetTag}</Badge>
                </div>
                {data.bundleGroups.length === 0 ? (
                  <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">No currently due assignments form a bundle-ready group.</p>
                ) : (
                  <div className="grid gap-2 lg:grid-cols-2">
                    {data.bundleGroups.map((group) => (
                      <div key={group.key} className="flex flex-col gap-2 rounded-md border bg-background p-2.5 sm:flex-row sm:items-center sm:justify-between">
                        <div><p className="text-xs font-semibold">{group.inspectionType === 'standstill' ? 'Standstill / Shutdown' : 'Running'} · {group.assignmentIds.length} task{group.assignmentIds.length === 1 ? '' : 's'}</p><p className="text-[10px] text-muted-foreground">{group.totalEstimatedMinutes} min · {formatDateTime(group.planningStart)}{group.planningEnd && group.planningEnd !== group.planningStart ? ` → ${formatDateTime(group.planningEnd)}` : ''}</p></div>
                        <Button type="button" size="sm" className="h-8 shrink-0" onClick={() => void createBundle(group)} disabled={Boolean(bundlingKey)}>
                          {bundlingKey === group.key ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <PackageCheck className="mr-1 h-3.5 w-3.5" />}Create Work Bundle
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-lg border p-3">
                <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="text-xs font-semibold">PM Compliance</p>
                    <p className="text-[10px] text-muted-foreground">Historical completion, open-overdue exposure, and missed direct-PM cycles. This is completion compliance, not an on-time SLA.</p>
                  </div>
                  <div className="w-full space-y-1 sm:w-40">
                    <Label className="text-[10px] font-semibold">Reporting Window</Label>
                    <Select value={complianceWindowDays} onValueChange={setComplianceWindowDays}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="30">30 days</SelectItem><SelectItem value="90">90 days</SelectItem><SelectItem value="180">180 days</SelectItem><SelectItem value="365">365 days</SelectItem></SelectContent>
                    </Select>
                  </div>
                </div>

                {complianceLoading && !complianceData ? (
                  <div className="flex min-h-20 items-center justify-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Loading PM compliance…</div>
                ) : complianceError ? (
                  <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-200"><AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /><div><p className="font-semibold">Compliance history could not be loaded.</p><p className="mt-0.5 opacity-80">{complianceError}</p></div></div>
                ) : complianceData ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
                      {buildPmComplianceKpis(complianceData.summary).map((kpi) => (
                        <div key={kpi.key} className="rounded-md border bg-muted/10 p-2.5">
                          <p className="text-[9px] uppercase text-muted-foreground">{kpi.label}</p>
                          <p className={`mt-1 text-base font-bold ${kpi.key === 'overdue' ? 'text-amber-600' : kpi.key === 'missed' ? 'text-red-600' : kpi.key === 'completed' ? 'text-emerald-600' : ''}`}>{kpi.value}</p>
                        </div>
                      ))}
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-muted-foreground">
                      <span>{formatDateTime(complianceData.window.start)} → {formatDateTime(complianceData.window.end)}</span>
                      {complianceLoading && <span className="flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" />Refreshing…</span>}
                    </div>

                    <div className="overflow-x-auto rounded-md border">
                      <Table>
                        <TableHeader><TableRow><TableHead className="text-xs">Due</TableHead><TableHead className="text-xs">Task</TableHead><TableHead className="text-xs">PM Type</TableHead><TableHead className="text-xs">Outcome</TableHead><TableHead className="text-xs">Work Order</TableHead><TableHead className="text-xs">Delay</TableHead></TableRow></TableHeader>
                        <TableBody>
                          {recentComplianceCycles.length === 0 ? (
                            <TableRow><TableCell colSpan={6} className="py-6 text-center text-xs text-muted-foreground">No PM cycles matured in this reporting window.</TableCell></TableRow>
                          ) : recentComplianceCycles.map((cycle) => (
                            <TableRow key={cycle.identity}>
                              <TableCell className="whitespace-nowrap text-[10px]">{formatDateTime(cycle.dueAt)}</TableCell>
                              <TableCell><p className="font-mono text-[10px] text-muted-foreground">Task #{cycle.taskNumber}</p><p className="max-w-[260px] truncate text-xs" title={cycle.description}>{cycle.description}</p></TableCell>
                              <TableCell><Badge variant="outline" className="text-[10px] uppercase">{cycle.pmType}</Badge><p className="mt-1 text-[9px] capitalize text-muted-foreground">{cycle.maintenanceMode}</p></TableCell>
                              <TableCell>{complianceOutcomeBadge(cycle.outcome)}{cycle.completedAt && <p className="mt-1 text-[9px] text-muted-foreground">{formatDateTime(cycle.completedAt)}</p>}</TableCell>
                              <TableCell><p className="text-xs font-medium">{cycle.workOrderNumber}</p><p className="text-[9px] capitalize text-muted-foreground">{cycle.workOrderStatus.replace(/_/g, ' ')}</p></TableCell>
                              <TableCell className="whitespace-nowrap text-xs">{formatDelay(cycle.delayMinutes)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader><TableRow><TableHead className="text-xs">Technical Path</TableHead><TableHead className="text-xs">Task</TableHead><TableHead className="text-xs">PM / Activity</TableHead><TableHead className="text-xs">Inspection Type</TableHead><TableHead className="text-xs">Due State</TableHead><TableHead className="text-xs">Est. Minutes</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {data.assignments.length === 0 ? <TableRow><TableCell colSpan={6} className="py-8 text-center text-xs text-muted-foreground">No direct PM assignments exist on this machine.</TableCell></TableRow> : data.assignments.map((assignment) => (
                      <TableRow key={assignment.id}>
                        <TableCell><p className="max-w-[260px] truncate text-xs font-medium" title={assignment.technicalPathLabel || 'Whole machine'}>{assignment.technicalPathLabel || 'Whole machine'}</p><p className="text-[10px] text-muted-foreground">{assignment.targetKind === 'machine' ? 'Machine target' : 'Maintainable node'}</p></TableCell>
                        <TableCell><p className="font-mono text-[10px] text-muted-foreground">Task #{assignment.pmTask.taskNumber}</p><p className="max-w-[280px] truncate text-xs" title={assignment.pmTask.description}>{assignment.pmTask.description}</p></TableCell>
                        <TableCell><div className="flex flex-wrap gap-1"><Badge variant="outline" className="text-[10px] uppercase">{assignment.pmType}</Badge><Badge variant="secondary" className="text-[10px] capitalize">{assignment.activityMode}</Badge></div></TableCell>
                        <TableCell><Badge variant="outline" className="text-[10px]">{assignment.inspectionType === 'running' ? 'Running' : 'Standstill'}</Badge></TableCell>
                        <TableCell><div className="flex items-center gap-2">{dueBadge(assignment.dueStatus)}{assignment.dueStatus === 'due' && !assignment.isBundleEligible && <AlertCircle className="h-3.5 w-3.5 text-amber-500" />}</div><p className="mt-1 text-[9px] text-muted-foreground">{assignment.nextDueDate ? formatDateTime(assignment.nextDueDate) : assignment.nextDueReading != null ? `Meter ${assignment.nextDueReading} ${assignment.frequencyUnit || ''}` : assignment.dueReason.replace(/_/g, ' ')}</p></TableCell>
                        <TableCell className="text-xs">{assignment.estimatedMinutes}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
