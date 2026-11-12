'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { api } from '@/lib/api';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent } from '@/components/ui/chart';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, ResponsiveContainer, LineChart, Line, BarChart, Bar } from 'recharts';
import {
  Activity, Database, HardDrive, Clock, TrendingUp, TrendingDown, Minus,
  AlertTriangle, CheckCircle2, XCircle, RefreshCw, Search, BarChart3,
  Zap, Shield, Layers, ArrowUpDown, Eye,
} from 'lucide-react';

// ============================================================================
// TYPES
// ============================================================================

interface DashboardData {
  tagMonitor: TagMonitor[];
  dataCompleteness: DataCompleteness;
  storage: StorageUtil;
  ingestion: IngestionMetrics;
  topConsumers: TopConsumer[];
  anomalySummary: AnomalySummary;
  qualityScores: QualityScore[];
  generatedAt: string;
}

interface TagMonitor {
  sourceId: string;
  latestValue: number | null;
  latestTimestamp: string | null;
  quality: number | null;
  status: 'active' | 'stale' | 'inactive';
  readingsLastHour: number;
  trend: 'up' | 'down' | 'stable' | 'unknown';
}

interface DataCompleteness {
  period: string;
  totalSources: number;
  activeSources: number;
  overallCompleteness: number;
  sourcesByCompleteness: Array<{ sourceId: string; expectedCount: number; actualCount: number; completeness: number }>;
}

interface StorageUtil {
  totalRawReadings: number;
  totalDownsampledReadings: number;
  estimatedRawBytes: number;
  estimatedDownsampledBytes: number;
  totalEstimatedBytes: number;
  formattedTotal: string;
  bySource: Array<{ sourceId: string; rawCount: number; downsampledCount: number; percentageOfTotal: number }>;
}

interface IngestionMetrics {
  readingsPerSecond: number;
  readingsPerMinute: number;
  readingsPerHour: number;
  readingsToday: number;
  readingsLastHour: number;
  peakReadingsPerMinute: number;
  averageReadingsPerMinute: number;
}

interface TopConsumer {
  sourceId: string;
  totalReadings: number;
  percentageOfTotal: number;
  avgReadingsPerDay: number;
  growthRate: number;
}

interface AnomalySummary {
  totalActive: number;
  unacknowledged: number;
  bySeverity: Record<string, number>;
  bySource: Array<{ sourceId: string; count: number; avgScore: number; latestAnomaly: string | null }>;
}

interface QualityScore {
  sourceId: string;
  overallScore: number;
  completenessScore: number;
  qualityScore: number;
  timelinessScore: number;
  consistencyScore: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
}

interface RetentionPolicy {
  id: string;
  name: string;
  description: string | null;
  sourceId: string | null;
  keepDays: number;
  aggregationKeepDays: number | null;
  isActive: boolean;
  lastExecutedAt: string | null;
  totalDeleted: number;
}

interface DownsamplingPolicy {
  id: string;
  sourceId: string | null;
  rawRetentionDays: number;
  minuteRetentionDays: number;
  hourlyRetentionDays: number;
  dailyRetentionDays: number;
  weeklyRetentionDays: number;
  aggregationMethod: string;
  isActive: boolean;
}

interface DownsamplingSourceStatus {
  sourceId: string;
  lastBucket: Record<string, Date | null>;
  totalDownsampled: Record<string, number>;
}

interface AnomalyRecord {
  id: string;
  sourceId: string;
  detectedAt: string;
  method: string;
  value: number;
  expectedValue: number | null;
  anomalyScore: number;
  severity: string;
  confirmed: boolean;
  acknowledgedAt: string | null;
}

interface TrendDataPoint {
  time: string;
  value: number;
}

type TimeRange = '1h' | '6h' | '24h' | '7d' | '30d' | '90d' | '1y';

const TIME_RANGES: { label: string; value: TimeRange; ms: number }[] = [
  { label: '1H', value: '1h', ms: 3600000 },
  { label: '6H', value: '6h', ms: 21600000 },
  { label: '24H', value: '24h', ms: 86400000 },
  { label: '7D', value: '7d', ms: 604800000 },
  { label: '30D', value: '30d', ms: 2592000000 },
  { label: '90D', value: '90d', ms: 7776000000 },
  { label: '1Y', value: '1y', ms: 31536000000 },
];

const COMPARISON_COLORS = ['#10b981', '#f59e0b', '#8b5cf6'];

function autoInterval(range: TimeRange): string {
  switch (range) {
    case '1h': return '1m';
    case '6h': return '5m';
    case '24h': return '1h';
    case '7d': return '1h';
    case '30d': return '1d';
    case '90d': return '1d';
    case '1y': return '1w';
    default: return '1h';
  }
}

