'use client';

import React, { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  Activity,
  ArrowUpDown,
  BarChart3,
  CheckCircle2,
  ClipboardList,
  Clock,
  Download,
  FileDown,
  FileSpreadsheet,
  Filter,
  Loader2,
  Package,
  RefreshCw,
  Search,
  Timer,
  User,
  Wrench,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { api, getAuthHeaders } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { useModuleEnabled, MODULE_CODES } from '@/hooks/useModuleEnabled';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DateRangePicker } from '@/components/ui/datetime-picker';
import { AsyncSearchableSelect } from '@/components/ui/searchable-select';
import { EmptyState, LoadingSkeleton, formatCurrency } from '@/components/shared/helpers';

type ReportType = 'lifecycle' | 'execution' | 'technician_performance' | 'materials' | 'downtime' | 'tools';
type Scalar = string | number;
type TableRowData = Record<string, Scalar>;
type TableColumn = { key: string; label: string };

type ReportDefinition = {
  value: ReportType;
  label: string;
  description: string;
  icon: React.ElementType;
};

const REPORT_TYPES: ReportDefinition[] = [
  { value: 'lifecycle', label: 'Full Lifecycle', icon: Activity, description: 'MR → WO conversion, closure and turnaround' },
  { value: 'execution', label: 'WO Execution', icon: ClipboardList, description: 'Completion, rework and team performance' },
  { value: 'technician_performance', label: 'Technician Performance', icon: User, description: 'Completion, time accuracy and rework by technician' },
  { value: 'materials', label: 'Materials & Parts', icon: Package, description: 'Material cost and spare-part return performance' },
  { value: 'downtime', label: 'Downtime Analysis', icon: Timer, description: 'Asset downtime, impact and production loss' },
  { value: 'tools', label: 'Tool Management', icon: Wrench, description: 'Damage frequency, repair cost and write-offs' },
];

const CHART_COLORS = ['#059669', '#0ea5e9', '#f59e0b', '#ef4444', '#8b5cf6', '#14b8a6', '#f97316', '#6366f1'];
const PAGE_SIZE = 15;

