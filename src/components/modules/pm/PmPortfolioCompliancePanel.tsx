'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Building2, Factory, Loader2, RefreshCw, ShieldAlert } from 'lucide-react';
import { api } from '@/lib/api';
import {
  buildPmPortfolioComplianceKpis,
  formatPmPortfolioDelay,
  formatPmPortfolioPercentage,
  takeTopPmPortfolioMachineRisks,
} from '@/lib/pm-portfolio-compliance-view';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { SearchableSelect, type SearchableOption } from '@/components/ui/searchable-select';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface PlantRecord {
  id: string;
  name: string;
  code: string;
}

interface DepartmentRecord {
  id: string;
  name: string;
  code: string;
}

interface PortfolioSummary {
  maturedCycles: number;
  completed: number;
  openOverdue: number;
  missed: number;
  completionCompliancePct: number | null;
  machinesWithMaturedCycles: number;
  machinesWithOpenOverdue: number;
}

interface DepartmentRisk {
  departmentId: string | null;
  departmentName: string;
  machineCount: number;
  maturedCycles: number;
  completed: number;
  openOverdue: number;
  missed: number;
  completionCompliancePct: number | null;
  oldestOpenOverdueMinutes: number | null;
}

interface MachineRisk {
  assetId: string;
  assetName: string;
  assetTag: string;
  departmentId: string | null;
  departmentName: string;
  maturedCycles: number;
  completed: number;
  openOverdue: number;
  missed: number;
  completionCompliancePct: number | null;
  oldestOpenOverdueMinutes: number | null;
}

interface OverdueCycle {
  identity: string;
  assetId: string;
  assetName: string;
  assetTag: string;
  departmentId: string | null;
  departmentName: string;
  taskNumber: number;
  description: string;
  pmType: string;
  maintenanceMode: string;
  dueAt: string;
  outcome: 'completed' | 'overdue_open' | 'missed';
  delayMinutes: number | null;
  workOrderNumber: string;
  workOrderStatus: string;
}

interface PortfolioResponse {
  window: { days: number; start: string; end: string };
  summary: PortfolioSummary;
  departments: DepartmentRisk[];
  machines: MachineRisk[];
  oldestOpenOverdue: OverdueCycle[];
}

function formatDateTime(value: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}

function riskBadge(overdue: number, missed: number) {
  if (overdue > 0) {
    return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-300">{overdue} overdue</Badge>;
  }
  if (missed > 0) {
    return <Badge className="bg-red-100 text-red-700 hover:bg-red-100 dark:bg-red-950/40 dark:text-red-300">{missed} missed</Badge>;
  }
  return <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300">Clear</Badge>;
}