function formatNumber(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toLocaleString();
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function formatTimestamp(ts: string): string {
  const d = new Date(ts);
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function HistorianDashboard() {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/api/historian/dashboard?view=full');
      if (res.success) setDashboard(res.data);
    } catch (e) {
      console.error('Failed to load dashboard', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchDashboard(); }, [fetchDashboard]);

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl px-4 py-6 space-y-6 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-emerald-100 dark:bg-emerald-950/40 flex items-center justify-center">
              <Database className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">Historian Dashboard</h1>
              <p className="text-sm text-muted-foreground">Time-series data management and analytics</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {dashboard && (
              <span className="text-xs text-muted-foreground hidden sm:inline">
                Updated {timeAgo(dashboard.generatedAt)}
              </span>
            )}
            <Button variant="outline" size="sm" onClick={fetchDashboard} disabled={loading}>
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-4 sm:w-auto sm:inline-grid">
            <TabsTrigger value="overview" className="text-xs sm:text-sm">Overview</TabsTrigger>
            <TabsTrigger value="trends" className="text-xs sm:text-sm">Trends</TabsTrigger>
            <TabsTrigger value="policies" className="text-xs sm:text-sm">Policies</TabsTrigger>
            <TabsTrigger value="anomalies" className="text-xs sm:text-sm">Anomalies</TabsTrigger>
          </TabsList>

          {/* ================================================================== */}
          {/* OVERVIEW TAB */}
          {/* ================================================================== */}
          <TabsContent value="overview" className="space-y-6 mt-6">
            {loading && !dashboard ? <OverviewSkeleton /> : dashboard && (
              <>
                <DataSummaryCards dashboard={dashboard} />
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                  <IngestionCard ingestion={dashboard.ingestion} />
                  <CompletenessCard completeness={dashboard.dataCompleteness} />
                </div>
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                  <StorageCard storage={dashboard.storage} />
                  <AnomalySummaryCard anomaly={dashboard.anomalySummary} />
                </div>
                <TagBrowser tags={dashboard.tagMonitor} qualityScores={dashboard.qualityScores} />
              </>
            )}
          </TabsContent>

          {/* ================================================================== */}
          {/* TRENDS TAB */}
          {/* ================================================================== */}
          <TabsContent value="trends" className="space-y-6 mt-6">
            <TrendViewer tagMonitor={dashboard?.tagMonitor ?? []} />
            <ComparisonView tagMonitor={dashboard?.tagMonitor ?? []} />
            <CalculatedMetrics tagMonitor={dashboard?.tagMonitor ?? []} />
          </TabsContent>

          {/* ================================================================== */}
          {/* POLICIES TAB */}
          {/* ================================================================== */}
          <TabsContent value="policies" className="space-y-6 mt-6">
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <DownsamplingStatusCard />
              <RetentionPolicyCard />
            </div>
          </TabsContent>

          {/* ================================================================== */}
          {/* ANOMALIES TAB */}
          {/* ================================================================== */}
          <TabsContent value="anomalies" className="space-y-6 mt-6">
            <AnomalyWindows />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

// ============================================================================
// OVERVIEW TAB — SUB-COMPONENTS
// ============================================================================

function OverviewSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
      <Skeleton className="h-80 rounded-xl" />
    </div>
  );
}

