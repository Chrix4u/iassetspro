'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { toast } from 'sonner';
import { useModuleEnabled, MODULE_CODES } from '@/hooks/useModuleEnabled';
import { api } from '@/lib/api';

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Cell,
  ReferenceLine,
  ComposedChart,
} from 'recharts';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Download,
  TrendingUp,
  TrendingDown,
  Gauge,
  Clock,
  AlertTriangle,
  Activity,
  Target,
  Wrench,
  BarChart3,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MachineAvailabilityData {
  year: number;
  weeklyKPIs: Array<{
    week: number;
    weekLabel: string;
    totalMachines: number;
    availableMachines: number;
    efficientMachines: number;
    weightedAvgEfficiency: number;
    totalPlannedMins: number;
    totalRepairMins: number;
    totalBreakdowns: number;
    avgMTTR: number;
    avgMTBF: number;
    avgAvailability: number;
  }>;
  machines: Array<{
    assetId: string;
    assetName: string;
    assetTag: string;
    manufacturer: string | null;
    model: string | null;
    category: string | null;
    criticality: string | null;
    mfgYear: number | null;
    installYear: number | null;
    machineLife: number | null;
    weekly: Array<{
      week: number;
      plannedMins: number;
      stoppagesMins: number;
      repairDowntimeMins: number;
      breakdowns: number;
      actualAvailability: number;
      pctDowntime: number;
      efficiency: number;
      weightedEfficiency: number;
      mttr: number;
      mtbf: number;
      failureRate: number;
    }>;
    totals: {
      plannedMins: number;
      stoppagesMins: number;
      repairDowntimeMins: number;
      breakdowns: number;
      actualAvailability: number;
      avgEfficiency: number;
      avgMTTR: number;
      avgMTBF: number;
      avgFailureRate: number;
    };
  }>;
  pareto: {
    failurePareto: Array<{ assetName: string; avgFailureRate: number; cumulativePct: number }>;
    nbdPareto: Array<{ assetName: string; totalBreakdowns: number; cumulativePct: number }>;
    dtPareto: Array<{ assetName: string; totalRepairMins: number; cumulativePct: number }>;
    mttrPareto: Array<{ assetName: string; avgMTTR: number; cumulativePct: number }>;
  };
  weeklyTrends: {
    downtime: Array<{ week: number; totalMins: number; avgPerMachine: number }>;
    breakdowns: Array<{ week: number; count: number }>;
    mttr: Array<{ week: number; avg: number }>;
    mtbf: Array<{ week: number; avg: number }>;
    availability: Array<{ week: number; avg: number }>;
    failureRate: Array<{ week: number; avg: number }>;
  };
  targets: {
    efficiency: number;
    mttr: number;
    mtbf: number;
    failureRate: number;
    repairDowntimeWeekly: number;
    breakdownsWeekly: number;
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function effColor(v: number): string {
  if (v >= 97) return 'text-emerald-600 font-semibold';
  if (v >= 90) return 'text-amber-600 font-semibold';
  return 'text-red-600 font-semibold';
}

function effBg(v: number): string {
  if (v >= 97) return 'bg-emerald-50';
  if (v >= 90) return 'bg-amber-50';
  return 'bg-red-50';
}

function dtColor(v: number): string {
  if (v > 5) return 'text-red-600 font-semibold';
  if (v >= 2) return 'text-amber-600 font-semibold';
  return 'text-emerald-600 font-semibold';
}

function dtBg(v: number): string {
  if (v > 5) return 'bg-red-50';
  if (v >= 2) return 'bg-amber-50';
  return 'bg-emerald-50';
}

function fmt(n: number, dec = 1): string {
  if (n == null || Number.isNaN(n)) return '—';
  return n.toFixed(dec);
}

function fmtInt(n: number): string {
  if (n == null || Number.isNaN(n)) return '—';
  return Math.round(n).toLocaleString();
}

function statusBadge(breakdowns: number): { label: string; variant: 'destructive' | 'outline' | 'secondary' } {
  if (breakdowns > 5) return { label: 'Critical', variant: 'destructive' };
  if (breakdowns >= 2) return { label: 'Warning', variant: 'outline' };
  return { label: 'Normal', variant: 'secondary' };
}

const BAR_COLORS = [
  '#10b981', '#14b8a6', '#06b6d4', '#0ea5e9', '#6366f1',
  '#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#f43f5e',
  '#ef4444', '#f97316', '#eab308', '#84cc16', '#22c55e',
  '#10b981', '#14b8a6', '#06b6d4', '#0ea5e9', '#6366f1',
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function MachineAvailabilityPage() {
  const assetsEnabled = useModuleEnabled(MODULE_CODES.ASSETS);
  const repairsEnabled = useModuleEnabled(MODULE_CODES.REPAIRS);
  const pmEnabled = useModuleEnabled(MODULE_CODES.PM_SCHEDULES);
  const dtEnabled = useModuleEnabled(MODULE_CODES.DOWNTIME);
  const [data, setData] = useState<MachineAvailabilityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState(new Date().getFullYear());
  const [selectedWeek, setSelectedWeek] = useState<number | null>(null);
  const [tab, setTab] = useState('machine-details');

  // Fetch
  useEffect(() => {
    setLoading(true);
    api.get<MachineAvailabilityData>(`/api/reports/machine-availability?year=${year}`)
      .then((res) => {
        if (res.success && res.data) {
          setData(res.data);
          // default to latest week
          const weeks = res.data.weeklyKPIs.map((k: { week: number }) => k.week);
          setSelectedWeek(weeks.length > 0 ? weeks[weeks.length - 1] : null);
        } else {
          console.error('[MachineAvailability] API error:', res.error);
          toast.error(`Failed to load machine availability data: ${res.error || 'Unknown error'}`);
        }
      })
      .catch((err) => {
        console.error('[MachineAvailability] Network error:', err);
        toast.error(`Network error: ${err instanceof Error ? err.message : 'Request failed'}`);
      })
      .finally(() => setLoading(false));
  }, [year]);

  const weeks = useMemo(() => (data ? data.weeklyKPIs.map((k) => k.week) : []), [data]);

  const selectedKPI = useMemo(
    () => (data && selectedWeek ? data.weeklyKPIs.find((k) => k.week === selectedWeek) ?? null : null),
    [data, selectedWeek],
  );

  // Weighted average efficiency for the selected week (used in totals row)
  const weightedAvgEff = useMemo(() => {
    if (!data || !selectedWeek) return 100;
    let totalWE = 0;
    let totalPM = 0;
    for (const m of data.machines) {
      const w = m.weekly.find(x => x.week === selectedWeek);
      if (w) {
        totalWE += w.weightedEfficiency;
        totalPM += w.plannedMins;
      }
    }
    return totalPM > 0 ? totalWE / totalPM : 100;
  }, [data, selectedWeek]);

  // --- CSV Export (Tab 1) ---
  const exportCSV = useCallback(() => {
    if (!data || !selectedWeek) return;
    const header = [
      'Machine Name', 'Code', 'Mfg Year', 'Install Year', 'Life',
      'Planned (min)', 'Stoppages (min)', 'Repair DT (min)', 'Breakdowns',
      'Actual Avail (min)', '% DT', 'Efficiency', 'Weighted Eff',
    ];
    const rows = [header];
    for (const m of data.machines) {
      const w = m.weekly.find((x) => x.week === selectedWeek);
      rows.push([
        m.assetName,
        m.assetTag,
        String(m.mfgYear ?? ''),
        String(m.installYear ?? ''),
        String(m.machineLife ?? ''),
        w ? String(w.plannedMins) : '',
        w ? String(w.stoppagesMins) : '',
        w ? String(w.repairDowntimeMins) : '',
        w ? String(w.breakdowns) : '',
        w ? String(w.actualAvailability) : '',
        w ? fmt(w.pctDowntime) : '',
        w ? fmt(w.efficiency) : '',
        w ? fmt(w.efficiency) : '',
      ]);
    }
    const csv = rows.map((r) => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `machine-availability-wk${selectedWeek}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('CSV exported');
  }, [data, selectedWeek]);

  // Module disabled check — AFTER all hooks
  if (!assetsEnabled && !repairsEnabled) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <p className="text-muted-foreground">Modules Not Active</p>
          <p className="text-sm text-muted-foreground mt-1">Enable the Assets or Repairs module in Settings → Modules to view machine availability.</p>
        </div>
      </div>
    );
  }

  // ===================== LOADING =====================
  if (loading) {
    return (
      <div className="space-y-6 p-4 md:p-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-72" />
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
        <Skeleton className="h-[500px] w-full" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 p-12 text-center">
        <BarChart3 className="h-12 w-12 text-muted-foreground" />
        <p className="text-lg font-medium text-muted-foreground">No machine availability data found.</p>
        <p className="text-sm text-muted-foreground">Try selecting a different year.</p>
      </div>
    );
  }

  // Derived aggregates for Tab 6
  const latestWeek = weeks.length > 0 ? weeks[weeks.length - 1] : null;
  const latestKPI = latestWeek ? data.weeklyKPIs.find((k) => k.week === latestWeek) : null;
  const prevWeek = weeks.length > 1 ? weeks[weeks.length - 2] : null;
  const prevKPI = prevWeek ? data.weeklyKPIs.find((k) => k.week === prevWeek) : null;

  function trendVal(cur: number | undefined, prev: number | undefined): 'up' | 'down' | 'flat' {
    if (cur == null || prev == null) return 'flat';
    if (cur > prev) return 'up';
    if (cur < prev) return 'down';
    return 'flat';
  }

  // ===================== RENDER =====================
  return (
    <div className="space-y-4 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight md:text-2xl">Machine Availability &amp; Efficiency</h1>
          <p className="text-sm text-muted-foreground">
            Weekly machine register &mdash; Year {data.year}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[2023, 2024, 2025, 2026].map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList className="flex w-full flex-wrap gap-1">
          <TabsTrigger value="machine-details" className="text-xs sm:text-sm">Machine Details</TabsTrigger>
          <TabsTrigger value="efficiency" className="text-xs sm:text-sm">Efficiency Analysis</TabsTrigger>
          <TabsTrigger value="pareto" className="text-xs sm:text-sm">Pareto Analysis</TabsTrigger>
          <TabsTrigger value="trends" className="text-xs sm:text-sm">Weekly Trends</TabsTrigger>
          <TabsTrigger value="breakdown" className="text-xs sm:text-sm">Breakdown Summary</TabsTrigger>
          <TabsTrigger value="kpis" className="text-xs sm:text-sm">Targets &amp; KPIs</TabsTrigger>
        </TabsList>

        {/* ============================================================= */}
        {/* TAB 1 — Machine Details (Weekly Register)                 */}
        {/* ============================================================= */}
        <TabsContent value="machine-details" className="space-y-4">
          {/* KPI Strip */}
          {selectedKPI && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {[
                { label: 'Total Machines', value: String(selectedKPI.totalMachines), icon: BarChart3, color: 'text-slate-600', targetTab: 'machine-details' as const },
                { label: 'Available', value: String(selectedKPI.availableMachines), icon: Activity, color: 'text-emerald-600', targetTab: 'machine-details' as const },
                { label: 'Efficient (≥97%)', value: String(selectedKPI.efficientMachines), icon: Gauge, color: 'text-emerald-600', targetTab: 'efficiency' as const },
                { label: 'Weighted Avg Eff.', value: fmt(selectedKPI.weightedAvgEfficiency) + '%', icon: Target, color: selectedKPI.weightedAvgEfficiency >= 97 ? 'text-emerald-600' : selectedKPI.weightedAvgEfficiency >= 90 ? 'text-amber-600' : 'text-red-600', targetTab: 'efficiency' as const },
                repairsEnabled ? { label: 'Total Breakdowns', value: String(selectedKPI.totalBreakdowns), icon: AlertTriangle, color: selectedKPI.totalBreakdowns <= (data.targets.breakdownsWeekly ?? 2) ? 'text-emerald-600' : 'text-red-600', targetTab: 'breakdown' as const } : null,
              ].filter((item): item is NonNullable<typeof item> => Boolean(item)).map((item) => (
                <Card key={item.label} className="border border-border/60 shadow-sm cursor-pointer hover:shadow-md transition-shadow" onClick={() => setTab(item.targetTab)}>
                  <CardContent className="flex items-center gap-3 p-4">
                    <item.icon className={`h-5 w-5 shrink-0 ${item.color}`} />
                    <div className="min-w-0">
                      <p className="truncate text-xs text-muted-foreground">{item.label}</p>
                      <p className="text-lg font-bold leading-tight">{item.value}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Week Selector + Export */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Week:</span>
              <Select
                value={selectedWeek ? String(selectedWeek) : ''}
                onValueChange={(v) => setSelectedWeek(Number(v))}
              >
                <SelectTrigger className="w-52">
                  <SelectValue placeholder="Select week" />
                </SelectTrigger>
                <SelectContent>
                  {weeks.map((w) => {
                    const label = data.weeklyKPIs.find((k) => k.week === w)?.weekLabel ?? `Week ${w}`;
                    return (
                      <SelectItem key={w} value={String(w)}>
                        {label}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" size="sm" onClick={exportCSV} disabled={!selectedWeek}>
              <Download className="mr-1.5 h-4 w-4" />
              Export CSV
            </Button>
          </div>

          {/* Machine Details Table */}
          <Card className="border border-border/60 shadow-sm">
            <CardHeader className="px-4 py-3">
              <CardTitle className="text-sm font-semibold">
                Week {selectedWeek} — Machine Register
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-[480px] overflow-auto">
                <table className="w-full min-w-[800px] text-xs">
                  <thead>
                    <tr className="sticky top-0 z-10 bg-background border-b">
                      <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Machine Name</th>
                      <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Code</th>
                      <th className="px-3 py-2 text-right font-semibold text-muted-foreground">Mfg Year</th>
                      <th className="px-3 py-2 text-right font-semibold text-muted-foreground">Install Year</th>
                      <th className="px-3 py-2 text-right font-semibold text-muted-foreground">Life (yrs)</th>
                      {pmEnabled && <th className="px-3 py-2 text-right font-semibold text-muted-foreground">Planned (min)</th>}
                      {repairsEnabled && dtEnabled && <th className="px-3 py-2 text-right font-semibold text-muted-foreground">Stoppages (min)</th>}
                      {repairsEnabled && dtEnabled && <th className="px-3 py-2 text-right font-semibold text-muted-foreground">Repair DT (min)</th>}
                      {repairsEnabled && <th className="px-3 py-2 text-right font-semibold text-muted-foreground"># BD</th>}
                      <th className="px-3 py-2 text-right font-semibold text-muted-foreground">Actual Avail (min)</th>
                      {repairsEnabled && dtEnabled && <th className="px-3 py-2 text-right font-semibold text-muted-foreground">% Downtime</th>}
                      <th className="px-3 py-2 text-right font-semibold text-muted-foreground">Efficiency</th>
                      <th className="px-3 py-2 text-right font-semibold text-muted-foreground">Weighted Eff</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.machines.map((m, idx) => {
                      const w = m.weekly.find((x) => x.week === selectedWeek);
                      const eff = w?.efficiency ?? 0;
                      const pct = w?.pctDowntime ?? 0;
                      return (
                        <tr
                          key={m.assetId}
                          className={idx % 2 === 0 ? 'bg-background' : 'bg-muted/30'}
                        >
                          <td className="px-3 py-2 font-medium">{m.assetName}</td>
                          <td className="px-3 py-2 text-muted-foreground">{m.assetTag}</td>
                          <td className="px-3 py-2 text-right">{m.mfgYear ?? '—'}</td>
                          <td className="px-3 py-2 text-right">{m.installYear ?? '—'}</td>
                          <td className="px-3 py-2 text-right">{m.machineLife != null ? fmt(m.machineLife, 0) : '—'}</td>
                          {pmEnabled && <td className="px-3 py-2 text-right">{w ? fmtInt(w.plannedMins) : '—'}</td>}
                          {repairsEnabled && dtEnabled && <td className="px-3 py-2 text-right">{w ? fmtInt(w.stoppagesMins) : '—'}</td>}
                          {repairsEnabled && dtEnabled && <td className="px-3 py-2 text-right">{w ? fmtInt(w.repairDowntimeMins) : '—'}</td>}
                          {repairsEnabled && <td className="px-3 py-2 text-right">{w ? String(w.breakdowns) : '—'}</td>}
                          <td className="px-3 py-2 text-right">{w ? fmtInt(w.actualAvailability) : '—'}</td>
                          {repairsEnabled && dtEnabled && <td className={`px-3 py-2 text-right ${dtColor(pct)} ${dtBg(pct)}`}>{w ? fmt(pct) + '%' : '—'}</td>}
                          <td className={`px-3 py-2 text-right ${effColor(eff)} ${effBg(eff)}`}>{w ? fmt(eff) + '%' : '—'}</td>
                          <td className={`px-3 py-2 text-right ${effColor(eff)} ${effBg(eff)}`}>{w ? fmt(eff) + '%' : '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  {/* Totals row */}
                  {selectedWeek && (
                    <tfoot>
                      <tr className="sticky bottom-0 z-10 border-t-2 bg-muted/60 font-semibold">
                        <td className="px-3 py-2" colSpan={5}>TOTALS / AVERAGES</td>
                        {pmEnabled && <td className="px-3 py-2 text-right">{fmtInt(data.machines.reduce((s, m) => { const w = m.weekly.find(x => x.week === selectedWeek); return s + (w?.plannedMins ?? 0); }, 0))}</td>}
                        {repairsEnabled && dtEnabled && <td className="px-3 py-2 text-right">{fmtInt(data.machines.reduce((s, m) => { const w = m.weekly.find(x => x.week === selectedWeek); return s + (w?.stoppagesMins ?? 0); }, 0))}</td>}
                        {repairsEnabled && dtEnabled && <td className="px-3 py-2 text-right">{fmtInt(data.machines.reduce((s, m) => { const w = m.weekly.find(x => x.week === selectedWeek); return s + (w?.repairDowntimeMins ?? 0); }, 0))}</td>}
                        {repairsEnabled && <td className="px-3 py-2 text-right">{data.machines.reduce((s, m) => { const w = m.weekly.find(x => x.week === selectedWeek); return s + (w?.breakdowns ?? 0); }, 0)}</td>}
                        <td className="px-3 py-2 text-right">{fmtInt(data.machines.reduce((s, m) => { const w = m.weekly.find(x => x.week === selectedWeek); return s + (w?.actualAvailability ?? 0); }, 0))}</td>
                        {repairsEnabled && dtEnabled && <td className="px-3 py-2 text-right">{fmt(data.machines.reduce((s, m) => { const w = m.weekly.find(x => x.week === selectedWeek); return s + (w?.pctDowntime ?? 0); }, 0) / (data.machines.length || 1))}%</td>}
                        <td className={`px-3 py-2 text-right ${effColor(data.machines.reduce((s, m) => { const w = m.weekly.find(x => x.week === selectedWeek); return s + (w?.efficiency ?? 0); }, 0) / (data.machines.length || 1))}`}>{fmt(data.machines.reduce((s, m) => { const w = m.weekly.find(x => x.week === selectedWeek); return s + (w?.efficiency ?? 0); }, 0) / (data.machines.length || 1))}%</td>
                        <td className={`px-3 py-2 text-right ${effColor(weightedAvgEff)} ${effBg(weightedAvgEff)}`}>{fmt(weightedAvgEff)}%</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ============================================================= */}
        {/* TAB 2 — Efficiency Analysis Matrix                            */}
        {/* ============================================================= */}
        <TabsContent value="efficiency" className="space-y-4">
          <Card className="border border-border/60 shadow-sm">
            <CardHeader className="px-4 py-3">
              <CardTitle className="text-sm font-semibold">Weekly Efficiency Matrix</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-[500px] overflow-auto">
                <table className="w-full min-w-[900px] text-xs">
                  <thead>
                    <tr className="sticky top-0 z-10 bg-background border-b">
                      <th className="sticky left-0 z-20 bg-background px-3 py-2 text-left font-semibold">Machine</th>
                      {weeks.map((w) => (
                        <th key={w} className="px-2 py-2 text-center font-semibold text-muted-foreground min-w-[60px]">
                          W{w}
                        </th>
                      ))}
                      <th className="px-3 py-2 text-center font-semibold bg-muted/60 min-w-[60px]">Avg</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.machines.map((m, idx) => {
                      const rowAvg = m.weekly.length > 0
                        ? m.weekly.reduce((s, w) => s + w.efficiency, 0) / m.weekly.length
                        : 0;
                      return (
                        <tr key={m.assetId} className={idx % 2 === 0 ? 'bg-background' : 'bg-muted/30'}>
                          <td className="sticky left-0 z-10 bg-inherit px-3 py-2 font-medium whitespace-nowrap">
                            {m.assetName}
                          </td>
                          {weeks.map((wk) => {
                            const w = m.weekly.find((x) => x.week === wk);
                            const eff = w?.efficiency ?? 0;
                            return (
                              <td
                                key={wk}
                                className={`px-2 py-2 text-center ${effColor(eff)} ${effBg(eff)}`}
                              >
                                {w ? fmt(eff, 0) : '—'}
                              </td>
                            );
                          })}
                          <td className={`px-3 py-2 text-center font-semibold bg-muted/60 ${effColor(rowAvg)} ${effBg(rowAvg)}`}>
                            {fmt(rowAvg, 1)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="sticky bottom-0 z-10 border-t-2 bg-muted/60 font-semibold">
                      <td className="sticky left-0 z-20 bg-muted/60 px-3 py-2">Column Avg</td>
                      {weeks.map((wk) => {
                        const vals = data.machines.map((m) => m.weekly.find((x) => x.week === wk)?.efficiency).filter((v): v is number => v != null);
                        const avg = vals.length > 0 ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;
                        return (
                          <td key={wk} className={`px-2 py-2 text-center ${effColor(avg)}`}>
                            {vals.length > 0 ? fmt(avg, 1) : '—'}
                          </td>
                        );
                      })}
                      <td className="px-3 py-2 text-center bg-muted/80">
                        {fmt(data.machines.reduce((s, m) => {
                          const vals = m.weekly.map(w => w.efficiency);
                          return s + (vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0);
                        }, 0) / (data.machines.length || 1), 1)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ============================================================= */}
        {/* TAB 3 — Pareto Analysis (4 charts)                            */}
        {/* ============================================================= */}
        <TabsContent value="pareto" className="space-y-6">
          {!repairsEnabled ? (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-center text-muted-foreground">
              <BarChart3 className="h-10 w-10" />
              <p>Repairs module is not active.</p>
              <p className="text-sm">Enable it in Settings → Modules to view Pareto analysis.</p>
            </div>
          ) : (
          <>
          {data.pareto.failurePareto.length === 0 && data.pareto.nbdPareto.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-center text-muted-foreground">
              <BarChart3 className="h-10 w-10" />
              <p>No Pareto data available for this period.</p>
            </div>
          )}

          {/* Failure Rate Pareto */}
          {data.pareto.failurePareto.length > 0 && (
            <Card className="border border-border/60 shadow-sm">
              <CardHeader className="px-4 py-3">
                <CardTitle className="text-sm font-semibold">Failure Rate Pareto</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <ComposedChart data={data.pareto.failurePareto} margin={{ top: 10, right: 30, left: 0, bottom: 60 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="assetName" tick={{ fontSize: 10 }} angle={-45} textAnchor="end" height={70} />
                    <YAxis yAxisId="left" tick={{ fontSize: 11 }} label={{ value: 'Failure Rate %', angle: -90, position: 'insideLeft', style: { fontSize: 11 } }} />
                    <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tick={{ fontSize: 11 }} label={{ value: 'Cumulative %', angle: 90, position: 'insideRight', style: { fontSize: 11 } }} />
                    <Tooltip />
                    <Legend />
                    <Bar yAxisId="left" dataKey="avgFailureRate" name="Avg Failure Rate" radius={[3, 3, 0, 0]}>
                      {data.pareto.failurePareto.map((_, i) => (
                        <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                      ))}
                    </Bar>
                    <ReferenceLine yAxisId="right" y={80} stroke="#ef4444" strokeDasharray="6 3" label={{ value: '80%', position: 'right', fontSize: 11 }} />
                    <Line yAxisId="right" type="monotone" dataKey="cumulativePct" name="Cumulative %" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Breakdown Count Pareto */}
          {data.pareto.nbdPareto.length > 0 && (
            <Card className="border border-border/60 shadow-sm">
              <CardHeader className="px-4 py-3">
                <CardTitle className="text-sm font-semibold">Breakdown Count Pareto</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <ComposedChart data={data.pareto.nbdPareto} margin={{ top: 10, right: 30, left: 0, bottom: 60 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="assetName" tick={{ fontSize: 10 }} angle={-45} textAnchor="end" height={70} />
                    <YAxis yAxisId="left" tick={{ fontSize: 11 }} label={{ value: 'Breakdowns', angle: -90, position: 'insideLeft', style: { fontSize: 11 } }} />
                    <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend />
                    <Bar yAxisId="left" dataKey="totalBreakdowns" name="Total Breakdowns" radius={[3, 3, 0, 0]}>
                      {data.pareto.nbdPareto.map((_, i) => (
                        <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                      ))}
                    </Bar>
                    <ReferenceLine yAxisId="right" y={80} stroke="#ef4444" strokeDasharray="6 3" label={{ value: '80%', position: 'right', fontSize: 11 }} />
                    <Line yAxisId="right" type="monotone" dataKey="cumulativePct" name="Cumulative %" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Downtime Pareto */}
          {repairsEnabled && dtEnabled && data.pareto.dtPareto.length > 0 && (
            <Card className="border border-border/60 shadow-sm">
              <CardHeader className="px-4 py-3">
                <CardTitle className="text-sm font-semibold">Downtime Pareto (Repair Minutes)</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <ComposedChart data={data.pareto.dtPareto} margin={{ top: 10, right: 30, left: 0, bottom: 60 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="assetName" tick={{ fontSize: 10 }} angle={-45} textAnchor="end" height={70} />
                    <YAxis yAxisId="left" tick={{ fontSize: 11 }} label={{ value: 'Repair Mins', angle: -90, position: 'insideLeft', style: { fontSize: 11 } }} />
                    <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend />
                    <Bar yAxisId="left" dataKey="totalRepairMins" name="Total Repair Mins" radius={[3, 3, 0, 0]}>
                      {data.pareto.dtPareto.map((_, i) => (
                        <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                      ))}
                    </Bar>
                    <ReferenceLine yAxisId="right" y={80} stroke="#ef4444" strokeDasharray="6 3" label={{ value: '80%', position: 'right', fontSize: 11 }} />
                    <Line yAxisId="right" type="monotone" dataKey="cumulativePct" name="Cumulative %" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* MTTR Pareto */}
          {data.pareto.mttrPareto.length > 0 && (
            <Card className="border border-border/60 shadow-sm">
              <CardHeader className="px-4 py-3">
                <CardTitle className="text-sm font-semibold">MTTR Pareto (Minutes)</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <ComposedChart data={data.pareto.mttrPareto} margin={{ top: 10, right: 30, left: 0, bottom: 60 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="assetName" tick={{ fontSize: 10 }} angle={-45} textAnchor="end" height={70} />
                    <YAxis yAxisId="left" tick={{ fontSize: 11 }} label={{ value: 'MTTR (min)', angle: -90, position: 'insideLeft', style: { fontSize: 11 } }} />
                    <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend />
                    <Bar yAxisId="left" dataKey="avgMTTR" name="Avg MTTR" radius={[3, 3, 0, 0]}>
                      {data.pareto.mttrPareto.map((_, i) => (
                        <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                      ))}
                    </Bar>
                    <ReferenceLine yAxisId="right" y={80} stroke="#ef4444" strokeDasharray="6 3" label={{ value: '80%', position: 'right', fontSize: 11 }} />
                    <Line yAxisId="right" type="monotone" dataKey="cumulativePct" name="Cumulative %" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
          </>
          )}
        </TabsContent>

        {/* ============================================================= */}
        {/* TAB 4 — Weekly Trends (6 charts in 2x3 grid)                 */}
        {/* ============================================================= */}
        <TabsContent value="trends" className="space-y-4">
          {data.weeklyTrends.downtime.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-center text-muted-foreground">
              <TrendingUp className="h-10 w-10" />
              <p>No weekly trend data available.</p>
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {/* 1. Repair Downtime Trend */}
            {repairsEnabled && dtEnabled && (
            <Card className="border border-border/60 shadow-sm">
              <CardHeader className="px-4 py-3">
                <CardTitle className="text-sm font-semibold">Repair Downtime Trend</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={data.weeklyTrends.downtime} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="week" tick={{ fontSize: 11 }} label={{ value: 'Week', position: 'insideBottom', offset: -2, style: { fontSize: 11 } }} />
                    <YAxis tick={{ fontSize: 11 }} label={{ value: 'Mins', angle: -90, position: 'insideLeft', style: { fontSize: 11 } }} />
                    <Tooltip />
                    <Area type="monotone" dataKey="totalMins" name="Total Mins" stroke="#f97316" fill="#f973163a" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            )}

            {/* 2. Breakdown Count Trend */}
            {repairsEnabled && (
            <Card className="border border-border/60 shadow-sm">
              <CardHeader className="px-4 py-3">
                <CardTitle className="text-sm font-semibold">Breakdown Count Trend</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={data.weeklyTrends.breakdowns} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="week" tick={{ fontSize: 11 }} label={{ value: 'Week', position: 'insideBottom', offset: -2, style: { fontSize: 11 } }} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="count" name="Breakdowns" fill="#ef4444" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            )}

            {/* 3. MTTR Trend */}
            {repairsEnabled && (
            <Card className="border border-border/60 shadow-sm">
              <CardHeader className="px-4 py-3">
                <CardTitle className="text-sm font-semibold">MTTR Trend</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={data.weeklyTrends.mttr} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="week" tick={{ fontSize: 11 }} label={{ value: 'Week', position: 'insideBottom', offset: -2, style: { fontSize: 11 } }} />
                    <YAxis tick={{ fontSize: 11 }} label={{ value: 'Min', angle: -90, position: 'insideLeft', style: { fontSize: 11 } }} />
                    <Tooltip />
                    <ReferenceLine y={data.targets.mttr} stroke="#ef4444" strokeDasharray="6 3" label={{ value: `Target: ${data.targets.mttr}`, position: 'right', fontSize: 10 }} />
                    <Line type="monotone" dataKey="avg" name="Avg MTTR" stroke="#f97316" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            )}

            {/* 4. MTBF Trend */}
            {repairsEnabled && (
            <Card className="border border-border/60 shadow-sm">
              <CardHeader className="px-4 py-3">
                <CardTitle className="text-sm font-semibold">MTBF Trend</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={data.weeklyTrends.mtbf} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="week" tick={{ fontSize: 11 }} label={{ value: 'Week', position: 'insideBottom', offset: -2, style: { fontSize: 11 } }} />
                    <YAxis tick={{ fontSize: 11 }} label={{ value: 'Min', angle: -90, position: 'insideLeft', style: { fontSize: 11 } }} />
                    <Tooltip />
                    <ReferenceLine y={data.targets.mtbf} stroke="#10b981" strokeDasharray="6 3" label={{ value: `Target: ${data.targets.mtbf}`, position: 'right', fontSize: 10 }} />
                    <Line type="monotone" dataKey="avg" name="Avg MTBF" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            )}

            {/* 5. Availability Trend */}
            <Card className="border border-border/60 shadow-sm">
              <CardHeader className="px-4 py-3">
                <CardTitle className="text-sm font-semibold">Availability Trend</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={data.weeklyTrends.availability} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="week" tick={{ fontSize: 11 }} label={{ value: 'Week', position: 'insideBottom', offset: -2, style: { fontSize: 11 } }} />
                    <YAxis tick={{ fontSize: 11 }} domain={[80, 100]} label={{ value: '%', angle: -90, position: 'insideLeft', style: { fontSize: 11 } }} />
                    <Tooltip />
                    <ReferenceLine y={97} stroke="#10b981" strokeDasharray="6 3" label={{ value: 'Target: 97%', position: 'right', fontSize: 10 }} />
                    <Area type="monotone" dataKey="avg" name="Avg Availability %" stroke="#10b981" fill="#10b9813a" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* 6. Failure Rate Trend */}
            {repairsEnabled && (
            <Card className="border border-border/60 shadow-sm">
              <CardHeader className="px-4 py-3">
                <CardTitle className="text-sm font-semibold">Failure Rate Trend</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={data.weeklyTrends.failureRate} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="week" tick={{ fontSize: 11 }} label={{ value: 'Week', position: 'insideBottom', offset: -2, style: { fontSize: 11 } }} />
                    <YAxis tick={{ fontSize: 11 }} label={{ value: '%', angle: -90, position: 'insideLeft', style: { fontSize: 11 } }} />
                    <Tooltip />
                    <ReferenceLine y={data.targets.failureRate} stroke="#ef4444" strokeDasharray="6 3" label={{ value: `Target: ${data.targets.failureRate}%`, position: 'right', fontSize: 10 }} />
                    <Line type="monotone" dataKey="avg" name="Avg Failure Rate %" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            )}
          </div>
        </TabsContent>

        {/* ============================================================= */}
        {/* TAB 5 — Breakdown Summary                                     */}
        {/* ============================================================= */}
        <TabsContent value="breakdown" className="space-y-4">
          {!repairsEnabled ? (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-center text-muted-foreground">
              <AlertTriangle className="h-10 w-10" />
              <p>Repairs module is not active.</p>
              <p className="text-sm">Enable it in Settings → Modules to view breakdown data.</p>
            </div>
          ) : (
          <Card className="border border-border/60 shadow-sm">
            <CardHeader className="px-4 py-3">
              <CardTitle className="text-sm font-semibold">Breakdown Summary by Machine</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-[500px] overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="sticky top-0 z-10 bg-background">
                      <TableHead className="px-3 py-2">Machine Name</TableHead>
                      <TableHead className="px-3 py-2">Code</TableHead>
                      <TableHead className="px-3 py-2">Criticality</TableHead>
                      <TableHead className="px-3 py-2 text-right">Total BDs</TableHead>
                      <TableHead className="px-3 py-2 text-right">Total Downtime (hrs)</TableHead>
                      <TableHead className="px-3 py-2 text-right">Avg MTTR (min)</TableHead>
                      <TableHead className="px-3 py-2 text-right">Availability %</TableHead>
                      <TableHead className="px-3 py-2">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[...data.machines]
                      .sort((a, b) => b.totals.breakdowns - a.totals.breakdowns)
                      .map((m) => {
                        const st = statusBadge(m.totals.breakdowns);
                        const hrs = (m.totals.repairDowntimeMins / 60);
                        return (
                          <TableRow key={m.assetId}>
                            <TableCell className="px-3 py-2 font-medium">{m.assetName}</TableCell>
                            <TableCell className="px-3 py-2 text-muted-foreground">{m.assetTag}</TableCell>
                            <TableCell className="px-3 py-2">
                              {m.criticality ? (
                                <Badge
                                  variant={
                                    m.criticality.toLowerCase() === 'critical'
                                      ? 'destructive'
                                      : m.criticality.toLowerCase() === 'high'
                                        ? 'outline'
                                        : 'secondary'
                                  }
                                  className="text-[10px]"
                                >
                                  {m.criticality}
                                </Badge>
                              ) : '—'}
                            </TableCell>
                            <TableCell className="px-3 py-2 text-right font-medium">{m.totals.breakdowns}</TableCell>
                            <TableCell className="px-3 py-2 text-right">{fmt(hrs, 1)}</TableCell>
                            <TableCell className="px-3 py-2 text-right">{fmt(m.totals.avgMTTR, 0)}</TableCell>
                            <TableCell className={`px-3 py-2 text-right ${effColor(m.totals.avgEfficiency)}`}>
                              {fmt(m.totals.avgEfficiency, 1)}%
                            </TableCell>
                            <TableCell className="px-3 py-2">
                              <Badge variant={st.variant} className="text-[10px]">{st.label}</Badge>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
          )}
        </TabsContent>

        {/* ============================================================= */}
        {/* TAB 6 — Targets & KPIs (Executive Dashboard)                  */}
        {/* ============================================================= */}
        <TabsContent value="kpis" className="space-y-6">
          {/* KPI Cards */}
          {latestKPI && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {[
                {
                  label: 'Avg Efficiency',
                  value: fmt(latestKPI.weightedAvgEfficiency) + '%',
                  target: fmt(data.targets.efficiency) + '%',
                  met: latestKPI.weightedAvgEfficiency >= data.targets.efficiency,
                  icon: Gauge,
                  cur: latestKPI.weightedAvgEfficiency,
                  prev: prevKPI?.weightedAvgEfficiency,
                  higherIsGood: true,
                  targetTab: 'efficiency' as const,
                },
                repairsEnabled ? {
                  label: 'Avg MTTR',
                  value: fmt(latestKPI.avgMTTR, 0) + ' min',
                  target: '< ' + fmt(data.targets.mttr, 0) + ' min',
                  met: latestKPI.avgMTTR <= data.targets.mttr,
                  icon: Clock,
                  cur: latestKPI.avgMTTR,
                  prev: prevKPI?.avgMTTR,
                  higherIsGood: false,
                  targetTab: 'trends' as const,
                } : null,
                repairsEnabled ? {
                  label: 'Avg MTBF',
                  value: fmtInt(latestKPI.avgMTBF) + ' min',
                  target: '> ' + fmtInt(data.targets.mtbf) + ' min',
                  met: latestKPI.avgMTBF >= data.targets.mtbf,
                  icon: Wrench,
                  cur: latestKPI.avgMTBF,
                  prev: prevKPI?.avgMTBF,
                  higherIsGood: true,
                  targetTab: 'trends' as const,
                } : null,
                {
                  label: 'Avg Availability',
                  value: fmt(latestKPI.avgAvailability) + '%',
                  target: '≥ 97%',
                  met: latestKPI.avgAvailability >= 97,
                  icon: Activity,
                  cur: latestKPI.avgAvailability,
                  prev: prevKPI?.avgAvailability,
                  higherIsGood: true,
                  targetTab: 'trends' as const,
                },
                repairsEnabled ? {
                  label: 'Total Breakdowns',
                  value: String(latestKPI.totalBreakdowns),
                  target: '≤ ' + String(data.targets.breakdownsWeekly) + '/wk',
                  met: latestKPI.totalBreakdowns <= data.targets.breakdownsWeekly,
                  icon: AlertTriangle,
                  cur: latestKPI.totalBreakdowns,
                  prev: prevKPI?.totalBreakdowns,
                  higherIsGood: false,
                  targetTab: 'breakdown' as const,
                } : null,
                repairsEnabled ? {
                  label: 'Avg Failure Rate',
                  value: fmt(100 - latestKPI.weightedAvgEfficiency) + '%',
                  target: '< ' + fmt(data.targets.failureRate) + '%',
                  met: (100 - latestKPI.weightedAvgEfficiency) <= data.targets.failureRate,
                  icon: BarChart3,
                  cur: 100 - latestKPI.weightedAvgEfficiency,
                  prev: prevKPI ? 100 - prevKPI.weightedAvgEfficiency : undefined,
                  higherIsGood: false,
                  targetTab: 'pareto' as const,
                } : null,
              ].filter((item): item is NonNullable<typeof item> => Boolean(item)).map((item) => {
                const direction = trendVal(item.cur, item.prev);
                const trendIsGood =
                  direction === 'flat' ? item.met :
                  item.higherIsGood ? direction === 'up' : direction === 'down';
                return (
                  <Card
                    key={item.label}
                    className={`border shadow-sm cursor-pointer hover:shadow-md transition-shadow ${item.met ? 'border-emerald-200' : 'border-red-200'}`}
                    onClick={() => setTab(item.targetTab)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <item.icon className={`h-4 w-4 ${item.met ? 'text-emerald-600' : 'text-red-500'}`} />
                        {direction !== 'flat' && (
                          trendIsGood
                            ? <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
                            : <TrendingDown className="h-3.5 w-3.5 text-red-500" />
                        )}
                      </div>
                      <p className="mt-2 text-lg font-bold leading-tight">{item.value}</p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">{item.label}</p>
                      <p className="mt-1 text-[10px] text-muted-foreground">Target: {item.target}</p>
                      <Badge
                        variant={item.met ? 'secondary' : 'destructive'}
                        className={`mt-1.5 text-[10px] ${item.met ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100' : ''}`}
                      >
                        {item.met ? 'Met' : 'Missed'}
                      </Badge>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {/* Comparison Table: Machine vs Target */}
          <Card className="border border-border/60 shadow-sm">
            <CardHeader className="px-4 py-3">
              <CardTitle className="text-sm font-semibold">Machine Target Comparison</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-[500px] overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="sticky top-0 z-10 bg-background">
                      <TableHead className="px-3 py-2">Machine</TableHead>
                      <TableHead className="px-3 py-2 text-right">Efficiency %</TableHead>
                      <TableHead className="px-3 py-2 text-right">Target</TableHead>
                      <TableHead className="px-3 py-2 text-right">MTTR (min)</TableHead>
                      <TableHead className="px-3 py-2 text-right">Target</TableHead>
                      <TableHead className="px-3 py-2 text-right">MTBF (min)</TableHead>
                      <TableHead className="px-3 py-2 text-right">Target</TableHead>
                      <TableHead className="px-3 py-2 text-right">Failure Rate %</TableHead>
                      <TableHead className="px-3 py-2 text-right">Target</TableHead>
                      <TableHead className="px-3 py-2 text-center">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.machines.map((m) => {
                      const effMet = m.totals.avgEfficiency >= data.targets.efficiency;
                      const mttrMet = m.totals.avgMTTR <= data.targets.mttr;
                      const mtbfMet = m.totals.avgMTBF >= data.targets.mtbf;
                      const frMet = m.totals.avgFailureRate <= data.targets.failureRate;
                      const allMet = effMet && mttrMet && mtbfMet && frMet;
                      return (
                        <TableRow key={m.assetId}>
                          <TableCell className="px-3 py-2 font-medium whitespace-nowrap">{m.assetName}</TableCell>
                          <TableCell className={`px-3 py-2 text-right ${effMet ? '' : 'text-red-600 font-semibold bg-red-50'}`}>
                            {fmt(m.totals.avgEfficiency, 1)}
                          </TableCell>
                          <TableCell className="px-3 py-2 text-right text-muted-foreground">{data.targets.efficiency}</TableCell>
                          <TableCell className={`px-3 py-2 text-right ${mttrMet ? '' : 'text-red-600 font-semibold bg-red-50'}`}>
                            {fmt(m.totals.avgMTTR, 0)}
                          </TableCell>
                          <TableCell className="px-3 py-2 text-right text-muted-foreground">{data.targets.mttr}</TableCell>
                          <TableCell className={`px-3 py-2 text-right ${mtbfMet ? '' : 'text-red-600 font-semibold bg-red-50'}`}>
                            {fmtInt(m.totals.avgMTBF)}
                          </TableCell>
                          <TableCell className="px-3 py-2 text-right text-muted-foreground">{fmtInt(data.targets.mtbf)}</TableCell>
                          <TableCell className={`px-3 py-2 text-right ${frMet ? '' : 'text-red-600 font-semibold bg-red-50'}`}>
                            {fmt(m.totals.avgFailureRate, 1)}
                          </TableCell>
                          <TableCell className="px-3 py-2 text-right text-muted-foreground">{data.targets.failureRate}</TableCell>
                          <TableCell className="px-3 py-2 text-center">
                            <Badge
                              variant={allMet ? 'secondary' : 'destructive'}
                              className={`text-[10px] ${allMet ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100' : ''}`}
                            >
                              {allMet ? 'All Met' : 'Missed'}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default MachineAvailabilityPage;