function humanize(value: string) {
  return value.replace(/^wo_/, '').replace(/^mr_/, '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatHours(value: unknown) {
  const n = Number(value || 0);
  return `${Math.round(n * 100) / 100}h`;
}

function formatPercent(value: unknown) {
  const n = Number(value || 0);
  return `${Math.round(n * 100) / 100}%`;
}

function csvCell(value: Scalar) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function buildSummary(type: ReportType, data: any): { label: string; value: string }[] {
  if (!data) return [];
  switch (type) {
    case 'lifecycle':
      return [
        { label: 'Maintenance Requests', value: String(data.totalRequests ?? 0) },
        { label: 'Converted to WO', value: String(data.convertedToWo ?? 0) },
        { label: 'Closed', value: String(data.closed ?? 0) },
        { label: 'Avg Turnaround', value: formatHours(data.avgTurnaroundHours) },
      ];
    case 'execution':
      return [
        { label: 'Work Orders', value: String(data.totalWOs ?? data.summary?.total ?? 0) },
        { label: 'Completion Rate', value: formatPercent(data.completionRate) },
        { label: 'Avg Actual Hours', value: formatHours(data.avgActualHours) },
        { label: 'Rework Rate', value: formatPercent(data.reworkRate) },
      ];
    case 'technician_performance': {
      const technicians = Array.isArray(data.technicians) ? data.technicians : [];
      const avgCompletion = technicians.length > 0
        ? technicians.reduce((sum: number, t: any) => sum + Number(t.completionRate || 0), 0) / technicians.length
        : 0;
      const avgAccuracy = technicians.length > 0
        ? technicians.reduce((sum: number, t: any) => sum + Number(t.timeAccuracy || 0), 0) / technicians.length
        : 0;
      return [
        { label: 'Technicians', value: String(data.totalTechnicians ?? technicians.length) },
        { label: 'Work Orders', value: String(data.totalWorkOrders ?? 0) },
        { label: 'Avg Completion', value: formatPercent(avgCompletion) },
        { label: 'Avg Time Accuracy', value: formatPercent(avgAccuracy) },
      ];
    }
    case 'materials':
      return [
        { label: 'Material Cost', value: formatCurrency(data.summary?.totalMaterialCost ?? 0) },
        { label: 'WOs with Materials', value: String(data.summary?.workOrdersWithMaterials ?? 0) },
        { label: 'Avg Cost / WO', value: formatCurrency(data.summary?.avgCostPerWo ?? 0) },
        { label: 'Return Rate', value: formatPercent(data.sparePartReturns?.returnRate ?? 0) },
      ];
    case 'downtime':
      return [
        { label: 'Downtime Events', value: String(data.summary?.totalEvents ?? 0) },
        { label: 'Total Downtime', value: formatHours(data.summary?.totalDowntimeHours ?? 0) },
        { label: 'Avg Duration', value: formatHours(data.summary?.avgDurationHours ?? 0) },
        { label: 'Production Loss', value: formatCurrency(data.summary?.totalProductionLoss ?? 0) },
      ];
    case 'tools':
      return [
        { label: 'Damage Reports', value: String(data.summary?.totalDamageReports ?? 0) },
        { label: 'Repair Cost', value: formatCurrency(data.summary?.totalRepairCost ?? 0) },
        { label: 'Repaired', value: String(data.summary?.repaired ?? 0) },
        { label: 'Written Off', value: String(data.summary?.writtenOff ?? 0) },
      ];
  }
}

function buildTable(type: ReportType, data: any): { columns: TableColumn[]; rows: TableRowData[] } {
  if (!data) return { columns: [], rows: [] };
  switch (type) {
    case 'lifecycle':
      return {
        columns: [
          { key: 'mrNumber', label: 'MR Number' },
          { key: 'title', label: 'Title' },
          { key: 'priority', label: 'Priority' },
          { key: 'mrStatus', label: 'MR Status' },
          { key: 'woNumber', label: 'WO Number' },
          { key: 'woStatus', label: 'WO Status' },
          { key: 'turnaround', label: 'Turnaround' },
        ],
        rows: (data.entries || []).map((entry: any) => ({
          mrNumber: entry.mrNumber || '—',
          title: entry.mrTitle || '—',
          priority: humanize(entry.priority || 'unknown'),
          mrStatus: humanize(entry.status || 'unknown'),
          woNumber: entry.woNumber || '—',
          woStatus: entry.woStatus ? humanize(entry.woStatus) : '—',
          turnaround: entry.totalTurnaroundHours == null ? 'Open' : formatHours(entry.totalTurnaroundHours),
        })),
      };
    case 'execution':
      return {
        columns: [
          { key: 'technician', label: 'Technician' },
          { key: 'assigned', label: 'Assigned WOs' },
          { key: 'closed', label: 'Closed' },
          { key: 'completion', label: 'Closure Rate' },
          { key: 'avgHours', label: 'Avg Actual Hours' },
          { key: 'rework', label: 'Rework' },
        ],
        rows: (data.teamMetrics || []).map((metric: any) => ({
          technician: metric.fullName || 'Unassigned',
          assigned: metric.total ?? 0,
          closed: metric.closed ?? 0,
          completion: formatPercent((metric.total || 0) > 0 ? ((metric.closed || 0) / metric.total) * 100 : 0),
          avgHours: formatHours(metric.avgActualHours),
          rework: metric.rework ?? 0,
        })),
      };
    case 'technician_performance':
      return {
        columns: [
          { key: 'technician', label: 'Technician' },
          { key: 'department', label: 'Department' },
          { key: 'trade', label: 'Trade' },
          { key: 'workOrders', label: 'WOs' },
          { key: 'completion', label: 'Completion' },
          { key: 'avgHours', label: 'Avg Hours / WO' },
          { key: 'timeAccuracy', label: 'Time Accuracy' },
          { key: 'rework', label: 'Rework Rate' },
        ],
        rows: (data.technicians || []).map((tech: any) => ({
          technician: tech.user?.fullName || tech.fullName || '—',
          department: tech.user?.department || '—',
          trade: tech.user?.primaryTrade || '—',
          workOrders: tech.woCount ?? 0,
          completion: formatPercent(tech.completionRate),
          avgHours: formatHours(tech.avgTimePerWo),
          timeAccuracy: formatPercent(tech.timeAccuracy),
          rework: formatPercent(tech.reworkRate),
        })),
      };
    case 'materials':
      return {
        columns: [
          { key: 'woNumber', label: 'WO Number' },
          { key: 'title', label: 'Title' },
          { key: 'materials', label: 'Materials' },
          { key: 'issued', label: 'Issued' },
          { key: 'returned', label: 'Returned' },
          { key: 'cost', label: 'Material Cost' },
        ],
        rows: (data.costByWorkOrder || []).map((row: any) => ({
          woNumber: row.woNumber || '—',
          title: row.title || '—',
          materials: row.materialCount ?? 0,
          issued: row.issuedCount ?? 0,
          returned: row.returnedCount ?? 0,
          cost: formatCurrency(row.totalMaterialCost ?? 0),
        })),
      };
    case 'downtime':
      return {
        columns: [
          { key: 'asset', label: 'Asset' },
          { key: 'incidents', label: 'Incidents' },
          { key: 'downtime', label: 'Downtime' },
          { key: 'productionLoss', label: 'Production Loss' },
        ],
        rows: (data.byAsset || []).map((row: any) => ({
          asset: row.assetName || 'Unknown',
          incidents: row.count ?? 0,
          downtime: formatHours(row.totalHours),
          productionLoss: formatCurrency(row.totalLoss ?? 0),
        })),
      };
    case 'tools':
      return {
        columns: [
          { key: 'tool', label: 'Tool' },
          { key: 'code', label: 'Tool Code' },
          { key: 'category', label: 'Category' },
          { key: 'damageCount', label: 'Damage Count' },
          { key: 'repairCost', label: 'Repair Cost' },
        ],
        rows: (data.mostDamagedTools || []).map((row: any) => ({
          tool: row.toolName || '—',
          code: row.toolCode || '—',
          category: row.category || '—',
          damageCount: row.damageCount ?? 0,
          repairCost: formatCurrency(row.totalCost ?? 0),
        })),
      };
  }
}

function buildPrimaryChart(type: ReportType, data: any) {
  if (!data) return [];
  switch (type) {
    case 'lifecycle':
      return Object.entries(data.avgStageDurations || {}).map(([name, value]) => ({ name: humanize(name), value: Math.round(Number(value || 0) * 100) / 100 }));
    case 'execution':
      return (data.byType || []).map((row: any) => ({ name: humanize(row.type || 'unknown'), value: row.count ?? 0, secondary: row.closed ?? 0 }));
    case 'technician_performance':
      return (data.technicians || []).slice(0, 10).map((row: any) => ({ name: row.user?.fullName || row.fullName || 'Unknown', value: row.completionRate ?? 0, secondary: row.reworkRate ?? 0 }));
    case 'materials':
      return (data.costByWorkOrder || []).slice(0, 10).map((row: any) => ({ name: row.woNumber || 'WO', value: row.totalMaterialCost ?? 0 }));
    case 'downtime':
      return (data.byAsset || []).slice(0, 10).map((row: any) => ({ name: row.assetName || 'Unknown', value: row.totalHours ?? 0, secondary: row.count ?? 0 }));
    case 'tools':
      return (data.mostDamagedTools || []).slice(0, 10).map((row: any) => ({ name: row.toolName || row.toolCode || 'Tool', value: row.damageCount ?? 0, secondary: row.totalCost ?? 0 }));
  }
}

function buildSecondaryChart(type: ReportType, data: any) {
  if (!data) return [];
  const fromObject = (obj: Record<string, any>) => Object.entries(obj || {}).map(([name, value]) => ({
    name: humanize(name),
    value: typeof value === 'number' ? value : Number(value?.count ?? value?.total ?? 0),
  }));

  switch (type) {
    case 'lifecycle': {
      const counts: Record<string, number> = {};
      for (const entry of data.entries || []) counts[entry.status || 'unknown'] = (counts[entry.status || 'unknown'] || 0) + 1;
      return fromObject(counts);
    }
    case 'execution':
      return (data.byPriority || []).map((row: any) => ({ name: humanize(row.priority || 'unknown'), value: row.total ?? 0 }));
    case 'technician_performance':
      return [];
    case 'materials': {
      const returns = data.sparePartReturns || {};
      const other = Math.max(0, Number(returns.total || 0) - Number(returns.returnedToStore || 0) - Number(returns.disposed || 0));
      return [
        { name: 'Returned to Store', value: Number(returns.returnedToStore || 0) },
        { name: 'Disposed', value: Number(returns.disposed || 0) },
        { name: 'Other / In Progress', value: other },
      ].filter((row) => row.value > 0);
    }
    case 'downtime':
      return fromObject(data.byCategory || {});
    case 'tools':
      return fromObject(data.bySeverity || {});
  }
}

function chartTitle(type: ReportType) {
  return {
    lifecycle: 'Average Stage Duration (hours)',
    execution: 'Work Orders by Type',
    technician_performance: 'Top Technician Completion Rates',
    materials: 'Highest Material-Cost Work Orders',
    downtime: 'Assets with Highest Downtime',
    tools: 'Most Frequently Damaged Tools',
  }[type];
}

function secondaryChartTitle(type: ReportType) {
  return {
    lifecycle: 'Maintenance Requests by Status',
    execution: 'Work Orders by Priority',
    technician_performance: '',
    materials: 'Spare Part Return Outcomes',
    downtime: 'Downtime by Category',
    tools: 'Damage by Severity',
  }[type];
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="border-border/60 shadow-sm">
      <CardContent className="p-4">
        <p className="text-2xl font-bold tracking-tight">{value}</p>
        <p className="text-xs text-muted-foreground mt-1">{label}</p>
      </CardContent>
    </Card>
  );
}

