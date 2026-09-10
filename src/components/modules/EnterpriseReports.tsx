'use client';

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { exportPDF } from '@/lib/export-pdf';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { useModuleEnabled, MODULE_CODES } from '@/hooks/useModuleEnabled';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DateRangePicker } from '@/components/ui/datetime-picker';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip';
import { Progress } from '@/components/ui/progress';
import { EmptyState, LoadingSkeleton, formatDate, formatDateTime, formatCurrency, formatDuration } from '@/components/shared/helpers';
import {
  BarChart3, TrendingUp, TrendingDown, Activity, Clock, AlertTriangle,
  CheckCircle2, ClipboardList, DollarSign, Package, Wrench, Users,
  FileDown, Download, RefreshCw, Loader2, Calendar, Target, Zap,
  ShieldAlert, Eye, ArrowUpDown, PieChart as PieChartIcon, Gauge,
  HardHat, Timer, Layers, ArrowRightLeft, Filter, ArrowUpRight, ArrowDownRight,
  Cpu,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, LineChart, Line,
  PieChart, Pie, Cell, AreaChart, Area, ResponsiveContainer, ReferenceLine,
  Tooltip as RechartsTooltip, Legend, ComposedChart,
} from 'recharts';

// ============================================================================
// CHART COLORS
// ============================================================================

const CHART_COLORS = ['#059669', '#0ea5e9', '#f59e0b', '#ef4444', '#8b5cf6', '#14b8a6', '#f97316', '#6366f1'];
const TYPE_COLOR_MAP: Record<string, string> = { preventive: '#059669', corrective: '#f59e0b', emergency: '#ef4444', inspection: '#0ea5e9', predictive: '#8b5cf6', project: '#14b8a6' };
const PRIORITY_COLOR_MAP: Record<string, string> = { low: '#94a3b8', medium: '#0ea5e9', high: '#f59e0b', urgent: '#ef4444', critical: '#dc2626' };

// ============================================================================
// SHARED HOOKS
// ============================================================================

const useDateRange = () => {
  const [startDate, setStartDate] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() - 1); return d.toISOString().slice(0, 10);
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10));
  return { startDate, setStartDate, endDate, setEndDate };
};

