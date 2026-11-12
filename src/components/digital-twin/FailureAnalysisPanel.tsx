'use client';

import { formatUiDate } from '@/lib/date-display';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { formatDuration, formatDurationFromMinutes } from '@/components/shared/helpers';
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  Clock,
  AlertTriangle,
  DollarSign,
  Activity,
  Filter,
  Loader2,
  ChevronDown,
  RefreshCw,
  AlertOctagon,
  ShieldCheck,
  Timer,
  Zap,
  CircleDot,
  Calendar,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useDigitalTwinStore } from '@/stores/digitalTwinStore';
import type { FailureAnalysisData, FailureRecord } from '@/types';

// ============================================================================
// Types
// ============================================================================

export interface FailureAnalysisPanelProps {
  /** Asset ID to load analysis for */
  assetId?: string;
  /** Component ID to load analysis for */
  componentId?: string;
  /** Compact mode for embedding */
  compact?: boolean;
}

// ============================================================================
// Severity Badge
// ============================================================================

function SeverityBadge({ severity }: { severity: string }) {
  const s = (severity || '').toLowerCase();
  const config: Record<string, string> = {
    critical: 'bg-red-600/20 text-red-400 border-red-600/30',
    high: 'bg-orange-600/20 text-orange-400 border-orange-600/30',
    medium: 'bg-amber-600/20 text-amber-400 border-amber-600/30',
    low: 'bg-slate-600/20 text-slate-400 border-slate-600/30',
  };
  return (
    <Badge variant="outline" className={`text-[9px] px-1.5 py-0 ${config[s] ?? 'bg-slate-600/20 text-slate-400 border-slate-600/30'}`}>
      {severity || '—'}
    </Badge>
  );
}

// ============================================================================
// KPI Card
// ============================================================================