export function RepairReportsPage() {
  const repairsEnabled = useModuleEnabled(MODULE_CODES.REPAIRS);
  const { isAdmin } = useAuthStore();
  const canChoosePlant = isAdmin();

  const [reportType, setReportType] = useState<ReportType>('lifecycle');
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [priority, setPriority] = useState('all');
  const [department, setDepartment] = useState('');
  const [assignee, setAssignee] = useState('');
  const [plantId, setPlantId] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState('');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [reportData, setReportData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState<'pdf' | 'xlsx' | 'csv' | null>(null);

  const currentDefinition = REPORT_TYPES.find((item) => item.value === reportType)!;
  const supportsPriority = reportType === 'lifecycle' || reportType === 'execution';
  const supportsDepartment = reportType === 'technician_performance';
  const supportsAssignee = reportType === 'execution';

  const buildParams = useCallback((includeFormat?: string) => {
    const params = new URLSearchParams({ type: reportType });
    if (dateFrom) params.set('from', dateFrom);
    if (dateTo) params.set('to', dateTo);
    if (supportsPriority && priority !== 'all') params.set('priority', priority);
    if (supportsDepartment && department) params.set('department', department);
    if (supportsAssignee && assignee) params.set('assignee', assignee);
    if (canChoosePlant && plantId) params.set('plantId', plantId);
    if (includeFormat) params.set('format', includeFormat);
    return params;
  }, [assignee, canChoosePlant, dateFrom, dateTo, department, plantId, priority, reportType, supportsAssignee, supportsDepartment, supportsPriority]);

  const generateReport = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`/api/repairs/reports?${buildParams().toString()}`);
      if (res.success) {
        setReportData(res.data);
        setPage(1);
        setSearch('');
        setSortKey('');
      } else {
        setReportData(null);
        toast.error(res.error || 'Failed to generate report');
      }
    } finally {
      setLoading(false);
    }
  }, [buildParams]);

  const table = useMemo(() => buildTable(reportType, reportData), [reportData, reportType]);
  const summary = useMemo(() => buildSummary(reportType, reportData), [reportData, reportType]);
  const primaryChart = useMemo(() => buildPrimaryChart(reportType, reportData), [reportData, reportType]);
  const secondaryChart = useMemo(() => buildSecondaryChart(reportType, reportData), [reportData, reportType]);

  const filteredRows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const rows = needle
      ? table.rows.filter((row) => Object.values(row).some((value) => String(value).toLowerCase().includes(needle)))
      : table.rows;
    if (!sortKey) return rows;
    return [...rows].sort((a, b) => {
      const av = a[sortKey] ?? '';
      const bv = b[sortKey] ?? '';
      const aNum = typeof av === 'number' ? av : Number.NaN;
      const bNum = typeof bv === 'number' ? bv : Number.NaN;
      const cmp = !Number.isNaN(aNum) && !Number.isNaN(bNum)
        ? aNum - bNum
        : String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: 'base' });
      return sortDirection === 'asc' ? cmp : -cmp;
    });
  }, [search, sortDirection, sortKey, table.rows]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const visibleRows = filteredRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const toggleSort = (key: string) => {
    if (sortKey === key) setSortDirection((direction) => direction === 'asc' ? 'desc' : 'asc');
    else {
      setSortKey(key);
      setSortDirection('asc');
    }
    setPage(1);
  };

  const filenameBase = `repairs-${reportType}-${dateFrom || 'all'}-to-${dateTo || 'present'}`;

  const exportCsv = async () => {
    if (!table.columns.length) return;
    setExporting('csv');
    try {
      const header = table.columns.map((column) => csvCell(column.label)).join(',');
      const body = filteredRows.map((row) => table.columns.map((column) => csvCell(row[column.key] ?? '')).join(',')).join('\n');
      const blob = new Blob([`\uFEFF${header}\n${body}`], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${filenameBase}.csv`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success('CSV exported');
    } finally {
      setExporting(null);
    }
  };

  const exportXlsx = async () => {
    if (!table.columns.length) return;
    setExporting('xlsx');
    try {
      const XLSX = await import('xlsx');
      const dataRows = filteredRows.map((row) => Object.fromEntries(table.columns.map((column) => [column.label, row[column.key] ?? ''])));
      const summaryRows = summary.map((item) => ({ Metric: item.label, Value: item.value }));
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(summaryRows), 'Summary');
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(dataRows), 'Report Data');
      XLSX.writeFile(workbook, `${filenameBase}.xlsx`);
      toast.success('Excel workbook exported');
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Excel export failed');
    } finally {
      setExporting(null);
    }
  };

  const exportPdf = async () => {
    setExporting('pdf');
    try {
      const base = process.env.NEXT_PUBLIC_API_URL || '';
      const response = await fetch(`${base}/api/repairs/reports?${buildParams('pdf').toString()}`, {
        headers: getAuthHeaders(),
      });
      if (!response.ok) {
        let message = 'PDF export failed';
        try {
          const payload = await response.json();
          message = payload?.error || message;
        } catch {
          // Keep the generic error when the server did not return JSON.
        }
        throw new Error(message);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${filenameBase}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success('PDF exported');
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'PDF export failed');
    } finally {
      setExporting(null);
    }
  };

  if (!repairsEnabled) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <p className="text-muted-foreground">Repairs module is not active.</p>
          <p className="text-sm text-muted-foreground mt-1">Enable it in Settings → Modules.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-content space-y-6">
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-emerald-100 dark:bg-emerald-900/30 rounded-xl">
            <BarChart3 className="h-6 w-6 text-emerald-700 dark:text-emerald-400" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-2xl font-bold tracking-tight">Repairs Reports & Analytics</h2>
              <Badge variant="outline" className="text-[10px]">Plant scoped</Badge>
            </div>
            <p className="text-sm text-muted-foreground">Tabular and graphical maintenance intelligence with PDF, Excel and CSV exports</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={generateReport} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1.5" />}
            Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={exportPdf} disabled={!reportData || exporting !== null}>
            {exporting === 'pdf' ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <FileDown className="h-4 w-4 mr-1.5" />} PDF
          </Button>
          <Button variant="outline" size="sm" onClick={exportXlsx} disabled={!reportData || exporting !== null}>
            {exporting === 'xlsx' ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <FileSpreadsheet className="h-4 w-4 mr-1.5" />} Excel
          </Button>
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!reportData || exporting !== null}>
            {exporting === 'csv' ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Download className="h-4 w-4 mr-1.5" />} CSV
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        {REPORT_TYPES.map((definition) => {
          const Icon = definition.icon;
          const selected = reportType === definition.value;
          return (
            <button
              key={definition.value}
              type="button"
              onClick={() => {
                setReportType(definition.value);
                setReportData(null);
                setPage(1);
                setSearch('');
                setSortKey('');
              }}
              className={`rounded-xl border p-3 text-left transition-all ${selected ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30 ring-1 ring-emerald-300' : 'border-border/60 hover:border-emerald-300 hover:bg-muted/30'}`}
            >
              <div className="flex items-center gap-2 mb-1">
                <Icon className={`h-4 w-4 ${selected ? 'text-emerald-600' : 'text-muted-foreground'}`} />
                <span className="text-sm font-semibold">{definition.label}</span>
              </div>
              <p className="text-[11px] leading-4 text-muted-foreground">{definition.description}</p>
            </button>
          );
        })}
      </div>

      <Card className="border-border/60 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><Filter className="h-4 w-4" /> Report Filters</CardTitle>
          <CardDescription>Filters are applied server-side and remain inside the authenticated plant scope.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3 items-end">
            <div className="xl:col-span-2">
              <DateRangePicker label="Date Range" from={dateFrom || undefined} to={dateTo || undefined} onChange={(from, to) => { setDateFrom(from || ''); setDateTo(to || ''); }} />
            </div>
            {supportsPriority && (
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger><SelectValue placeholder="Priority" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All priorities</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
            )}
            {supportsDepartment && (
              <AsyncSearchableSelect
                value={department}
                onValueChange={setDepartment}
                placeholder="All departments"
                searchPlaceholder="Search departments..."
                fetchOptions={async () => {
                  const res = await api.get('/api/departments?limit=200');
                  if (!res.success || !Array.isArray(res.data)) return [];
                  return res.data.map((item: any) => ({ value: item.id, label: item.name || item.code || item.id }));
                }}
              />
            )}
            {supportsAssignee && (
              <AsyncSearchableSelect
                value={assignee}
                onValueChange={setAssignee}
                placeholder="All technicians"
                searchPlaceholder="Search technicians..."
                fetchOptions={async () => {
                  const res = await api.get('/api/workers?role=technician&limit=500');
                  if (!res.success || !Array.isArray(res.data)) return [];
                  return res.data.map((item: any) => ({ value: item.id, label: item.fullName || item.username || item.id }));
                }}
              />
            )}
            {canChoosePlant && (
              <AsyncSearchableSelect
                value={plantId}
                onValueChange={setPlantId}
                placeholder="All accessible plants"
                searchPlaceholder="Search plants..."
                fetchOptions={async () => {
                  const res = await api.get('/api/plants?limit=200');
                  if (!res.success || !Array.isArray(res.data)) return [];
                  return res.data.map((item: any) => ({ value: item.id, label: item.name || item.code || item.id }));
                }}
              />
            )}
            <Button onClick={generateReport} disabled={loading} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              {loading ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <BarChart3 className="h-4 w-4 mr-1.5" />}
              Generate
            </Button>
          </div>
        </CardContent>
      </Card>

      {loading && <LoadingSkeleton />}

      {!loading && !reportData && (
        <Card>
          <CardContent className="py-16">
            <EmptyState icon={BarChart3} title="Generate a Repairs report" description={`Choose filters for ${currentDefinition.label} and select Generate.`} />
          </CardContent>
        </Card>
      )}

      {!loading && reportData && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {summary.map((item) => <StatCard key={item.label} label={item.label} value={item.value} />)}
          </div>

          <div className={`grid grid-cols-1 ${secondaryChart.length > 0 ? 'xl:grid-cols-2' : ''} gap-6`}>
            <Card className="border-border/60 shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">{chartTitle(reportType)}</CardTitle>
                <CardDescription>Graphical view of the selected report scope</CardDescription>
              </CardHeader>
              <CardContent>
                {primaryChart.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={primaryChart} margin={{ top: 10, right: 12, left: 0, bottom: 30 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-20} textAnchor="end" interval={0} height={60} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <RechartsTooltip />
                      <Legend />
                      <Bar dataKey="value" name={reportType === 'materials' || reportType === 'tools' ? 'Primary metric' : 'Value'} fill="#059669" radius={[4, 4, 0, 0]} />
                      {primaryChart.some((row: any) => row.secondary != null) && <Bar dataKey="secondary" name="Secondary" fill="#0ea5e9" radius={[4, 4, 0, 0]} />}
                    </BarChart>
                  </ResponsiveContainer>
                ) : <EmptyState icon={BarChart3} title="No chart data" />}
              </CardContent>
            </Card>

            {secondaryChart.length > 0 && (
              <Card className="border-border/60 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base">{secondaryChartTitle(reportType)}</CardTitle>
                  <CardDescription>Distribution within the same filtered report</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie data={secondaryChart} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100}>
                        {secondaryChart.map((_: any, index: number) => <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />)}
                      </Pie>
                      <RechartsTooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}
          </div>

          <Card className="border-border/60 shadow-sm overflow-hidden">
            <CardHeader className="pb-3">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-base">Tabular Report</CardTitle>
                  <CardDescription>{filteredRows.length} row{filteredRows.length === 1 ? '' : 's'} in the current view</CardDescription>
                </div>
                <div className="relative w-full lg:w-80">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Filter the table..." className="pl-9" />
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {table.columns.length === 0 || filteredRows.length === 0 ? (
                <div className="p-8"><EmptyState icon={ClipboardList} title="No tabular data" description="No rows match the selected filters." /></div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          {table.columns.map((column) => (
                            <TableHead key={column.key} className="whitespace-nowrap">
                              <button type="button" onClick={() => toggleSort(column.key)} className="inline-flex items-center gap-1 font-medium hover:text-foreground">
                                {column.label}<ArrowUpDown className="h-3 w-3" />
                              </button>
                            </TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {visibleRows.map((row, index) => (
                          <TableRow key={`${page}-${index}`}>
                            {table.columns.map((column) => <TableCell key={column.key} className="whitespace-nowrap max-w-[320px] truncate">{String(row[column.key] ?? '—')}</TableCell>)}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t px-4 py-3">
                    <p className="text-xs text-muted-foreground">Page {page} of {totalPages} · {filteredRows.length} rows</p>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</Button>
                      <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>Next</Button>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="border-emerald-200 bg-emerald-50/60 dark:bg-emerald-950/20 dark:border-emerald-900/60">
            <CardContent className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-emerald-600 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold">Exports use the generated report scope</p>
                  <p className="text-xs text-muted-foreground">CSV and Excel also respect the table search/sort. PDF is generated by the protected Repairs reporting endpoint using the same server filters and plant scope.</p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground"><Clock className="h-4 w-4" /> Last generated in this session</div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

export default RepairReportsPage;