export function PmPortfolioCompliancePanel() {
  const [plantId, setPlantId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [windowDays, setWindowDays] = useState('30');
  const [plants, setPlants] = useState<PlantRecord[]>([]);
  const [departments, setDepartments] = useState<DepartmentRecord[]>([]);
  const [data, setData] = useState<PortfolioResponse | null>(null);
  const [loadingPlants, setLoadingPlants] = useState(true);
  const [loadingDepartments, setLoadingDepartments] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const loadPlants = async () => {
      setLoadingPlants(true);
      try {
        const response = await api.get<PlantRecord[]>('/api/plants');
        if (!response.success || !Array.isArray(response.data)) {
          throw new Error(response.error || 'Failed to load plants');
        }
        if (!active) return;
        setPlants(response.data);
        setPlantId((current) => current || response.data?.[0]?.id || '');
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Failed to load plants');
      } finally {
        if (active) setLoadingPlants(false);
      }
    };
    void loadPlants();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    setDepartmentId('');
    setDepartments([]);
    if (!plantId) return () => { active = false; };

    const loadDepartments = async () => {
      setLoadingDepartments(true);
      try {
        const response = await api.get<DepartmentRecord[]>(`/api/departments?plantId=${encodeURIComponent(plantId)}`);
        if (!response.success || !Array.isArray(response.data)) {
          throw new Error(response.error || 'Failed to load departments');
        }
        if (active) setDepartments(response.data);
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Failed to load departments');
      } finally {
        if (active) setLoadingDepartments(false);
      }
    };
    void loadDepartments();
    return () => { active = false; };
  }, [plantId]);

  const loadPortfolio = useCallback(async () => {
    if (!plantId) {
      setData(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ plantId, windowDays });
      if (departmentId) params.set('departmentId', departmentId);
      const response = await api.get<PortfolioResponse>(`/api/pm-assignments/compliance/portfolio?${params.toString()}`);
      if (!response.success) throw new Error(response.error || 'Failed to load PM portfolio compliance');
      setData(response.data || null);
    } catch (loadError) {
      setData(null);
      setError(loadError instanceof Error ? loadError.message : 'Failed to load PM portfolio compliance');
    } finally {
      setLoading(false);
    }
  }, [departmentId, plantId, windowDays]);

  useEffect(() => { void loadPortfolio(); }, [loadPortfolio]);

  const plantOptions: SearchableOption[] = useMemo(() => plants.map((plant) => ({
    value: plant.id,
    label: `${plant.name} [${plant.code}]`,
  })), [plants]);

  const departmentOptions: SearchableOption[] = useMemo(() => departments.map((department) => ({
    value: department.id,
    label: `${department.name} [${department.code}]`,
  })), [departments]);

  const topMachines = data ? takeTopPmPortfolioMachineRisks(data.machines) : [];

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Factory className="h-4 w-4 text-emerald-600" />PM Portfolio Compliance
            </CardTitle>
            <CardDescription>
              Plant and department exposure across matured direct-PM cycles. Completion compliance is not an on-time SLA metric.
            </CardDescription>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => void loadPortfolio()} disabled={!plantId || loading}>
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_11rem]">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Plant</Label>
            <SearchableSelect
              value={plantId}
              onValueChange={setPlantId}
              options={plantOptions}
              placeholder="Select plant..."
              searchPlaceholder="Search plants..."
              clearable={false}
              loading={loadingPlants}
              groupBy={false}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Department</Label>
            <SearchableSelect
              value={departmentId}
              onValueChange={setDepartmentId}
              options={departmentOptions}
              placeholder="All departments"
              searchPlaceholder="Search departments..."
              clearable
              loading={loadingDepartments}
              disabled={!plantId}
              groupBy={false}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Reporting Window</Label>
            <Select value={windowDays} onValueChange={setWindowDays}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="30">30 days</SelectItem>
                <SelectItem value="90">90 days</SelectItem>
                <SelectItem value="180">180 days</SelectItem>
                <SelectItem value="365">365 days</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {!plantId && !loadingPlants ? (
          <div className="rounded-lg border border-dashed p-6 text-center text-xs text-muted-foreground">No accessible plant is available for portfolio compliance.</div>
        ) : error ? (
          <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-200">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <div><p className="font-semibold">Portfolio compliance could not be loaded.</p><p className="mt-0.5 opacity-80">{error}</p></div>
          </div>
        ) : loading && !data ? (
          <div className="flex min-h-28 items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading PM portfolio compliance…</div>
        ) : data ? (
          <>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
              {buildPmPortfolioComplianceKpis(data.summary).map((kpi) => (
                <div key={kpi.key} className="rounded-lg border p-3">
                  <p className="text-[9px] uppercase text-muted-foreground">{kpi.label}</p>
                  <p className={`mt-1 text-lg font-bold ${kpi.key === 'overdue' ? 'text-amber-600' : kpi.key === 'missed' ? 'text-red-600' : kpi.key === 'completed' ? 'text-emerald-600' : ''}`}>{kpi.value}</p>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/10 px-3 py-2 text-[10px] text-muted-foreground">
              <span>{formatDateTime(data.window.start)} → {formatDateTime(data.window.end)}</span>
              {loading && <span className="flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" />Refreshing…</span>}
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <div className="rounded-lg border">
                <div className="border-b px-3 py-2.5">
                  <p className="flex items-center gap-1.5 text-xs font-semibold"><Building2 className="h-3.5 w-3.5" />Department Risk</p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">Ranked by open overdue, missed cycles, then completion compliance.</p>
                </div>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader><TableRow><TableHead className="text-xs">Department</TableHead><TableHead className="text-xs">Machines</TableHead><TableHead className="text-xs">Compliance</TableHead><TableHead className="text-xs">Exposure</TableHead><TableHead className="text-xs">Oldest</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {data.departments.length === 0 ? (
                        <TableRow><TableCell colSpan={5} className="py-6 text-center text-xs text-muted-foreground">No PM cycles matured in this reporting window.</TableCell></TableRow>
                      ) : data.departments.map((department) => (
                        <TableRow key={department.departmentId || '__unassigned__'}>
                          <TableCell><p className="text-xs font-medium">{department.departmentName}</p><p className="text-[9px] text-muted-foreground">{department.maturedCycles} matured · {department.completed} completed</p></TableCell>
                          <TableCell className="text-xs">{department.machineCount}</TableCell>
                          <TableCell className="text-xs font-semibold">{formatPmPortfolioPercentage(department.completionCompliancePct)}</TableCell>
                          <TableCell>{riskBadge(department.openOverdue, department.missed)}{department.missed > 0 && department.openOverdue > 0 && <p className="mt-1 text-[9px] text-red-600">{department.missed} missed</p>}</TableCell>
                          <TableCell className="whitespace-nowrap text-xs">{formatPmPortfolioDelay(department.oldestOpenOverdueMinutes)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              <div className="rounded-lg border">
                <div className="border-b px-3 py-2.5">
                  <p className="flex items-center gap-1.5 text-xs font-semibold"><ShieldAlert className="h-3.5 w-3.5" />Machine Risk · Top 15</p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">Highest-risk machines in server-ranked order.</p>
                </div>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader><TableRow><TableHead className="text-xs">Machine</TableHead><TableHead className="text-xs">Department</TableHead><TableHead className="text-xs">Compliance</TableHead><TableHead className="text-xs">Exposure</TableHead><TableHead className="text-xs">Oldest</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {topMachines.length === 0 ? (
                        <TableRow><TableCell colSpan={5} className="py-6 text-center text-xs text-muted-foreground">No machines have matured PM cycles in this window.</TableCell></TableRow>
                      ) : topMachines.map((machine) => (
                        <TableRow key={machine.assetId}>
                          <TableCell><p className="text-xs font-medium">{machine.assetName}</p><p className="font-mono text-[9px] text-muted-foreground">{machine.assetTag} · {machine.maturedCycles} matured</p></TableCell>
                          <TableCell className="text-xs">{machine.departmentName}</TableCell>
                          <TableCell className="text-xs font-semibold">{formatPmPortfolioPercentage(machine.completionCompliancePct)}</TableCell>
                          <TableCell>{riskBadge(machine.openOverdue, machine.missed)}{machine.missed > 0 && machine.openOverdue > 0 && <p className="mt-1 text-[9px] text-red-600">{machine.missed} missed</p>}</TableCell>
                          <TableCell className="whitespace-nowrap text-xs">{formatPmPortfolioDelay(machine.oldestOpenOverdueMinutes)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>

            <div className="rounded-lg border">
              <div className="border-b px-3 py-2.5">
                <p className="text-xs font-semibold">Oldest Open Overdue PM</p>
                <p className="mt-0.5 text-[10px] text-muted-foreground">The ten oldest still-open matured cycles in the selected portfolio.</p>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader><TableRow><TableHead className="text-xs">Machine</TableHead><TableHead className="text-xs">Task</TableHead><TableHead className="text-xs">Due</TableHead><TableHead className="text-xs">Work Order</TableHead><TableHead className="text-xs">Delay</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {data.oldestOpenOverdue.length === 0 ? (
                      <TableRow><TableCell colSpan={5} className="py-6 text-center text-xs text-muted-foreground">No open overdue PM cycles in this reporting window.</TableCell></TableRow>
                    ) : data.oldestOpenOverdue.map((cycle) => (
                      <TableRow key={cycle.identity}>
                        <TableCell><p className="text-xs font-medium">{cycle.assetName}</p><p className="font-mono text-[9px] text-muted-foreground">{cycle.assetTag} · {cycle.departmentName}</p></TableCell>
                        <TableCell><p className="font-mono text-[9px] text-muted-foreground">Task #{cycle.taskNumber} · {cycle.pmType.toUpperCase()}</p><p className="max-w-[320px] truncate text-xs" title={cycle.description}>{cycle.description}</p></TableCell>
                        <TableCell className="whitespace-nowrap text-[10px]">{formatDateTime(cycle.dueAt)}</TableCell>
                        <TableCell><p className="text-xs font-medium">{cycle.workOrderNumber}</p><p className="text-[9px] capitalize text-muted-foreground">{cycle.workOrderStatus.replace(/_/g, ' ')}</p></TableCell>
                        <TableCell className="whitespace-nowrap text-xs font-semibold text-amber-600">{formatPmPortfolioDelay(cycle.delayMinutes)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
