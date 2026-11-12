'use client';

import React, { useState, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/authStore';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DateRangePicker } from '@/components/ui/datetime-picker';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, PieChart, Pie, Cell,
  LineChart, Line, AreaChart, Area, ResponsiveContainer, Tooltip, Legend,
  ComposedChart,
} from 'recharts';
import {
  Activity, AlertTriangle, Clock, Wrench, Package, Timer, TrendingDown,
  FileBarChart, Download, RefreshCw, BarChart3, DollarSign, Zap,
  ShieldAlert, Factory, HardHat, Users, Boxes, Loader2, FileDown,
  Hammer, CircleStop, Gauge, ChartPie, ArrowDownUp, Pause, Construction,
  ClipboardList, CalendarDays, Filter, Printer, Cpu,
} from 'lucide-react';
import { EmptyState, LoadingSkeleton, formatCurrency, formatDuration } from '@/components/shared/helpers';
import { useModuleEnabled, MODULE_CODES } from '@/hooks/useModuleEnabled';

// ============================================================================
// CONSTANTS
// ============================================================================

const CHART_COLORS = ['#059669', '#0ea5e9', '#f59e0b', '#ef4444', '#8b5cf6', '#14b8a6', '#f97316', '#6366f1'];

const TRADE_COLORS: Record<string, string> = {
  mechanical: '#059669', electrical: '#0ea5e9', civil: '#f59e0b',
  facility: '#8b5cf6', workshop: '#f97316', other: '#6b7280', Unassigned: '#94a3b8',
};

const PRIORITY_COLORS: Record<string, string> = {
  low: '#94a3b8', medium: '#0ea5e9', high: '#f59e0b', critical: '#ef4444',
};

const SLA_TARGETS: Record<string, number> = {
  critical: 0.5,
  high: 1,
  medium: 4,
  low: 8,
};

// Safe trade name extraction — API may return Trade object {id, name, code} or string
function tradeName(trade: any): string {
  if (!trade) return 'Unassigned';
  if (typeof trade === 'string') return trade;
  if (typeof trade === 'object' && trade.name) return trade.name;
  return String(trade);
}

type ReportData = {
  summary: any;
  downtime: any;
  responseTime: any;
  breakdowns: any;
  manHours: any;
  materials: any;
  failureRate: any;
  stoppages: any;
  cost: any;
  distribution: any;
};

// ============================================================================
// HOOKS
// ============================================================================

const useDateRange = () => {
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().slice(0, 10);
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10));
  return { startDate, setStartDate, endDate, setEndDate };
};

// ============================================================================
// HELPERS
// ============================================================================