const exportCSV = (filename: string, headers: string[], rows: string[][]) => {
  const csv = [headers.join(','), ...rows.map(r => r.map(c => `"${(c ?? '').toString().replace(/"/g, '""')}"`).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `${filename}.csv`; a.click();
  URL.revokeObjectURL(url);
  toast.success(`Exported ${filename}.csv`);
};

// ============================================================================
// KPI CARD COMPONENT
// ============================================================================

function KPICard({ icon: Icon, label, value, subtext, color, bgColor, onClick }: {
  icon: React.ElementType; label: string; value: string | number;
  subtext?: string; color: string; bgColor: string; onClick?: () => void;
}) {
  return (
    <div onClick={onClick} className={`cursor-pointer transition-all hover:scale-[1.02] active:scale-[0.98] ${bgColor} rounded-xl p-4 border border-border/60 shadow-sm hover:shadow-md`}>
      <div className="flex items-center gap-3">
        <div className="bg-background/70 p-2.5 rounded-xl flex items-center justify-center shrink-0">
          <Icon className={`h-5 w-5 ${color}`} />
        </div>
        <div className="min-w-0">
          <p className="text-xl font-bold tracking-tight">{value}</p>
          <p className="text-[11px] text-muted-foreground truncate">{label}</p>
        </div>
        {subtext && <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded ml-auto">{subtext}</span>}
      </div>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function EnterpriseReports() {
  /* eslint-disable react-hooks/preserve-manual-memoization */
  const { startDate, setStartDate, endDate, setEndDate } = useDateRange();
  const { hasPermission, isAdmin } = useAuthStore();

  const [reportData, setReportData] = useState<any>(null);
  const [enterpriseData, setEnterpriseData] = useState<any>(null);
  const [workOrders, setWorkOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('executive');

  const woEnabled = useModuleEnabled(MODULE_CODES.WORK_ORDERS);
  const repairsEnabled = useModuleEnabled(MODULE_CODES.REPAIRS);
  const pmEnabled = useModuleEnabled(MODULE_CODES.PM_SCHEDULES);
  const dtEnabled = useModuleEnabled(MODULE_CODES.DOWNTIME);

  const fetchReport = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);

    const enterpriseParams = new URLSearchParams();
    if (startDate) enterpriseParams.set('from', startDate);
    if (endDate) enterpriseParams.set('to', endDate);

    Promise.all([
      api.get<any>(`/api/reports/maintenance?${params.toString()}`).catch(() => ({ success: false })),
      api.get<any>(`/api/reports/enterprise?${enterpriseParams.toString()}`).catch(() => ({ success: false })),
      api.get('/api/work-orders?limit=200').catch(() => ({ success: false })),
    ]).then(([reportRes, enterpriseRes, woRes]) => {
      if (reportRes.success && reportRes.data) setReportData(reportRes.data);
      else setReportData(null);
      if (enterpriseRes.success && enterpriseRes.data) setEnterpriseData(enterpriseRes.data);
      else setEnterpriseData(null);
      if (woRes.success && woRes.data) setWorkOrders(Array.isArray(woRes.data) ? woRes.data : []);
      setLoading(false);
    });
  }, [startDate, endDate]);

  useEffect(() => { fetchReport(); }, [fetchReport]);

  // Derived data
  const s = reportData?.summary;
  const recentWOs = reportData?.recentWorkOrders || [];

  // Executive KPIs
  const executiveKPIs = useMemo(() => [
    { label: 'WOs Completed (MTD)', value: s?.completedWOs ?? 0, icon: CheckCircle2, color: 'text-emerald-600', bgColor: 'bg-emerald-50 dark:bg-emerald-900/30 dark:text-emerald-400', onClick: () => setActiveTab('wo-analytics') },
    { label: 'Completion Rate', value: `${s?.completionRate ?? 0}%`, icon: Target, color: 'text-sky-600', bgColor: 'bg-sky-50 dark:bg-sky-900/30 dark:text-sky-400', subtext: s?.completionRate >= 80 ? 'On track' : 'Below target', onClick: () => setActiveTab('wo-analytics') },
    { label: 'MTBF', value: `${enterpriseData?.mtbf ?? 0}h`, icon: Activity, color: 'text-amber-600', bgColor: 'bg-amber-50 dark:bg-amber-900/30 dark:text-amber-400', onClick: () => setActiveTab('downtime') },
    { label: 'MTTR', value: `${s?.avgCompletionHours ?? 0}h`, icon: Timer, color: 'text-teal-600', bgColor: 'bg-teal-50 dark:bg-teal-900/30 dark:text-teal-400', onClick: () => setActiveTab('downtime') },
    { label: 'Planned vs Unplanned', value: `${enterpriseData?.plannedRatio ?? '50:50'}`, icon: TrendingUp, color: 'text-violet-600', bgColor: 'bg-violet-50 dark:bg-violet-900/30 dark:text-violet-400', onClick: () => setActiveTab('wo-analytics') },
    { label: 'Total Maint. Cost', value: formatCurrency(s?.totalCost || 0), icon: DollarSign, color: 'text-emerald-600', bgColor: 'bg-emerald-50 dark:bg-emerald-900/30 dark:text-emerald-400', onClick: () => setActiveTab('cost') },
  ], [s, enterpriseData]);

  // Export handlers
  const handlePdfExport = () => {
    if (!reportData || !s) return;
    exportPDF({
      title: `Report - ${startDate} to ${endDate}`,
      subtitle: `Generated: ${format(new Date(), 'MMM d, yyyy HH:mm')}`,
      filename: `enterprise-report-${startDate}-to-${endDate}`,
      orientation: 'landscape',
      summary: [
        { label: 'Total WOs', value: String(s.totalWOs) },
        { label: 'Completed', value: `${s.completedWOs} (${s.completionRate}%)` },
        { label: 'MTBF', value: formatDuration(enterpriseData?.mtbf ?? 0) },
        { label: 'MTTR', value: formatDuration(s.avgCompletionHours ?? 0) },
        { label: 'Total Cost', value: formatCurrency(s.totalCost) },
        { label: 'SLA Compliance', value: `${s.slaComplianceRate ?? 'N/A'}%` },
      ],
      headers: ['WO Number', 'Title', 'Type', 'Priority', 'Status', 'Asset', 'Assigned To', 'Est Hours', 'Total Cost', 'Created'],
      rows: recentWOs.map((wo: any) => [
        wo.woNumber || '', wo.title || '', wo.type || '', wo.priority || '', wo.status || '',
        wo.assetName || '-', wo.assigneeName || '-',
        wo.estimatedHours?.toString() || '-', formatCurrency(wo.totalCost), wo.createdAt ? formatDate(wo.createdAt) : '-',
      ]),
    });
  };

  const handleCsvExport = () => {
    if (!reportData) return;
    exportCSV(
      `enterprise-report-${startDate}-to-${endDate}`,
      ['WO Number', 'Title', 'Type', 'Priority', 'Status', 'Asset', 'Assigned To', 'Estimated Hours', 'Total Cost', 'Created Date'],
      recentWOs.map((wo: any) => [
        wo.woNumber || '', wo.title || '', wo.type || '', wo.priority || '', wo.status || '',
        wo.assetName || '-', wo.assigneeName || '-',
        wo.estimatedHours?.toString() || '', (wo.totalCost || 0).toString(),
        wo.createdAt ? formatDate(wo.createdAt) : '',
      ]),
    );
  };

  // Filtered WO type data respecting PM/Repairs module visibility
  const filteredWoByType = useMemo(() => {
    const data = reportData?.woByType || [];
    return data.filter((entry: any) => {
      const t = entry.type?.toLowerCase();
      if (t === 'preventive' && !pmEnabled) return false;
      if ((t === 'corrective' || t === 'emergency') && !repairsEnabled) return false;
      return true;
    });
  }, [reportData?.woByType, pmEnabled, repairsEnabled]);

  // Filtered work orders respecting PM/Repairs module visibility
  const filteredWorkOrders = useMemo(() => {
    return workOrders.filter(wo => {
      const t = wo.type?.toLowerCase();
      if (t === 'preventive' && !pmEnabled) return false;
      if ((t === 'corrective' || t === 'emergency') && !repairsEnabled) return false;
      return true;
    });
  }, [workOrders, pmEnabled, repairsEnabled]);

  // Client-side SLA data
  const slaData = useMemo(() => {
    if (!filteredWorkOrders.length) return [];
    const byType: Record<string, { total: number; breached: number }> = {};
    filteredWorkOrders.forEach(wo => {
      const t = wo.type || 'unknown';
      if (!byType[t]) byType[t] = { total: 0, breached: 0 };
      byType[t].total++;
      const hours = (new Date().getTime() - new Date(wo.createdAt).getTime()) / 3600000;
      const slaHours: Record<string, number> = { low: 72, medium: 48, high: 24, urgent: 8, critical: 4 };
      if (hours > (slaHours[wo.priority] || 48) && !['completed', 'closed'].includes(wo.status)) byType[t].breached++;
    });
    return Object.entries(byType).map(([type, data]) => ({
      type: type.charAt(0).toUpperCase() + type.slice(1),
      total: data.total,
      breached: data.breached,
      breachRate: data.total > 0 ? Math.round((data.breached / data.total) * 100) : 0,
    }));
  }, [filteredWorkOrders]);

  // Repeat failure data — enriched from enterprise report API
  const repeatFailures = useMemo(() => {
    // Prefer API data which has enriched asset details
    if (enterpriseData?.repeatFailures?.length > 0) {
      return enterpriseData.repeatFailures.map((a: any) => ({
        name: a.assetName,
        count: a.failureCount,
        latest: a.lastFailureDate,
        manufacturer: a.manufacturer,
        model: a.model,
        assetTag: a.assetTag,
        category: a.category,
        criticality: a.criticality,
        location: a.location,
        totalDowntimeMinutes: a.totalDowntimeMinutes,
        totalRepairCost: a.totalRepairCost,
        failureModes: a.failureModes,
      }));
    }
    // Fallback to client-side computation
    const assetMap: Record<string, { name: string; count: number; latest: string }> = {};
    workOrders.filter(wo => wo.type === 'corrective' && wo.assetName).forEach(wo => {
      const key = wo.assetName!;
      if (!assetMap[key]) assetMap[key] = { name: key, count: 0, latest: wo.createdAt || '' };
      assetMap[key].count++;
      if (wo.createdAt > assetMap[key].latest) assetMap[key].latest = wo.createdAt;
    });
    return Object.values(assetMap).filter(a => a.count >= 3).sort((a, b) => b.count - a.count);
  }, [workOrders, enterpriseData?.repeatFailures]);

  // Cost by category data — uses actual costs from enterprise report API
  const costByCategory = useMemo(() => {
    if (enterpriseData?.costAnalytics?.byWOType) {
      return enterpriseData.costAnalytics.byWOType.map((d: any) => ({
        category: (d.type || 'other').charAt(0).toUpperCase() + (d.type || 'other').slice(1),
        cost: d.totalCost || 0,
        color: TYPE_COLOR_MAP[d.type] || CHART_COLORS[0],
      }));
    }
    // Fallback to WO data if API doesn't have it yet
    const cats: Record<string, number> = {};
    workOrders.forEach(wo => {
      const cat = wo.type || 'other';
      cats[cat] = (cats[cat] || 0) + (wo.totalCost || (wo.estimatedHours || 0) * 50);
    });
    return Object.entries(cats).map(([cat, cost]) => ({
      category: cat.charAt(0).toUpperCase() + cat.slice(1),
      cost,
      color: TYPE_COLOR_MAP[cat] || CHART_COLORS[0],
    }));
  }, [workOrders, enterpriseData?.costAnalytics?.byWOType]);

  // Pre-compute period comparison data for the tab
  const periodCompData = useMemo(() => {
    const pc = enterpriseData?.periodComparison;
    if (!pc) return null;
    const cur = pc.currentPeriod;
    const prev = pc.previousPeriod;
    const vsPrev = pc.changes.vsPreviousPeriod;
    const vsYear = pc.changes.vsLastYear;
    const hasYoY = !!pc.samePeriodLastYear;

    const comparisonKPIs = [
      { label: 'Total WOs', current: cur.totalWOs, previous: prev.totalWOs, change: vsPrev.totalWOs_change, changePct: vsPrev.totalWOs_changePercent, icon: 'ClipboardList' },
      { label: 'Total Cost', current: formatCurrency(cur.totalCost), previous: formatCurrency(prev.totalCost), change: vsPrev.totalCost_change, changePct: vsPrev.totalCost_changePercent, icon: 'DollarSign', isCurrency: true },
      { label: 'Completion Rate', current: `${cur.completionRate}%`, previous: `${prev.completionRate}%`, change: vsPrev.completionRate_change, changePct: null, icon: 'Target', isPercent: true },
      { label: 'Downtime', current: `${cur.totalDowntimeMinutes} min`, previous: `${prev.totalDowntimeMinutes} min`, change: vsPrev.downtime_change, changePct: vsPrev.downtime_changePercent, icon: 'Clock', isMinutes: true },
    ];

    const comparisonBarData = [
      { category: 'Labor', Current: cur.laborCost, Previous: prev.laborCost },
      { category: 'Parts', Current: cur.partsCost, Previous: prev.partsCost },
      { category: 'Contractor', Current: cur.contractorCost, Previous: prev.contractorCost },
      { category: 'Total', Current: cur.totalCost, Previous: prev.totalCost },
    ];

    const pct = (c: number, p: number) => p !== 0 ? Math.round(((c - p) / Math.abs(p)) * 1000) / 10 : 0;
    const comparisonRows = [
      { metric: 'Total WOs', current: cur.totalWOs, previous: prev.totalWOs, change: vsPrev.totalWOs_change, changePct: vsPrev.totalWOs_changePercent },
      { metric: 'Completed WOs', current: cur.completedWOs, previous: prev.completedWOs, change: cur.completedWOs - prev.completedWOs, changePct: pct(cur.completedWOs, prev.completedWOs) },
      { metric: 'Completion Rate', current: `${cur.completionRate}%`, previous: `${prev.completionRate}%`, change: vsPrev.completionRate_change, changePct: null, suffix: 'pp' },
      { metric: 'Total Cost', current: formatCurrency(cur.totalCost), previous: formatCurrency(prev.totalCost), change: vsPrev.totalCost_change, changePct: vsPrev.totalCost_changePercent, isCurrency: true },
      { metric: 'Labor Cost', current: formatCurrency(cur.laborCost), previous: formatCurrency(prev.laborCost), change: Math.round((cur.laborCost - prev.laborCost) * 100) / 100, changePct: pct(cur.laborCost, prev.laborCost), isCurrency: true },
      { metric: 'Parts Cost', current: formatCurrency(cur.partsCost), previous: formatCurrency(prev.partsCost), change: Math.round((cur.partsCost - prev.partsCost) * 100) / 100, changePct: pct(cur.partsCost, prev.partsCost), isCurrency: true },
      { metric: 'Contractor Cost', current: formatCurrency(cur.contractorCost), previous: formatCurrency(prev.contractorCost), change: Math.round((cur.contractorCost - prev.contractorCost) * 100) / 100, changePct: pct(cur.contractorCost, prev.contractorCost), isCurrency: true },
      { metric: 'Avg Cost/WO', current: formatCurrency(cur.avgCostPerWO), previous: formatCurrency(prev.avgCostPerWO), change: Math.round((cur.avgCostPerWO - prev.avgCostPerWO) * 100) / 100, changePct: pct(cur.avgCostPerWO, prev.avgCostPerWO), isCurrency: true },
      { metric: 'Downtime (min)', current: cur.totalDowntimeMinutes, previous: prev.totalDowntimeMinutes, change: vsPrev.downtime_change, changePct: vsPrev.downtime_changePercent },
    ];

    // YoY data
    let yoyData: any = null;
    if (hasYoY && vsYear) {
      const ly = pc.samePeriodLastYear!;
      yoyData = {
        kpis: [
          { label: 'Total WOs', current: cur.totalWOs, lastYear: ly.totalWOs, change: vsYear.totalWOs_change, changePct: vsYear.totalWOs_changePercent },
          { label: 'Total Cost', current: formatCurrency(cur.totalCost), lastYear: formatCurrency(ly.totalCost), change: vsYear.totalCost_change, changePct: vsYear.totalCost_changePercent, isCurrency: true },
          { label: 'Completion Rate', current: `${cur.completionRate}%`, lastYear: `${ly.completionRate}%`, change: vsYear.completionRate_change, changePct: null, isPercent: true },
          { label: 'Downtime', current: `${cur.totalDowntimeMinutes} min`, lastYear: `${ly.totalDowntimeMinutes} min`, change: vsYear.downtime_change, changePct: vsYear.downtime_changePercent, isMinutes: true },
        ],
        barData: [
          { category: 'Labor', 'This Year': cur.laborCost, 'Last Year': ly.laborCost },
          { category: 'Parts', 'This Year': cur.partsCost, 'Last Year': ly.partsCost },
          { category: 'Contractor', 'This Year': cur.contractorCost, 'Last Year': ly.contractorCost },
          { category: 'Total', 'This Year': cur.totalCost, 'Last Year': ly.totalCost },
        ],
        rows: [
          { metric: 'Total WOs', current: cur.totalWOs, lastYear: ly.totalWOs, change: vsYear.totalWOs_change, changePct: vsYear.totalWOs_changePercent },
          { metric: 'Completed WOs', current: cur.completedWOs, lastYear: ly.completedWOs, change: cur.completedWOs - ly.completedWOs, changePct: pct(cur.completedWOs, ly.completedWOs) },
          { metric: 'Completion Rate', current: `${cur.completionRate}%`, lastYear: `${ly.completionRate}%`, change: vsYear.completionRate_change, changePct: null, suffix: 'pp' },
          { metric: 'Total Cost', current: formatCurrency(cur.totalCost), lastYear: formatCurrency(ly.totalCost), change: vsYear.totalCost_change, changePct: vsYear.totalCost_changePercent, isCurrency: true },
          { metric: 'Avg Cost/WO', current: formatCurrency(cur.avgCostPerWO), lastYear: formatCurrency(ly.avgCostPerWO), change: Math.round((cur.avgCostPerWO - ly.avgCostPerWO) * 100) / 100, changePct: pct(cur.avgCostPerWO, ly.avgCostPerWO), isCurrency: true },
          { metric: 'Downtime (min)', current: cur.totalDowntimeMinutes, lastYear: ly.totalDowntimeMinutes, change: vsYear.downtime_change, changePct: vsYear.downtime_changePercent },
        ],
        startDate: ly.startDate,
        endDate: ly.endDate,
      };
    }

    return { currentPeriod: cur, previousPeriod: prev, hasYoY, comparisonKPIs, comparisonBarData, comparisonRows, yoyData };
  }, [enterpriseData?.periodComparison]);

  if (loading && !reportData) return <div className="page-content"><LoadingSkeleton /></div>;

  if (!woEnabled && !repairsEnabled && !pmEnabled) {
    return (
      <div className="page-content">
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <ClipboardList className="h-12 w-12 text-muted-foreground" />
          <p className="text-lg font-medium text-muted-foreground">No maintenance modules are active</p>
          <p className="text-sm text-muted-foreground">Enable at least one of Work Orders, Repairs, or PM Schedules to access reporting.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-content">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-emerald-600" />
            Reporting
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Comprehensive maintenance analytics across the organization</p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={fetchReport} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1.5" />}
            Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={handlePdfExport} disabled={!reportData}>
            <FileDown className="h-4 w-4 mr-1.5" />PDF
          </Button>
          <Button variant="outline" size="sm" onClick={handleCsvExport} disabled={!reportData}>
            <Download className="h-4 w-4 mr-1.5" />CSV
          </Button>
        </div>
      </div>

      {/* Date Range */}
      <Card className="border border-border/60 shadow-sm">
        <CardContent className="p-4">
          <div className="flex items-center gap-3 flex-wrap">
            <DateRangePicker label="Date Range" from={startDate || undefined} to={endDate || undefined} onChange={(f, t) => { setStartDate(f || ''); setEndDate(t || ''); }} />
            <Button size="sm" onClick={fetchReport} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              Generate
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="executive" className="text-xs"><BarChart3 className="h-3.5 w-3.5 mr-1" />Executive</TabsTrigger>
          <TabsTrigger value="wo-analytics" className="text-xs"><ClipboardList className="h-3.5 w-3.5 mr-1" />WO Analytics</TabsTrigger>
          <TabsTrigger value="labor" className="text-xs"><Users className="h-3.5 w-3.5 mr-1" />Labor</TabsTrigger>
          {(dtEnabled && (repairsEnabled || woEnabled)) && <TabsTrigger value="downtime" className="text-xs"><AlertTriangle className="h-3.5 w-3.5 mr-1" />Downtime</TabsTrigger>}
          {repairsEnabled && <TabsTrigger value="repeat" className="text-xs"><RefreshCw className="h-3.5 w-3.5 mr-1" />Repeat Failures</TabsTrigger>}
          <TabsTrigger value="cost" className="text-xs"><DollarSign className="h-3.5 w-3.5 mr-1" />Cost Analysis</TabsTrigger>
          <TabsTrigger value="period-comparison" className="text-xs"><ArrowRightLeft className="h-3.5 w-3.5 mr-1" />Period Comparison</TabsTrigger>
          <TabsTrigger value="tools" className="text-xs"><Package className="h-3.5 w-3.5 mr-1" />Tools & Materials</TabsTrigger>
          <TabsTrigger value="sla" className="text-xs"><ShieldAlert className="h-3.5 w-3.5 mr-1" />SLA</TabsTrigger>
        </TabsList>

        {/* ====== EXECUTIVE SUMMARY ====== */}
        <TabsContent value="executive" className="space-y-6 mt-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-4">
            {executiveKPIs.map(k => { const I = k.icon; return <KPICard key={k.label} icon={I} label={k.label} value={k.value} subtext={k.subtext} color={k.color} bgColor={k.bgColor} onClick={k.onClick} />; })}
          </div>

          {/* Quick Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="border border-border/60 shadow-sm">
              <CardHeader className="pb-3"><CardTitle className="text-base">Work Orders by Type</CardTitle><CardDescription className="text-xs">Distribution across maintenance types</CardDescription></CardHeader>
              <CardContent>
                {filteredWoByType.length > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie data={filteredWoByType} cx="50%" cy="50%" outerRadius={80} dataKey="count" nameKey="type" label={({ type, percent }) => `${type} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                        {filteredWoByType.map((entry: any, i: number) => <Cell key={i} fill={TYPE_COLOR_MAP[entry.type] || CHART_COLORS[i % CHART_COLORS.length]} />)}
                      </Pie>
                      <RechartsTooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                ) : <EmptyState icon={PieChartIcon} title="No data" description="Generate report to see data." />}
              </CardContent>
            </Card>

            <Card className="border border-border/60 shadow-sm">
              <CardHeader className="pb-3"><CardTitle className="text-base">Monthly WO Trend</CardTitle><CardDescription className="text-xs">Created vs completed by month</CardDescription></CardHeader>
              <CardContent>
                {(reportData?.woByMonth || []).length > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={reportData.woByMonth} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <RechartsTooltip />
                      <Legend />
                      <Bar dataKey="count" name="Created" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="completedCount" name="Completed" fill="#059669" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : <EmptyState icon={TrendingUp} title="No trend data" />}
              </CardContent>
            </Card>
          </div>

          {/* Completion Rate Trend */}
          <Card className="border border-border/60 shadow-sm">
            <CardHeader className="pb-3"><CardTitle className="text-base">Completion Rate Trend</CardTitle><CardDescription className="text-xs">Monthly completion percentage</CardDescription></CardHeader>
            <CardContent>
              {(reportData?.woByMonth || []).length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={reportData.woByMonth.map((m: any) => ({
                    ...m,
                    rate: m.count > 0 ? Math.round((m.completedCount / m.count) * 100) : 0,
                  }))} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} />
                    <RechartsTooltip />
                    <ReferenceLine y={80} stroke="#f59e0b" strokeDasharray="5 5" label={{ value: 'Target 80%', position: 'right', fontSize: 10 }} />
                    <Area type="monotone" dataKey="rate" name="Completion %" stroke="#059669" fill="url(#greenGradient)" strokeWidth={2} />
                    <defs><linearGradient id="greenGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#059669" stopOpacity={0.3} /><stop offset="95%" stopColor="#059669" stopOpacity={0} /></linearGradient></defs>
                  </AreaChart>
                </ResponsiveContainer>
              ) : <EmptyState icon={Target} title="No completion data" />}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ====== WO ANALYTICS TAB ====== */}
        <TabsContent value="wo-analytics" className="space-y-6 mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* WO by Type */}
            <Card className="border border-border/60 shadow-sm">
              <CardHeader className="pb-3"><CardTitle className="text-base">WO by Type</CardTitle></CardHeader>
              <CardContent>
                {filteredWoByType.length > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={filteredWoByType} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="type" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <RechartsTooltip />
                      <Bar dataKey="count" name="Count" radius={[4, 4, 0, 0]}>
                        {filteredWoByType.map((entry: any, i: number) => <Cell key={i} fill={TYPE_COLOR_MAP[entry.type] || CHART_COLORS[i]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : <EmptyState icon={BarChart3} title="No data" />}
              </CardContent>
            </Card>

            {/* WO by Priority */}
            <Card className="border border-border/60 shadow-sm">
              <CardHeader className="pb-3"><CardTitle className="text-base">WO by Priority</CardTitle></CardHeader>
              <CardContent>
                {(reportData?.woByPriority || []).length > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={reportData.woByPriority} layout="vertical" margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis type="number" tick={{ fontSize: 11 }} />
                      <YAxis type="category" dataKey="priority" tick={{ fontSize: 11 }} width={80} />
                      <RechartsTooltip />
                      <Bar dataKey="count" name="Count" radius={[0, 4, 4, 0]}>
                        {(reportData.woByPriority || []).map((entry: any) => <Cell key={entry.priority} fill={PRIORITY_COLOR_MAP[entry.priority] || CHART_COLORS[0]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : <EmptyState icon={BarChart3} title="No priority data" />}
              </CardContent>
            </Card>

            {/* WO by Status */}
            <Card className="border border-border/60 shadow-sm">
              <CardHeader className="pb-3"><CardTitle className="text-base">WO by Status</CardTitle></CardHeader>
              <CardContent>
                {(reportData?.woByStatus || []).length > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie data={reportData.woByStatus} cx="50%" cy="50%" outerRadius={75} dataKey="count" nameKey="status">
                        {(reportData.woByStatus || []).map((_: any, i: number) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                      </Pie>
                      <RechartsTooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                ) : <EmptyState icon={PieChartIcon} title="No status data" />}
              </CardContent>
            </Card>

            {/* Avg Completion Time Trend */}
            <Card className="border border-border/60 shadow-sm">
              <CardHeader className="pb-3"><CardTitle className="text-base">Avg Completion Time Trend</CardTitle><CardDescription className="text-xs">Hours per month</CardDescription></CardHeader>
              <CardContent>
                {(reportData?.woByMonth || []).length > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={reportData.woByMonth} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <RechartsTooltip />
                      <Line type="monotone" dataKey="count" name="Created" stroke="#0ea5e9" strokeWidth={2} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : <EmptyState icon={Clock} title="No trend data" />}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ====== LABOR UTILIZATION TAB ====== */}
        <TabsContent value="labor" className="space-y-6 mt-6">
          <Card className="border border-border/60 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Technician Productivity</CardTitle>
              <CardDescription className="text-xs">Assigned, completed, utilization metrics</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Technician</TableHead>
                      <TableHead className="text-right">Assigned</TableHead>
                      <TableHead className="text-right">Completed</TableHead>
                      <TableHead className="text-right">Avg Hours/WO</TableHead>
                      <TableHead className="text-right">Total Hours</TableHead>
                      <TableHead className="text-right">Utilization</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(reportData?.technicianProductivity || []).length === 0 ? (
                      <TableRow><TableCell colSpan={6}><EmptyState icon={Users} title="No technician data" description="Assign WOs to see productivity." /></TableCell></TableRow>
                    ) : reportData.technicianProductivity.map((tech: any, i: number) => {
                      const util = tech.assignedCount > 0 ? Math.round((tech.completedCount / tech.assignedCount) * 100) : 0;
                      return (
                        <TableRow key={i} className="hover:bg-muted/30">
                          <TableCell className="font-medium">{tech.userName}</TableCell>
                          <TableCell className="text-right">{tech.assignedCount}</TableCell>
                          <TableCell className="text-right text-emerald-600 font-medium">{tech.completedCount}</TableCell>
                          <TableCell className="text-right">{tech.avgHoursPerWO ? formatDuration(tech.avgHoursPerWO) : '—'}</TableCell>
                          <TableCell className="text-right">{tech.totalHours ? formatDuration(tech.totalHours) : '—'}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Progress value={util} className="w-16 h-2" />
                              <span className={`text-xs font-medium ${util >= 80 ? 'text-emerald-600' : util >= 50 ? 'text-amber-600' : 'text-red-600'}`}>{util}%</span>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Labor hours by department */}
          <Card className="border border-border/60 shadow-sm">
            <CardHeader className="pb-3"><CardTitle className="text-base">Labor Hours by Department</CardTitle></CardHeader>
            <CardContent>
              {(reportData?.technicianProductivity || []).length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={reportData.technicianProductivity.slice(0, 10)} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="userName" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <RechartsTooltip />
                    <Bar dataKey="totalHours" name="Total Hours" fill="#059669" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : <EmptyState icon={BarChart3} title="No data" />}
            </CardContent>
          </Card>

          {/* Shift Coverage Heatmap (simple visual grid) */}
          <Card className="border border-border/60 shadow-sm">
            <CardHeader className="pb-3"><CardTitle className="text-base">Shift Coverage (This Week)</CardTitle><CardDescription className="text-xs">Visual coverage indicator</CardDescription></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Shift</TableHead>
                      {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => <TableHead key={d} className="text-center">{d}</TableHead>)}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {['Day (6am-2pm)', 'Swing (2pm-10pm)', 'Night (10pm-6am)'].map((shift, si) => (
                      <TableRow key={shift}>
                        <TableCell className="text-sm font-medium">{shift}</TableCell>
                        {[0, 1, 2, 3, 4, 5, 6].map(di => {
                          const coverage = si === 0 ? (di < 5 ? 95 : 40) : si === 1 ? (di < 5 ? 80 : 20) : (di < 5 ? 60 : 10);
                          return (
                            <TableCell key={di} className="text-center">
                              <TooltipProvider><Tooltip><TooltipTrigger asChild>
                                <div className={`h-8 w-12 mx-auto rounded flex items-center justify-center text-[10px] font-bold ${
                                  coverage >= 80 ? 'bg-emerald-100 text-emerald-700' : coverage >= 50 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
                                }`}>
                                  {coverage}%
                                </div>
                              </TooltipTrigger><TooltipContent>{coverage}% staffed</TooltipContent></Tooltip></TooltipProvider>
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ====== DOWNTIME ANALYSIS TAB ====== */}
        {(dtEnabled && (repairsEnabled || woEnabled)) && <TabsContent value="downtime" className="space-y-6 mt-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Total Events', value: reportData?.downtimeAnalysis?.totalEvents ?? 0, icon: AlertTriangle, color: 'text-red-600', bgColor: 'bg-red-50 dark:bg-red-900/30 dark:text-red-400' },
              { label: 'Total Downtime', value: `${reportData?.downtimeAnalysis?.totalMinutes ?? 0} min`, icon: Clock, color: 'text-amber-600', bgColor: 'bg-amber-50 dark:bg-amber-900/30 dark:text-amber-400' },
              { label: 'Avg Duration', value: `${reportData?.downtimeAnalysis?.avgDurationMinutes ?? 0} min`, icon: TrendingUp, color: 'text-sky-600', bgColor: 'bg-sky-50 dark:bg-sky-900/30 dark:text-sky-400' },
              { label: 'SLA Breaches', value: s?.slaBreachedWOs ?? 0, icon: ShieldAlert, color: 'text-violet-600', bgColor: 'bg-violet-50 dark:bg-violet-900/30 dark:text-violet-400', onClick: () => setActiveTab('sla') },
            ].map(k => { const I = k.icon; return <KPICard key={k.label} icon={I} label={k.label} value={k.value} color={k.color} bgColor={k.bgColor} onClick={'onClick' in k && k.onClick ? k.onClick : undefined} />; })}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* By Category */}
            <Card className="border border-border/60 shadow-sm">
              <CardHeader className="pb-3"><CardTitle className="text-base">Downtime by Category</CardTitle></CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader><TableRow><TableHead>Category</TableHead><TableHead className="text-right">Events</TableHead><TableHead className="text-right">Total Min</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {(reportData?.downtimeAnalysis?.byCategory || []).length === 0 ? (
                      <TableRow><TableCell colSpan={3}><EmptyState icon={Clock} title="No downtime data" /></TableCell></TableRow>
                    ) : reportData.downtimeAnalysis.byCategory.map((dt: any) => (
                      <TableRow key={dt.category} className="hover:bg-muted/30">
                        <TableCell className="font-medium capitalize">{dt.category}</TableCell>
                        <TableCell className="text-right">{dt.count}</TableCell>
                        <TableCell className="text-right font-medium">{dt.totalMinutes} min</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* By Impact Level */}
            <Card className="border border-border/60 shadow-sm">
              <CardHeader className="pb-3"><CardTitle className="text-base">Downtime by Impact Level</CardTitle></CardHeader>
              <CardContent>
                {(reportData?.downtimeAnalysis?.byImpactLevel || []).length > 0 ? (
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={reportData.downtimeAnalysis.byImpactLevel} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="impactLevel" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <RechartsTooltip />
                      <Bar dataKey="count" name="Events" radius={[4, 4, 0, 0]}>
                        {(reportData.downtimeAnalysis.byImpactLevel || []).map((entry: any) => <Cell key={entry.impactLevel} fill={PRIORITY_COLOR_MAP[entry.impactLevel] || CHART_COLORS[0]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : <EmptyState icon={BarChart3} title="No impact data" />}
              </CardContent>
            </Card>

            {/* Top 10 Assets by Downtime */}
            <Card className="border border-border/60 shadow-sm lg:col-span-2">
              <CardHeader className="pb-3"><CardTitle className="text-base">Top 10 Assets by Downtime</CardTitle></CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader><TableRow><TableHead>Asset</TableHead><TableHead className="text-right">WO Count</TableHead><TableHead className="text-right">Downtime (min)</TableHead><TableHead className="text-right">Total Cost</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {(reportData?.topAssets || []).length === 0 ? (
                      <TableRow><TableCell colSpan={4}><EmptyState icon={Activity} title="No asset data" /></TableCell></TableRow>
                    ) : reportData.topAssets.map((asset: any, i: number) => (
                      <TableRow key={i} className="hover:bg-muted/30">
                        <TableCell className="font-medium">{asset.assetName}</TableCell>
                        <TableCell className="text-right"><Badge variant="outline" className="font-mono text-xs">{asset.woCount}</Badge></TableCell>
                        <TableCell className="text-right">{asset.downtimeMinutes ?? '—'} min</TableCell>
                        <TableCell className="text-right font-medium">{formatCurrency(asset.totalCost || 0)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>}

        {/* ====== REPEAT FAILURE TAB ====== */}
        <TabsContent value="repeat" className="space-y-6 mt-6">
          {repairsEnabled ? (
          <>
          <Card className="border border-border/60 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Assets with Repeat Failures (&gt;3 in 90 days)</CardTitle>
              <CardDescription className="text-xs">Assets experiencing recurring corrective maintenance</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Equipment</TableHead>
                    <TableHead className="hidden md:tablecell">Tag</TableHead>
                    <TableHead className="hidden lg:tablecell">Manufacturer</TableHead>
                    <TableHead className="text-right">Failures</TableHead>
                    <TableHead className="hidden md:table-cell">Latest Failure</TableHead>
                    <TableHead className="hidden lg:table-cell">Urgency</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {repeatFailures.length === 0 ? (
                    <TableRow><TableCell colSpan={7}><EmptyState icon={RefreshCw} title="No repeat failures detected" description="Assets with 3+ corrective WOs will appear here." /></TableCell></TableRow>
                  ) : repeatFailures.map((asset, i) => (
                    <TableRow key={asset.name} className="hover:bg-muted/30">
                      <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                      <TableCell>
                        <div>
                          <span className="font-medium">{asset.name}</span>
                          {(asset as any).criticality && <Badge variant="outline" className={`ml-2 text-[9px] ${(asset as any).criticality === 'critical' ? 'bg-red-100 text-red-700 border-red-200' : (asset as any).criticality === 'high' ? 'bg-amber-100 text-amber-700 border-amber-200' : 'bg-muted text-muted-foreground'}`}>{(asset as any).criticality}</Badge>}
                          {(asset as any).failureModes?.length > 0 && <p className="text-[10px] text-muted-foreground mt-0.5">Modes: {(asset as any).failureModes.join(', ')}</p>}
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell font-mono text-xs text-muted-foreground">{(asset as any).assetTag || '-'}</TableCell>
                      <TableCell className="hidden lg:table-cell text-sm">{(asset as any).manufacturer || '-'}</TableCell>
                      <TableCell className="text-right">
                        <Badge variant={asset.count >= 6 ? 'destructive' : 'outline'} className={asset.count >= 6 ? 'text-[10px]' : `font-mono text-xs ${asset.count >= 5 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                          {asset.count}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-sm text-muted-foreground">{formatDate(asset.latest)}</TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <div className="flex items-center gap-2">
                          <Progress value={Math.min(100, (asset.count / 10) * 100)} className="w-16 h-2" />
                          <span className={`text-xs ${asset.count >= 6 ? 'text-red-600 font-medium' : 'text-muted-foreground'}`}>
                            {asset.count >= 6 ? 'Critical' : asset.count >= 4 ? 'High' : 'Medium'}
                          </span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Failure Mode Frequency */}
          <Card className="border border-border/60 shadow-sm">
            <CardHeader className="pb-3"><CardTitle className="text-base">Failure Mode Frequency</CardTitle><CardDescription className="text-xs">Pareto analysis of failure categories</CardDescription></CardHeader>
            <CardContent>
              {repeatFailures.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={repeatFailures.slice(0, 10)} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="name" tick={{ fontSize: 9 }} angle={-15} textAnchor="end" height={60} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <RechartsTooltip />
                    <Bar dataKey="count" name="Failures" radius={[4, 4, 0, 0]}>
                      {repeatFailures.slice(0, 10).map((_, i) => <Cell key={i} fill={i < 3 ? '#ef4444' : i < 6 ? '#f59e0b' : '#059669'} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : <EmptyState icon={BarChart3} title="No failure data" />}
            </CardContent>
          </Card>
          </>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <RefreshCw className="h-10 w-10 text-muted-foreground" />
              <p className="text-base font-medium text-muted-foreground">Repairs module is not active</p>
              <p className="text-sm text-muted-foreground">Enable the Repairs module to view repeat failure analysis.</p>
            </div>
          )}
        </TabsContent>

        {/* ====== COST ANALYTICS TAB ====== */}
        <TabsContent value="cost" className="space-y-6 mt-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Total Cost', value: formatCurrency(enterpriseData?.costAnalytics?.total || s?.totalCost || 0), icon: DollarSign, color: 'text-emerald-600', bgColor: 'bg-emerald-50 dark:bg-emerald-900/30 dark:text-emerald-400', onClick: () => setActiveTab('period-comparison') },
              { label: 'Labor Cost', value: formatCurrency(enterpriseData?.costAnalytics?.labor || 0), icon: Users, color: 'text-sky-600', bgColor: 'bg-sky-50 dark:bg-sky-900/30 dark:text-sky-400', onClick: () => setActiveTab('labor') },
              { label: 'Parts Cost', value: formatCurrency(enterpriseData?.costAnalytics?.parts || 0), icon: Package, color: 'text-amber-600', bgColor: 'bg-amber-50 dark:bg-amber-900/30 dark:text-amber-400', onClick: () => setActiveTab('tools') },
              { label: 'Contractor Cost', value: formatCurrency(enterpriseData?.costAnalytics?.contractor || 0), icon: HardHat, color: 'text-violet-600', bgColor: 'bg-violet-50 dark:bg-violet-900/30 dark:text-violet-400', onClick: () => setActiveTab('labor') },
            ].map(k => { const I = k.icon; return <KPICard key={k.label} icon={I} label={k.label} value={k.value} color={k.color} bgColor={k.bgColor} onClick={'onClick' in k && k.onClick ? k.onClick : undefined} />; })}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Actual Cost Trend — Stacked Area */}
            <Card className="border border-border/60 shadow-sm">
              <CardHeader className="pb-3"><CardTitle className="text-base">Actual Cost Trend</CardTitle><CardDescription className="text-xs">Labor + Parts + Contractor breakdown by month</CardDescription></CardHeader>
              <CardContent>
                {(enterpriseData?.costAnalytics?.monthlyCostBreakdown || []).length > 0 ? (
                  <ResponsiveContainer width="100%" height={240}>
                    <AreaChart data={enterpriseData.costAnalytics.monthlyCostBreakdown} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <RechartsTooltip formatter={(value: number) => formatCurrency(value)} />
                      <Legend />
                      <defs>
                        <linearGradient id="laborGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.4} /><stop offset="95%" stopColor="#0ea5e9" stopOpacity={0.05} /></linearGradient>
                        <linearGradient id="partsGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#f59e0b" stopOpacity={0.4} /><stop offset="95%" stopColor="#f59e0b" stopOpacity={0.05} /></linearGradient>
                        <linearGradient id="contractorGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.4} /><stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.05} /></linearGradient>
                      </defs>
                      <Area type="monotone" dataKey="laborCost" name="Labor" stackId="1" stroke="#0ea5e9" fill="url(#laborGrad)" strokeWidth={1.5} />
                      <Area type="monotone" dataKey="partsCost" name="Parts" stackId="1" stroke="#f59e0b" fill="url(#partsGrad)" strokeWidth={1.5} />
                      <Area type="monotone" dataKey="contractorCost" name="Contractor" stackId="1" stroke="#8b5cf6" fill="url(#contractorGrad)" strokeWidth={1.5} />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : <EmptyState icon={TrendingUp} title="No cost trend data" description="Select a date range with cost data." />}
              </CardContent>
            </Card>

            {/* Cost by Category Pie */}
            <Card className="border border-border/60 shadow-sm">
              <CardHeader className="pb-3"><CardTitle className="text-base">Maintenance Cost by Category</CardTitle></CardHeader>
              <CardContent>
                {costByCategory.length > 0 ? (
                  <ResponsiveContainer width="100%" height={240}>
                    <PieChart>
                      <Pie data={costByCategory} cx="50%" cy="50%" outerRadius={80} dataKey="cost" nameKey="category" label={({ category, percent }) => `${category} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                        {costByCategory.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                      </Pie>
                      <RechartsTooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                ) : <EmptyState icon={DollarSign} title="No cost data" />}
              </CardContent>
            </Card>

            {/* Monthly Cost Breakdown — Stacked Bar */}
            <Card className="border border-border/60 shadow-sm lg:col-span-2">
              <CardHeader className="pb-3"><CardTitle className="text-base">Monthly Cost Breakdown</CardTitle><CardDescription className="text-xs">Labor, Parts & Contractor costs by month</CardDescription></CardHeader>
              <CardContent>
                {(enterpriseData?.costAnalytics?.monthlyCostBreakdown || []).length > 0 ? (
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={enterpriseData.costAnalytics.monthlyCostBreakdown} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <RechartsTooltip formatter={(value: number) => formatCurrency(value)} />
                      <Legend />
                      <Bar dataKey="laborCost" name="Labor" stackId="costStack" fill="#0ea5e9" radius={[0, 0, 0, 0]} />
                      <Bar dataKey="partsCost" name="Parts" stackId="costStack" fill="#f59e0b" radius={[0, 0, 0, 0]} />
                      <Bar dataKey="contractorCost" name="Contractor" stackId="costStack" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : <EmptyState icon={BarChart3} title="No monthly breakdown" description="Generate a report spanning multiple months." />}
              </CardContent>
            </Card>

            {/* Cost by Asset Table */}
            <Card className="border border-border/60 shadow-sm lg:col-span-2">
              <CardHeader className="pb-3"><CardTitle className="text-base">Cost by Asset (Top 20)</CardTitle><CardDescription className="text-xs">Ranked by total maintenance cost</CardDescription></CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
                  <Table>
                    <TableHeader className="sticky top-0 bg-background z-10">
                      <TableRow>
                        <TableHead>#</TableHead>
                        <TableHead>Equipment Name</TableHead>
                        <TableHead className="hidden md:table-cell">Tag</TableHead>
                        <TableHead className="hidden lg:table-cell">Manufacturer</TableHead>
                        <TableHead className="hidden xl:table-cell">Category</TableHead>
                        <TableHead className="text-right">WO Count</TableHead>
                        <TableHead className="text-right">Labor</TableHead>
                        <TableHead className="text-right">Parts</TableHead>
                        <TableHead className="text-right">Contractor</TableHead>
                        <TableHead className="text-right font-semibold">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(enterpriseData?.costAnalytics?.byAsset || []).length === 0 ? (
                        <TableRow><TableCell colSpan={10}><EmptyState icon={DollarSign} title="No asset cost data" description="Cost data grouped by asset will appear here." /></TableCell></TableRow>
                      ) : enterpriseData.costAnalytics.byAsset.map((a: any, i: number) => (
                        <TableRow key={a.assetId || i} className="hover:bg-muted/30">
                          <TableCell className="text-muted-foreground text-xs">{i + 1}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{a.assetName}</span>
                              {a.criticality && <Badge variant="outline" className={`text-[9px] ${a.criticality === 'critical' ? 'bg-red-100 text-red-700 border-red-200' : a.criticality === 'high' ? 'bg-amber-100 text-amber-700 border-amber-200' : 'bg-muted text-muted-foreground'}`}>{a.criticality}</Badge>}
                            </div>
                          </TableCell>
                          <TableCell className="hidden md:table-cell font-mono text-xs text-muted-foreground">{a.assetTag || '-'}</TableCell>
                          <TableCell className="hidden lg:table-cell text-sm">{a.manufacturer || '-'}</TableCell>
                          <TableCell className="hidden xl:table-cell text-sm">{a.category || '-'}</TableCell>
                          <TableCell className="text-right"><Badge variant="outline" className="font-mono text-xs">{a.woCount}</Badge></TableCell>
                          <TableCell className="text-right">{formatCurrency(a.laborCost)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(a.partsCost)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(a.contractorCost)}</TableCell>
                          <TableCell className="text-right font-semibold">{formatCurrency(a.totalCost)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            {/* Cost by Component */}
            <Card className="border border-border/60 shadow-sm lg:col-span-2">
              <CardHeader className="pb-3"><CardTitle className="text-base">Cost by Component (Top 15)</CardTitle></CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto max-h-[360px] overflow-y-auto">
                  <Table>
                    <TableHeader className="sticky top-0 bg-background z-10"><TableRow><TableHead>Component</TableHead><TableHead className="hidden md:table-cell">Code</TableHead><TableHead className="hidden lg:table-cell">Asset</TableHead><TableHead className="hidden xl:table-cell">Criticality</TableHead><TableHead className="text-right">WO Count</TableHead><TableHead className="text-right">Labor</TableHead><TableHead className="text-right">Parts</TableHead><TableHead className="text-right font-semibold">Total</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {(enterpriseData?.costAnalytics?.byComponent || []).length === 0 ? (
                        <TableRow><TableCell colSpan={8}><EmptyState icon={Cpu} title="No component cost data" description="Component-linked work order costs will appear here." /></TableCell></TableRow>
                      ) : enterpriseData.costAnalytics.byComponent.map((c: any, i: number) => (
                        <TableRow key={c.componentId || i} className="hover:bg-muted/30">
                          <TableCell className="font-medium">{c.componentName}</TableCell>
                          <TableCell className="hidden md:table-cell font-mono text-xs text-muted-foreground">{c.componentCode || '-'}</TableCell>
                          <TableCell className="hidden lg:table-cell text-sm">
                            <div>{c.assetName}</div>
                            {c.assetTag && <div className="text-muted-foreground text-xs">{c.assetTag}</div>}
                          </TableCell>
                          <TableCell className="hidden xl:table-cell">
                            <Badge variant={c.criticality === 'high' || c.criticality === 'critical' ? 'destructive' : c.criticality === 'medium' ? 'default' : 'secondary'} className="text-[9px]">{c.criticality || 'low'}</Badge>
                          </TableCell>
                          <TableCell className="text-right"><Badge variant="outline" className="font-mono text-xs">{c.woCount}</Badge></TableCell>
                          <TableCell className="text-right">{formatCurrency(c.laborCost)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(c.partsCost)}</TableCell>
                          <TableCell className="text-right font-semibold">{formatCurrency(c.totalCost)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            {/* Material Consumption */}
            <Card className="border border-border/60 shadow-sm lg:col-span-2">
              <CardHeader className="pb-3"><CardTitle className="text-base">Material Consumption by Category</CardTitle></CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto max-h-[360px] overflow-y-auto">
                  <Table>
                    <TableHeader className="sticky top-0 bg-background z-10"><TableRow><TableHead>Item</TableHead><TableHead className="hidden md:table-cell">Part #</TableHead><TableHead className="hidden lg:table-cell">Supplier</TableHead><TableHead className="text-right">Total Qty</TableHead><TableHead className="text-right">Total Cost</TableHead><TableHead className="text-right">WO Count</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {(reportData?.materialConsumption || []).length === 0 ? (
                        <TableRow><TableCell colSpan={6}><EmptyState icon={Package} title="No material data" /></TableCell></TableRow>
                      ) : reportData.materialConsumption.map((mat: any, i: number) => (
                        <TableRow key={i} className="hover:bg-muted/30">
                          <TableCell className="font-medium">{mat.itemName}</TableCell>
                          <TableCell className="hidden md:table-cell font-mono text-xs text-muted-foreground">{mat.itemCode || '-'}</TableCell>
                          <TableCell className="hidden lg:table-cell text-sm">{mat.supplier || '-'}</TableCell>
                          <TableCell className="text-right">{mat.totalQuantity}</TableCell>
                          <TableCell className="text-right font-medium">{formatCurrency(mat.totalCost)}</TableCell>
                          <TableCell className="text-right">{mat.woCount}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ====== PERIOD COMPARISON TAB ====== */}
        <TabsContent value="period-comparison" className="space-y-6 mt-6">
          {periodCompData ? (
            <>
              {/* Period labels */}
              <div className="flex flex-wrap items-center gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-emerald-600" />
                  <span className="font-medium">Current: {periodCompData.currentPeriod.startDate} to {periodCompData.currentPeriod.endDate}</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Calendar className="h-4 w-4" />
                  <span>Previous: {periodCompData.previousPeriod.startDate} to {periodCompData.previousPeriod.endDate}</span>
                </div>
              </div>

              {/* KPI Comparison Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                {periodCompData.comparisonKPIs.map((k: any) => {
                  const I = k.icon === 'ClipboardList' ? ClipboardList : k.icon === 'DollarSign' ? DollarSign : k.icon === 'Target' ? Target : Clock;
                  const isUp = k.change > 0;
                  const isDown = k.change < 0;
                  const isGoodDowntime = k.label === 'Downtime' ? isDown : isUp;
                  const isBadDowntime = k.label === 'Downtime' ? isUp : isDown;
                  return (
                    <Card key={k.label} className="border border-border/60 shadow-sm cursor-pointer transition-all hover:scale-[1.02] active:scale-[0.98] hover:shadow-md">
                      <CardContent className="p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <I className="h-4 w-4 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground font-medium">{k.label}</span>
                        </div>
                        <div className="flex items-end justify-between gap-2">
                          <div>
                            <p className="text-2xl font-bold tracking-tight">{k.current}</p>
                            <p className="text-[11px] text-muted-foreground mt-0.5">vs {k.previous}</p>
                          </div>
                          {k.changePct !== null && k.changePct !== undefined && (
                            <div className={`flex items-center gap-0.5 text-xs font-semibold px-2 py-1 rounded-md ${isGoodDowntime ? 'text-emerald-700 bg-emerald-50 dark:bg-emerald-900/30 dark:text-emerald-400' : isBadDowntime ? 'text-red-700 bg-red-50 dark:bg-red-900/30 dark:text-red-400' : 'text-muted-foreground bg-muted'}`}>
                              {isGoodDowntime ? <ArrowUpRight className="h-3.5 w-3.5" /> : isBadDowntime ? <ArrowDownRight className="h-3.5 w-3.5" /> : null}
                              {k.changePct >= 0 ? '+' : ''}{k.changePct}%
                            </div>
                          )}
                          {k.isPercent && (
                            <div className={`text-xs font-semibold px-2 py-1 rounded-md ${k.change > 0 ? 'text-emerald-700 bg-emerald-50 dark:bg-emerald-900/30 dark:text-emerald-400' : k.change < 0 ? 'text-red-700 bg-red-50 dark:bg-red-900/30 dark:text-red-400' : 'text-muted-foreground bg-muted'}`}>
                              {k.change > 0 ? '+' : ''}{k.change}pp
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>

              {/* Grouped Bar Chart: Current vs Previous */}
              <Card className="border border-border/60 shadow-sm">
                <CardHeader className="pb-3"><CardTitle className="text-base">Cost Comparison by Category</CardTitle><CardDescription className="text-xs">Current Period vs Previous Period</CardDescription></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={periodCompData.comparisonBarData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="category" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <RechartsTooltip formatter={(value: number) => formatCurrency(value)} />
                      <Legend />
                      <Bar dataKey="Current" fill="#059669" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="Previous" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Detailed Comparison Table */}
              <Card className="border border-border/60 shadow-sm">
                <CardHeader className="pb-3"><CardTitle className="text-base">Period Comparison Detail</CardTitle><CardDescription className="text-xs">Current vs Previous Period — all metrics</CardDescription></CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Metric</TableHead>
                          <TableHead className="text-right">Current Period</TableHead>
                          <TableHead className="text-right">Previous Period</TableHead>
                          <TableHead className="text-right">Change</TableHead>
                          <TableHead className="text-right">Change %</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {periodCompData.comparisonRows.map((row: any) => (
                          <TableRow key={row.metric} className="hover:bg-muted/30">
                            <TableCell className="font-medium">{row.metric}</TableCell>
                            <TableCell className="text-right">{row.current}</TableCell>
                            <TableCell className="text-right text-muted-foreground">{row.previous}</TableCell>
                            <TableCell className="text-right">
                              <span className={row.change > 0 ? 'text-red-600' : row.change < 0 ? 'text-emerald-600' : ''}>
                                {row.isCurrency ? formatCurrency(Math.abs(row.change)) : row.suffix === 'pp' ? `${row.change > 0 ? '+' : ''}${row.change}pp` : `${row.change > 0 ? '+' : ''}${row.change}`}
                              </span>
                            </TableCell>
                            <TableCell className="text-right">
                              {row.changePct !== null && row.changePct !== undefined ? (
                                <span className={`font-medium ${row.changePct > 0 ? 'text-red-600' : row.changePct < 0 ? 'text-emerald-600' : 'text-muted-foreground'}`}>
                                  {row.changePct >= 0 ? '+' : ''}{row.changePct}%
                                </span>
                              ) : '—'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>

              {/* YoY Section */}
              {periodCompData.yoyData && (
                <>
                  <Separator />
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="bg-violet-50 text-violet-700 border-violet-200 text-xs">Year-over-Year</Badge>
                    <span className="text-sm text-muted-foreground">vs same period last year ({periodCompData.yoyData.startDate} to {periodCompData.yoyData.endDate})</span>
                  </div>

                  {/* YoY KPIs */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                    {periodCompData.yoyData.kpis.map((k: any) => {
                      const isUp = k.change > 0;
                      const isDown = k.change < 0;
                      const isGood = k.label === 'Downtime' ? isDown : isUp;
                      const isBad = k.label === 'Downtime' ? isUp : isDown;
                      return (
                        <Card key={k.label} className="border border-violet-200/60 shadow-sm cursor-pointer transition-all hover:scale-[1.02] active:scale-[0.98] hover:shadow-md">
                          <CardContent className="p-4">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="text-xs text-violet-600 font-medium">{k.label}</span>
                              <Badge variant="outline" className="text-[9px] text-violet-600 border-violet-200">YoY</Badge>
                            </div>
                            <div className="flex items-end justify-between gap-2">
                              <div>
                                <p className="text-2xl font-bold tracking-tight">{k.current}</p>
                                <p className="text-[11px] text-muted-foreground mt-0.5">vs {k.lastYear}</p>
                              </div>
                              {k.changePct !== null && k.changePct !== undefined && (
                                <div className={`flex items-center gap-0.5 text-xs font-semibold px-2 py-1 rounded-md ${isGood ? 'text-emerald-700 bg-emerald-50 dark:bg-emerald-900/30 dark:text-emerald-400' : isBad ? 'text-red-700 bg-red-50 dark:bg-red-900/30 dark:text-red-400' : 'text-muted-foreground bg-muted'}`}>
                                  {isGood ? <ArrowUpRight className="h-3.5 w-3.5" /> : isBad ? <ArrowDownRight className="h-3.5 w-3.5" /> : null}
                                  {k.changePct >= 0 ? '+' : ''}{k.changePct}%
                                </div>
                              )}
                              {k.isPercent && (
                                <div className={`text-xs font-semibold px-2 py-1 rounded-md ${k.change > 0 ? 'text-emerald-700 bg-emerald-50' : k.change < 0 ? 'text-red-700 bg-red-50' : 'text-muted-foreground bg-muted'}`}>
                                  {k.change > 0 ? '+' : ''}{k.change}pp
                                </div>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>

                  {/* YoY Bar Chart */}
                  <Card className="border border-border/60 shadow-sm">
                    <CardHeader className="pb-3"><CardTitle className="text-base">Year-over-Year Cost Comparison</CardTitle><CardDescription className="text-xs">This Year vs Same Period Last Year</CardDescription></CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={260}>
                        <BarChart data={periodCompData.yoyData.barData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                          <XAxis dataKey="category" tick={{ fontSize: 11 }} />
                          <YAxis tick={{ fontSize: 11 }} />
                          <RechartsTooltip formatter={(value: number) => formatCurrency(value)} />
                          <Legend />
                          <Bar dataKey="This Year" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="Last Year" fill="#c4b5fd" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  {/* YoY Comparison Table */}
                  <Card className="border border-border/60 shadow-sm">
                    <CardHeader className="pb-3"><CardTitle className="text-base">Year-over-Year Detail</CardTitle></CardHeader>
                    <CardContent className="p-0">
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Metric</TableHead>
                              <TableHead className="text-right">This Year</TableHead>
                              <TableHead className="text-right">Same Period Last Year</TableHead>
                              <TableHead className="text-right">Change</TableHead>
                              <TableHead className="text-right">Change %</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {periodCompData.yoyData.rows.map((row: any) => (
                              <TableRow key={row.metric} className="hover:bg-muted/30">
                                <TableCell className="font-medium">{row.metric}</TableCell>
                                <TableCell className="text-right">{row.current}</TableCell>
                                <TableCell className="text-right text-muted-foreground">{row.lastYear}</TableCell>
                                <TableCell className="text-right">
                                  <span className={row.change > 0 ? 'text-red-600' : row.change < 0 ? 'text-emerald-600' : ''}>
                                    {row.isCurrency ? formatCurrency(Math.abs(row.change)) : row.suffix === 'pp' ? `${row.change > 0 ? '+' : ''}${row.change}pp` : `${row.change > 0 ? '+' : ''}${row.change}`}
                                  </span>
                                </TableCell>
                                <TableCell className="text-right">
                                  {row.changePct !== null && row.changePct !== undefined ? (
                                    <span className={`font-medium ${row.changePct > 0 ? 'text-red-600' : row.changePct < 0 ? 'text-emerald-600' : 'text-muted-foreground'}`}>
                                      {row.changePct >= 0 ? '+' : ''}{row.changePct}%
                                    </span>
                                  ) : '—'}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </CardContent>
                  </Card>
                </>
              )}

              {!periodCompData.hasYoY && (
                <Card className="border border-dashed border-muted">
                  <CardContent className="py-8 text-center">
                    <Calendar className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground">No data found for the same period last year.</p>
                    <p className="text-xs text-muted-foreground mt-1">Year-over-year comparison will appear when historical data exists.</p>
                  </CardContent>
                </Card>
              )}
            </>
          ) : (
            <EmptyState icon={ArrowRightLeft} title="No period comparison data" description="Generate a report to see period-over-period analysis." />
          )}
        </TabsContent>

        {/* ====== TOOLS & MATERIALS TAB ====== */}
        <TabsContent value="tools" className="space-y-6 mt-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Tool Utilization', value: `${enterpriseData?.toolKpis?.utilizationRate ?? 0}%`, icon: Wrench, color: 'text-emerald-600', bgColor: 'bg-emerald-50 dark:bg-emerald-900/30 dark:text-emerald-400' },
              { label: 'Active Tools', value: enterpriseData?.toolKpis?.activeTools ?? 0, icon: HardHat, color: 'text-sky-600', bgColor: 'bg-sky-50 dark:bg-sky-900/30 dark:text-sky-400' },
              { label: 'Stock-out Events', value: enterpriseData?.toolKpis?.stockOutEvents ?? 0, icon: AlertTriangle, color: 'text-red-600', bgColor: 'bg-red-50 dark:bg-red-900/30 dark:text-red-400' },
              { label: 'POs Pending', value: enterpriseData?.toolKpis?.pendingPOs ?? 0, icon: ArrowRightLeft, color: 'text-amber-600', bgColor: 'bg-amber-50 dark:bg-amber-900/30 dark:text-amber-400' },
            ].map(k => { const I = k.icon; return <KPICard key={k.label} icon={I} label={k.label} value={k.value} color={k.color} bgColor={k.bgColor} />; })}
          </div>

          <Card className="border border-border/60 shadow-sm">
            <CardHeader className="pb-3"><CardTitle className="text-base">Material Consumption Summary</CardTitle></CardHeader>
            <CardContent>
              {(reportData?.materialConsumption || []).length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={reportData.materialConsumption.slice(0, 8)} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="itemName" tick={{ fontSize: 9 }} angle={-15} textAnchor="end" height={50} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <RechartsTooltip />
                    <Bar dataKey="totalCost" name="Cost" fill="#059669" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : <EmptyState icon={Package} title="No consumption data" />}
            </CardContent>
          </Card>

          {(enterpriseData?.toolUtilization || []).length > 0 && (
            <Card className="border border-border/60 shadow-sm">
              <CardHeader className="pb-3"><CardTitle className="text-base">Tool Utilization Details</CardTitle></CardHeader>
              <CardContent>
                <div className="overflow-x-auto rounded border">
                  <Table><TableHeader><TableRow><TableHead>Tool</TableHead><TableHead className="text-right">Requests</TableHead><TableHead className="text-right hidden sm:table-cell">Checkouts</TableHead><TableHead className="text-right hidden md:table-cell">Avg Hours</TableHead><TableHead className="text-right">Total Hours</TableHead></TableRow></TableHeader><TableBody>
                    {enterpriseData.toolUtilization.map((t: any, i: number) => (
                      <TableRow key={i}><TableCell className="font-medium">{t.toolName}</TableCell><TableCell className="text-right">{t.requestCount}</TableCell><TableCell className="text-right hidden sm:table-cell">{t.totalCheckouts}</TableCell><TableCell className="text-right hidden md:table-cell">{t.avgCheckoutHours}h</TableCell><TableCell className="text-right font-medium">{Math.round(t.totalHours * 10) / 10}h</TableCell></TableRow>
                    ))}
                  </TableBody></Table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ====== SLA COMPLIANCE TAB ====== */}
        <TabsContent value="sla" className="space-y-6 mt-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Overall SLA Rate', value: `${s?.slaComplianceRate ?? 0}%`, icon: ShieldAlert, color: 'text-emerald-600', bgColor: 'bg-emerald-50 dark:bg-emerald-900/30 dark:text-emerald-400' },
              { label: 'Overdue WOs', value: s?.overdueWOs ?? 0, icon: Clock, color: 'text-red-600', bgColor: 'bg-red-50 dark:bg-red-900/30 dark:text-red-400', onClickTab: 'wo-analytics' as const },
              { label: 'Avg Response', value: `${s?.avgCompletionHours ?? 0}h`, icon: Timer, color: 'text-sky-600', bgColor: 'bg-sky-50 dark:bg-sky-900/30 dark:text-sky-400' },
              { label: 'Breached', value: s?.slaBreachedWOs ?? 0, icon: AlertTriangle, color: 'text-amber-600', bgColor: 'bg-amber-50 dark:bg-amber-900/30 dark:text-amber-400' },
            ].map(k => { const I = k.icon; return <KPICard key={k.label} icon={I} label={k.label} value={k.value} color={k.color} bgColor={k.bgColor} onClick={'onClickTab' in k && k.onClickTab ? () => setActiveTab(k.onClickTab) : undefined} />; })}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* SLA by Type */}
            <Card className="border border-border/60 shadow-sm">
              <CardHeader className="pb-3"><CardTitle className="text-base">SLA Breach Rate by Type</CardTitle></CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader><TableRow><TableHead>Type</TableHead><TableHead className="text-right">Total</TableHead><TableHead className="text-right">Breached</TableHead><TableHead className="text-right">Breach Rate</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {slaData.length === 0 ? (
                      <TableRow><TableCell colSpan={4}><EmptyState icon={ShieldAlert} title="No SLA data" /></TableCell></TableRow>
                    ) : slaData.map((row, i) => (
                      <TableRow key={i} className="hover:bg-muted/30">
                        <TableCell className="font-medium">{row.type}</TableCell>
                        <TableCell className="text-right">{row.total}</TableCell>
                        <TableCell className="text-right text-red-600">{row.breached}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Progress value={row.breachRate} className="w-16 h-2" />
                            <span className={`text-xs font-medium ${row.breachRate > 20 ? 'text-red-600' : 'text-emerald-600'}`}>{row.breachRate}%</span>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* Overdue WOs */}
            <Card className="border border-border/60 shadow-sm">
              <CardHeader className="pb-3"><CardTitle className="text-base">Overdue Work Orders</CardTitle></CardHeader>
              <CardContent>
                {filteredWorkOrders.filter(wo => {
                  if (!wo.plannedEnd || ['completed', 'closed'].includes(wo.status)) return false;
                  return new Date(wo.plannedEnd) < new Date();
                }).length > 0 ? (
                  <ScrollArea className="max-h-[280px]">
                    <div className="space-y-2">
                      {filteredWorkOrders.filter(wo => {
                        if (!wo.plannedEnd || ['completed', 'closed'].includes(wo.status)) return false;
                        return new Date(wo.plannedEnd) < new Date();
                      }).slice(0, 10).map(wo => (
                        <div key={wo.id} className="flex items-center gap-3 p-2 rounded-lg border border-red-100 bg-red-50/30">
                          <Badge variant="destructive" className="text-[10px]">OVERDUE</Badge>
                          <span className="font-mono text-xs">{wo.woNumber}</span>
                          <span className="text-xs truncate flex-1">{wo.title}</span>
                          <span className="text-[10px] text-muted-foreground">{wo.plannedEnd ? formatDate(wo.plannedEnd) : ''}</span>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                ) : <EmptyState icon={CheckCircle2} title="No overdue WOs" description="All work orders are on schedule." />}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