function DataSummaryCards({ dashboard }: { dashboard: DashboardData }) {
  const totalRecords = dashboard.storage.totalRawReadings + dashboard.storage.totalDownsampledReadings;
  const activeSources = dashboard.dataCompleteness.activeSources;
  const totalSources = dashboard.dataCompleteness.totalSources;

  const cards = [
    {
      title: 'Total Raw Readings',
      value: formatNumber(dashboard.storage.totalRawReadings),
      icon: <Database className="h-4 w-4" />,
      color: 'text-emerald-600 dark:text-emerald-400',
      bg: 'bg-emerald-50 dark:bg-emerald-950/30',
    },
    {
      title: 'Downsampled Records',
      value: formatNumber(dashboard.storage.totalDownsampledReadings),
      icon: <Layers className="h-4 w-4" />,
      color: 'text-blue-600 dark:text-blue-400',
      bg: 'bg-blue-50 dark:bg-blue-950/30',
    },
    {
      title: 'Active Sources',
      value: `${activeSources}/${totalSources}`,
      icon: <Activity className="h-4 w-4" />,
      color: 'text-amber-600 dark:text-amber-400',
      bg: 'bg-amber-50 dark:bg-amber-950/30',
    },
    {
      title: 'Storage Estimate',
      value: dashboard.storage.formattedTotal,
      icon: <HardDrive className="h-4 w-4" />,
      color: 'text-purple-600 dark:text-purple-400',
      bg: 'bg-purple-50 dark:bg-purple-950/30',
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      {cards.map((c) => (
        <Card key={c.title} className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className={`h-9 w-9 rounded-lg ${c.bg} flex items-center justify-center ${c.color}`}>
                {c.icon}
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground truncate">{c.title}</p>
                <p className="text-lg font-bold text-foreground">{c.value}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function IngestionCard({ ingestion }: { ingestion: IngestionMetrics }) {
  const metrics = [
    { label: 'Readings/sec', value: ingestion.readingsPerSecond.toFixed(1) },
    { label: 'Readings/min', value: formatNumber(Math.round(ingestion.readingsPerMinute)) },
    { label: 'Readings/hour', value: formatNumber(ingestion.readingsPerHour) },
    { label: 'Today', value: formatNumber(ingestion.readingsToday) },
    { label: 'Peak/min', value: formatNumber(ingestion.peakReadingsPerMinute) },
    { label: 'Avg/min', value: ingestion.averageReadingsPerMinute.toFixed(1) },
  ];

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3 px-5 pt-5">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Zap className="h-4 w-4 text-emerald-500" />
          Ingestion Rate
        </CardTitle>
      </CardHeader>
      <CardContent className="px-5 pb-5">
        <div className="grid grid-cols-3 gap-3">
          {metrics.map((m) => (
            <div key={m.label} className="text-center p-2 rounded-lg bg-muted/50">
              <p className="text-xs text-muted-foreground">{m.label}</p>
              <p className="text-base font-bold text-foreground mt-0.5">{m.value}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function CompletenessCard({ completeness }: { completeness: DataCompleteness }) {
  const pct = completeness.overallCompleteness;
  const color = pct >= 90 ? 'text-emerald-500' : pct >= 70 ? 'text-amber-500' : 'text-red-500';

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3 px-5 pt-5">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          Data Completeness (1h)
        </CardTitle>
      </CardHeader>
      <CardContent className="px-5 pb-5 space-y-4">
        <div className="flex items-center gap-4">
          <div className="text-center">
            <p className={`text-3xl font-bold ${color}`}>{pct}%</p>
            <p className="text-xs text-muted-foreground">{completeness.activeSources} active</p>
          </div>
          <Progress value={pct} className="flex-1 h-3" />
        </div>
        <div className="max-h-36 overflow-y-auto space-y-1">
          {completeness.sourcesByCompleteness.slice(0, 8).map((s) => (
            <div key={s.sourceId} className="flex items-center gap-2 text-xs">
              <span className="w-24 truncate text-muted-foreground font-mono">{s.sourceId.slice(0, 16)}</span>
              <Progress value={s.completeness} className="flex-1 h-1.5" />
              <span className="w-10 text-right font-mono">{s.completeness.toFixed(0)}%</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function StorageCard({ storage }: { storage: StorageUtil }) {
  const chartData = storage.bySource.slice(0, 10).map((s) => ({
    name: s.sourceId.slice(0, 12),
    raw: s.rawCount,
    downsampled: s.downsampledCount,
  }));

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3 px-5 pt-5">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <HardDrive className="h-4 w-4 text-purple-500" />
          Storage Distribution
        </CardTitle>
        <CardDescription className="text-xs">
          Total: {storage.formattedTotal} ({formatNumber(storage.totalRawReadings + storage.totalDownsampledReadings)} records)
        </CardDescription>
      </CardHeader>
      <CardContent className="px-5 pb-5">
        {chartData.length > 0 ? (
          <ChartContainer config={{ raw: { label: 'Raw', color: '#10b981' }, downsampled: { label: 'Downsampled', color: '#6366f1' } }} className="h-52">
            <BarChart data={chartData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" tickFormatter={(v) => formatNumber(v)} className="text-[10px]" />
              <YAxis type="category" dataKey="name" width={80} className="text-[10px]" tick={{ fontSize: 10 }} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <ChartLegend content={<ChartLegendContent />} />
              <Bar dataKey="raw" stackId="a" fill="var(--color-raw)" radius={[0, 2, 2, 0]} />
              <Bar dataKey="downsampled" stackId="a" fill="var(--color-downsampled)" radius={[0, 2, 2, 0]} />
            </BarChart>
          </ChartContainer>
        ) : (
          <div className="flex items-center justify-center h-52 text-muted-foreground text-sm">No storage data</div>
        )}
      </CardContent>
    </Card>
  );
}

function AnomalySummaryCard({ anomaly }: { anomaly: AnomalySummary }) {
  const severities = [
    { key: 'critical', label: 'Critical', color: 'bg-red-500' },
    { key: 'high', label: 'High', color: 'bg-orange-500' },
    { key: 'warning', label: 'Warning', color: 'bg-amber-500' },
    { key: 'low', label: 'Low', color: 'bg-blue-500' },
  ];

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3 px-5 pt-5">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          Anomaly Summary
        </CardTitle>
        <CardDescription className="text-xs">
          {anomaly.totalActive} active, {anomaly.unacknowledged} unacknowledged
        </CardDescription>
      </CardHeader>
      <CardContent className="px-5 pb-5 space-y-3">
        <div className="flex gap-2 flex-wrap">
          {severities.map((s) => (
            <div key={s.key} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted/50">
              <div className={`h-2 w-2 rounded-full ${s.color}`} />
              <span className="text-xs text-muted-foreground">{s.label}</span>
              <span className="text-xs font-bold">{anomaly.bySeverity[s.key] ?? 0}</span>
            </div>
          ))}
        </div>
        {anomaly.bySource.length > 0 && (
          <div className="max-h-24 overflow-y-auto space-y-1">
            {anomaly.bySource.slice(0, 5).map((s) => (
              <div key={s.sourceId} className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground font-mono truncate w-24">{s.sourceId.slice(0, 16)}</span>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px] px-1.5">{s.count}</Badge>
                  <span className="text-muted-foreground">{s.avgScore.toFixed(1)}</span>
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
// TAG BROWSER
// ============================================================================

function TagBrowser({ tags, qualityScores }: { tags: TagMonitor[]; qualityScores: QualityScore[] }) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const qualityMap = useMemo(() => {
    const m = new Map<string, QualityScore>();
    for (const q of qualityScores) m.set(q.sourceId, q);
    return m;
  }, [qualityScores]);

  const filtered = useMemo(() => {
    return tags.filter((t) => {
      if (search && !t.sourceId.toLowerCase().includes(search.toLowerCase())) return false;
      if (statusFilter !== 'all' && t.status !== statusFilter) return false;
      return true;
    });
  }, [tags, search, statusFilter]);

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3 px-5 pt-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Eye className="h-4 w-4 text-emerald-500" />
            Tag Browser
            <Badge variant="secondary" className="ml-1">{filtered.length}</Badge>
          </CardTitle>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search tags..."
                className="h-8 w-48 pl-8 text-xs"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-8 w-28 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="stale">Stale</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-5 pb-5">
        <div className="max-h-80 overflow-y-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Source ID</TableHead>
                <TableHead className="text-xs text-center">Status</TableHead>
                <TableHead className="text-xs text-center">Trend</TableHead>
                <TableHead className="text-xs text-right">Latest Value</TableHead>
                <TableHead className="text-xs text-right">Last Reading</TableHead>
                <TableHead className="text-xs text-center hidden sm:table-cell">Readings/Hour</TableHead>
                <TableHead className="text-xs text-center hidden md:table-cell">Grade</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.slice(0, 50).map((tag) => {
                const qs = qualityMap.get(tag.sourceId);
                return (
                  <TableRow key={tag.sourceId}>
                    <TableCell className="text-xs font-mono truncate max-w-40">{tag.sourceId}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant={tag.status === 'active' ? 'default' : tag.status === 'stale' ? 'secondary' : 'outline'}
                        className={`${tag.status === 'active' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400' : tag.status === 'stale' ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400' : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'} text-[10px]`}>
                        {tag.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      {tag.trend === 'up' && <TrendingUp className="h-3.5 w-3.5 text-emerald-500 mx-auto" />}
                      {tag.trend === 'down' && <TrendingDown className="h-3.5 w-3.5 text-red-500 mx-auto" />}
                      {tag.trend === 'stable' && <Minus className="h-3.5 w-3.5 text-muted-foreground mx-auto" />}
                      {tag.trend === 'unknown' && <Minus className="h-3.5 w-3.5 text-muted-foreground/50 mx-auto" />}
                    </TableCell>
                    <TableCell className="text-xs text-right font-mono">
                      {tag.latestValue !== null ? tag.latestValue.toFixed(2) : '—'}
                    </TableCell>
                    <TableCell className="text-xs text-right text-muted-foreground">{timeAgo(tag.latestTimestamp)}</TableCell>
                    <TableCell className="text-xs text-center hidden sm:table-cell">{tag.readingsLastHour}</TableCell>
                    <TableCell className="text-center hidden md:table-cell">
                      {qs && (
                        <Badge variant="outline" className={`text-[10px] font-bold ${
                          qs.grade === 'A' ? 'border-emerald-300 text-emerald-600' :
                          qs.grade === 'B' ? 'border-blue-300 text-blue-600' :
                          qs.grade === 'C' ? 'border-amber-300 text-amber-600' :
                          'border-red-300 text-red-600'
                        }`}>
                          {qs.grade}
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-xs text-muted-foreground py-8">
                    No tags found
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// TRENDS TAB — TREND VIEWER
// ============================================================================

function TrendViewer({ tagMonitor }: { tagMonitor: TagMonitor[] }) {
  const [selectedSource, setSelectedSource] = useState('');
  const [timeRange, setTimeRange] = useState<TimeRange>('24h');
  const [chartData, setChartData] = useState<TrendDataPoint[]>([]);
  const [chartLoading, setChartLoading] = useState(false);

  useEffect(() => {
    if (tagMonitor.length > 0 && !selectedSource) {
      const active = tagMonitor.find(t => t.status === 'active');
      if (active) setSelectedSource(active.sourceId);
    }
  }, [tagMonitor, selectedSource]);

  const fetchTrend = useCallback(async () => {
    if (!selectedSource) return;
    setChartLoading(true);
    try {
      const range = TIME_RANGES.find(r => r.value === timeRange)!;
      const from = new Date(Date.now() - range.ms);
      const to = new Date();
      const interval = autoInterval(timeRange);

      const res = await api.post('/api/historian/aggregate', {
        operation: 'multi-source',
        sourceIds: [selectedSource],
        from: from.toISOString(),
        to: to.toISOString(),
        interval,
      });
      if (res.success) {
        const data = (res.data as Array<{ timestamp: string; sourceId: string; avg: number | null }>)
          .filter(d => d.sourceId === selectedSource && d.avg !== null)
          .map(d => ({
            time: new Date(d.timestamp).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
            value: d.avg!,
          }));
        setChartData(data);
      }
    } catch (e) {
      console.error('Failed to fetch trend data', e);
    } finally {
      setChartLoading(false);
    }
  }, [selectedSource, timeRange]);

  useEffect(() => { fetchTrend(); }, [fetchTrend]);

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3 px-5 pt-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-emerald-500" />
            Trend Viewer
          </CardTitle>
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={selectedSource} onValueChange={setSelectedSource}>
              <SelectTrigger className="h-8 w-52 text-xs">
                <SelectValue placeholder="Select tag..." />
              </SelectTrigger>
              <SelectContent>
                {tagMonitor.map(t => (
                  <SelectItem key={t.sourceId} value={t.sourceId}>{t.sourceId}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex gap-1">
              {TIME_RANGES.map(r => (
                <Button key={r.value} variant={timeRange === r.value ? 'default' : 'outline'} size="sm"
                  className={`h-7 px-2 text-[11px] ${timeRange === r.value ? 'bg-emerald-600 hover:bg-emerald-700' : ''}`}
                  onClick={() => setTimeRange(r.value)}>
                  {r.label}
                </Button>
              ))}
            </div>
            <Button variant="outline" size="sm" className="h-7" onClick={fetchTrend}>
              <RefreshCw className={`h-3 w-3 ${chartLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
        <CardDescription className="text-xs">
          Resolution: {autoInterval(timeRange)} | {chartData.length} data points
        </CardDescription>
      </CardHeader>
      <CardContent className="px-5 pb-5">
        {chartLoading && chartData.length === 0 ? (
          <Skeleton className="h-72 rounded-lg" />
        ) : chartData.length === 0 ? (
          <div className="flex items-center justify-center h-72 text-muted-foreground text-sm">No data available</div>
        ) : (
          <ChartContainer config={{ value: { label: selectedSource, color: '#10b981' } }} className="h-72">
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="time" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 10 }} domain={['auto', 'auto']} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Area type="monotone" dataKey="value" stroke="#10b981" strokeWidth={2} fill="url(#trendGradient)" />
            </AreaChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// TRENDS TAB — COMPARISON VIEW
// ============================================================================

function ComparisonView({ tagMonitor }: { tagMonitor: TagMonitor[] }) {
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  const [timeRange, setTimeRange] = useState<TimeRange>('24h');
  const [chartData, setChartData] = useState<Record<string, number | null>[]>([]);
  const [chartLoading, setChartLoading] = useState(false);

  const toggleSource = (srcId: string) => {
    setSelectedSources(prev => {
      if (prev.includes(srcId)) return prev.filter(s => s !== srcId);
      if (prev.length >= 3) return prev;
      return [...prev, srcId];
    });
  };

  const fetchComparison = useCallback(async () => {
    if (selectedSources.length === 0) { setChartData([]); return; }
    setChartLoading(true);
    try {
      const range = TIME_RANGES.find(r => r.value === timeRange)!;
      const from = new Date(Date.now() - range.ms);
      const to = new Date();
      const interval = autoInterval(timeRange);

      const res = await api.post('/api/historian/aggregate', {
        operation: 'multi-source',
        sourceIds: selectedSources,
        from: from.toISOString(),
        to: to.toISOString(),
        interval,
      });
      if (res.success) {
        const raw = res.data as Array<{ timestamp: string; sourceId: string; avg: number | null }>;
        // Pivot: one row per timestamp with columns per source
        const timeMap = new Map<string, Record<string, number | null>>();
        for (const d of raw) {
          const key = d.timestamp;
          if (!timeMap.has(key)) timeMap.set(key, { time: new Date(key).getTime() });
          timeMap.get(key)![d.sourceId] = d.avg;
        }
        const pivoted = [...timeMap.values()]
          .sort((a, b) => (a.time! as number) - (b.time! as number))
          .map(d => ({
            time: new Date(d.time! as number).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
            ...Object.fromEntries(selectedSources.map(s => [s, d[s] ?? null])),
          }));
        setChartData(pivoted);
      }
    } catch (e) {
      console.error('Failed to fetch comparison data', e);
    } finally {
      setChartLoading(false);
    }
  }, [selectedSources, timeRange]);

  useEffect(() => { fetchComparison(); }, [fetchComparison]);

  const chartConfig = useMemo(() => {
    const cfg: Record<string, { label: string; color: string }> = {};
    selectedSources.forEach((s, i) => { cfg[s] = { label: s.slice(0, 20), color: COMPARISON_COLORS[i] }; });
    return cfg;
  }, [selectedSources]);

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3 px-5 pt-5">
        <div className="flex flex-col gap-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <ArrowUpDown className="h-4 w-4 text-blue-500" />
            Comparison View
            <Badge variant="outline" className="text-[10px]">{selectedSources.length}/3 selected</Badge>
          </CardTitle>
          <div className="flex flex-wrap gap-1.5">
            {tagMonitor.slice(0, 20).map((t, i) => {
              const isSelected = selectedSources.includes(t.sourceId);
              const colorIdx = selectedSources.indexOf(t.sourceId);
              return (
                <Button key={t.sourceId} variant={isSelected ? 'default' : 'outline'} size="sm"
                  className={`h-7 text-[11px] ${isSelected ? '' : ''}`}
                  style={isSelected ? { backgroundColor: COMPARISON_COLORS[colorIdx], borderColor: COMPARISON_COLORS[colorIdx] } : {}}
                  onClick={() => toggleSource(t.sourceId)}>
                  {t.sourceId.slice(0, 18)}
                </Button>
              );
            })}
          </div>
          <div className="flex gap-1">
            {TIME_RANGES.map(r => (
              <Button key={r.value} variant={timeRange === r.value ? 'default' : 'outline'} size="sm"
                className={`h-7 px-2 text-[11px] ${timeRange === r.value ? 'bg-blue-600 hover:bg-blue-700' : ''}`}
                onClick={() => setTimeRange(r.value)}>
                {r.label}
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-5 pb-5">
        {chartLoading && chartData.length === 0 ? (
          <Skeleton className="h-72 rounded-lg" />
        ) : chartData.length === 0 ? (
          <div className="flex items-center justify-center h-72 text-muted-foreground text-sm">
            {selectedSources.length === 0 ? 'Select 2-3 tags to compare' : 'No data available'}
          </div>
        ) : (
          <ChartContainer config={chartConfig} className="h-72">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="time" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 10 }} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <ChartLegend content={<ChartLegendContent />} />
              {selectedSources.map((s, i) => (
                <Line key={s} type="monotone" dataKey={s} stroke={COMPARISON_COLORS[i]} strokeWidth={2} dot={false} connectNulls />
              ))}
            </LineChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// TRENDS TAB — CALCULATED METRICS
// ============================================================================

function CalculatedMetrics({ tagMonitor }: { tagMonitor: TagMonitor[] }) {
  const [selectedSource, setSelectedSource] = useState('');
  const [timeRange, setTimeRange] = useState<TimeRange>('24h');
  const [metrics, setMetrics] = useState<Record<string, number> | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (tagMonitor.length > 0 && !selectedSource) {
      const active = tagMonitor.find(t => t.status === 'active');
      if (active) setSelectedSource(active.sourceId);
    }
  }, [tagMonitor, selectedSource]);

  const fetchMetrics = useCallback(async () => {
    if (!selectedSource) return;
    setLoading(true);
    try {
      const range = TIME_RANGES.find(r => r.value === timeRange)!;
      const from = new Date(Date.now() - range.ms);
      const to = new Date();

      const res = await api.post('/api/historian/aggregate', {
        operation: 'stats-single',
        sourceId: selectedSource,
        from: from.toISOString(),
        to: to.toISOString(),
      });
      if (res.success) setMetrics(res.data);
    } catch (e) {
      console.error('Failed to fetch metrics', e);
    } finally {
      setLoading(false);
    }
  }, [selectedSource, timeRange]);

  useEffect(() => { fetchMetrics(); }, [fetchMetrics]);

  const items = metrics ? [
    { label: 'Count', value: metrics.count?.toLocaleString() ?? '—' },
    { label: 'Average', value: metrics.avg?.toFixed(3) ?? '—' },
    { label: 'Min', value: metrics.min?.toFixed(3) ?? '—' },
    { label: 'Max', value: metrics.max?.toFixed(3) ?? '—' },
    { label: 'Std Dev', value: metrics.stdDev?.toFixed(3) ?? '—' },
    { label: 'P5', value: metrics.p5?.toFixed(3) ?? '—' },
    { label: 'P25', value: metrics.p25?.toFixed(3) ?? '—' },
    { label: 'Median (P50)', value: metrics.p50?.toFixed(3) ?? '—' },
    { label: 'P75', value: metrics.p75?.toFixed(3) ?? '—' },
    { label: 'P95', value: metrics.p95?.toFixed(3) ?? '—' },
    { label: 'Skewness', value: metrics.skewness?.toFixed(3) ?? '—' },
    { label: 'Kurtosis', value: metrics.kurtosis?.toFixed(3) ?? '—' },
  ] : [];

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3 px-5 pt-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-violet-500" />
            Calculated Metrics
          </CardTitle>
          <div className="flex items-center gap-2">
            <Select value={selectedSource} onValueChange={setSelectedSource}>
              <SelectTrigger className="h-8 w-52 text-xs">
                <SelectValue placeholder="Select tag..." />
              </SelectTrigger>
              <SelectContent>
                {tagMonitor.map(t => (
                  <SelectItem key={t.sourceId} value={t.sourceId}>{t.sourceId}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={timeRange} onValueChange={(v) => setTimeRange(v as TimeRange)}>
              <SelectTrigger className="h-8 w-24 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIME_RANGES.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-5 pb-5">
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
          </div>
        ) : items.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {items.map(m => (
              <div key={m.label} className="rounded-lg bg-muted/50 p-3 text-center">
                <p className="text-[11px] text-muted-foreground">{m.label}</p>
                <p className="text-sm font-bold text-foreground mt-0.5">{m.value}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">No data</div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// POLICIES TAB — SUB-COMPONENTS
// ============================================================================

function DownsamplingStatusCard() {
  const [policies, setPolicies] = useState<DownsamplingPolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [downsampleStatus, setDownsampleStatus] = useState<DownsamplingSourceStatus[]>([]);
  const [runningJob, setRunningJob] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const [pRes, dRes] = await Promise.all([
          api.get('/api/historian/downsample/policies'),
          api.get('/api/historian/downsample'),
        ]);
        if (pRes.success) setPolicies(pRes.data);
        if (dRes.success) setDownsampleStatus([]);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const runDownsample = async () => {
    setRunningJob(true);
    try {
      const res = await api.post('/api/historian/downsample', {});
      if (res.success) alert(`Downsampling complete: ${res.data.sourcesProcessed} sources processed`);
    } catch (e) { console.error(e); }
    finally { setRunningJob(false); }
  };

  const tiers = ['1m', '5m', '1h', '1d', '1w'];

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3 px-5 pt-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Layers className="h-4 w-4 text-emerald-500" />
            Downsampling Policies
          </CardTitle>
          <Button size="sm" className="h-7 bg-emerald-600 hover:bg-emerald-700" onClick={runDownsample} disabled={runningJob}>
            <RefreshCw className={`h-3 w-3 mr-1.5 ${runningJob ? 'animate-spin' : ''}`} />
            Run Job
          </Button>
        </div>
      </CardHeader>
      <CardContent className="px-5 pb-5">
        {loading ? (
          <Skeleton className="h-48 rounded-lg" />
        ) : policies.length === 0 ? (
          <div className="text-center text-sm text-muted-foreground py-8">No downsampling policies configured</div>
        ) : (
          <div className="max-h-72 overflow-y-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Source</TableHead>
                  <TableHead className="text-xs text-center">Method</TableHead>
                  {tiers.map(t => <TableHead key={t} className="text-xs text-center">{t}</TableHead>)}
                  <TableHead className="text-xs text-center">Active</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {policies.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="text-xs font-mono">{p.sourceId ?? 'Global'}</TableCell>
                    <TableCell className="text-xs text-center">{p.aggregationMethod}</TableCell>
                    {[p.rawRetentionDays, p.minuteRetentionDays, p.hourlyRetentionDays, p.dailyRetentionDays, p.weeklyRetentionDays].map((d, i) => (
                      <TableCell key={tiers[i]} className="text-xs text-center">{d}d</TableCell>
                    ))}
                    <TableCell className="text-center">
                      <Badge variant={p.isActive ? 'default' : 'outline'}
                        className={p.isActive ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 text-[10px]' : 'text-[10px]'}>
                        {p.isActive ? 'Yes' : 'No'}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RetentionPolicyCard() {
  const [policies, setPolicies] = useState<RetentionPolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [runningCleanup, setRunningCleanup] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await api.get('/api/historian/retention');
        if (res.success) setPolicies(res.data);
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    }
    load();
  }, []);

  const runCleanupAll = async () => {
    setRunningCleanup(true);
    try {
      const res = await api.post('/api/historian/retention', { action: 'execute-all' });
      if (res.success) alert(`Cleanup complete: ${res.data.totalDeleted} records deleted`);
    } catch (e) { console.error(e); }
    finally { setRunningCleanup(false); }
  };

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3 px-5 pt-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Shield className="h-4 w-4 text-red-500" />
            Retention Policies
          </CardTitle>
          <Button size="sm" variant="outline" className="h-7" onClick={runCleanupAll} disabled={runningCleanup}>
            <RefreshCw className={`h-3 w-3 mr-1.5 ${runningCleanup ? 'animate-spin' : ''}`} />
            Run Cleanup
          </Button>
        </div>
      </CardHeader>
      <CardContent className="px-5 pb-5">
        {loading ? (
          <Skeleton className="h-48 rounded-lg" />
        ) : policies.length === 0 ? (
          <div className="text-center text-sm text-muted-foreground py-8">No retention policies configured</div>
        ) : (
          <div className="max-h-72 overflow-y-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Name</TableHead>
                  <TableHead className="text-xs text-center">Keep Days</TableHead>
                  <TableHead className="text-xs text-center">Agg Days</TableHead>
                  <TableHead className="text-xs text-center">Deleted</TableHead>
                  <TableHead className="text-xs text-center hidden sm:table-cell">Last Run</TableHead>
                  <TableHead className="text-xs text-center">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {policies.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="text-xs font-medium truncate max-w-40">{p.name}</TableCell>
                    <TableCell className="text-xs text-center">{p.keepDays}d</TableCell>
                    <TableCell className="text-xs text-center">{p.aggregationKeepDays ? `${p.aggregationKeepDays}d` : '—'}</TableCell>
                    <TableCell className="text-xs text-center">{formatNumber(p.totalDeleted)}</TableCell>
                    <TableCell className="text-xs text-center text-muted-foreground hidden sm:table-cell">
                      {p.lastExecutedAt ? timeAgo(p.lastExecutedAt) : 'Never'}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant={p.isActive ? 'default' : 'outline'}
                        className={p.isActive ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 text-[10px]' : 'text-[10px]'}>
                        {p.isActive ? 'Active' : 'Disabled'}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// ANOMALIES TAB — ANOMALY WINDOWS
// ============================================================================

function AnomalyWindows() {
  const [anomalies, setAnomalies] = useState<AnomalyRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const limit = 25;

  const fetchAnomalies = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: String(limit), offset: String(page * limit) });
      if (severityFilter !== 'all') params.set('severity', severityFilter);

      const res = await api.get(`/api/historian/anomalies?${params}`);
      if (res.success) {
        setAnomalies(res.data.data);
        setTotal(res.data.pagination.total);
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [page, severityFilter]);

  useEffect(() => { fetchAnomalies(); }, [fetchAnomalies]);

  const totalPages = Math.ceil(total / limit);

  const severityColor = (s: string) => {
    switch (s) {
      case 'critical': return 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400';
      case 'high': return 'bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400';
      case 'warning': return 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400';
      default: return 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400';
    }
  };

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3 px-5 pt-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            Anomaly Windows
            <Badge variant="secondary">{total} total</Badge>
          </CardTitle>
          <div className="flex items-center gap-2">
            <Select value={severityFilter} onValueChange={setSeverityFilter}>
              <SelectTrigger className="h-8 w-32 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Severity</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="warning">Warning</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-5 pb-5">
        {loading ? (
          <Skeleton className="h-64 rounded-lg" />
        ) : anomalies.length === 0 ? (
          <div className="text-center text-sm text-muted-foreground py-12">
            <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-emerald-400" />
            No anomalies detected
          </div>
        ) : (
          <>
            <div className="max-h-96 overflow-y-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Source</TableHead>
                    <TableHead className="text-xs">Detected At</TableHead>
                    <TableHead className="text-xs text-center">Severity</TableHead>
                    <TableHead className="text-xs text-center">Score</TableHead>
                    <TableHead className="text-xs text-right">Value</TableHead>
                    <TableHead className="text-xs text-right">Expected</TableHead>
                    <TableHead className="text-xs text-center hidden sm:table-cell">Method</TableHead>
                    <TableHead className="text-xs text-center hidden md:table-cell">Ack</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {anomalies.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="text-xs font-mono truncate max-w-32">{a.sourceId}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{formatTimestamp(a.detectedAt)}</TableCell>
                      <TableCell className="text-center">
                        <Badge className={`text-[10px] ${severityColor(a.severity)}`}>{a.severity}</Badge>
                      </TableCell>
                      <TableCell className="text-xs text-center font-bold">{a.anomalyScore.toFixed(1)}</TableCell>
                      <TableCell className="text-xs text-right font-mono">{a.value.toFixed(2)}</TableCell>
                      <TableCell className="text-xs text-right font-mono text-muted-foreground">
                        {a.expectedValue !== null ? a.expectedValue.toFixed(2) : '—'}
                      </TableCell>
                      <TableCell className="text-xs text-center hidden sm:table-cell">
                        <Badge variant="outline" className="text-[10px]">{a.method}</Badge>
                      </TableCell>
                      <TableCell className="text-center hidden md:table-cell">
                        {a.acknowledgedAt ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 mx-auto" />
                        ) : (
                          <XCircle className="h-3.5 w-3.5 text-muted-foreground/50 mx-auto" />
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <p className="text-xs text-muted-foreground">
                  Page {page + 1} of {totalPages}
                </p>
                <div className="flex gap-1">
                  <Button variant="outline" size="sm" className="h-7 text-xs" disabled={page === 0}
                    onClick={() => setPage(p => p - 1)}>
                    Previous
                  </Button>
                  <Button variant="outline" size="sm" className="h-7 text-xs" disabled={page >= totalPages - 1}
                    onClick={() => setPage(p => p + 1)}>
                    Next
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