const exportCSV = (filename: string, headers: string[], rows: string[][]) => {
  const csv = [headers.join(','), ...rows.map(r => r.map(c => `"${(c ?? '').toString().replace(/"/g, '""')}"`).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `${filename}.csv`; a.click();
  URL.revokeObjectURL(url);
  toast.success(`Exported ${filename}.csv`);
};

function formatHours(h: number | null | undefined): string {
  if (h == null || isNaN(h)) return '—';
  return formatDuration(h);
}

function formatRate(r: number | null | undefined): string {
  if (r == null || isNaN(r)) return '-';
  return `${r.toFixed(1)}%`;
}

function getColorForKey(key: string, fallback: string): string {
  return TRADE_COLORS[key] || PRIORITY_COLORS[key] || fallback;
}

function getSeverityColor(value: number): string {
  if (value >= 40) return '#ef4444';
  if (value >= 20) return '#f59e0b';
  return '#059669';
}

function getSLAComplianceColor(rate: number): string {
  if (rate >= 90) return '#059669';
  if (rate >= 70) return '#f59e0b';
  return '#ef4444';
}

function formatTimestamp(): string {
  return new Date().toLocaleString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function KPICard({ label, value, icon: Icon, color, subtitle, onClick }: {
  label: string; value: string | number; icon: React.ElementType; color: string; subtitle?: string; onClick?: () => void;
}) {
  return (
    <Card
      className={`${color ? '' : ''}border border-border/60 shadow-sm cursor-pointer transition-all hover:shadow-md hover:scale-[1.02] active:scale-[0.98]`}
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className={`h-10 w-10 rounded-xl ${color} flex items-center justify-center shrink-0`}>
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xl font-bold truncate leading-tight">{value}</p>
            <p className="text-[11px] text-muted-foreground truncate">{label}</p>
            {subtitle && <p className="text-[10px] text-muted-foreground/70 truncate">{subtitle}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ReportHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-6 print-mb-2">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <FileBarChart className="h-6 w-6 text-emerald-600" />
            {title}
          </h1>
          <p className="text-muted-foreground mt-1">{subtitle}</p>
        </div>
        <div className="text-xs text-muted-foreground text-right print-hidden">
          <p className="flex items-center gap-1 justify-end">
            <CalendarDays className="h-3 w-3" />
            Report generated: {formatTimestamp()}
          </p>
        </div>
      </div>
    </div>
  );
}

function TabSectionHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mb-4">
      <h3 className="text-base font-semibold">{title}</h3>
      {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
    </div>
  );
}

function SummaryFooter({ notes }: { notes: string[] }) {
  return (
    <Card className="border border-dashed border-muted-foreground/30 bg-muted/20 mt-6">
      <CardContent className="p-4">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Key Takeaways</p>
        <ul className="space-y-1">
          {notes.map((note, i) => (
            <li key={i} className="text-xs text-muted-foreground flex items-start gap-2">
              <span className="w-1 h-1 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
              {note}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function ChartCard({ title, children, className = '' }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <Card className={`border border-border/60 shadow-sm ${className}`}>
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="text-sm font-semibold">{title}</CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        {children}
      </CardContent>
    </Card>
  );
}

function SafeChart({ data, children, emptyIcon: EmptyIcon, emptyTitle, emptyDescription, height = 280 }: {
  data: any[]; children: React.ReactNode; emptyIcon: React.ElementType;
  emptyTitle: string; emptyDescription: string; height?: number;
}) {
  if (!data || data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-8">
        <EmptyIcon className="h-8 w-8 text-muted-foreground/40 mb-2" />
        <p className="text-sm font-medium text-muted-foreground">{emptyTitle}</p>
        <p className="text-xs text-muted-foreground/70 mt-1">{emptyDescription}</p>
      </div>
    );
  }
  return <div style={{ height }}>{children}</div>;
}

function ReportTable({ headers, rows, totalRow, maxHeight = 400 }: {
  headers: { key: string; label: string; align?: string; className?: string }[];
  rows: Record<string, React.ReactNode>[];
  totalRow?: Record<string, React.ReactNode>;
  maxHeight?: number;
}) {
  const scrollStyle = maxHeight ? `max-h-[${maxHeight}px] overflow-y-auto` : '';
  return (
    <Card className="border border-border/60 shadow-sm">
      <CardContent className="p-0">
        <div className={`overflow-x-auto ${maxHeight ? 'max-h-96 overflow-y-auto' : ''}`}>
          <Table>
            <TableHeader className="sticky top-0 bg-background z-10">
              <TableRow>
                {headers.map((h) => (
                  <TableHead key={h.key} className={`text-xs font-semibold uppercase tracking-wider ${h.align === 'right' ? 'text-right' : ''} ${h.className || ''}`}>
                    {h.label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={headers.length} className="text-center py-8">
                    <p className="text-sm text-muted-foreground">No data available</p>
                  </TableCell>
                </TableRow>
              ) : (
                <>
                  {rows.map((row, idx) => (
                    <TableRow key={idx} className="even:bg-muted/20 hover:bg-muted/40 transition-colors">
                      {headers.map((h) => (
                        <TableCell key={h.key} className={`text-sm ${h.align === 'right' ? 'text-right' : ''} ${h.className || ''}`}>
                          {row[h.key] ?? '-'}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                  {totalRow && (
                    <TableRow className="bg-muted/60 font-semibold border-t-2 border-border">
                      {headers.map((h) => (
                        <TableCell key={h.key} className={`text-sm ${h.align === 'right' ? 'text-right' : ''} ${h.className || ''}`}>
                          {totalRow[h.key] ?? ''}
                        </TableCell>
                      ))}
                    </TableRow>
                  )}
                </>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function WOReportsPage() {
  const { startDate, setStartDate, endDate, setEndDate } = useDateRange();
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [pdfLoading, setPdfLoading] = useState(false);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);

  // Module visibility
  const woEnabled = useModuleEnabled(MODULE_CODES.WORK_ORDERS);
  const repairsEnabled = useModuleEnabled(MODULE_CODES.REPAIRS);
  const pmEnabled = useModuleEnabled(MODULE_CODES.PM_SCHEDULES);
  const invEnabled = useModuleEnabled(MODULE_CODES.INVENTORY);
  const dtEnabled = useModuleEnabled(MODULE_CODES.DOWNTIME);

  // Filters
  const [tradeFilter, setTradeFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [moduleFilter, setModuleFilter] = useState<'all' | 'repairs' | 'pm'>('all');

  // Fetch report data
  const fetchReport = useCallback(() => {
    // Don't fetch if the selected module filter's module is disabled
    if (moduleFilter === 'repairs' && !repairsEnabled) return;
    if (moduleFilter === 'pm' && !pmEnabled) return;
    setLoading(true);
    api
      .get<ReportData>(
        `/api/work-orders/reports?from=${startDate}&to=${endDate}&trade=${tradeFilter || ''}&priority=${priorityFilter || ''}&department=${deptFilter || ''}&moduleFilter=${moduleFilter}`,
        { timeout: 60_000 }
      )
      .then((res) => {
        if (res.success && res.data) {
          setReportData(res.data);
          setGeneratedAt(formatTimestamp());
        } else {
          setReportData(null);
        }
        setLoading(false);
      })
      .catch(() => {
        setReportData(null);
        setLoading(false);
        toast.error('Failed to load report data');
      });
  }, [startDate, endDate, tradeFilter, priorityFilter, deptFilter, moduleFilter, repairsEnabled, pmEnabled]);

  // Auto-fetch on mount
  React.useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const s = reportData?.summary;

  // ============================================================================
  // CSV EXPORT (Enhanced per tab)
  // ============================================================================

  const handleExportCSV = useCallback(() => {
    if (!reportData) return;
    const tab = activeTab;
    let filename = `wo-report-${startDate}-to-${endDate}`;
    let headers: string[] = [];
    let rows: string[][] = [];

    switch (tab) {
      case 'overview': {
        filename += '-overview';
        headers = ['Category', 'Sub-Category', 'Count', 'Percentage'];
        const total = s?.totalWOs || 1;
        (reportData.distribution?.byType || []).forEach((d: any) => rows.push(['Type', d.type, String(d.count), `${((d.count/total)*100).toFixed(1)}%`]));
        (reportData.distribution?.byStatus || []).forEach((d: any) => rows.push(['Status', d.status, String(d.count), `${((d.count/total)*100).toFixed(1)}%`]));
        (reportData.distribution?.byTrade || []).forEach((d: any) => rows.push(['Trade', tradeName(d.trade), String(d.count), `${((d.count/total)*100).toFixed(1)}%`]));
        (reportData.distribution?.byPriority || []).forEach((d: any) => rows.push(['Priority', d.priority, String(d.count), `${((d.count/total)*100).toFixed(1)}%`]));
        break;
      }
      case 'downtime': {
        filename += '-downtime';
        const dtData = reportData.downtime?.byTrade || [];
        const totalHrs = dtData.reduce((a: number, b: any) => a + b.totalHours, 0);
        const totalEvts = dtData.reduce((a: number, b: any) => a + b.events, 0);
        headers = ['Trade', 'Events', 'Hours', 'Avg Hours/Event', '% of Total', 'Production Loss'];
        rows = dtData.map((d: any) => [
          tradeName(d.trade), String(d.events), String(d.totalHours),
          d.events > 0 ? (d.totalHours / d.events).toFixed(1) : '0',
          totalHrs > 0 ? `${((d.totalHours / totalHrs) * 100).toFixed(1)}%` : '0%',
          String(d.productionLoss || 0),
        ]);
        rows.push(['TOTAL', String(totalEvts), String(totalHrs), '-', '100%', String(dtData.reduce((a: number, b: any) => a + (b.productionLoss || 0), 0))]);
        break;
      }
      case 'response-time': {
        filename += '-response-time';
        headers = ['Group', 'Type', 'Count', 'Avg Hours', 'Min Hours', 'Max Hours', 'SLA Target (h)', 'SLA Compliance'];
        (reportData.responseTime?.byPriority || []).forEach((d: any) => {
          const target = SLA_TARGETS[d.priority] || 8;
          const compliance = d.avgHours <= target ? 100 : Math.round((target / d.avgHours) * 100);
          rows.push([d.priority, 'Priority', String(d.count), String(d.avgHours), String(d.minHours), String(d.maxHours), String(target), `${compliance}%`]);
        });
        (reportData.responseTime?.byTrade || []).forEach((d: any) =>
          rows.push([tradeName(d.trade), 'Trade', String(d.count), String(d.avgHours), '-', '-', '-', '-'])
        );
        break;
      }
      case 'breakdowns': {
        filename += '-breakdowns';
        const bdTotal = reportData.breakdowns?.total || 1;
        headers = ['Group', 'Type', 'Count', '% of Total'];
        (reportData.breakdowns?.byTrade || []).forEach((d: any) => rows.push([tradeName(d.trade), 'Trade', String(d.count), `${((d.count/bdTotal)*100).toFixed(1)}%`]));
        (reportData.breakdowns?.byType || []).forEach((d: any) => rows.push([d.type, 'Type', String(d.count), `${((d.count/bdTotal)*100).toFixed(1)}%`]));
        (reportData.breakdowns?.byPriority || []).forEach((d: any) => rows.push([d.priority, 'Priority', String(d.count), `${((d.count/bdTotal)*100).toFixed(1)}%`]));
        break;
      }
      case 'man-hours': {
        filename += '-man-hours';
        const mhTotal = reportData.manHours?.grandTotal || 1;
        const techs = reportData.manHours?.byTechnician || [];
        headers = ['Technician', 'Total Hours', 'WO Count', 'Avg Hrs/WO', '% of Grand Total'];
        rows = techs.map((d: any) => [
          d.name, String(d.totalHours), String(d.woCount),
          String(d.avgHoursPerWO), `${((d.totalHours / mhTotal) * 100).toFixed(1)}%`,
        ]);
        rows.push(['TOTAL', String(reportData.manHours?.grandTotal || 0), '-', '-', '100%']);
        break;
      }
      case 'materials': {
        filename += '-materials';
        const matTotal = reportData.materials?.totalCost || 1;
        const items = reportData.materials?.topItems || [];
        headers = ['Item Name', 'Part #', 'Supplier', 'Unit', 'Total Qty', 'Unit Cost', 'Total Cost', 'WOs Used', '% of Total Cost'];
        rows = items.map((d: any) => [
          d.name, d.inventoryItem?.itemCode || '', d.inventoryItem?.supplier || '', d.inventoryItem?.unitOfMeasure || '',
          String(d.totalQty), String(d.unitCost || ''), String(d.totalCost),
          String(d.woCount), `${((d.totalCost / matTotal) * 100).toFixed(1)}%`,
        ]);
        rows.push(['TOTAL', '', '', '', String(reportData.materials?.totalQty || 0), '', String(reportData.materials?.totalCost || 0), '-', '100%']);
        break;
      }
      case 'failure-rate': {
        filename += '-failure-rate';
        headers = ['Equipment', 'Tag', 'Manufacturer', 'Model', 'Category', 'Criticality', 'Location', 'Total WOs', 'Failures', 'Failure Rate', 'MTBF (Days)', 'Risk Level'];
        const assets = reportData.failureRate?.byAsset || [];
        rows = assets.map((d: any) => {
          const mtbf = reportData.failureRate?.mtbf?.find((m: any) => m.assetId === d.assetId);
          const a = d.asset || {};
          const risk = d.failureRate >= 40 ? 'High' : d.failureRate >= 20 ? 'Medium' : 'Low';
          return [d.assetName || d.assetId, a.assetTag || '', a.manufacturer || '', a.model || '', typeof a.category === 'string' ? a.category : a.category?.name || '', a.criticality || '',
            [a.building, a.floor, a.area].filter(Boolean).join('/') || a.location || '',
            String(d.totalWOs), String(d.failures), `${d.failureRate}%`, String(mtbf?.mtbfDays || '-'), risk];
        });
        break;
      }
      case 'stoppages': {
        filename += '-stoppages';
        const spData = reportData.stoppages?.byTrade || [];
        const totalSp = spData.reduce((a: number, b: any) => a + b.count, 0);
        const totalSpHrs = spData.reduce((a: number, b: any) => a + b.totalHours, 0);
        headers = ['Trade', 'Stoppage Count', 'Total Hours', 'Avg Hours', '% of Total'];
        rows = spData.map((d: any) => [
          tradeName(d.trade), String(d.count), String(d.totalHours),
          d.count > 0 ? (d.totalHours / d.count).toFixed(1) : '0',
          totalSp > 0 ? `${((d.count / totalSp) * 100).toFixed(1)}%` : '0%',
        ]);
        rows.push(['TOTAL', String(totalSp), String(totalSpHrs), '-', '100%']);
        break;
      }
      default: {
        headers = ['Metric', 'Value'];
        rows = [
          ['Total WOs', String(s?.totalWOs ?? 0)],
          ['Completed', String(s?.completedWOs ?? 0)],
          ['Completion Rate', String(s?.completionRate ?? 0)],
        ];
      }
    }

    exportCSV(filename, headers, rows);
  }, [reportData, activeTab, startDate, endDate, s]);

  // ============================================================================
  // PDF EXPORT
  // ============================================================================

  const downloadPDF = useCallback(async () => {
    try {
      setPdfLoading(true);
      const params = new URLSearchParams();
      if (startDate) params.set('from', startDate);
      if (endDate) params.set('to', endDate);
      if (tradeFilter) params.set('trade', tradeFilter);
      if (priorityFilter) params.set('priority', priorityFilter);
      if (deptFilter) params.set('department', deptFilter);
      if (moduleFilter && moduleFilter !== 'all') params.set('moduleFilter', moduleFilter);
      params.set('format', 'pdf');

      const response = await api.getRaw(`/api/work-orders/reports?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to generate PDF');

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `work-order-report-${new Date().toISOString().slice(0, 10)}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('PDF report downloaded');
    } catch {
      toast.error('Failed to download PDF report');
    } finally {
      setPdfLoading(false);
    }
  }, [startDate, endDate, tradeFilter, priorityFilter, deptFilter, moduleFilter]);

  // ============================================================================
  // COMPUTED DATA
  // ============================================================================

  const kpiCards = useMemo(() => {
    if (!s) return [];
    return [
      { label: 'Total Work Orders', value: s.totalWOs ?? 0, icon: ClipboardList, color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 dark:text-emerald-400', tab: 'overview' as string | undefined },
      { label: 'Completion Rate', value: `${s.completionRate ?? 0}%`, icon: Activity, color: 'text-sky-600 bg-sky-50 dark:bg-sky-900/30 dark:text-sky-400', tab: 'overview' as string | undefined },
      { label: 'Breakdown Rate', value: `${s.breakdownRate ?? 0}%`, icon: AlertTriangle, color: 'text-red-600 bg-red-50 dark:bg-red-900/30 dark:text-red-400', tab: 'breakdowns' as string | undefined },
      { label: 'Avg Response', value: formatHours(s.avgResponseTime), icon: Clock, color: 'text-amber-600 bg-amber-50 dark:bg-amber-900/30 dark:text-amber-400', tab: 'response-time' as string | undefined },
      { label: 'Total Man Hours', value: formatHours(s.totalManHours), icon: HardHat, color: 'text-violet-600 bg-violet-50 dark:bg-violet-900/30 dark:text-violet-400', tab: 'man-hours' as string | undefined },
      { label: 'Material Cost', value: formatCurrency(s.totalMaterialCost), icon: Package, color: 'text-teal-600 bg-teal-50 dark:bg-teal-900/30 dark:text-teal-400', tab: 'materials' as string | undefined },
      { label: 'Total Downtime', value: formatHours(s.totalDowntimeHours), icon: CircleStop, color: 'text-orange-600 bg-orange-50 dark:bg-orange-900/30 dark:text-orange-400', tab: 'downtime' as string | undefined },
      { label: 'Rework Rate', value: formatRate(s.reworkRate), icon: TrendingDown, color: 'text-rose-600 bg-rose-50 dark:bg-rose-900/30 dark:text-rose-400', tab: 'failure-rate' as string | undefined },
    ];
  }, [s]);

  // Downtime totals
  const downtimeTotals = useMemo(() => {
    const dt = reportData?.downtime?.byTrade || [];
    return {
      totalHours: dt.reduce((a: number, b: any) => a + (b.totalHours || 0), 0),
      totalEvents: dt.reduce((a: number, b: any) => a + (b.events || 0), 0),
      productionLoss: dt.reduce((a: number, b: any) => a + (b.productionLoss || 0), 0),
    };
  }, [reportData?.downtime?.byTrade]);

  // Breakdown summary
  const breakdownSummary = useMemo(() => {
    const bd = reportData?.breakdowns;
    const byMonth = bd?.byMonth || [];
    const topMonth = byMonth.length > 0 ? byMonth.reduce((a: any, b: any) => a.count > b.count ? a : b) : null;
    const byTrade = bd?.byTrade || [];
    const mostAffected = byTrade.length > 0 ? byTrade[0] : null;
    return { topMonth, mostAffected };
  }, [reportData?.breakdowns]);

  // Man hours summary
  const manHoursSummary = useMemo(() => {
    const mh = reportData?.manHours;
    const byTrade = mh?.byTrade || [];
    const mostActive = byTrade.length > 0 ? byTrade[0] : null;
    const byTech = mh?.byTechnician || [];
    const topTech = byTech.length > 0 ? byTech[0] : null;
    return { mostActive, topTech };
  }, [reportData?.manHours]);

  // Materials summary
  const materialsSummary = useMemo(() => {
    const mat = reportData?.materials;
    const topItem = mat?.topItems?.[0] || null;
    const avgCostPerWO = (s?.totalWOs || 0) > 0 ? (mat?.totalCost || 0) / (s?.totalWOs || 1) : 0;
    return { topItem, avgCostPerWO };
  }, [reportData?.materials, s?.totalWOs]);

  // Failure rate summary
  const failureSummary = useMemo(() => {
    const fr = reportData?.failureRate;
    const byAsset = fr?.byAsset || [];
    const highest = byAsset.length > 0 ? byAsset[0] : null;
    const mtbfData = fr?.mtbf || [];
    const avgMTBF = mtbfData.length > 0 ? mtbfData.reduce((a: number, b: any) => a + (b.mtbfDays || 0), 0) / mtbfData.length : 0;
    const avgRate = byAsset.length > 0 ? byAsset.reduce((a: number, b: any) => a + (b.failureRate || 0), 0) / byAsset.length : 0;
    return { highest, avgMTBF, avgRate };
  }, [reportData?.failureRate]);

  // Stoppages summary
  const stoppageSummary = useMemo(() => {
    const sp = reportData?.stoppages;
    const byTrade = sp?.byTrade || [];
    const mostTrade = byTrade.length > 0 ? byTrade.reduce((a: any, b: any) => a.count > b.count ? a : b) : null;
    const totalHrs = byTrade.reduce((a: number, b: any) => a + (b.totalHours || 0), 0);
    const total = sp?.total || 0;
    return { mostTrade, totalHrs, avgDuration: total > 0 ? totalHrs / total : 0 };
  }, [reportData?.stoppages]);

  // Filter distribution byType based on enabled modules
  const filteredByType = useMemo(() => {
    const data = reportData?.distribution?.byType || [];
    return data.filter((d: any) => {
      if (d.type === 'preventive') return pmEnabled;
      if (d.type === 'corrective' || d.type === 'emergency') return repairsEnabled;
      return true; // other types (predictive, inspection, project) always show
    });
  }, [reportData?.distribution?.byType, pmEnabled, repairsEnabled]);

  // Filter breakdowns byType based on enabled modules
  const filteredBreakdownByType = useMemo(() => {
    const data = reportData?.breakdowns?.byType || [];
    return data.filter((d: any) => {
      if (d.type === 'preventive') return pmEnabled;
      if (d.type === 'corrective' || d.type === 'emergency') return repairsEnabled;
      return true;
    });
  }, [reportData?.breakdowns?.byType, pmEnabled, repairsEnabled]);

  // Filter materials byType based on enabled modules
  const filteredMaterialsByType = useMemo(() => {
    const data = reportData?.materials?.byType || [];
    return data.filter((d: any) => {
      if (d.type === 'preventive') return pmEnabled;
      if (d.type === 'corrective' || d.type === 'emergency') return repairsEnabled;
      return true;
    });
  }, [reportData?.materials?.byType, pmEnabled, repairsEnabled]);

  // Filter failure rate byType based on enabled modules
  const filteredFailureByType = useMemo(() => {
    const data = reportData?.failureRate?.byType || [];
    return data.filter((d: any) => {
      if (d.type === 'preventive') return pmEnabled;
      if (d.type === 'corrective' || d.type === 'emergency') return repairsEnabled;
      return true;
    });
  }, [reportData?.failureRate?.byType, pmEnabled, repairsEnabled]);

  // Pareto data for breakdowns
  const breakdownParetoData = useMemo(() => {
    const byTrade = reportData?.breakdowns?.byTrade || [];
    if (byTrade.length === 0) return [];
    const total = byTrade.reduce((a: number, b: any) => a + b.count, 0);
    let cumulative = 0;
    return byTrade.map((d: any) => {
      cumulative += d.count;
      return { ...d, cumulative, cumulativePct: total > 0 ? Math.round((cumulative / total) * 100) : 0 };
    });
  }, [reportData?.breakdowns?.byTrade]);

  // Filter description
  const filterDescription = useMemo(() => {
    const parts: string[] = [];
    if (startDate && endDate) parts.push(`${startDate} to ${endDate}`);
    if (tradeFilter && tradeFilter !== 'all') parts.push(`Trade: ${tradeFilter}`);
    if (priorityFilter && priorityFilter !== 'all') parts.push(`Priority: ${priorityFilter}`);
    if (deptFilter) parts.push(`Dept: ${deptFilter}`);
    if (moduleFilter === 'repairs') parts.push('Module: Repairs');
    if (moduleFilter === 'pm') parts.push('Module: PM');
    return parts.join(' | ') || 'All data';
  }, [startDate, endDate, tradeFilter, priorityFilter, deptFilter, moduleFilter]);

  // ============================================================================
  // RENDER
  // ============================================================================

  if (loading && !reportData) {
    return (
      <div className="page-content">
        <LoadingSkeleton />
      </div>
    );
  }

  if (!repairsEnabled && !pmEnabled) {
    return (
      <div className="page-content flex items-center justify-center min-h-[50vh]">
        <div className="text-center space-y-3">
          <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mx-auto">
            <FileBarChart className="h-8 w-8 text-muted-foreground" />
          </div>
          <h2 className="text-lg font-semibold">Module Not Active</h2>
          <p className="text-sm text-muted-foreground max-w-md">
            Repairs and PM modules are not active. Enable at least one in Settings to view reports.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-content">
      {/* PRINT STYLES */}
      <style jsx global>{`
        @media print {
          .print-hidden { display: none !important; }
          .print-mb-2 { margin-bottom: 0.5rem !important; }
          body { background: white !important; }
          .page-content { padding: 0 !important; max-width: 100% !important; }
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .recharts-responsive-container { min-height: 200px !important; }
        }
      `}</style>

      {/* ================================================================ */}
      {/* HEADER                                                           */}
      {/* ================================================================ */}
      <ReportHeader
        title="Work Order Reports"
        subtitle="Comprehensive analytics on work orders, downtime, response time, materials, and costs"
      />

      {/* ================================================================ */}
      {/* FILTER CONTROLS                                                  */}
      {/* ================================================================ */}
      <Card className="border border-border/60 shadow-sm mb-6 print-hidden">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <p className="text-sm font-semibold">Filters</p>
            <Badge variant="outline" className="text-[10px] ml-auto">{filterDescription}</Badge>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4 items-end">
            <div className="sm:col-span-2">
              <Label className="text-xs text-muted-foreground mb-1 block">Date Range</Label>
              <DateRangePicker
                from={startDate || undefined}
                to={endDate || undefined}
                onChange={(f, t) => {
                  setStartDate(f || '');
                  setEndDate(t || '');
                }}
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Trade</Label>
              <Select value={tradeFilter} onValueChange={setTradeFilter}>
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="All Trades" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Trades</SelectItem>
                  <SelectItem value="mechanical">Mechanical</SelectItem>
                  <SelectItem value="electrical">Electrical</SelectItem>
                  <SelectItem value="civil">Civil</SelectItem>
                  <SelectItem value="facility">Facility</SelectItem>
                  <SelectItem value="workshop">Workshop</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Priority</Label>
              <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="All Priorities" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Priorities</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Department</Label>
              <Input
                placeholder="All Departments"
                value={deptFilter}
                onChange={(e) => setDeptFilter(e.target.value)}
                className="h-10"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Module</Label>
              <Select value={moduleFilter} onValueChange={(v: 'all' | 'repairs' | 'pm') => setModuleFilter(v)}>
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="repairs" disabled={!repairsEnabled}>Repairs Only</SelectItem>
                  <SelectItem value="pm" disabled={!pmEnabled}>PM Only</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-4 flex-wrap">
            <Button size="sm" onClick={fetchReport} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1.5" />}
              Generate Report
            </Button>
            <Separator orientation="vertical" className="h-6 mx-1" />
            <Button variant="outline" size="sm" onClick={handleExportCSV} disabled={!reportData || loading}>
              <Download className="h-4 w-4 mr-1.5" />
              Export CSV
            </Button>
            <Button variant="outline" size="sm" onClick={downloadPDF} disabled={pdfLoading}>
              {pdfLoading ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <FileDown className="h-4 w-4 mr-1.5" />}
              Download PDF
            </Button>
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="h-4 w-4 mr-1.5" />
              Print
            </Button>
            {generatedAt && (
              <span className="text-[10px] text-muted-foreground ml-auto flex items-center gap-1">
                <CalendarDays className="h-3 w-3" /> Generated: {generatedAt}
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ================================================================ */}
      {/* LOADING OVERLAY                                                  */}
      {/* ================================================================ */}
      {loading && reportData && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4 print-hidden">
          <Loader2 className="h-4 w-4 animate-spin" />
          Refreshing report data...
        </div>
      )}

      {!reportData && !loading && (
        <EmptyState
          icon={FileBarChart}
          title="No report data available"
          description="Click 'Generate Report' to load work order analytics for the selected date range."
        />
      )}

      {/* ================================================================ */}
      {/* REPORT CONTENT                                                   */}
      {/* ================================================================ */}
      {reportData && !loading && (
        <>
          {/* Global KPI Strip */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            {kpiCards.map((k) => (
              <KPICard key={k.label} label={k.label} value={k.value} icon={k.icon} color={k.color} onClick={k.tab ? () => setActiveTab(k.tab!) : undefined} />
            ))}
          </div>

          {/* Tabbed Content */}
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="flex-wrap h-auto gap-1 mb-6 print-hidden">
              <TabsTrigger value="overview" className="text-xs">
                <BarChart3 className="h-3.5 w-3.5 mr-1" />Overview
              </TabsTrigger>
              {dtEnabled && (
              <TabsTrigger value="downtime" className="text-xs">
                <CircleStop className="h-3.5 w-3.5 mr-1" />Downtime
                {repairsEnabled && <Badge variant="outline" className="text-[9px] px-1 py-0 ml-1 text-orange-600 border-orange-300">R</Badge>}
              </TabsTrigger>
              )}
              <TabsTrigger value="response-time" className="text-xs">
                <Timer className="h-3.5 w-3.5 mr-1" />Response Time
              </TabsTrigger>
              <TabsTrigger value="breakdowns" className="text-xs">
                <Zap className="h-3.5 w-3.5 mr-1" />Breakdowns
                {repairsEnabled && <Badge variant="outline" className="text-[9px] px-1 py-0 ml-1 text-orange-600 border-orange-300">R</Badge>}
              </TabsTrigger>
              <TabsTrigger value="man-hours" className="text-xs">
                <HardHat className="h-3.5 w-3.5 mr-1" />Man Hours
              </TabsTrigger>
              {invEnabled && (
              <TabsTrigger value="materials" className="text-xs">
                <Boxes className="h-3.5 w-3.5 mr-1" />Materials
                {repairsEnabled && <Badge variant="outline" className="text-[9px] px-1 py-0 ml-1 text-orange-600 border-orange-300">R</Badge>}
              </TabsTrigger>
              )}
              <TabsTrigger value="failure-rate" className="text-xs">
                <Gauge className="h-3.5 w-3.5 mr-1" />Failure Rate
              </TabsTrigger>
              <TabsTrigger value="components" className="text-xs">
                <Cpu className="h-3.5 w-3.5 mr-1" />Components
              </TabsTrigger>
              {dtEnabled && (
              <TabsTrigger value="stoppages" className="text-xs">
                <Pause className="h-3.5 w-3.5 mr-1" />Stoppages
                {repairsEnabled && <Badge variant="outline" className="text-[9px] px-1 py-0 ml-1 text-orange-600 border-orange-300">R</Badge>}
              </TabsTrigger>
              )}
            </TabsList>

            {/* ============================================================= */}
            {/* TAB 1: OVERVIEW DASHBOARD                                     */}
            {/* ============================================================= */}
            <TabsContent value="overview" className="space-y-6 mt-0">
              <TabSectionHeader title="Overview Dashboard" description="High-level work order performance metrics and distribution analysis" />

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* WO Distribution by Type (Donut) */}
                <ChartCard title="WO Distribution by Type">
                  <SafeChart
                    data={filteredByType}
                    emptyIcon={ChartPie}
                    emptyTitle="No type data"
                    emptyDescription="Work order type distribution will appear here."
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={filteredByType}
                          cx="50%"
                          cy="50%"
                          innerRadius={55}
                          outerRadius={90}
                          dataKey="count"
                          nameKey="type"
                          paddingAngle={2}
                          label={({ name, percent }: any) => `${name} ${(percent * 100).toFixed(0)}%`}
                          labelLine={false}
                          fontSize={11}
                        >
                          {(filteredByType || []).map((_: any, i: number) => (
                            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </SafeChart>
                </ChartCard>

                {/* WO by Status (Horizontal Bar) */}
                <ChartCard title="WO by Status">
                  <SafeChart
                    data={reportData.distribution?.byStatus}
                    emptyIcon={BarChart3}
                    emptyTitle="No status data"
                    emptyDescription="Status distribution will appear here."
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={reportData.distribution.byStatus}
                        layout="vertical"
                        margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis type="number" tick={{ fontSize: 11 }} />
                        <YAxis type="category" dataKey="status" tick={{ fontSize: 10 }} width={90} />
                        <Tooltip />
                        <Bar dataKey="count" name="Count" radius={[0, 4, 4, 0]}>
                          {(reportData.distribution.byStatus || []).map((_: any, i: number) => (
                            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </SafeChart>
                </ChartCard>

                {/* WO by Trade (Vertical Bar) */}
                <ChartCard title="WO by Trade">
                  <SafeChart
                    data={reportData.distribution?.byTrade}
                    emptyIcon={BarChart3}
                    emptyTitle="No trade data"
                    emptyDescription="Trade distribution will appear here."
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={reportData.distribution.byTrade} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis dataKey="trade" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Bar dataKey="count" name="Count" radius={[4, 4, 0, 0]}>
                          {(reportData.distribution.byTrade || []).map((entry: any) => (
                            <Cell key={entry.trade} fill={getColorForKey(entry.trade, CHART_COLORS[0])} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </SafeChart>
                </ChartCard>

                {/* Cost Trend by Month (Stacked Area) */}
                <ChartCard title="Cost Trend by Month">
                  <SafeChart
                    data={reportData.cost?.byMonth}
                    emptyIcon={DollarSign}
                    emptyTitle="No cost trend data"
                    emptyDescription="Monthly cost trends will appear here."
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={reportData.cost.byMonth} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip formatter={(value: any) => formatCurrency(value)} />
                        <Legend />
                        <Area type="monotone" dataKey="laborCost" stackId="1" stroke="#059669" fill="#05966933" name="Labor" />
                        <Area type="monotone" dataKey="partsCost" stackId="1" stroke="#0ea5e9" fill="#0ea5e933" name="Parts" />
                        <Area type="monotone" dataKey="totalCost" stroke="#f59e0b" fill="#f59e0b33" name="Total" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </SafeChart>
                </ChartCard>
              </div>

              <SummaryFooter notes={[
                `Total of ${s?.totalWOs ?? 0} work orders processed in the selected period.`,
                `Completion rate of ${s?.completionRate ?? 0}% across all work order types.`,
                `Breakdown work orders represent ${s?.breakdownRate ?? 0}% of total volume.`,
                `Average response time is ${formatHours(s?.avgResponseTime)} with ${formatRate(s?.reworkRate)} rework rate.`,
              ]} />
            </TabsContent>

            {/* ============================================================= */}
            {/* TAB 2: DOWNTIME (PER TRADE) REPORT                            */}
            {/* ============================================================= */}
            {dtEnabled && (
            <TabsContent value="downtime" className="space-y-6 mt-0">
              <TabSectionHeader title="Downtime Report (Per Trade)" description="Analysis of equipment downtime events, duration, and production impact" />

              {/* KPI Strip */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <KPICard label="Total Downtime Hours" value={formatHours(downtimeTotals.totalHours)} icon={CircleStop} color="text-red-600 bg-red-50 dark:bg-red-900/30 dark:text-red-400" />
                <KPICard label="Total Events" value={downtimeTotals.totalEvents} icon={AlertTriangle} color="text-amber-600 bg-amber-50 dark:bg-amber-900/30 dark:text-amber-400" />
                <KPICard label="Avg Downtime/Event" value={formatHours(downtimeTotals.totalEvents > 0 ? downtimeTotals.totalHours / downtimeTotals.totalEvents : 0)} icon={Timer} color="text-orange-600 bg-orange-50 dark:bg-orange-900/30 dark:text-orange-400" />
                <KPICard label="Production Loss" value={formatCurrency(downtimeTotals.productionLoss)} icon={DollarSign} color="text-rose-600 bg-rose-50 dark:bg-rose-900/30 dark:text-rose-400" />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Downtime by Trade (Horizontal Bar) */}
                <ChartCard title="Downtime by Trade (Hours)" className="lg:col-span-2">
                  <SafeChart
                    data={reportData.downtime?.byTrade}
                    emptyIcon={CircleStop}
                    emptyTitle="No downtime data"
                    emptyDescription="Downtime by trade will appear here."
                    height={300}
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={reportData.downtime.byTrade}
                        layout="vertical"
                        margin={{ top: 5, right: 30, left: 10, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis type="number" tick={{ fontSize: 11 }} unit="h" />
                        <YAxis type="category" dataKey="trade" tick={{ fontSize: 11 }} width={90} />
                        <Tooltip formatter={(value: any) => `${value}h`} />
                        <Bar dataKey="totalHours" name="Hours" radius={[0, 4, 4, 0]}>
                          {(reportData.downtime.byTrade || []).map((entry: any) => (
                            <Cell key={entry.trade} fill={getColorForKey(entry.trade, CHART_COLORS[0])} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </SafeChart>
                </ChartCard>

                {/* Downtime by Category (Donut) */}
                <ChartCard title="Downtime by Category">
                  <SafeChart
                    data={reportData.downtime?.byCategory}
                    emptyIcon={ChartPie}
                    emptyTitle="No category data"
                    emptyDescription="Category distribution will appear here."
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={reportData.downtime.byCategory}
                          cx="50%"
                          cy="50%"
                          innerRadius={55}
                          outerRadius={90}
                          dataKey="totalHours"
                          nameKey="category"
                          paddingAngle={2}
                        >
                          {(reportData.downtime.byCategory || []).map((_: any, i: number) => (
                            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value: any) => `${value}h`} />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </SafeChart>
                </ChartCard>

                {/* Downtime Trend by Month (Line + Area) */}
                <ChartCard title="Downtime Trend by Month">
                  <SafeChart
                    data={reportData.downtime?.byMonth}
                    emptyIcon={TrendingDown}
                    emptyTitle="No trend data"
                    emptyDescription="Monthly downtime trends will appear here."
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={reportData.downtime.byMonth} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Legend />
                        <Area type="monotone" dataKey="totalHours" stroke="#ef4444" fill="#ef444433" name="Hours" />
                        <Line type="monotone" dataKey="events" stroke="#f59e0b" strokeWidth={2} name="Events" dot={{ r: 4 }} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </SafeChart>
                </ChartCard>
              </div>

              {/* Downtime Detail Table */}
              <ReportTable
                headers={[
                  { key: 'trade', label: 'Trade' },
                  { key: 'events', label: 'Events', align: 'right' },
                  { key: 'hours', label: 'Hours', align: 'right' },
                  { key: 'avgHours', label: 'Avg Hours/Event', align: 'right' },
                  { key: 'pctTotal', label: '% of Total', align: 'right' },
                  { key: 'prodLoss', label: 'Production Loss', align: 'right' },
                ]}
                rows={(reportData.downtime?.byTrade || []).map((d: any) => ({
                  trade: <span className="font-medium capitalize">{tradeName(d.trade)}</span>,
                  events: d.events,
                  hours: formatHours(d.totalHours),
                  avgHours: formatHours(d.events > 0 ? d.totalHours / d.events : 0),
                  pctTotal: downtimeTotals.totalHours > 0 ? `${((d.totalHours / downtimeTotals.totalHours) * 100).toFixed(1)}%` : '0%',
                  prodLoss: formatCurrency(d.productionLoss),
                }))}
                totalRow={{
                  trade: <span className="font-bold">TOTAL</span>,
                  events: <span className="font-bold">{downtimeTotals.totalEvents}</span>,
                  hours: <span className="font-bold">{formatHours(downtimeTotals.totalHours)}</span>,
                  avgHours: <span className="font-bold">{formatHours(downtimeTotals.totalEvents > 0 ? downtimeTotals.totalHours / downtimeTotals.totalEvents : 0)}</span>,
                  pctTotal: <span className="font-bold">100%</span>,
                  prodLoss: <span className="font-bold">{formatCurrency(downtimeTotals.productionLoss)}</span>,
                }}
              />

              <SummaryFooter notes={[
                `${downtimeTotals.totalEvents} downtime events totaling ${formatHours(downtimeTotals.totalHours)}.`,
                `Average event duration: ${formatHours(downtimeTotals.totalEvents > 0 ? downtimeTotals.totalHours / downtimeTotals.totalEvents : 0)}.`,
                `Total production loss: ${formatCurrency(downtimeTotals.productionLoss)}.`,
              ]} />
            </TabsContent>
            )}

            {/* ============================================================= */}
            {/* TAB 3: RESPONSE TIME REPORT                                    */}
            {/* ============================================================= */}
            <TabsContent value="response-time" className="space-y-6 mt-0">
              <TabSectionHeader title="Response Time Report" description="Analysis of work order response times by priority and trade with SLA compliance" />

              {/* KPI Strip */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <KPICard
                  label="Overall Avg Response"
                  value={formatHours(reportData.responseTime?.overall?.avgHours)}
                  icon={Timer}
                  color="text-amber-600 bg-amber-50 dark:bg-amber-900/30 dark:text-amber-400"
                />
                <KPICard
                  label="Sample Size"
                  value={reportData.responseTime?.overall?.sampleSize ?? 0}
                  subtitle="work orders"
                  icon={ClipboardList}
                  color="text-sky-600 bg-sky-50 dark:bg-sky-900/30 dark:text-sky-400"
                />
                <KPICard
                  label="Best Response (Min)"
                  value={formatHours(
                    (reportData.responseTime?.byPriority || []).length > 0
                      ? (reportData.responseTime?.byPriority || []).reduce((min: number, d: any) => d.minHours < min ? d.minHours : min, Infinity)
                      : null
                  )}
                  icon={Activity}
                  color="text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 dark:text-emerald-400"
                />
                <KPICard
                  label="Worst Response (Max)"
                  value={formatHours(
                    (reportData.responseTime?.byPriority || []).length > 0
                      ? (reportData.responseTime?.byPriority || []).reduce((max: number, d: any) => d.maxHours > max ? d.maxHours : max, 0)
                      : null
                  )}
                  icon={AlertTriangle}
                  color="text-red-600 bg-red-50 dark:bg-red-900/30 dark:text-red-400"
                />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Response Time by Priority */}
                <ChartCard title="Response Time by Priority">
                  <SafeChart
                    data={reportData.responseTime?.byPriority}
                    emptyIcon={Timer}
                    emptyTitle="No priority data"
                    emptyDescription="Response time by priority will appear here."
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={reportData.responseTime.byPriority} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis dataKey="priority" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} unit="h" />
                        <Tooltip />
                        <Bar dataKey="avgHours" name="Avg Hours" radius={[4, 4, 0, 0]}>
                          {(reportData.responseTime.byPriority || []).map((entry: any) => (
                            <Cell key={entry.priority} fill={getColorForKey(entry.priority, CHART_COLORS[0])} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </SafeChart>
                </ChartCard>

                {/* Response Time by Trade */}
                <ChartCard title="Response Time by Trade">
                  <SafeChart
                    data={reportData.responseTime?.byTrade}
                    emptyIcon={Timer}
                    emptyTitle="No trade data"
                    emptyDescription="Response time by trade will appear here."
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={reportData.responseTime.byTrade} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis dataKey="trade" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} unit="h" />
                        <Tooltip />
                        <Bar dataKey="avgHours" name="Avg Hours" radius={[4, 4, 0, 0]}>
                          {(reportData.responseTime.byTrade || []).map((entry: any) => (
                            <Cell key={entry.trade} fill={getColorForKey(entry.trade, CHART_COLORS[0])} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </SafeChart>
                </ChartCard>
              </div>

              {/* Response Time Table with SLA */}
              <ReportTable
                headers={[
                  { key: 'group', label: 'Priority / Trade' },
                  { key: 'count', label: 'Count', align: 'right' },
                  { key: 'avgHrs', label: 'Avg Hours', align: 'right' },
                  { key: 'minHrs', label: 'Min Hours', align: 'right' },
                  { key: 'maxHrs', label: 'Max Hours', align: 'right' },
                  { key: 'slaTarget', label: 'SLA Target', align: 'right' },
                  { key: 'slaCompliance', label: 'SLA Compliance', align: 'right' },
                ]}
                rows={[
                  ...(reportData.responseTime?.byPriority || []).map((d: any) => {
                    const target = SLA_TARGETS[d.priority] || 8;
                    const compliance = d.avgHours > 0 ? Math.min(100, Math.round((target / d.avgHours) * 100)) : 100;
                    const compColor = getSLAComplianceColor(compliance);
                    return {
                      group: <span className="font-medium capitalize flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: getColorForKey(d.priority, CHART_COLORS[0]) }} />
                        {d.priority}
                      </span>,
                      count: d.count,
                      avgHrs: formatHours(d.avgHours),
                      minHrs: formatHours(d.minHours),
                      maxHrs: formatHours(d.maxHours),
                      slaTarget: `${target}h`,
                      slaCompliance: <Badge variant="outline" className="text-[10px] px-1.5 py-0" style={{ color: compColor, borderColor: compColor }}>{compliance}%</Badge>,
                    };
                  }),
                  ...(reportData.responseTime?.byTrade || []).map((d: any) => ({
                    group: <span className="font-medium capitalize flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: getColorForKey(tradeName(d.trade), CHART_COLORS[0]) }} />
                      {tradeName(d.trade)}
                    </span>,
                    count: d.count,
                    avgHrs: formatHours(d.avgHours),
                    minHrs: '-',
                    maxHrs: '-',
                    slaTarget: '-',
                    slaCompliance: '-',
                  })),
                ]}
              />

              <SummaryFooter notes={[
                `Overall average response time: ${formatHours(reportData.responseTime?.overall?.avgHours)} (${reportData.responseTime?.overall?.sampleSize ?? 0} samples).`,
                'SLA targets: Critical=0.5h, High=1h, Medium=4h, Low=8h.',
                'Green ≥90% compliance | Amber 70-90% | Red <70%.',
              ]} />
            </TabsContent>

            {/* ============================================================= */}
            {/* TAB 4: BREAKDOWN REPORT                                        */}
            {/* ============================================================= */}
            <TabsContent value="breakdowns" className="space-y-6 mt-0">
              <TabSectionHeader title="Number of Breakdown Report" description="Analysis of breakdown frequency, trends, and Pareto analysis by trade" />

              {/* KPI Strip */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <KPICard label="Total Breakdowns" value={reportData.breakdowns?.total ?? 0} icon={Zap} color="text-red-600 bg-red-50 dark:bg-red-900/30 dark:text-red-400" />
                <KPICard label="Breakdown Rate" value={`${s?.breakdownRate ?? 0}%`} icon={AlertTriangle} color="text-amber-600 bg-amber-50 dark:bg-amber-900/30 dark:text-amber-400" />
                <KPICard label="Most Affected Trade" value={breakdownSummary.mostAffected?.trade || '-'} icon={HardHat} color="text-orange-600 bg-orange-50 dark:bg-orange-900/30 dark:text-orange-400" />
                <KPICard label="Top Breakdown Month" value={breakdownSummary.topMonth?.month || '-'} icon={CalendarDays} color="text-violet-600 bg-violet-50 dark:bg-violet-900/30 dark:text-violet-400" />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Breakdowns by Type (Bar) */}
                <ChartCard title="Breakdowns by Type">
                  <SafeChart
                    data={filteredBreakdownByType}
                    emptyIcon={BarChart3}
                    emptyTitle="No type data"
                    emptyDescription="Breakdown type data will appear here."
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={filteredBreakdownByType} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis dataKey="type" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Bar dataKey="count" name="Count" radius={[4, 4, 0, 0]}>
                          {(filteredBreakdownByType || []).map((_: any, i: number) => (
                            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </SafeChart>
                </ChartCard>

                {/* Breakdowns by Trade (Bar) */}
                <ChartCard title="Breakdowns by Trade">
                  <SafeChart
                    data={reportData.breakdowns?.byTrade}
                    emptyIcon={BarChart3}
                    emptyTitle="No trade data"
                    emptyDescription="Trade breakdown data will appear here."
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={reportData.breakdowns.byTrade} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis dataKey="trade" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Bar dataKey="count" name="Count" radius={[4, 4, 0, 0]}>
                          {(reportData.breakdowns.byTrade || []).map((entry: any) => (
                            <Cell key={entry.trade} fill={getColorForKey(entry.trade, CHART_COLORS[0])} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </SafeChart>
                </ChartCard>

                {/* Breakdown Trend by Month (Line with markers) */}
                <ChartCard title="Breakdown Trend by Month" className="lg:col-span-2">
                  <SafeChart
                    data={reportData.breakdowns?.byMonth}
                    emptyIcon={TrendingDown}
                    emptyTitle="No monthly data"
                    emptyDescription="Monthly breakdown trends will appear here."
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={reportData.breakdowns.byMonth} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Line type="monotone" dataKey="count" stroke="#ef4444" strokeWidth={2} name="Breakdowns" dot={{ r: 5, fill: '#ef4444', stroke: '#fff', strokeWidth: 2 }} activeDot={{ r: 6 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </SafeChart>
                </ChartCard>

                {/* Breakdown by Priority (Donut) */}
                <ChartCard title="Breakdown by Priority">
                  <SafeChart
                    data={reportData.breakdowns?.byPriority}
                    emptyIcon={ChartPie}
                    emptyTitle="No priority data"
                    emptyDescription="Priority distribution will appear here."
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={reportData.breakdowns.byPriority}
                          cx="50%"
                          cy="50%"
                          innerRadius={55}
                          outerRadius={90}
                          dataKey="count"
                          nameKey="priority"
                          paddingAngle={2}
                        >
                          {(reportData.breakdowns.byPriority || []).map((entry: any) => (
                            <Cell key={entry.priority} fill={getColorForKey(entry.priority, CHART_COLORS[0])} />
                          ))}
                        </Pie>
                        <Tooltip />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </SafeChart>
                </ChartCard>

                {/* Pareto Chart (ComposedChart) */}
                <ChartCard title="Pareto Analysis (Cumulative %)">
                  <SafeChart
                    data={breakdownParetoData}
                    emptyIcon={ChartPie}
                    emptyTitle="No data for Pareto"
                    emptyDescription="Pareto analysis requires breakdown data by trade."
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={breakdownParetoData} margin={{ top: 5, right: 40, left: -10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis dataKey="trade" tick={{ fontSize: 10 }} />
                        <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
                        <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} unit="%" domain={[0, 100]} />
                        <Tooltip />
                        <Legend />
                        <Bar yAxisId="left" dataKey="count" name="Count" radius={[4, 4, 0, 0]}>
                          {breakdownParetoData.map((entry: any) => (
                            <Cell key={entry.trade} fill={getColorForKey(entry.trade, CHART_COLORS[0])} />
                          ))}
                        </Bar>
                        <Line yAxisId="right" type="monotone" dataKey="cumulativePct" stroke="#8b5cf6" strokeWidth={2} name="Cumulative %" dot={{ r: 3 }} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </SafeChart>
                </ChartCard>
              </div>

              {/* Breakdown Table */}
              <ReportTable
                headers={[
                  { key: 'trade', label: 'Trade' },
                  { key: 'breakdowns', label: 'Breakdowns', align: 'right' },
                  { key: 'pctTotal', label: '% of Total', align: 'right' },
                  { key: 'trend', label: 'Trend', align: 'right' },
                ]}
                rows={(reportData.breakdowns?.byTrade || []).map((d: any, idx: number) => {
                  const total = reportData.breakdowns?.total || 1;
                  return {
                    trade: <span className="font-medium capitalize flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: getColorForKey(tradeName(d.trade), CHART_COLORS[0]) }} />
                      {tradeName(d.trade)}
                    </span>,
                    breakdowns: d.count,
                    pctTotal: `${((d.count / total) * 100).toFixed(1)}%`,
                    trend: idx === 0 ? <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-red-600 border-red-300">Highest</Badge> : '-',
                  };
                })}
              />

              <SummaryFooter notes={[
                `${reportData.breakdowns?.total ?? 0} breakdown work orders in the selected period.`,
                `Most affected trade: ${breakdownSummary.mostAffected?.trade || 'N/A'}.`,
                `Pareto analysis shows the top trades contributing to 80% of all breakdowns.`,
              ]} />
            </TabsContent>

            {/* ============================================================= */}
            {/* TAB 5: MAN HOURS REPORT                                        */}
            {/* ============================================================= */}
            <TabsContent value="man-hours" className="space-y-6 mt-0">
              <TabSectionHeader title="Man Hours Report" description="Labor hours analysis by trade, technician, activity type, and monthly trend" />

              {/* KPI Strip */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <KPICard label="Total Man Hours" value={formatHours(reportData.manHours?.grandTotal)} icon={HardHat} color="text-violet-600 bg-violet-50 dark:bg-violet-900/30 dark:text-violet-400" />
                <KPICard label="Avg Hours/WO" value={formatHours((s?.totalWOs || 0) > 0 ? (reportData.manHours?.grandTotal || 0) / (s?.totalWOs || 1) : 0)} icon={Timer} color="text-sky-600 bg-sky-50 dark:bg-sky-900/30 dark:text-sky-400" />
                <KPICard label="Most Active Trade" value={manHoursSummary.mostActive?.trade || '-'} icon={Wrench} color="text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 dark:text-emerald-400" />
                <KPICard label="Top Technician Hours" value={formatHours(manHoursSummary.topTech?.totalHours)} subtitle={manHoursSummary.topTech?.name} icon={Users} color="text-amber-600 bg-amber-50 dark:bg-amber-900/30 dark:text-amber-400" />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Man Hours by Trade (Horizontal Bar) */}
                <ChartCard title="Man Hours by Trade">
                  <SafeChart
                    data={reportData.manHours?.byTrade}
                    emptyIcon={BarChart3}
                    emptyTitle="No trade data"
                    emptyDescription="Man hours by trade will appear here."
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={reportData.manHours.byTrade}
                        layout="vertical"
                        margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis type="number" tick={{ fontSize: 11 }} unit="h" />
                        <YAxis type="category" dataKey="trade" tick={{ fontSize: 11 }} width={90} />
                        <Tooltip />
                        <Bar dataKey="totalHours" name="Hours" radius={[0, 4, 4, 0]}>
                          {(reportData.manHours.byTrade || []).map((entry: any) => (
                            <Cell key={entry.trade} fill={getColorForKey(entry.trade, CHART_COLORS[0])} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </SafeChart>
                </ChartCard>

                {/* Man Hours by Technician (Top 15 Horizontal Bar) */}
                <ChartCard title="Top 15 Technicians by Hours">
                  <SafeChart
                    data={(reportData.manHours?.byTechnician || []).slice(0, 15)}
                    emptyIcon={Users}
                    emptyTitle="No technician data"
                    emptyDescription="Technician hours will appear here."
                    height={320}
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={(reportData.manHours.byTechnician || []).slice(0, 15)}
                        layout="vertical"
                        margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis type="number" tick={{ fontSize: 11 }} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={100} />
                        <Tooltip />
                        <Bar dataKey="totalHours" name="Hours" radius={[0, 4, 4, 0]}>
                          {(reportData.manHours.byTechnician || []).slice(0, 15).map((_: any, i: number) => (
                            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </SafeChart>
                </ChartCard>

                {/* Man Hours Trend by Month (Line) */}
                <ChartCard title="Man Hours Trend by Month">
                  <SafeChart
                    data={reportData.manHours?.byMonth}
                    emptyIcon={HardHat}
                    emptyTitle="No monthly data"
                    emptyDescription="Monthly man hours will appear here."
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={reportData.manHours.byMonth} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Line type="monotone" dataKey="totalHours" stroke="#8b5cf6" strokeWidth={2} name="Hours" dot={{ r: 4, fill: '#8b5cf6', stroke: '#fff', strokeWidth: 2 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </SafeChart>
                </ChartCard>

                {/* Man Hours by Activity Type (Donut) */}
                <ChartCard title="Man Hours by Activity Type">
                  <SafeChart
                    data={reportData.manHours?.byActivity}
                    emptyIcon={ChartPie}
                    emptyTitle="No activity data"
                    emptyDescription="Activity hours will appear here."
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={reportData.manHours.byActivity}
                          cx="50%"
                          cy="50%"
                          innerRadius={55}
                          outerRadius={90}
                          dataKey="totalHours"
                          nameKey="activity"
                          paddingAngle={2}
                          label={({ name, percent }: any) => `${name} ${(percent * 100).toFixed(0)}%`}
                          labelLine={false}
                          fontSize={10}
                        >
                          {(reportData.manHours.byActivity || []).map((_: any, i: number) => (
                            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value: any) => `${value}h`} />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </SafeChart>
                </ChartCard>
              </div>

              {/* Technician Detail Table */}
              <ReportTable
                headers={[
                  { key: 'name', label: 'Technician' },
                  { key: 'totalHrs', label: 'Total Hours', align: 'right' },
                  { key: 'woCount', label: 'WO Count', align: 'right' },
                  { key: 'avgHrs', label: 'Avg Hrs/WO', align: 'right' },
                  { key: 'pctTotal', label: '% of Grand Total', align: 'right' },
                ]}
                rows={(reportData.manHours?.byTechnician || []).map((d: any) => {
                  const grandTotal = reportData.manHours?.grandTotal || 1;
                  return {
                    name: <span className="font-medium">{d.name}</span>,
                    totalHrs: <span className="font-medium">{formatHours(d.totalHours)}</span>,
                    woCount: d.woCount,
                    avgHrs: formatHours(d.avgHoursPerWO),
                    pctTotal: `${((d.totalHours / grandTotal) * 100).toFixed(1)}%`,
                  };
                })}
                totalRow={{
                  name: <span className="font-bold">TOTAL</span>,
                  totalHrs: <span className="font-bold">{formatHours(reportData.manHours?.grandTotal)}</span>,
                  woCount: '-',
                  avgHrs: '-',
                  pctTotal: <span className="font-bold">100%</span>,
                }}
                maxHeight={400}
              />

              <SummaryFooter notes={[
                `Total man hours: ${formatHours(reportData.manHours?.grandTotal)} across ${(reportData.manHours?.byTechnician || []).length} technicians.`,
                `Most active trade: ${manHoursSummary.mostActive?.trade || 'N/A'}.`,
                `Top contributor: ${manHoursSummary.topTech?.name || 'N/A'} with ${formatHours(manHoursSummary.topTech?.totalHours)}.`,
              ]} />
            </TabsContent>

            {/* ============================================================= */}
            {/* TAB 6: MATERIAL QUANTITY & COST REPORT                         */}
            {/* ============================================================= */}
            {invEnabled && (
            <TabsContent value="materials" className="space-y-6 mt-0">
              <TabSectionHeader title="Material Quantity & Cost Report" description="Analysis of material usage, costs, and trends by work order type" />

              {/* KPI Strip */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <KPICard label="Total Items Used" value={String(reportData.materials?.totalQty ?? 0)} icon={Boxes} color="text-sky-600 bg-sky-50 dark:bg-sky-900/30 dark:text-sky-400" />
                <KPICard label="Total Material Cost" value={formatCurrency(reportData.materials?.totalCost)} icon={Package} color="text-teal-600 bg-teal-50 dark:bg-teal-900/30 dark:text-teal-400" />
                <KPICard label="Avg Cost/WO" value={formatCurrency(materialsSummary.avgCostPerWO)} icon={DollarSign} color="text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 dark:text-emerald-400" />
                <KPICard label="Top Material by Cost" value={materialsSummary.topItem?.name || '-'} icon={TrendingDown} color="text-amber-600 bg-amber-50 dark:bg-amber-900/30 dark:text-amber-400" />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Material Cost by WO Type (Stacked Bar) */}
                <ChartCard title="Material Cost by WO Type">
                  <SafeChart
                    data={filteredMaterialsByType}
                    emptyIcon={Boxes}
                    emptyTitle="No type data"
                    emptyDescription="Material usage by WO type will appear here."
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={filteredMaterialsByType} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis dataKey="type" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip formatter={(value: any, name: any) => name === 'totalQty' ? `${value} qty` : formatCurrency(value)} />
                        <Legend />
                        <Bar dataKey="totalCost" name="Cost" fill="#059669" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="totalQty" name="Qty" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </SafeChart>
                </ChartCard>

                {/* Top 15 Materials by Cost (Horizontal Bar) */}
                <ChartCard title="Top 15 Materials by Cost">
                  <SafeChart
                    data={(reportData.materials?.topItems || []).slice(0, 15)}
                    emptyIcon={Package}
                    emptyTitle="No material data"
                    emptyDescription="Top materials by cost will appear here."
                    height={320}
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={(reportData.materials.topItems || []).slice(0, 15)}
                        layout="vertical"
                        margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis type="number" tick={{ fontSize: 11 }} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 9 }} width={120} />
                        <Tooltip formatter={(value: any) => formatCurrency(value)} />
                        <Bar dataKey="totalCost" name="Cost" radius={[0, 4, 4, 0]}>
                          {(reportData.materials.topItems || []).slice(0, 15).map((_: any, i: number) => (
                            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </SafeChart>
                </ChartCard>

                {/* Material Cost Trend by Month (Line) */}
                <ChartCard title="Material Cost Trend by Month" className="lg:col-span-2">
                  <SafeChart
                    data={reportData.materials?.costByMonth}
                    emptyIcon={TrendingDown}
                    emptyTitle="No monthly data"
                    emptyDescription="Monthly cost trends will appear here."
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={reportData.materials.costByMonth} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip formatter={(value: any) => formatCurrency(value)} />
                        <Line type="monotone" dataKey="totalCost" stroke="#059669" strokeWidth={2} name="Cost" dot={{ r: 4, fill: '#059669', stroke: '#fff', strokeWidth: 2 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </SafeChart>
                </ChartCard>
              </div>

              {/* Materials Table — Enterprise Grade with Part Details */}
              <ReportTable
                headers={[
                  { key: 'name', label: 'Item Name' },
                  { key: 'itemCode', label: 'Part #' },
                  { key: 'supplier', label: 'Supplier' },
                  { key: 'unit', label: 'Unit' },
                  { key: 'totalQty', label: 'Total Qty', align: 'right' },
                  { key: 'unitCost', label: 'Unit Cost', align: 'right' },
                  { key: 'totalCost', label: 'Total Cost', align: 'right' },
                  { key: 'woCount', label: 'WOs Used', align: 'right' },
                  { key: 'pctTotal', label: '% of Total', align: 'right' },
                ]}
                rows={(reportData.materials?.topItems || []).map((d: any) => {
                  const totalCost = reportData.materials?.totalCost || 1;
                  const item = d.inventoryItem;
                  return {
                    name: <div><span className="font-medium">{d.name}</span>{item?.specification && <p className="text-[10px] text-muted-foreground mt-0.5 max-w-[200px] truncate">{item.specification}</p>}</div>,
                    itemCode: item?.itemCode ? <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{item.itemCode}</code> : '-',
                    supplier: item?.supplier || d.supplier || '-',
                    unit: item?.unitOfMeasure || d.unitOfMeasure || '-',
                    totalQty: d.totalQty,
                    unitCost: d.unitCost ? formatCurrency(d.unitCost) : '-',
                    totalCost: <span className="font-medium">{formatCurrency(d.totalCost)}</span>,
                    woCount: d.woCount,
                    pctTotal: `${((d.totalCost / totalCost) * 100).toFixed(1)}%`,
                  };
                })}
                totalRow={{
                  name: <span className="font-bold">TOTAL</span>,
                  itemCode: '',
                  supplier: '',
                  unit: '',
                  totalQty: <span className="font-bold">{reportData.materials?.totalQty ?? 0}</span>,
                  unitCost: '',
                  totalCost: <span className="font-bold">{formatCurrency(reportData.materials?.totalCost)}</span>,
                  woCount: '-',
                  pctTotal: <span className="font-bold">100%</span>,
                }}
                maxHeight={400}
              />

              <SummaryFooter notes={[
                `Total material cost: ${formatCurrency(reportData.materials?.totalCost)} for ${reportData.materials?.totalQty ?? 0} items.`,
                `Average material cost per work order: ${formatCurrency(materialsSummary.avgCostPerWO)}.`,
                `Top material by cost: ${materialsSummary.topItem?.name || 'N/A'}.`,
              ]} />
            </TabsContent>
            )}

            {/* ============================================================= */}
            {/* TAB 7: FAILURE RATE REPORT                                     */}
            {/* ============================================================= */}
            <TabsContent value="failure-rate" className="space-y-6 mt-0">
              <TabSectionHeader title="Failure Rate Report" description="Asset failure rate analysis, MTBF tracking, and risk assessment" />

              {/* KPI Strip */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <KPICard label="Avg Failure Rate" value={formatRate(failureSummary.avgRate)} icon={Gauge} color="text-red-600 bg-red-50 dark:bg-red-900/30 dark:text-red-400" />
                <KPICard label="Highest Risk Asset" value={failureSummary.highest?.assetName || '-'} icon={ShieldAlert} color="text-amber-600 bg-amber-50 dark:bg-amber-900/30 dark:text-amber-400" />
                <KPICard label="MTBF (avg days)" value={`${failureSummary.avgMTBF.toFixed(1)}d`} icon={Clock} color="text-sky-600 bg-sky-50 dark:bg-sky-900/30 dark:text-sky-400" />
                <KPICard label="Rework Rate" value={formatRate(reportData.failureRate?.reworkRate)} icon={TrendingDown} color="text-rose-600 bg-rose-50 dark:bg-rose-900/30 dark:text-rose-400" />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Failure Rate by Asset (Top 15, color coded by severity) */}
                <ChartCard title="Failure Rate by Asset (Top 15)" className="lg:col-span-2">
                  <SafeChart
                    data={(reportData.failureRate?.byAsset || []).slice(0, 15)}
                    emptyIcon={Gauge}
                    emptyTitle="No failure rate data"
                    emptyDescription="Asset failure rates will appear here."
                    height={350}
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={(reportData.failureRate.byAsset || []).slice(0, 15)}
                        layout="vertical"
                        margin={{ top: 5, right: 30, left: 10, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis type="number" tick={{ fontSize: 11 }} unit="%" />
                        <YAxis type="category" dataKey="assetName" tick={{ fontSize: 10 }} width={120} />
                        <Tooltip formatter={(value: any) => `${value}%`} />
                        <Bar dataKey="failureRate" name="Failure Rate" radius={[0, 4, 4, 0]}>
                          {(reportData.failureRate.byAsset || []).slice(0, 15).map((entry: any, i: number) => (
                            <Cell key={i} fill={getSeverityColor(entry.failureRate)} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </SafeChart>
                </ChartCard>

                {/* Failure Rate by Type (Bar) */}
                <ChartCard title="Failure Rate by WO Type">
                  <SafeChart
                    data={filteredFailureByType}
                    emptyIcon={BarChart3}
                    emptyTitle="No type data"
                    emptyDescription="Failure rate by type will appear here."
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={filteredFailureByType} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis dataKey="type" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} unit="%" />
                        <Tooltip formatter={(value: any) => `${value}%`} />
                        <Bar dataKey="failureRate" name="Failure Rate" radius={[4, 4, 0, 0]}>
                          {(filteredFailureByType || []).map((_: any, i: number) => (
                            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </SafeChart>
                </ChartCard>

                {/* MTBF by Asset (Horizontal Bar - sorted ascending) */}
                <ChartCard title="MTBF by Asset (Days)">
                  <SafeChart
                    data={(reportData.failureRate?.mtbf || []).slice(0, 15)}
                    emptyIcon={Clock}
                    emptyTitle="No MTBF data"
                    emptyDescription="MTBF requires assets with 2+ failures."
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={(reportData.failureRate.mtbf || []).slice(0, 15)}
                        layout="vertical"
                        margin={{ top: 5, right: 30, left: 10, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis type="number" tick={{ fontSize: 11 }} unit="d" />
                        <YAxis type="category" dataKey="assetName" tick={{ fontSize: 10 }} width={120} />
                        <Tooltip formatter={(value: any) => `${value} days`} />
                        <Bar dataKey="mtbfDays" name="MTBF (Days)" radius={[0, 4, 4, 0]}>
                          {(reportData.failureRate.mtbf || []).slice(0, 15).map((entry: any, i: number) => (
                            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </SafeChart>
                </ChartCard>
              </div>

              {/* Failure Rate Detail Table — Enterprise Grade with Asset Details */}
              <ReportTable
                headers={[
                  { key: 'asset', label: 'Equipment' },
                  { key: 'tag', label: 'Tag' },
                  { key: 'manufacturer', label: 'Manufacturer' },
                  { key: 'model', label: 'Model' },
                  { key: 'category', label: 'Category' },
                  { key: 'criticality', label: 'Crit.' },
                  { key: 'location', label: 'Location' },
                  { key: 'totalWOs', label: 'Total WOs', align: 'right' },
                  { key: 'failures', label: 'Failures', align: 'right' },
                  { key: 'failureRate', label: 'Fail. Rate', align: 'right' },
                  { key: 'mtbf', label: 'MTBF (d)', align: 'right' },
                  { key: 'riskLevel', label: 'Risk', align: 'center' },
                ]}
                rows={(reportData.failureRate?.byAsset || []).map((d: any) => {
                  const mtbf = reportData.failureRate?.mtbf?.find((m: any) => m.assetId === d.assetId);
                  const asset = d.asset || {};
                  const risk = d.failureRate >= 40 ? 'High' : d.failureRate >= 20 ? 'Medium' : 'Low';
                  const riskColor = d.failureRate >= 40 ? 'text-red-600 bg-red-50 dark:bg-red-900/30 border-red-300' : d.failureRate >= 20 ? 'text-amber-600 bg-amber-50 dark:bg-amber-900/30 border-amber-300' : 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 border-emerald-300';
                  const critColor = asset.criticality === 'critical' ? 'text-red-600 font-bold' : asset.criticality === 'high' ? 'text-orange-600 font-medium' : 'text-muted-foreground';
                  return {
                    asset: <span className="font-medium">{d.assetName || d.assetId}</span>,
                    tag: asset.assetTag ? <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{asset.assetTag}</code> : '-',
                    manufacturer: asset.manufacturer || '-',
                    model: asset.model || '-',
                    category: typeof asset.category === 'string' ? asset.category : asset.category?.name || '-',
                    criticality: asset.criticality ? <span className={critColor}>{asset.criticality}</span> : '-',
                    location: [asset.building, asset.floor, asset.area].filter(Boolean).join(' / ') || asset.location || '-',
                    totalWOs: d.totalWOs,
                    failures: d.failures,
                    failureRate: <span style={{ color: getSeverityColor(d.failureRate) }} className="font-medium">{formatRate(d.failureRate)}</span>,
                    mtbf: mtbf ? mtbf.mtbfDays.toFixed(1) : '-',
                    riskLevel: <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${riskColor}`}>{risk}</Badge>,
                  };
                })}
                maxHeight={400}
              />

              <SummaryFooter notes={[
                `Average failure rate: ${formatRate(failureSummary.avgRate)} across ${(reportData.failureRate?.byAsset || []).length} assets.`,
                `Average MTBF: ${failureSummary.avgMTBF.toFixed(1)} days.`,
                `Rework rate: ${formatRate(reportData.failureRate?.reworkRate)} (${reportData.failureRate?.reworkWOs ?? 0} WOs).`,
                `Risk levels: High (≥40%) | Medium (20-40%) | Low (<20%).`,
              ]} />
            </TabsContent>

            {/* ============================================================= */}
            {/* TAB 8: COMPONENT-LEVEL COST ANALYSIS                        */}
            {/* ============================================================= */}
            <TabsContent value="components" className="space-y-6 mt-0">
              <TabSectionHeader title="Component Cost Analysis" description="Maintenance cost breakdown at the component level — identify which components drive the most repair spend" />

              {(reportData.componentCosts || []).length === 0 ? (
                <EmptyState icon={Cpu} title="No component data" description="Component-linked work orders will appear here once components are assigned to work orders during creation or completion." />
              ) : (
                <>
                  {/* KPI Strip */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <KPICard label="Components Serviced" value={(reportData.componentCosts || []).length} icon={Cpu} color="text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 dark:text-emerald-400" />
                    <KPICard label="Total Component Cost" value={formatCurrency((reportData.componentCosts || []).reduce((s: number, c: any) => s + c.totalCost, 0))} icon={DollarSign} color="text-blue-600 bg-blue-50 dark:bg-blue-900/30 dark:text-blue-400" />
                    <KPICard label="Avg Cost/Component" value={formatCurrency((reportData.componentCosts || []).length > 0 ? (reportData.componentCosts || []).reduce((s: number, c: any) => s + c.totalCost, 0) / (reportData.componentCosts || []).length : 0)} icon={BarChart3} color="text-violet-600 bg-violet-50 dark:bg-violet-900/30 dark:text-violet-400" />
                    <KPICard label="Most Repaired" value={(() => { const sorted = [...(reportData.componentCosts || [])].sort((a: any, b: any) => b.woCount - a.woCount); return sorted[0]?.componentName || '-'; })()} icon={Wrench} color="text-orange-600 bg-orange-50 dark:bg-orange-900/30 dark:text-orange-400" />
                  </div>

                  {/* Component Cost Table */}
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-semibold">Cost by Component (Top 20)</CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                      <div className="max-h-96 overflow-y-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-xs">Code</TableHead>
                              <TableHead className="text-xs">Component</TableHead>
                              <TableHead className="text-xs">Asset</TableHead>
                              <TableHead className="text-xs">Criticality</TableHead>
                              <TableHead className="text-xs text-right">WOs</TableHead>
                              <TableHead className="text-xs text-right">Total Cost</TableHead>
                              <TableHead className="text-xs text-right">Parts</TableHead>
                              <TableHead className="text-xs text-right">Labor</TableHead>
                              <TableHead className="text-xs text-right">Avg/WO</TableHead>
                              <TableHead className="text-xs text-right">Failures</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {(reportData.componentCosts || []).map((c: any, i: number) => (
                              <TableRow key={c.componentId || i}>
                                <TableCell className="text-xs font-mono">{c.componentCode || '-'}</TableCell>
                                <TableCell className="text-xs font-medium">{c.componentName}</TableCell>
                                <TableCell className="text-xs">
                                  <div>{c.assetName}</div>
                                  {c.assetTag && <div className="text-muted-foreground">{c.assetTag}</div>}
                                </TableCell>
                                <TableCell className="text-xs">
                                  <Badge variant={c.criticality === 'high' || c.criticality === 'critical' ? 'destructive' : c.criticality === 'medium' ? 'default' : 'secondary'} className="text-[10px]">
                                    {c.criticality || 'low'}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-xs text-right">{c.woCount}</TableCell>
                                <TableCell className="text-xs text-right font-medium">{formatCurrency(c.totalCost)}</TableCell>
                                <TableCell className="text-xs text-right">{formatCurrency(c.partsCost)}</TableCell>
                                <TableCell className="text-xs text-right">{formatCurrency(c.laborCost)}</TableCell>
                                <TableCell className="text-xs text-right">{formatCurrency(c.avgCostPerWO)}</TableCell>
                                <TableCell className="text-xs text-right">
                                  {c.failureCount > 0 ? (
                                    <Badge variant="destructive" className="text-[10px]">{c.failureCount}</Badge>
                                  ) : (c.woCount > 0 ? '0' : '-')}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </CardContent>
                  </Card>

                  <SummaryFooter notes={[
                    `${(reportData.componentCosts || []).length} components tracked across ${(reportData.componentCosts || []).reduce((s: number, c: any) => s + c.woCount, 0)} work orders.`,
                    `Total component repair cost: ${formatCurrency((reportData.componentCosts || []).reduce((s: number, c: any) => s + c.totalCost, 0))}.`,
                    `Components are linked to work orders during WO creation or repair completion.`,
                  ]} />
                </>
              )}
            </TabsContent>

            {/* ============================================================= */}
            {/* TAB 9: STOPPAGE NUMBER REPORT                                  */}
            {/* ============================================================= */}
            {dtEnabled && (
            <TabsContent value="stoppages" className="space-y-6 mt-0">
              <TabSectionHeader title="Stoppage Number Report" description="Analysis of production stoppage events by trade, impact level, and reason" />

              {/* KPI Strip */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <KPICard label="Total Stoppages" value={reportData.stoppages?.total ?? 0} icon={Pause} color="text-red-600 bg-red-50 dark:bg-red-900/30 dark:text-red-400" />
                <KPICard label="Most Stoppage Trade" value={stoppageSummary.mostTrade?.trade || '-'} icon={HardHat} color="text-orange-600 bg-orange-50 dark:bg-orange-900/30 dark:text-orange-400" />
                <KPICard label="Avg Duration/Stoppage" value={formatHours(stoppageSummary.avgDuration)} icon={Timer} color="text-amber-600 bg-amber-50 dark:bg-amber-900/30 dark:text-amber-400" />
                <KPICard label="Total Hours Lost" value={formatHours(stoppageSummary.totalHrs)} icon={CircleStop} color="text-violet-600 bg-violet-50 dark:bg-violet-900/30 dark:text-violet-400" />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Stoppages by Trade (Bar) */}
                <ChartCard title="Stoppages by Trade">
                  <SafeChart
                    data={reportData.stoppages?.byTrade}
                    emptyIcon={Pause}
                    emptyTitle="No trade data"
                    emptyDescription="Stoppages by trade will appear here."
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={reportData.stoppages.byTrade} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis dataKey="trade" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Bar dataKey="count" name="Count" radius={[4, 4, 0, 0]}>
                          {(reportData.stoppages.byTrade || []).map((entry: any) => (
                            <Cell key={entry.trade} fill={getColorForKey(entry.trade, CHART_COLORS[0])} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </SafeChart>
                </ChartCard>

                {/* Stoppages by Impact Level (Donut) */}
                <ChartCard title="Stoppages by Impact Level">
                  <SafeChart
                    data={reportData.stoppages?.byImpact}
                    emptyIcon={ChartPie}
                    emptyTitle="No impact data"
                    emptyDescription="Impact distribution will appear here."
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={reportData.stoppages.byImpact}
                          cx="50%"
                          cy="50%"
                          innerRadius={55}
                          outerRadius={90}
                          dataKey="count"
                          nameKey="impact"
                          paddingAngle={2}
                        >
                          {(reportData.stoppages.byImpact || []).map((entry: any) => (
                            <Cell key={entry.impact} fill={getColorForKey(entry.impact, CHART_COLORS[0])} />
                          ))}
                        </Pie>
                        <Tooltip />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </SafeChart>
                </ChartCard>

                {/* Stoppages by Reason (Horizontal Bar - top 10) */}
                <ChartCard title="Stoppages by Reason (Top 10)" className="lg:col-span-2">
                  <SafeChart
                    data={reportData.stoppages?.byReason}
                    emptyIcon={Construction}
                    emptyTitle="No reason data"
                    emptyDescription="Stoppage reasons will appear here."
                    height={300}
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={reportData.stoppages.byReason}
                        layout="vertical"
                        margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis type="number" tick={{ fontSize: 11 }} />
                        <YAxis type="category" dataKey="reason" tick={{ fontSize: 10 }} width={100} />
                        <Tooltip />
                        <Bar dataKey="count" name="Count" radius={[0, 4, 4, 0]}>
                          {(reportData.stoppages.byReason || []).map((_: any, i: number) => (
                            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </SafeChart>
                </ChartCard>
              </div>

              {/* Stoppages Table */}
              <ReportTable
                headers={[
                  { key: 'trade', label: 'Trade' },
                  { key: 'count', label: 'Stoppage Count', align: 'right' },
                  { key: 'totalHours', label: 'Total Hours', align: 'right' },
                  { key: 'avgHours', label: 'Avg Hours', align: 'right' },
                  { key: 'pctTotal', label: '% of Total', align: 'right' },
                ]}
                rows={(reportData.stoppages?.byTrade || []).map((d: any) => {
                  const total = reportData.stoppages?.total || 1;
                  const totalHrs = stoppageSummary.totalHrs || 1;
                  return {
                    trade: <span className="font-medium capitalize flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: getColorForKey(tradeName(d.trade), CHART_COLORS[0]) }} />
                      {tradeName(d.trade)}
                    </span>,
                    count: d.count,
                    totalHours: formatHours(d.totalHours),
                    avgHours: formatHours(d.count > 0 ? d.totalHours / d.count : 0),
                    pctTotal: `${((d.count / total) * 100).toFixed(1)}%`,
                  };
                })}
                totalRow={{
                  trade: <span className="font-bold">TOTAL</span>,
                  count: <span className="font-bold">{reportData.stoppages?.total ?? 0}</span>,
                  totalHours: <span className="font-bold">{formatHours(stoppageSummary.totalHrs)}</span>,
                  avgHours: <span className="font-bold">{formatHours(stoppageSummary.avgDuration)}</span>,
                  pctTotal: <span className="font-bold">100%</span>,
                }}
              />

              <SummaryFooter notes={[
                `${reportData.stoppages?.total ?? 0} total stoppage events in the selected period.`,
                `Most stoppages from trade: ${stoppageSummary.mostTrade?.trade || 'N/A'}.`,
                `Total hours lost to stoppages: ${formatHours(stoppageSummary.totalHrs)}.`,
              ]} />
            </TabsContent>
            )}
          </Tabs>
        </>
      )}
    </div>
  );
}