function KpiCard({ label, value, icon, color, suffix }: {
  label: string;
  value: string;
  icon: React.ReactNode;
  color: string;
  suffix?: string;
}) {
  return (
    <Card className="bg-white/[0.03] border-white/[0.06]">
      <CardContent className="p-3">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-[10px] text-slate-500 uppercase tracking-wider">{label}</div>
            <div className={`text-lg font-bold mt-1 ${color}`}>
              {value}
              {suffix && <span className="text-xs font-normal text-slate-400 ml-1">{suffix}</span>}
            </div>
          </div>
          <div className={`p-1.5 rounded-md ${color.replace('text-', 'bg-').replace('400', '400/10')}`}>
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Failure Mode Distribution (Horizontal Bar)
// ============================================================================

function FailureModeDistribution({ data }: { data: { mode: string; count: number; percentage: number }[] }) {
  const maxCount = Math.max(...data.map((d) => d.count), 1);

  return (
    <Card className="bg-white/[0.03] border-white/[0.06]">
      <CardHeader className="py-2.5 px-4">
        <CardTitle className="flex items-center gap-2 text-xs font-semibold text-slate-300">
          <BarChart3 className="h-3.5 w-3.5 text-slate-400" />
          Failure Mode Distribution
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        {data.length === 0 ? (
          <div className="text-xs text-slate-500 py-4 text-center">No data available</div>
        ) : (
          <div className="space-y-3">
            {data.map((item, i) => (
              <div key={i}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-slate-300 truncate">{item.mode}</span>
                  <span className="text-[10px] text-slate-500">
                    {item.count} ({item.percentage}%)
                  </span>
                </div>
                <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${(item.count / maxCount) * 100}%`,
                      backgroundColor: i === 0 ? '#ef4444' : i === 1 ? '#f59e0b' : i === 2 ? '#06b6d4' : '#64748b',
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Severity Breakdown (CSS Pie Chart)
// ============================================================================

function SeverityBreakdown({ data }: { data: { severity: string; count: number }[] }) {
  const total = data.reduce((sum, d) => sum + d.count, 0);
  if (total === 0) {
    return (
      <Card className="bg-white/[0.03] border-white/[0.06]">
        <CardHeader className="py-2.5 px-4">
          <CardTitle className="flex items-center gap-2 text-xs font-semibold text-slate-300">
            <AlertOctagon className="h-3.5 w-3.5 text-slate-400" />
            Severity Breakdown
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="text-xs text-slate-500 py-4 text-center">No data available</div>
        </CardContent>
      </Card>
    );
  }

  const severityColors: Record<string, string> = {
    critical: '#ef4444',
    high: '#f97316',
    medium: '#f59e0b',
    low: '#64748b',
  };

  // Build conic-gradient for pie chart
  let gradientParts: string[] = [];
  let cumulative = 0;
  data.forEach((d) => {
    const pct = (d.count / total) * 100;
    const color = severityColors[d.severity.toLowerCase()] ?? '#64748b';
    gradientParts.push(`${color} ${cumulative}% ${cumulative + pct}%`);
    cumulative += pct;
  });

  return (
    <Card className="bg-white/[0.03] border-white/[0.06]">
      <CardHeader className="py-2.5 px-4">
        <CardTitle className="flex items-center gap-2 text-xs font-semibold text-slate-300">
          <AlertOctagon className="h-3.5 w-3.5 text-slate-400" />
          Severity Breakdown
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <div className="flex items-center gap-6">
          {/* Pie chart */}
          <div
            className="w-24 h-24 rounded-full flex-shrink-0"
            style={{
              background: `conic-gradient(${gradientParts.join(', ')})`,
            }}
          >
            <div className="w-full h-full rounded-full flex items-center justify-center" style={{ background: 'rgba(10,10,18,0.95)' }}>
              <div className="text-center">
                <div className="text-base font-bold text-slate-200">{total}</div>
                <div className="text-[8px] text-slate-500 uppercase">Total</div>
              </div>
            </div>
          </div>

          {/* Legend */}
          <div className="flex-1 space-y-2">
            {data.map((d) => (
              <div key={d.severity} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div
                    className="h-2.5 w-2.5 rounded-sm"
                    style={{ backgroundColor: severityColors[d.severity.toLowerCase()] ?? '#64748b' }}
                  />
                  <span className="text-xs text-slate-300 capitalize">{d.severity}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-200">{d.count}</span>
                  <span className="text-[10px] text-slate-500">
                    {Math.round((d.count / total) * 100)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Monthly Trend (CSS Line Chart)
// ============================================================================

function MonthlyTrend({ data }: { data: { month: string; failures: number }[] }) {
  const maxFailures = Math.max(...data.map((d) => d.failures), 1);

  return (
    <Card className="bg-white/[0.03] border-white/[0.06]">
      <CardHeader className="py-2.5 px-4">
        <CardTitle className="flex items-center gap-2 text-xs font-semibold text-slate-300">
          <TrendingUp className="h-3.5 w-3.5 text-slate-400" />
          Monthly Trend (12 months)
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        {data.length === 0 ? (
          <div className="text-xs text-slate-500 py-4 text-center">No data available</div>
        ) : (
          <div className="space-y-3">
            {/* Chart area */}
            <div className="flex items-end gap-1 h-32">
              {data.map((d, i) => {
                const h = (d.failures / maxFailures) * 100;
                const color = d.failures === 0 ? 'bg-emerald-500/60' : d.failures <= 2 ? 'bg-amber-500/60' : 'bg-red-500/60';
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1 group relative">
                    {/* Tooltip */}
                    <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-slate-800 border border-slate-700 text-[9px] text-slate-200 px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                      {d.failures} failures
                    </div>
                    <div
                      className={`w-full rounded-t transition-all ${color} group-hover:opacity-100 cursor-default`}
                      style={{ height: `${Math.max(h, 4)}%` }}
                    />
                  </div>
                );
              })}
            </div>
            {/* Labels */}
            <div className="flex gap-1">
              {data.map((d, i) => (
                <div key={i} className="flex-1 text-center">
                  <span className="text-[8px] text-slate-600">{d.month.slice(-2)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Main FailureAnalysisPanel
// ============================================================================

export function FailureAnalysisPanel({
  assetId,
  componentId,
  compact = false,
}: FailureAnalysisPanelProps) {
  const failureAnalysis = useDigitalTwinStore((s) => s.failureAnalysis);
  const failureRecords = useDigitalTwinStore((s) => s.failureRecords);
  const isLoading = useDigitalTwinStore((s) => s.isLoadingFailureAnalysis);
  const loadFailureAnalysis = useDigitalTwinStore((s) => s.loadFailureAnalysis);

  const [filters, setFilters] = useState<{
    failureMode: string;
    severity: string;
    dateRange: string;
  }>({
    failureMode: 'all',
    severity: 'all',
    dateRange: 'all',
  });

  // Load data
  useEffect(() => {
    if (assetId || componentId) {
      loadFailureAnalysis({ assetId, componentId });
    }
  }, [assetId, componentId, loadFailureAnalysis]);

  // Filtered records
  const filteredRecords = useMemo(() => {
    let records = [...failureRecords];
    if (filters.severity !== 'all') {
      records = records.filter((r) => r.failureSeverity.toLowerCase() === filters.severity.toLowerCase());
    }
    if (filters.failureMode !== 'all') {
      records = records.filter((r) => r.failureMode === filters.failureMode);
    }
    return records;
  }, [failureRecords, filters]);

  const refresh = useCallback(() => {
    if (assetId || componentId) {
      loadFailureAnalysis({ assetId, componentId });
    }
  }, [assetId, componentId, loadFailureAnalysis]);

  if (isLoading && !failureAnalysis) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="flex flex-col items-center gap-3 text-slate-500">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span className="text-xs">Loading failure analysis...</span>
        </div>
      </div>
    );
  }

  if (!failureAnalysis) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-slate-500">
        <BarChart3 className="h-8 w-8 mb-2 opacity-40" />
        <span className="text-xs">No failure analysis data available</span>
        <span className="text-[10px] mt-1">Select an asset to view failure analysis</span>
      </div>
    );
  }

  const totalCost = failureAnalysis.totalRepairCost;

  if (compact) {
    return (
      <div className="space-y-3">
        {/* Compact KPI row */}
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-2 text-center">
            <div className="text-[9px] text-slate-500 uppercase">MTBF</div>
            <div className="text-sm font-bold text-emerald-400">
              {failureAnalysis.mtbf ? `${(failureAnalysis.mtbf / 24).toFixed(0)}d` : 'N/A'}
            </div>
          </div>
          <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-2 text-center">
            <div className="text-[9px] text-slate-500 uppercase">MTTR</div>
            <div className="text-sm font-bold text-amber-400">
              {failureAnalysis.mttr ? formatDuration(failureAnalysis.mttr) : 'N/A'}
            </div>
          </div>
          <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-2 text-center">
            <div className="text-[9px] text-slate-500 uppercase">Failures</div>
            <div className="text-sm font-bold text-red-400">{failureAnalysis.failureCount}</div>
          </div>
        </div>

        {/* Recent failures list */}
        <div className="space-y-1.5">
          {filteredRecords.slice(0, 5).map((fr) => (
            <div key={fr.id} className="flex items-center gap-2 p-2 rounded-md bg-white/[0.02] border border-white/[0.04]">
              <SeverityBadge severity={fr.failureSeverity} />
              <div className="flex-1 min-w-0">
                <div className="text-xs text-slate-200 truncate">{fr.failureMode}</div>
                <div className="text-[10px] text-slate-500">{formatUiDate(fr.detectedAt)}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-red-500/20 flex items-center justify-center">
            <BarChart3 className="h-4 w-4 text-red-400" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-200">Failure Analysis</h2>
            <p className="text-[10px] text-slate-500">Comprehensive failure pattern analysis</p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={refresh}
          className="h-8 w-8 text-slate-400 hover:text-slate-200"
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard
          label="Total Failures"
          value={String(failureAnalysis.failureCount)}
          icon={<AlertOctagon className="h-4 w-4 text-red-400" />}
          color="text-red-400"
        />
        <KpiCard
          label="MTBF"
          value={failureAnalysis.mtbf ? `${(failureAnalysis.mtbf / 24).toFixed(0)}` : 'N/A'}
          suffix="days"
          icon={<ShieldCheck className="h-4 w-4 text-emerald-400" />}
          color="text-emerald-400"
        />
        <KpiCard
          label="MTTR"
          value={failureAnalysis.mttr ? failureAnalysis.mttr.toFixed(1) : 'N/A'}
          suffix="hours"
          icon={<Timer className="h-4 w-4 text-amber-400" />}
          color="text-amber-400"
        />
        <KpiCard
          label="Reliability"
          value={`${failureAnalysis.reliabilityScore}%`}
          icon={<Activity className="h-4 w-4 text-cyan-400" />}
          color={failureAnalysis.reliabilityScore > 70 ? 'text-emerald-400' : failureAnalysis.reliabilityScore > 40 ? 'text-amber-400' : 'text-red-400'}
        />
        <KpiCard
          label="Total Downtime"
          value={formatDurationFromMinutes(failureAnalysis.totalDowntimeMinutes)}
          suffix="hours"
          icon={<Clock className="h-4 w-4 text-orange-400" />}
          color="text-orange-400"
        />
        <KpiCard
          label="Total Cost"
          value={`$${totalCost.toLocaleString()}`}
          icon={<DollarSign className="h-4 w-4 text-slate-400" />}
          color="text-slate-200"
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <FailureModeDistribution data={failureAnalysis.byMode} />
        <SeverityBreakdown data={failureAnalysis.bySeverity} />
        <MonthlyTrend data={failureAnalysis.byMonth} />
      </div>

      {/* Top Failing Components */}
      {failureAnalysis.topFailingComponents.length > 0 && (
        <Card className="bg-white/[0.03] border-white/[0.06]">
          <CardHeader className="py-2.5 px-4">
            <CardTitle className="flex items-center gap-2 text-xs font-semibold text-slate-300">
              <Zap className="h-3.5 w-3.5 text-slate-400" />
              Top Failing Components
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="space-y-2">
              {failureAnalysis.topFailingComponents.map((comp, i) => (
                <div key={comp.id} className="flex items-center gap-3 p-2 rounded-md bg-white/[0.02] border border-white/[0.04]">
                  <span className="text-xs font-bold text-slate-500 w-5 text-center">#{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-slate-200 truncate">{comp.name}</div>
                    <div className="text-[10px] text-slate-500 font-mono">{comp.code}</div>
                  </div>
                  <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-red-500/30 text-red-400">
                    {comp.failureCount} failures
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <Card className="bg-white/[0.03] border-white/[0.06]">
        <CardHeader className="py-2.5 px-4">
          <CardTitle className="flex items-center gap-2 text-xs font-semibold text-slate-300">
            <Filter className="h-3.5 w-3.5 text-slate-400" />
            Recent Failures
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <Select value={filters.severity} onValueChange={(v) => setFilters((f) => ({ ...f, severity: v }))}>
              <SelectTrigger className="h-7 text-[10px] bg-white/[0.04] border-white/[0.08] w-32">
                <SelectValue placeholder="Severity" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Severity</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filters.failureMode} onValueChange={(v) => setFilters((f) => ({ ...f, failureMode: v }))}>
              <SelectTrigger className="h-7 text-[10px] bg-white/[0.04] border-white/[0.08] w-36">
                <SelectValue placeholder="Failure Mode" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Modes</SelectItem>
                {failureAnalysis.byMode.map((m) => (
                  <SelectItem key={m.mode} value={m.mode}>{m.mode}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-[10px] text-slate-500 ml-auto">
              {filteredRecords.length} record{filteredRecords.length !== 1 ? 's' : ''}
            </span>
          </div>

          {/* Records Table */}
          <ScrollArea className="max-h-80">
            <Table>
              <TableHeader>
                <TableRow className="border-white/[0.06] hover:bg-transparent">
                  <TableHead className="text-[10px] text-slate-500 font-medium h-8">Component</TableHead>
                  <TableHead className="text-[10px] text-slate-500 font-medium h-8">Mode</TableHead>
                  <TableHead className="text-[10px] text-slate-500 font-medium h-8">Severity</TableHead>
                  <TableHead className="text-[10px] text-slate-500 font-medium h-8">Date</TableHead>
                  <TableHead className="text-[10px] text-slate-500 font-medium h-8">Duration</TableHead>
                  <TableHead className="text-[10px] text-slate-500 font-medium h-8">Cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRecords.length === 0 ? (
                  <TableRow className="border-white/[0.06]">
                    <TableCell colSpan={6} className="text-xs text-slate-500 py-6 text-center">
                      No failure records match the filters
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredRecords.map((fr) => (
                    <TableRow key={fr.id} className="border-white/[0.04] hover:bg-white/[0.02]">
                      <TableCell className="text-xs text-slate-200 py-2">
                        {fr.component?.name ?? 'Unknown'}
                      </TableCell>
                      <TableCell className="text-xs text-slate-300 py-2">{fr.failureMode}</TableCell>
                      <TableCell className="py-2">
                        <SeverityBadge severity={fr.failureSeverity} />
                      </TableCell>
                      <TableCell className="text-[10px] text-slate-400 py-2">
                        {formatUiDate(fr.detectedAt)}
                      </TableCell>
                      <TableCell className="text-[10px] text-slate-400 py-2">
                        {fr.downtimeMinutes > 60
                          ? formatDurationFromMinutes(fr.downtimeMinutes)
                          : `${fr.downtimeMinutes}m`}
                      </TableCell>
                      <TableCell className="text-[10px] text-slate-400 py-2">
                        {fr.repairCost ? `$${fr.repairCost.toLocaleString()}` : '—'}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}

export default FailureAnalysisPanel;
