'use client';

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { toast } from 'sonner';
import { exportPDF } from '@/lib/export-pdf';
import { useAuthStore } from '@/stores/authStore';
import { api } from '@/lib/api';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DateRangePicker } from '@/components/ui/datetime-picker';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Activity, AlertTriangle, Boxes, Building2, CheckCircle2, ClipboardCheck, ClipboardList,
  Database, GraduationCap, ShieldAlert, Target, XCircle,
  Wrench, Package, Factory, ShieldCheck, HardHat, TrendingUp,
  FileBarChart, FileSpreadsheet, Download, Plus, Search, Filter, Calendar,
  Eye, Printer, Share, BarChart3, DollarSign, RefreshCw, Clock, Settings,
  Loader2, ChevronDown, ChevronRight,
  ArrowUpDown, FileText, FileDown, Users,
  History, TrendingDown, Timer, Calculator, PackageSearch, Zap, MapPin,
  CircleDollarSign, Gauge,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, PieChart, Pie, Cell, ResponsiveContainer,
  Tooltip, Legend, LineChart, Line, ComposedChart,
} from 'recharts';
import { format } from 'date-fns';
import { EmptyState, StatusBadge, PriorityBadge, formatDate, formatDateTime, LoadingSkeleton, formatCurrency, formatDuration } from '@/components/shared/helpers';
import { useModuleEnabled, MODULE_CODES } from '@/hooks/useModuleEnabled';

// Shared date range state hook
const useDateRange = () => {
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().slice(0, 10);
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10));
  return { startDate, setStartDate, endDate, setEndDate };
};



// Client-side date range filter helper
function filterByDateRange<T extends { createdAt?: string | null }>(items: T[], startDate: string, endDate: string): T[] {
  const start = new Date(startDate + 'T00:00:00').getTime();
  const end = new Date(endDate + 'T23:59:59').getTime();
  return items.filter(item => {
    if (!item.createdAt) return false;
    const t = new Date(item.createdAt).getTime();
    return t >= start && t <= end;
  });
}

// Reusable CSV export helper
const exportCSV = (filename: string, headers: string[], rows: string[][]) => {
  const csv = [headers.join(','), ...rows.map(r => r.map(c => `"${(c ?? '').toString().replace(/"/g, '""')}"`).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `${filename}.csv`; a.click();
  URL.revokeObjectURL(url);
  toast.success(`Exported ${filename}.csv`);
};

export function ReportsAssetPage() {
  const moduleEnabled = useModuleEnabled(MODULE_CODES.ASSETS);
  const [assets, setAssets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCondition, setFilterCondition] = useState<string>('all');
  const [filterCriticality, setFilterCriticality] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  useEffect(() => {
    api.get<any[]>('/api/assets').then(res => {
      if (res.success && res.data) setAssets(res.data);
      setLoading(false);
    });
  }, []);

  const filtered = assets.filter(a => {
    if (filterCondition !== 'all' && a.condition !== filterCondition) return false;
    if (filterCriticality !== 'all' && a.criticality !== filterCriticality) return false;
    if (filterStatus !== 'all' && a.status !== filterStatus) return false;
    return true;
  });

  const byCondition: Record<string, number> = {};
  const byCriticality: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  assets.forEach(a => {
    const c = a.condition || 'Unknown'; byCondition[c] = (byCondition[c] || 0) + 1;
    const cr = a.criticality || 'Unknown'; byCriticality[cr] = (byCriticality[cr] || 0) + 1;
    const s = a.status || 'Unknown'; byStatus[s] = (byStatus[s] || 0) + 1;
  });

  const conditionColors: Record<string, string> = { excellent: 'bg-emerald-100 text-emerald-700 border-emerald-200', good: 'bg-sky-100 text-sky-700 border-sky-200', fair: 'bg-amber-100 text-amber-700 border-amber-200', poor: 'bg-orange-100 text-orange-700 border-orange-200', critical: 'bg-red-100 text-red-700 border-red-200' };

  const summaryCards = [
    { label: 'Total Assets', value: assets.length, icon: Building2, color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 dark:text-emerald-400' },
    { label: 'Conditions', value: Object.keys(byCondition).length, icon: Activity, color: 'text-sky-600 bg-sky-50 dark:bg-sky-900/30 dark:text-sky-400' },
    { label: 'Critical Assets', value: byCriticality['critical'] || 0, icon: AlertTriangle, color: 'text-red-600 bg-red-50 dark:bg-red-900/30 dark:text-red-400' },
    { label: 'Active Assets', value: byStatus['active'] || byStatus['operational'] || 0, icon: CheckCircle2, color: 'text-amber-600 bg-amber-50 dark:bg-amber-900/30 dark:text-amber-400' },
  ];

  return (
    <div className="page-content">
      <div><h1 className="text-2xl font-bold tracking-tight">Asset Reports</h1><p className="text-muted-foreground mt-1">Comprehensive reports on asset register, conditions, and lifecycle</p></div>
      {!moduleEnabled ? (
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <p className="text-muted-foreground">This module is not active.</p>
            <p className="text-sm text-muted-foreground mt-1">Enable it in Settings → Modules to view this report.</p>
          </div>
        </div>
      ) : loading ? <LoadingSkeleton /> : (<>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {summaryCards.map(k => { const I = k.icon; return (
            <Card key={k.label} className="cursor-pointer hover:shadow-md transition-all"><CardContent className="p-5"><div className="flex items-center gap-4"><div className={`h-11 w-11 rounded-xl ${k.color} flex items-center justify-center`}><I className="h-5 w-5" /></div><div><p className="text-2xl font-bold">{k.value}</p><p className="text-xs text-muted-foreground">{k.label}</p></div></div></CardContent></Card>
          ); })}
        </div>
        <div className="filter-row flex items-center gap-2 flex-wrap">
          <Select value={filterCondition} onValueChange={setFilterCondition}><SelectTrigger className="w-40"><SelectValue placeholder="Condition" /></SelectTrigger><SelectContent><SelectItem value="all">All Conditions</SelectItem>{Object.keys(byCondition).map(c => <SelectItem key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</SelectItem>)}</SelectContent></Select>
          <Select value={filterCriticality} onValueChange={setFilterCriticality}><SelectTrigger className="w-40"><SelectValue placeholder="Criticality" /></SelectTrigger><SelectContent><SelectItem value="all">All Criticality</SelectItem>{Object.keys(byCriticality).map(c => <SelectItem key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</SelectItem>)}</SelectContent></Select>
          <Select value={filterStatus} onValueChange={setFilterStatus}><SelectTrigger className="w-40"><SelectValue placeholder="Status" /></SelectTrigger><SelectContent><SelectItem value="all">All Status</SelectItem>{Object.keys(byStatus).map(s => <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>)}</SelectContent></Select>
        </div>
        <Card className="border-0 shadow-sm"><Table><TableHeader><TableRow><TableHead>Name</TableHead><TableHead className="hidden sm:table-cell">Asset Tag</TableHead><TableHead className="hidden md:table-cell">Category</TableHead><TableHead>Condition</TableHead><TableHead className="hidden sm:table-cell">Criticality</TableHead><TableHead>Status</TableHead><TableHead className="hidden lg:table-cell">Location</TableHead></TableRow></TableHeader><TableBody>
          {filtered.length === 0 ? (
            <TableRow><TableCell colSpan={7} className="h-48"><EmptyState icon={Building2} title="No assets found" description="Adjust your filters or add assets to see reports." /></TableCell></TableRow>
          ) : filtered.map(asset => (
            <TableRow key={asset.id} className="hover:bg-muted/30">
              <TableCell className="font-medium">{asset.name}</TableCell>
              <TableCell className="font-mono text-xs hidden sm:table-cell">{asset.assetTag || '-'}</TableCell>
              <TableCell className="text-sm hidden md:table-cell">{typeof asset.category === 'string' ? asset.category : asset.category?.name || '-'}</TableCell>
              <TableCell><Badge variant="outline" className={conditionColors[asset.condition] || 'bg-slate-100 text-slate-700 border-slate-200'}>{(asset.condition || 'N/A').toUpperCase()}</Badge></TableCell>
              <TableCell className="hidden sm:table-cell"><Badge variant="outline" className={asset.criticality === 'critical' ? 'bg-red-50 text-red-700 border-red-200' : asset.criticality === 'high' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-slate-100 text-slate-700 border-slate-200'}>{(asset.criticality || 'N/A').toUpperCase()}</Badge></TableCell>
              <TableCell><Badge variant="outline" className={asset.status === 'active' || asset.status === 'operational' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : asset.status === 'inactive' ? 'bg-slate-100 text-slate-500 border-slate-200' : 'bg-red-50 text-red-700 border-red-200'}>{(asset.status || 'N/A').toUpperCase()}</Badge></TableCell>
              <TableCell className="text-sm text-muted-foreground hidden lg:table-cell">{asset.location || '-'}</TableCell>
            </TableRow>
          ))}
        </TableBody></Table></Card>
      </>)}
    </div>
  );
}
// ============================================================================
// Reusable Export Button Group
// ============================================================================
function ExportButtonGroup({ onExportCSV, onExportPDF, onPrint, disabled }: {
  onExportCSV: () => void; onExportPDF: () => void; onPrint: () => void; disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Button variant="outline" size="sm" onClick={onExportCSV} disabled={disabled} title="Export to Excel/CSV">
        <FileSpreadsheet className="h-3.5 w-3.5 mr-1" />Excel
      </Button>
      <Button variant="outline" size="sm" onClick={onExportPDF} disabled={disabled} title="Export to PDF">
        <FileDown className="h-3.5 w-3.5 mr-1" />PDF
      </Button>
      <Button variant="outline" size="sm" onClick={onPrint} disabled={disabled} title="Print this report">
        <Printer className="h-3.5 w-3.5 mr-1" />Print
      </Button>
    </div>
  );
}

// ============================================================================
// Per-Asset WO Table (expandable with individual export buttons)
// ============================================================================
function AssetWOTable({ asset, typeColorMap }: { asset: any; typeColorMap: Record<string, string> }) {
  const [open, setOpen] = useState(false);
  const pmEnabled = useModuleEnabled(MODULE_CODES.PM_SCHEDULES);
  const repairsEnabled = useModuleEnabled(MODULE_CODES.REPAIRS);

  const getWoModuleLabel = (type: string): string | null => {
    if (type === 'preventive') return 'PM';
    if (type === 'corrective' || type === 'emergency') return 'Repair';
    return null;
  };

  const handleAssetExcel = () => {
    const headers = ['WO #', 'Title', 'Type', 'Priority', 'Status', 'Assigned To', 'Est Hrs', 'Act Hrs', 'Cost', 'Created'];
    const rows = asset.workOrders.map((wo: any) => [
      wo.woNumber, wo.title, wo.type, wo.priority, wo.status,
      wo.assigneeName || '', String(wo.estimatedHours ?? ''), String(wo.actualHours ?? ''),
      String(wo.totalCost), wo.createdAt ? formatDate(wo.createdAt) : '',
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.map(c => `"${(c ?? '').toString().replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${asset.assetName.replace(/[^a-zA-Z0-9]/g, '_')}-WOs.csv`; a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${asset.assetName} WOs to CSV`);
  };

  const handleAssetPDF = () => {
    exportPDF({
      title: `${asset.assetName} — Work Order Report`,
      subtitle: `WO Count: ${asset.woCount} | Completion: ${asset.completionRate}% | Cost: ${formatCurrency(asset.totalCost)}`,
      filename: `${asset.assetName.replace(/[^a-zA-Z0-9]/g, '_')}-WOs`,
      orientation: 'landscape',
      summary: [
        { label: 'Asset/Machine', value: asset.assetName },
        { label: 'Total WOs', value: String(asset.woCount) },
        { label: 'Completion Rate', value: `${asset.completionRate}%` },
        { label: 'Total Cost', value: formatCurrency(asset.totalCost) },
        { label: 'Total Hours', value: formatDuration(asset.totalActualHours) },
        { label: 'Total Downtime', value: formatDuration(asset.totalDowntimeMinutes / 60) },
      ],
      headers: ['WO #', 'Title', 'Type', 'Priority', 'Status', 'Assigned To', 'Est Hrs', 'Act Hrs', 'Cost'],
      rows: asset.workOrders.map((wo: any) => [
        wo.woNumber, wo.title, wo.type, wo.priority, wo.status,
        wo.assigneeName || '-', String(wo.estimatedHours ?? '-'), String(wo.actualHours ?? '-'),
        formatCurrency(wo.totalCost),
      ]),
    });
  };

  const handleAssetPrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    const html = `
      <html><head><title>${asset.assetName} — WO Report</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 20px; }
        h1 { font-size: 18px; margin-bottom: 4px; }
        .subtitle { font-size: 12px; color: #666; margin-bottom: 16px; }
        table { width: 100%; border-collapse: collapse; font-size: 11px; }
        th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: left; }
        th { background: #f5f5f5; font-weight: 600; }
        .right { text-align: right; }
        .summary { display: flex; gap: 24px; margin-bottom: 16px; font-size: 12px; }
        .summary span { font-weight: 600; }
      </style></head><body>
      <h1>${asset.assetName}</h1>
      <div class="subtitle">WO Count: ${asset.woCount} | Completion: ${asset.completionRate}% | Cost: ${formatCurrency(asset.totalCost)} | Downtime: ${formatDuration(asset.totalDowntimeMinutes / 60)}</div>
      <table>
        <thead><tr><th>WO #</th><th>Title</th><th>Type</th><th>Priority</th><th>Status</th><th>Assigned To</th><th class="right">Est Hrs</th><th class="right">Act Hrs</th><th class="right">Cost</th><th>Created</th></tr></thead>
        <tbody>${asset.workOrders.map((wo: any) => `<tr>
          <td>${wo.woNumber}</td><td>${wo.title}</td><td>${wo.type}</td><td>${wo.priority}</td><td>${wo.status}</td>
          <td>${wo.assigneeName || '-'}</td><td class="right">${wo.estimatedHours ?? '-'}</td><td class="right">${wo.actualHours ?? '-'}</td>
          <td class="right">${formatCurrency(wo.totalCost)}</td><td>${wo.createdAt ? formatDate(wo.createdAt) : '-'}</td>
        </tr>`).join('')}</tbody>
      </table></body></html>`;
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.print();
  };

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <TableRow className="cursor-pointer hover:bg-muted/50 bg-muted/20">
          <TableCell>
            <div className="flex items-center gap-2">
              {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
              <span className="font-semibold">{asset.assetName}</span>
            </div>
          </TableCell>
          <TableCell className="text-right font-medium">{asset.woCount}</TableCell>
          <TableCell className="text-right">
            <span className={asset.completionRate >= 80 ? 'text-emerald-600' : asset.completionRate >= 50 ? 'text-amber-600' : 'text-red-600'}>
              {asset.completionRate}%
            </span>
          </TableCell>
          <TableCell className="text-right">{formatDuration(asset.totalDowntimeMinutes / 60)}</TableCell>
          <TableCell className="text-right">{formatDuration(asset.totalActualHours)}</TableCell>
          <TableCell className="text-right font-medium">{formatCurrency(asset.totalCost)}</TableCell>
        </TableRow>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <tr><td colSpan={6} className="p-0">
          <div className="bg-muted/10 border-y">
            {/* Per-asset export buttons */}
            <div className="flex items-center justify-between px-4 pt-3 pb-1">
              <span className="text-xs font-medium text-muted-foreground">{asset.woCount} work orders for {asset.assetName}</span>
              <div className="flex items-center gap-1.5">
                <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); handleAssetExcel(); }} title="Export this asset to Excel/CSV">
                  <FileSpreadsheet className="h-3 w-3 mr-1" />Excel
                </Button>
                <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); handleAssetPDF(); }} title="Export this asset to PDF">
                  <FileDown className="h-3 w-3 mr-1" />PDF
                </Button>
                <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); handleAssetPrint(); }} title="Print this asset report">
                  <Printer className="h-3 w-3 mr-1" />Print
                </Button>
              </div>
            </div>
            <Table className="table-fixed min-w-[1080px]">
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="text-xs">WO #</TableHead>
                  <TableHead className="text-xs">Title</TableHead>
                  <TableHead className="text-xs hidden sm:table-cell">Type</TableHead>
                  <TableHead className="text-xs">Priority</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-xs hidden md:table-cell">Assigned To</TableHead>
                  <TableHead className="text-xs text-right hidden md:table-cell">Est Hrs</TableHead>
                  <TableHead className="text-xs text-right hidden md:table-cell">Act Hrs</TableHead>
                  <TableHead className="text-xs text-right hidden lg:table-cell">Cost</TableHead>
                  <TableHead className="text-xs hidden lg:table-cell">Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {asset.workOrders.map((wo: any) => (
                  <TableRow key={wo.id} className="hover:bg-muted/20">
                    <TableCell className="font-mono text-xs">{wo.woNumber}</TableCell>
                    <TableCell className="text-sm max-w-[160px] truncate">{wo.title}</TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <div className="flex items-center gap-1">
                        <Badge variant="outline" className={`${typeColorMap[wo.type] || 'bg-slate-100 text-slate-700'} text-white border-0 text-[10px]`}>
                          {wo.type?.toUpperCase()}
                        </Badge>
                        {getWoModuleLabel(wo.type) && (
                          <Badge variant="outline" className={`${getWoModuleLabel(wo.type) === 'PM' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-amber-100 text-amber-700 border-amber-200'} text-[9px] px-1.5`}>
                            {getWoModuleLabel(wo.type)}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell><PriorityBadge priority={wo.priority} /></TableCell>
                    <TableCell><StatusBadge status={wo.status} /></TableCell>
                    <TableCell className="text-xs hidden md:table-cell">{wo.assigneeName || '-'}</TableCell>
                    <TableCell className="text-xs text-right hidden md:table-cell">{wo.estimatedHours ?? '-'}</TableCell>
                    <TableCell className="text-xs text-right hidden md:table-cell">{wo.actualHours ?? '-'}</TableCell>
                    <TableCell className="text-xs text-right hidden lg:table-cell">{formatCurrency(wo.totalCost)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground hidden lg:table-cell whitespace-nowrap">{wo.createdAt ? formatDate(wo.createdAt) : '-'}</TableCell>
                  </TableRow>
                ))}
                {asset.workOrders.length === 0 && (
                  <TableRow><TableCell colSpan={10} className="text-center py-4 text-sm text-muted-foreground">No work orders</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </td></tr>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function ReportsMaintenancePage() {
  const moduleEnabled = useModuleEnabled(MODULE_CODES.WORK_ORDERS);
  const pmEnabled = useModuleEnabled(MODULE_CODES.PM_SCHEDULES);
  const repairsEnabled = useModuleEnabled(MODULE_CODES.REPAIRS);
  const subModuleEnabled = pmEnabled || repairsEnabled;
  const { startDate, setStartDate, endDate, setEndDate } = useDateRange();
  const [reportData, setReportData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('assets');
  const [techSort, setTechSort] = useState<'completedCount' | 'avgHoursPerWO' | 'totalHours'>('completedCount');

  const fetchReport = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    api.get<any>(`/api/reports/maintenance?${params.toString()}`).then(res => {
      if (res.success && res.data) setReportData(res.data);
      else setReportData(null);
      setLoading(false);
    }).catch(() => { setReportData(null); setLoading(false); });
  }, [startDate, endDate]);

  useEffect(() => { fetchReport(); }, [fetchReport]);

  const s = reportData?.summary;
  const recentWOs = reportData?.recentWorkOrders || [];
  const workOrdersByAsset = reportData?.workOrdersByAsset || [];

  const kpiCards = [
    { label: 'Total Work Orders', value: s?.totalWOs ?? 0, icon: ClipboardList, color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 dark:text-emerald-400', tab: 'data' as const },
    { label: 'Completion Rate', value: `${s?.completionRate ?? 0}%`, icon: CheckCircle2, color: 'text-sky-600 bg-sky-50 dark:bg-sky-900/30 dark:text-sky-400', tab: 'overview' as const },
    { label: 'Avg Completion Time', value: `${s?.avgCompletionHours ?? 0}h`, icon: Clock, color: 'text-amber-600 bg-amber-50 dark:bg-amber-900/30 dark:text-amber-400', tab: 'technicians' as const },
    { label: 'Avg Cost / WO', value: formatCurrency(s?.avgCostPerWO), icon: DollarSign, color: 'text-teal-600 bg-teal-50 dark:bg-teal-900/30 dark:text-teal-400', tab: 'materials' as const },
    { label: 'SLA Compliance', value: `${s?.slaComplianceRate ?? 0}%`, icon: ShieldCheck, color: 'text-violet-600 bg-violet-50 dark:bg-violet-900/30 dark:text-violet-400', tab: 'overview' as const },
    { label: 'Overdue', value: s?.overdueWOs ?? 0, icon: AlertTriangle, color: 'text-red-600 bg-red-50 dark:bg-red-900/30 dark:text-red-400', tab: 'data' as const },
  ];

  // WO type colors
  const typeColorMap: Record<string, string> = { preventive: 'bg-emerald-500', corrective: 'bg-amber-500', emergency: 'bg-red-500', inspection: 'bg-sky-500', predictive: 'bg-violet-500', project: 'bg-teal-500' };
  const priorityColorMap: Record<string, string> = { low: 'bg-slate-400', medium: 'bg-sky-500', high: 'bg-amber-500', critical: 'bg-red-500', emergency: 'bg-red-600' };

  // Chart colors
  const CHART_COLORS = ['#059669', '#0ea5e9', '#f59e0b', '#ef4444', '#8b5cf6', '#14b8a6', '#f97316', '#6366f1'];

  const reportLabel = `Maintenance Report — ${startDate} to ${endDate}`;

  // ============================================================================
  // EXPORT HANDLERS PER TAB
  // ============================================================================

  // --- ASSET TAB EXPORTS ---
  const handleAssetCSV = () => {
    if (!reportData) return;
    const rows: string[][] = [];
    workOrdersByAsset.forEach((a: any) => {
      rows.push([a.assetName, '', `WO Count: ${a.woCount}`, `Completion: ${a.completionRate}%`, `Total Cost: ${a.totalCost}`, '']);
      rows.push(['WO #', 'Title', 'Type', 'Priority', 'Status', 'Assigned To', 'Est Hrs', 'Act Hrs', 'Cost', 'Created']);
      a.workOrders.forEach((wo: any) => {
        rows.push([wo.woNumber, wo.title, wo.type, wo.priority, wo.status, wo.assigneeName || '', String(wo.estimatedHours ?? ''), String(wo.actualHours ?? ''), String(wo.totalCost), wo.createdAt ? formatDate(wo.createdAt) : '']);
      });
      rows.push([]);
    });
    exportCSV(`asset-wos-${startDate}-to-${endDate}`, rows[1] || ['Asset', 'WO #', 'Title', 'Type', 'Priority', 'Status', 'Assigned To', 'Est Hrs', 'Act Hrs', 'Cost', 'Created'], rows.filter(r => r.some(c => c)));
  };

  const handleAssetPDF = () => {
    if (!reportData) return;
    const headers = ['Asset', 'WO #', 'Title', 'Type', 'Priority', 'Status', 'Assigned To', 'Est Hrs', 'Act Hrs', 'Cost'];
    const rows: string[][] = [];
    workOrdersByAsset.forEach((a: any) => {
      a.workOrders.forEach((wo: any) => {
        rows.push([a.assetName, wo.woNumber, wo.title, wo.type, wo.priority, wo.status, wo.assigneeName || '-', String(wo.estimatedHours ?? '-'), String(wo.actualHours ?? '-'), formatCurrency(wo.totalCost)]);
      });
    });
    exportPDF({
      title: `Asset/Machine WO Report — ${startDate} to ${endDate}`,
      subtitle: `Generated: ${format(new Date(), 'MMM d, yyyy HH:mm')}`,
      filename: `asset-wo-report-${startDate}-to-${endDate}`,
      orientation: 'landscape',
      summary: [
        { label: 'Total Assets/Machines', value: String(workOrdersByAsset.length) },
        { label: 'Total WOs', value: String(s?.totalWOs ?? 0) },
        { label: 'Completion Rate', value: `${s?.completionRate ?? 0}%` },
        { label: 'Total Cost', value: formatCurrency(s?.totalCost) },
      ],
      headers,
      rows,
    });
  };

  const handleAssetPrint = () => { window.print(); };

  // --- OVERVIEW TAB EXPORTS ---
  const handleOverviewCSV = () => {
    if (!reportData || !s) return;
    const rows: string[][] = [];
    rows.push(['--- Work Orders by Type ---']);
    rows.push(['Type', 'Count']);
    (reportData.woByType || []).forEach((t: any) => rows.push([t.type, String(t.count)]));
    rows.push([]);
    rows.push(['--- Work Orders by Priority ---']);
    rows.push(['Priority', 'Count']);
    (reportData.woByPriority || []).forEach((p: any) => rows.push([p.priority, String(p.count)]));
    rows.push([]);
    rows.push(['--- Work Orders by Status ---']);
    rows.push(['Status', 'Count']);
    (reportData.woByStatus || []).forEach((st: any) => rows.push([st.status, String(st.count)]));
    rows.push([]);
    rows.push(['--- Monthly WO Trend ---']);
    rows.push(['Month', 'Created', 'Completed']);
    (reportData.woByMonth || []).forEach((m: any) => rows.push([m.month, String(m.count), String(m.completedCount)]));
    exportCSV(`maintenance-overview-${startDate}-to-${endDate}`, ['Section', 'Field', 'Value'], rows);
  };

  const handleOverviewPDF = () => {
    if (!reportData || !s) return;
    exportPDF({
      title: reportLabel,
      subtitle: `Generated: ${format(new Date(), 'MMM d, yyyy HH:mm')}`,
      filename: `maintenance-report-${startDate}-to-${endDate}`,
      orientation: 'landscape',
      summary: [
        { label: 'Total WOs', value: String(s.totalWOs) },
        { label: 'Completed', value: `${s.completedWOs} (${s.completionRate}%)` },
        { label: 'Avg Completion Time', value: formatDuration(s.avgCompletionHours) },
        { label: 'Avg Cost/WO', value: formatCurrency(s.avgCostPerWO) },
        { label: 'Total Cost', value: formatCurrency(s.totalCost) },
        { label: 'SLA Compliance', value: `${s.slaComplianceRate}%` },
        { label: 'Overdue', value: String(s.overdueWOs) },
      ],
      headers: ['WO Number', 'Title', 'Type', 'Priority', 'Status', 'Asset', 'Assigned To', 'Est Hours', 'Actual Hours', 'Total Cost', 'Created'],
      rows: recentWOs.slice(0, 50).map((wo: any) => [
        wo.woNumber || '', wo.title || '', wo.type || '', wo.priority || '', wo.status || '',
        wo.assetName || '-', wo.assigneeName || '-',
        wo.estimatedHours?.toString() || '-', wo.actualHours?.toString() || '-',
        formatCurrency(wo.totalCost), wo.createdAt ? formatDate(wo.createdAt) : '-',
      ]),
    });
  };

  // --- TECHNICIAN TAB EXPORTS ---
  const handleTechCSV = () => {
    if (!reportData) return;
    const techs = reportData.technicianProductivity || [];
    exportCSV(
      `technician-productivity-${startDate}-to-${endDate}`,
      ['Technician', 'Assigned', 'Completed', 'Avg Hrs/WO', 'Total Hours'],
      techs.map((t: any) => [t.userName, String(t.assignedCount), String(t.completedCount), String(t.avgHoursPerWO), String(t.totalHours)]),
    );
  };
  const handleTechPDF = () => {
    if (!reportData) return;
    const techs = reportData.technicianProductivity || [];
    exportPDF({
      title: `Technician Productivity — ${startDate} to ${endDate}`,
      subtitle: `Generated: ${format(new Date(), 'MMM d, yyyy HH:mm')}`,
      filename: `technician-productivity-${startDate}-to-${endDate}`,
      orientation: 'landscape',
      summary: [
        { label: 'Total Technicians', value: String(techs.length) },
        { label: 'Total WOs Assigned', value: String(techs.reduce((s: number, t: any) => s + t.assignedCount, 0)) },
        { label: 'Total WOs Completed', value: String(techs.reduce((s: number, t: any) => s + t.completedCount, 0)) },
      ],
      headers: ['Technician', 'Assigned', 'Completed', 'Avg Hrs/WO', 'Total Hours'],
      rows: techs.map((t: any) => [t.userName, String(t.assignedCount), String(t.completedCount), String(t.avgHoursPerWO), String(t.totalHours)]),
    });
  };

  // --- MATERIALS TAB EXPORTS ---
  const handleMaterialsCSV = () => {
    if (!reportData) return;
    exportCSV(
      `material-consumption-${startDate}-to-${endDate}`,
      ['Item Name', 'Assets / Machines', 'Total Qty', 'Total Cost', 'WO Count'],
      (reportData.materialConsumption || []).map((m: any) => [m.itemName, (m.assets || []).join('; ') || 'Unassigned', String(m.totalQuantity), String(m.totalCost), String(m.woCount)]),
    );
  };
  const handleMaterialsPDF = () => {
    if (!reportData) return;
    exportPDF({
      title: `Material Consumption — ${startDate} to ${endDate}`,
      subtitle: `Generated: ${format(new Date(), 'MMM d, yyyy HH:mm')}`,
      filename: `material-consumption-${startDate}-to-${endDate}`,
      orientation: 'landscape',
      summary: [
        { label: 'Total Items', value: String((reportData.materialConsumption || []).length) },
        { label: 'Total Cost', value: formatCurrency(s?.totalCost) },
      ],
      headers: ['Item Name', 'Assets / Machines', 'Total Qty', 'Total Cost', 'WO Count'],
      rows: (reportData.materialConsumption || []).map((m: any) => [m.itemName, (m.assets || []).join(', ') || 'Unassigned', String(m.totalQuantity), formatCurrency(m.totalCost), String(m.woCount)]),
    });
  };

  // --- DOWNTIME TAB EXPORTS ---
  const handleDowntimeCSV = () => {
    if (!reportData) return;
    const dt = reportData.downtimeAnalysis || {};
    const rows: string[][] = [];
    rows.push(['--- Downtime by Category ---']);
    rows.push(['Category', 'Events', 'Total Minutes']);
    (dt.byCategory || []).forEach((d: any) => rows.push([d.category, String(d.count), String(d.totalMinutes)]));
    rows.push([]);
    rows.push(['--- Downtime by Impact Level ---']);
    rows.push(['Impact Level', 'Events']);
    (dt.byImpactLevel || []).forEach((d: any) => rows.push([d.impactLevel, String(d.count)]));
    exportCSV(`downtime-analysis-${startDate}-to-${endDate}`, ['Section', 'Field', 'Value'], rows);
  };
  const handleDowntimePDF = () => {
    if (!reportData) return;
    const dt = reportData.downtimeAnalysis || {};
    exportPDF({
      title: `Downtime Analysis — ${startDate} to ${endDate}`,
      subtitle: `Generated: ${format(new Date(), 'MMM d, yyyy HH:mm')}`,
      filename: `downtime-analysis-${startDate}-to-${endDate}`,
      orientation: 'landscape',
      summary: [
        { label: 'Total Events', value: String(dt.totalEvents ?? 0) },
        { label: 'Total Minutes', value: String(dt.totalMinutes ?? 0) },
        { label: 'Avg Duration', value: `${dt.avgDurationMinutes ?? 0} min` },
      ],
      headers: ['Category', 'Events', 'Total Minutes'],
      rows: (dt.byCategory || []).map((d: any) => [d.category, String(d.count), String(d.totalMinutes)]),
    });
  };

  // --- DETAILED DATA TAB EXPORTS ---
  const handleDataCSV = () => {
    if (!reportData) return;
    exportCSV(
      `wo-detailed-${startDate}-to-${endDate}`,
      ['WO Number', 'Title', 'Type', 'Priority', 'Status', 'Asset', 'Assigned To', 'Team Leader', 'Est Hours', 'Act Hours', 'Material Cost', 'Labor Cost', 'Total Cost', 'Created', 'Completed'],
      recentWOs.map((wo: any) => [
        wo.woNumber || '', wo.title || '', wo.type || '', wo.priority || '', wo.status || '',
        wo.assetName || '-', wo.assigneeName || '-', wo.teamLeaderName || '-',
        wo.estimatedHours?.toString() || '', wo.actualHours?.toString() || '',
        (wo.materialCost || 0).toString(), (wo.laborCost || 0).toString(), (wo.totalCost || 0).toString(),
        wo.createdAt ? formatDate(wo.createdAt) : '', wo.completedDate ? formatDate(wo.completedDate) : '',
      ]),
    );
  };
  const handleDataPDF = () => {
    if (!reportData || !s) return;
    exportPDF({
      title: reportLabel,
      subtitle: `Generated: ${format(new Date(), 'MMM d, yyyy HH:mm')}`,
      filename: `maintenance-report-${startDate}-to-${endDate}`,
      orientation: 'landscape',
      summary: [
        { label: 'Total WOs', value: String(s.totalWOs) },
        { label: 'Completed', value: `${s.completedWOs} (${s.completionRate}%)` },
        { label: 'Total Cost', value: formatCurrency(s.totalCost) },
        { label: 'SLA Compliance', value: `${s.slaComplianceRate}%` },
      ],
      headers: ['WO #', 'Title', 'Type', 'Priority', 'Status', 'Asset', 'Assigned To', 'Est Hrs', 'Act Hrs', 'Total Cost', 'Created'],
      rows: recentWOs.slice(0, 200).map((wo: any) => [
        wo.woNumber || '', wo.title || '', wo.type || '', wo.priority || '', wo.status || '',
        wo.assetName || '-', wo.assigneeName || '-',
        wo.estimatedHours?.toString() || '-', wo.actualHours?.toString() || '-',
        formatCurrency(wo.totalCost), wo.createdAt ? formatDate(wo.createdAt) : '-',
      ]),
    });
  };

  // Technician sort handler
  const sortedTechnicians = useMemo(() => {
    const techs = reportData?.technicianProductivity || [];
    return [...techs].sort((a: any, b: any) => (b[techSort] || 0) - (a[techSort] || 0));
  }, [reportData, techSort]);

  if (loading && !reportData) return <div className="page-content"><LoadingSkeleton /></div>;

  if (!moduleEnabled || !subModuleEnabled) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <p className="text-muted-foreground">Maintenance report modules are not active.</p>
          <p className="text-sm text-muted-foreground mt-1">Enable PM Schedules and/or Repairs modules in Settings → Modules to view this report.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-content" id="maintenance-report-printable">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3 print:hidden">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Maintenance Reports</h1>
          <p className="text-muted-foreground mt-1">Comprehensive maintenance analytics with date range filtering and export capabilities</p>
        </div>
      </div>

      {/* Date Range + Generate */}
      <div className="flex items-center gap-3 flex-wrap print:hidden">
        <Card className="border border-border/60 shadow-sm"><CardContent className="p-4">
          <DateRangePicker label="Date Range" from={startDate || undefined} to={endDate || undefined} onChange={(f, t) => { setStartDate(f || ''); setEndDate(t || ''); }} />
        </CardContent></Card>
        <Button size="sm" onClick={fetchReport} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1.5" />}
          Generate Report
        </Button>
      </div>

      {loading && <LoadingSkeleton />}
      {!loading && reportData && (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-4 print:grid-cols-3 print:gap-2">
            {kpiCards.map(k => { const I = k.icon; return (
              <Card key={k.label} className="border border-border/60 shadow-sm print:shadow-none print:border cursor-pointer hover:shadow-md transition-all" onClick={() => k.tab && setActiveTab(k.tab)}><CardContent className="p-4 print:p-2">
                <div className="flex items-center gap-3">
                  <div className={`h-10 w-10 rounded-xl ${k.color} flex items-center justify-center shrink-0 print:hidden`}><I className="h-4.5 w-4.5" /></div>
                  <div className="min-w-0">
                    <p className="text-xl font-bold truncate">{k.value}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{k.label}</p>
                  </div>
                </div>
              </CardContent></Card>
            ); })}
          </div>

          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="flex-wrap h-auto gap-1 print:hidden">
              <TabsTrigger value="assets" className="text-xs"><Building2 className="h-3.5 w-3.5 mr-1" />By Asset/Machine</TabsTrigger>
              <TabsTrigger value="overview" className="text-xs"><BarChart3 className="h-3.5 w-3.5 mr-1" />Overview</TabsTrigger>
              <TabsTrigger value="technicians" className="text-xs"><Users className="h-3.5 w-3.5 mr-1" />Technician Productivity</TabsTrigger>
              <TabsTrigger value="materials" className="text-xs"><Package className="h-3.5 w-3.5 mr-1" />Materials & Costs</TabsTrigger>
              <TabsTrigger value="downtime" className="text-xs"><Clock className="h-3.5 w-3.5 mr-1" />Downtime</TabsTrigger>
              <TabsTrigger value="data" className="text-xs"><FileText className="h-3.5 w-3.5 mr-1" />Detailed Data</TabsTrigger>
            </TabsList>

            {/* Tab 1: By Asset/Machine (DEFAULT) */}
            <TabsContent value="assets" className="space-y-4 mt-6">
              <div className="flex items-center justify-between print:hidden">
                <div>
                  <h3 className="text-base font-semibold">Work Orders by Asset / Machine</h3>
                  <p className="text-xs text-muted-foreground">{workOrdersByAsset.length} assets/machines with work orders — click a row to expand</p>
                </div>
                <ExportButtonGroup onExportCSV={handleAssetCSV} onExportPDF={handleAssetPDF} onPrint={handleAssetPrint} disabled={!reportData} />
              </div>

              {/* Summary cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 print:grid-cols-4 print:gap-2">
                <Card className="border border-border/60 shadow-sm print:shadow-none print:border"><CardContent className="p-3 print:p-1.5 text-center">
                  <p className="text-lg font-bold">{workOrdersByAsset.length}</p><p className="text-[11px] text-muted-foreground">Assets/Machines</p>
                </CardContent></Card>
                <Card className="border border-border/60 shadow-sm print:shadow-none print:border"><CardContent className="p-3 print:p-1.5 text-center">
                  <p className="text-lg font-bold">{workOrdersByAsset.reduce((s: number, a: any) => s + a.woCount, 0)}</p><p className="text-[11px] text-muted-foreground">Total WOs</p>
                </CardContent></Card>
                <Card className="border border-border/60 shadow-sm print:shadow-none print:border"><CardContent className="p-3 print:p-1.5 text-center">
                  <p className="text-lg font-bold text-emerald-600">{formatCurrency(workOrdersByAsset.reduce((s: number, a: any) => s + a.totalCost, 0))}</p><p className="text-[11px] text-muted-foreground">Total Cost</p>
                </CardContent></Card>
                <Card className="border border-border/60 shadow-sm print:shadow-none print:border"><CardContent className="p-3 print:p-1.5 text-center">
                  <p className="text-lg font-bold">{formatDuration(workOrdersByAsset.reduce((s: number, a: any) => s + a.totalDowntimeMinutes / 60, 0))}</p><p className="text-[11px] text-muted-foreground">Total Downtime</p>
                </CardContent></Card>
              </div>

              {/* Per-asset table with expandable rows */}
              <Card className="border border-border/60 shadow-sm print:shadow-none print:border">
                <CardContent className="p-0">
                  <div className="overflow-x-auto max-h-[700px] overflow-y-auto">
                    <Table className="table-fixed min-w-[920px]">
                      <TableHeader className="sticky top-0 bg-background z-10">
                        <TableRow>
                          <TableHead className="w-[34%]">Asset / Machine</TableHead>
                          <TableHead className="w-[12%] text-right">WO Count</TableHead>
                          <TableHead className="w-[12%] text-right">Completion</TableHead>
                          <TableHead className="w-[14%] text-right">Downtime</TableHead>
                          <TableHead className="w-[14%] text-right">Total Hours</TableHead>
                          <TableHead className="w-[14%] text-right">Total Cost</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {workOrdersByAsset.length === 0 ? (
                          <TableRow><TableCell colSpan={6}><EmptyState icon={Building2} title="No asset data" description="Assets with work orders will appear here." /></TableCell></TableRow>
                        ) : workOrdersByAsset.map((asset: any) => (
                          <AssetWOTable key={asset.assetName} asset={asset} typeColorMap={typeColorMap} />
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Tab 2: Overview */}
            <TabsContent value="overview" className="space-y-6 mt-6">
              <div className="flex items-center justify-end print:hidden">
                <ExportButtonGroup onExportCSV={handleOverviewCSV} onExportPDF={handleOverviewPDF} onPrint={() => window.print()} disabled={!reportData} />
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card className="border border-border/60 shadow-sm print:shadow-none print:border">
                  <CardHeader className="pb-3"><CardTitle className="text-base">Work Orders by Type</CardTitle><CardDescription className="text-xs">Distribution of WO types</CardDescription></CardHeader>
                  <CardContent>
                    {(reportData.woByType || []).length > 0 ? (
                      <ResponsiveContainer width="100%" height={200}>
                        <BarChart data={reportData.woByType} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                          <XAxis dataKey="type" tick={{ fontSize: 11 }} />
                          <YAxis tick={{ fontSize: 11 }} />
                          <Tooltip />
                          <Bar dataKey="count" name="Count" radius={[4, 4, 0, 0]}>
                            {(reportData.woByType || []).map((_: any, i: number) => (
                              <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    ) : <EmptyState icon={BarChart3} title="No type data" description="Work orders will appear here." />}
                    {/* Tabular summary below chart */}
                    {(reportData.woByType || []).length > 0 && (
                      <div className="mt-4 border-t pt-3">
                        <Table><TableHeader><TableRow><TableHead className="text-xs">Type</TableHead><TableHead className="text-xs text-right">Count</TableHead><TableHead className="text-xs text-right">%</TableHead></TableRow></TableHeader>
                        <TableBody>
                          {reportData.woByType.map((t: any) => (
                            <TableRow key={t.type} className="hover:bg-muted/30">
                              <TableCell className="text-sm font-medium capitalize"><Badge variant="outline" className={`${typeColorMap[t.type] || 'bg-slate-100 text-slate-700'} text-white border-0 text-[10px] mr-2`}>{t.type?.toUpperCase()}</Badge>{t.type}</TableCell>
                              <TableCell className="text-sm text-right font-medium">{t.count}</TableCell>
                              <TableCell className="text-sm text-right text-muted-foreground">{s?.totalWOs ? Math.round((t.count / s.totalWOs) * 100) : 0}%</TableCell>
                            </TableRow>
                          ))}
                        </TableBody></Table>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card className="border border-border/60 shadow-sm print:shadow-none print:border">
                  <CardHeader className="pb-3"><CardTitle className="text-base">Work Orders by Priority</CardTitle><CardDescription className="text-xs">Priority level breakdown</CardDescription></CardHeader>
                  <CardContent>
                    {(reportData.woByPriority || []).length > 0 ? (
                      <ResponsiveContainer width="100%" height={200}>
                        <BarChart data={reportData.woByPriority} layout="vertical" margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                          <XAxis type="number" tick={{ fontSize: 11 }} />
                          <YAxis type="category" dataKey="priority" tick={{ fontSize: 11 }} width={80} />
                          <Tooltip />
                          <Bar dataKey="count" name="Count" radius={[0, 4, 4, 0]}>
                            {(reportData.woByPriority || []).map((entry: any) => (
                              <Cell key={entry.priority} fill={priorityColorMap[entry.priority] || CHART_COLORS[0]} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    ) : <EmptyState icon={BarChart3} title="No priority data" description="Work orders will appear here." />}
                    {(reportData.woByPriority || []).length > 0 && (
                      <div className="mt-4 border-t pt-3">
                        <Table><TableHeader><TableRow><TableHead className="text-xs">Priority</TableHead><TableHead className="text-xs text-right">Count</TableHead><TableHead className="text-xs text-right">%</TableHead></TableRow></TableHeader>
                        <TableBody>
                          {reportData.woByPriority.map((p: any) => (
                            <TableRow key={p.priority} className="hover:bg-muted/30">
                              <TableCell className="text-sm font-medium capitalize"><PriorityBadge priority={p.priority} /> {p.priority}</TableCell>
                              <TableCell className="text-sm text-right font-medium">{p.count}</TableCell>
                              <TableCell className="text-sm text-right text-muted-foreground">{s?.totalWOs ? Math.round((p.count / s.totalWOs) * 100) : 0}%</TableCell>
                            </TableRow>
                          ))}
                        </TableBody></Table>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card className="border border-border/60 shadow-sm print:shadow-none print:border">
                  <CardHeader className="pb-3"><CardTitle className="text-base">Work Orders by Status</CardTitle><CardDescription className="text-xs">Current status distribution</CardDescription></CardHeader>
                  <CardContent>
                    {(reportData.woByStatus || []).length > 0 ? (
                      <ResponsiveContainer width="100%" height={200}>
                        <BarChart data={reportData.woByStatus} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                          <XAxis dataKey="status" tick={{ fontSize: 10 }} angle={-25} textAnchor="end" height={50} />
                          <YAxis tick={{ fontSize: 11 }} />
                          <Tooltip />
                          <Bar dataKey="count" name="Count" fill="#059669" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : <EmptyState icon={BarChart3} title="No status data" description="Work orders will appear here." />}
                    {(reportData.woByStatus || []).length > 0 && (
                      <div className="mt-4 border-t pt-3">
                        <Table><TableHeader><TableRow><TableHead className="text-xs">Status</TableHead><TableHead className="text-xs text-right">Count</TableHead><TableHead className="text-xs text-right">%</TableHead></TableRow></TableHeader>
                        <TableBody>
                          {reportData.woByStatus.map((st: any) => (
                            <TableRow key={st.status} className="hover:bg-muted/30">
                              <TableCell className="text-sm font-medium"><StatusBadge status={st.status} /> {st.status}</TableCell>
                              <TableCell className="text-sm text-right font-medium">{st.count}</TableCell>
                              <TableCell className="text-sm text-right text-muted-foreground">{s?.totalWOs ? Math.round((st.count / s.totalWOs) * 100) : 0}%</TableCell>
                            </TableRow>
                          ))}
                        </TableBody></Table>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card className="border border-border/60 shadow-sm print:shadow-none print:border">
                  <CardHeader className="pb-3"><CardTitle className="text-base">Monthly WO Trend</CardTitle><CardDescription className="text-xs">Created vs completed by month</CardDescription></CardHeader>
                  <CardContent>
                    {(reportData.woByMonth || []).length > 0 ? (
                      <ResponsiveContainer width="100%" height={200}>
                        <BarChart data={reportData.woByMonth} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                          <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                          <YAxis tick={{ fontSize: 11 }} />
                          <Tooltip />
                          <Legend />
                          <Bar dataKey="count" name="Created" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="completedCount" name="Completed" fill="#059669" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : <EmptyState icon={TrendingUp} title="No monthly data" description="Work orders will appear here over time." />}
                    {(reportData.woByMonth || []).length > 0 && (
                      <div className="mt-4 border-t pt-3">
                        <Table><TableHeader><TableRow><TableHead className="text-xs">Month</TableHead><TableHead className="text-xs text-right">Created</TableHead><TableHead className="text-xs text-right">Completed</TableHead><TableHead className="text-xs text-right">Completion %</TableHead></TableRow></TableHeader>
                        <TableBody>
                          {reportData.woByMonth.map((m: any) => (
                            <TableRow key={m.month} className="hover:bg-muted/30">
                              <TableCell className="text-sm font-medium font-mono">{m.month}</TableCell>
                              <TableCell className="text-sm text-right">{m.count}</TableCell>
                              <TableCell className="text-sm text-right text-emerald-600 font-medium">{m.completedCount}</TableCell>
                              <TableCell className="text-sm text-right text-muted-foreground">{m.count > 0 ? Math.round((m.completedCount / m.count) * 100) : 0}%</TableCell>
                            </TableRow>
                          ))}
                        </TableBody></Table>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* Tab 3: Technician Productivity */}
            <TabsContent value="technicians" className="mt-6 space-y-6">
              <div className="flex items-center justify-between print:hidden">
                <div>
                  <h3 className="text-base font-semibold">Technician Productivity</h3>
                  <p className="text-xs text-muted-foreground">Assigned vs completed WOs, avg hours per WO</p>
                </div>
                <ExportButtonGroup onExportCSV={handleTechCSV} onExportPDF={handleTechPDF} onPrint={() => window.print()} disabled={!reportData} />
              </div>
              <Card className="border border-border/60 shadow-sm print:shadow-none print:border">
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Technician</TableHead>
                          <TableHead className="text-right cursor-pointer select-none" onClick={() => setTechSort(techSort === 'assignedCount' ? 'completedCount' : 'assignedCount')}>
                            <span className="flex items-center justify-end gap-1">Assigned <ArrowUpDown className="h-3 w-3" /></span>
                          </TableHead>
                          <TableHead className="text-right cursor-pointer select-none" onClick={() => setTechSort('completedCount')}>
                            <span className="flex items-center justify-end gap-1">Completed <ArrowUpDown className="h-3 w-3" /></span>
                          </TableHead>
                          <TableHead className="text-right cursor-pointer select-none" onClick={() => setTechSort('avgHoursPerWO')}>
                            <span className="flex items-center justify-end gap-1">Avg Hrs/WO <ArrowUpDown className="h-3 w-3" /></span>
                          </TableHead>
                          <TableHead className="text-right cursor-pointer select-none" onClick={() => setTechSort('totalHours')}>
                            <span className="flex items-center justify-end gap-1">Total Hours <ArrowUpDown className="h-3 w-3" /></span>
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sortedTechnicians.length === 0 ? (
                          <TableRow><TableCell colSpan={5}><EmptyState icon={Users} title="No technician data" description="Assign work orders to technicians to see productivity metrics." /></TableCell></TableRow>
                        ) : sortedTechnicians.map((tech: any) => (
                          <TableRow key={tech.userId} className="hover:bg-muted/30">
                            <TableCell className="font-medium">{tech.userName}</TableCell>
                            <TableCell className="text-right">{tech.assignedCount}</TableCell>
                            <TableCell className="text-right text-emerald-600 font-medium">{tech.completedCount}</TableCell>
                            <TableCell className="text-right">{formatDuration(tech.avgHoursPerWO)}</TableCell>
                            <TableCell className="text-right">{formatDuration(tech.totalHours)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>

              {reportData.repairCompletion && (
                <Card className="border border-border/60 shadow-sm print:shadow-none print:border">
                  <CardHeader className="pb-3"><CardTitle className="text-base">Repair Completion Metrics</CardTitle><CardDescription className="text-xs">Quality and timeliness of repair work</CardDescription></CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                      {[
                        { label: 'Total Repairs', value: reportData.repairCompletion.totalCompleted },
                        { label: 'Avg Rework Count', value: reportData.repairCompletion.avgReworkCount },
                        { label: 'Rework Rate', value: `${reportData.repairCompletion.reworkRate}%` },
                        { label: 'Avg Supervisor Review', value: formatDuration(reportData.repairCompletion.avgSupervisorReviewTimeHours) },
                        { label: 'Avg Closure Time', value: formatDuration(reportData.repairCompletion.avgClosureTimeHours) },
                      ].map((item: any, i: number) => (
                        <div key={i} className="text-center p-3 rounded-lg bg-muted/40">
                          <p className="text-lg font-bold">{item.value}</p>
                          <p className="text-[11px] text-muted-foreground">{item.label}</p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* Tab 4: Materials & Costs */}
            <TabsContent value="materials" className="mt-6 space-y-6">
              <div className="flex items-center justify-between print:hidden">
                <div>
                  <h3 className="text-base font-semibold">Material Consumption</h3>
                  <p className="text-xs text-muted-foreground">Top materials by cost for the selected period</p>
                </div>
                <ExportButtonGroup onExportCSV={handleMaterialsCSV} onExportPDF={handleMaterialsPDF} onPrint={() => window.print()} disabled={!reportData} />
              </div>
              <Card className="border border-border/60 shadow-sm print:shadow-none print:border">
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[26%]">Item Name</TableHead>
                          <TableHead className="w-[38%]">Assets / Machines</TableHead>
                          <TableHead className="w-[12%] text-right">Total Qty</TableHead>
                          <TableHead className="w-[14%] text-right">Total Cost</TableHead>
                          <TableHead className="w-[10%] text-right">WO Count</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(reportData.materialConsumption || []).length === 0 ? (
                          <TableRow><TableCell colSpan={5}><EmptyState icon={Package} title="No material data" description="Material usage will appear here once work orders use materials." /></TableCell></TableRow>
                        ) : reportData.materialConsumption.map((mat: any, i: number) => (
                          <TableRow key={i} className="hover:bg-muted/30">
                            <TableCell className="font-medium align-top">{mat.itemName}</TableCell>
                            <TableCell className="align-top text-sm text-muted-foreground">{(mat.assets || []).length ? (mat.assets || []).join(", ") : "Unassigned"}</TableCell>
                            <TableCell className="text-right align-top tabular-nums">{mat.totalQuantity}</TableCell>
                            <TableCell className="text-right align-top font-medium tabular-nums">{formatCurrency(mat.totalCost)}</TableCell>
                            <TableCell className="text-right align-top tabular-nums">{mat.woCount}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 print:grid-cols-3 print:gap-2">
                <Card className="border border-border/60 shadow-sm print:shadow-none print:border"><CardContent className="p-4 print:p-2 text-center">
                  <p className="text-2xl font-bold text-emerald-600">{formatCurrency(s?.totalCost)}</p>
                  <p className="text-xs text-muted-foreground">Total Maintenance Cost</p>
                </CardContent></Card>
                <Card className="border border-border/60 shadow-sm print:shadow-none print:border"><CardContent className="p-4 print:p-2 text-center">
                  <p className="text-2xl font-bold text-sky-600">{formatCurrency(s?.avgCostPerWO)}</p>
                  <p className="text-xs text-muted-foreground">Average Cost per WO</p>
                </CardContent></Card>
                <Card className="border border-border/60 shadow-sm print:shadow-none print:border"><CardContent className="p-4 print:p-2 text-center">
                  <p className="text-2xl font-bold text-amber-600">{s?.totalWOs ?? 0}</p>
                  <p className="text-xs text-muted-foreground">Total Work Orders</p>
                </CardContent></Card>
              </div>
            </TabsContent>

            {/* Tab 5: Downtime Analysis */}
            <TabsContent value="downtime" className="mt-6 space-y-6">
              <div className="flex items-center justify-between print:hidden">
                <div>
                  <h3 className="text-base font-semibold">Downtime Analysis</h3>
                  <p className="text-xs text-muted-foreground">Equipment downtime events and impact assessment</p>
                </div>
                <ExportButtonGroup onExportCSV={handleDowntimeCSV} onExportPDF={handleDowntimePDF} onPrint={() => window.print()} disabled={!reportData} />
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 print:grid-cols-4 print:gap-2">
                {[
                  { label: 'Total Events', value: reportData.downtimeAnalysis?.totalEvents ?? 0, icon: AlertTriangle, color: 'text-red-600 bg-red-50 dark:bg-red-900/30 dark:text-red-400' },
                  { label: 'Total Downtime', value: `${reportData.downtimeAnalysis?.totalMinutes ?? 0} min`, icon: Clock, color: 'text-amber-600 bg-amber-50 dark:bg-amber-900/30 dark:text-amber-400' },
                  { label: 'Avg Duration', value: `${reportData.downtimeAnalysis?.avgDurationMinutes ?? 0} min`, icon: TrendingUp, color: 'text-sky-600 bg-sky-50 dark:bg-sky-900/30 dark:text-sky-400' },
                  { label: 'SLA Breaches', value: s?.slaBreachedWOs ?? 0, icon: ShieldAlert, color: 'text-violet-600 bg-violet-50 dark:bg-violet-900/30 dark:text-violet-400' },
                ].map((k: any) => { const I = k.icon; return (
                  <Card key={k.label} className="border border-border/60 shadow-sm print:shadow-none print:border"><CardContent className="p-4 print:p-2">
                    <div className="flex items-center gap-3">
                      <div className={`h-9 w-9 rounded-lg ${k.color} flex items-center justify-center shrink-0 print:hidden`}><I className="h-4 w-4" /></div>
                      <div className="min-w-0">
                        <p className="text-lg font-bold truncate">{k.value}</p>
                        <p className="text-[11px] text-muted-foreground truncate">{k.label}</p>
                      </div>
                    </div>
                  </CardContent></Card>
                ); })}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card className="border border-border/60 shadow-sm print:shadow-none print:border">
                  <CardHeader className="pb-3"><CardTitle className="text-base">Downtime by Category</CardTitle></CardHeader>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader><TableRow><TableHead>Category</TableHead><TableHead className="text-right">Events</TableHead><TableHead className="text-right">Total Min</TableHead></TableRow></TableHeader>
                        <TableBody>
                          {(reportData.downtimeAnalysis?.byCategory || []).length === 0 ? (
                            <TableRow><TableCell colSpan={3}><EmptyState icon={Clock} title="No downtime data" description="Downtime events will appear here." /></TableCell></TableRow>
                          ) : reportData.downtimeAnalysis.byCategory.map((dt: any) => (
                            <TableRow key={dt.category} className="hover:bg-muted/30">
                              <TableCell className="font-medium capitalize">{dt.category}</TableCell>
                              <TableCell className="text-right">{dt.count}</TableCell>
                              <TableCell className="text-right font-medium">{dt.totalMinutes} min</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border border-border/60 shadow-sm print:shadow-none print:border">
                  <CardHeader className="pb-3"><CardTitle className="text-base">Downtime by Impact Level</CardTitle></CardHeader>
                  <CardContent>
                    {(reportData.downtimeAnalysis?.byImpactLevel || []).length > 0 ? (
                      <ResponsiveContainer width="100%" height={180}>
                        <BarChart data={reportData.downtimeAnalysis.byImpactLevel} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                          <XAxis dataKey="impactLevel" tick={{ fontSize: 11 }} />
                          <YAxis tick={{ fontSize: 11 }} />
                          <Tooltip />
                          <Bar dataKey="count" name="Events" radius={[4, 4, 0, 0]}>
                            {(reportData.downtimeAnalysis.byImpactLevel || []).map((entry: any) => (
                              <Cell key={entry.impactLevel} fill={priorityColorMap[entry.impactLevel] || CHART_COLORS[0]} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    ) : <EmptyState icon={ShieldAlert} title="No impact data" description="Impact level data will appear here." />}
                    {/* Tabular summary below chart */}
                    {(reportData.downtimeAnalysis?.byImpactLevel || []).length > 0 && (
                      <div className="mt-4 border-t pt-3">
                        <Table><TableHeader><TableRow><TableHead className="text-xs">Impact Level</TableHead><TableHead className="text-xs text-right">Events</TableHead><TableHead className="text-xs text-right">%</TableHead></TableRow></TableHeader>
                        <TableBody>
                          {reportData.downtimeAnalysis.byImpactLevel.map((il: any) => (
                            <TableRow key={il.impactLevel} className="hover:bg-muted/30">
                              <TableCell className="text-sm font-medium capitalize"><PriorityBadge priority={il.impactLevel} /> {il.impactLevel}</TableCell>
                              <TableCell className="text-sm text-right font-medium">{il.count}</TableCell>
                              <TableCell className="text-sm text-right text-muted-foreground">{reportData.downtimeAnalysis.totalEvents ? Math.round((il.count / reportData.downtimeAnalysis.totalEvents) * 100) : 0}%</TableCell>
                            </TableRow>
                          ))}
                        </TableBody></Table>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* Tab 6: Detailed Data */}
            <TabsContent value="data" className="mt-6">
              <div className="flex items-center justify-between print:hidden mb-4">
                <div>
                  <h3 className="text-base font-semibold">Detailed Work Order Data</h3>
                  <p className="text-xs text-muted-foreground">{recentWOs.length} work orders in the selected date range</p>
                </div>
                <ExportButtonGroup onExportCSV={handleDataCSV} onExportPDF={handleDataPDF} onPrint={() => window.print()} disabled={!reportData} />
              </div>
              <Card className="border border-border/60 shadow-sm print:shadow-none print:border">
                <CardContent className="p-0">
                  <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                    <Table>
                      <TableHeader className="sticky top-0 bg-background z-10">
                        <TableRow>
                          <TableHead>WO #</TableHead>
                          <TableHead>Title</TableHead>
                          <TableHead className="hidden md:table-cell">Type</TableHead>
                          <TableHead>Priority</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="hidden lg:table-cell">Asset</TableHead>
                          <TableHead className="hidden xl:table-cell">Assigned To</TableHead>
                          <TableHead className="hidden xl:table-cell">Team Leader</TableHead>
                          <TableHead className="text-right hidden md:table-cell">Est Hrs</TableHead>
                          <TableHead className="text-right hidden md:table-cell">Act Hrs</TableHead>
                          <TableHead className="text-right hidden lg:table-cell">Total Cost</TableHead>
                          <TableHead className="hidden lg:table-cell">Created</TableHead>
                          <TableHead className="hidden xl:table-cell">Completed</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {recentWOs.length === 0 ? (
                          <TableRow><TableCell colSpan={13}><EmptyState icon={ClipboardList} title="No work orders in date range" description="Adjust the date range to see work order data." /></TableCell></TableRow>
                        ) : recentWOs.map((wo: any) => (
                          <TableRow key={wo.id} className="hover:bg-muted/30">
                            <TableCell className="font-mono text-xs">{wo.woNumber}</TableCell>
                            <TableCell className="font-medium max-w-[180px] truncate">{wo.title}</TableCell>
                            <TableCell className="hidden md:table-cell">
                              <div className="flex items-center gap-1">
                                <Badge variant="outline" className={`${typeColorMap[wo.type] || 'bg-slate-100 text-slate-700'} text-white border-0 text-[10px]`}>
                                  {wo.type?.toUpperCase()}
                                </Badge>
                                {wo.type === 'preventive' && (
                                  <Badge variant="outline" className="bg-emerald-100 text-emerald-700 border-emerald-200 text-[9px] px-1.5">PM</Badge>
                                )}
                                {(wo.type === 'corrective' || wo.type === 'emergency') && (
                                  <Badge variant="outline" className="bg-amber-100 text-amber-700 border-amber-200 text-[9px] px-1.5">Repair</Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell><PriorityBadge priority={wo.priority} /></TableCell>
                            <TableCell><StatusBadge status={wo.status} /></TableCell>
                            <TableCell className="text-sm hidden lg:table-cell max-w-[140px] truncate">{wo.assetName || '-'}</TableCell>
                            <TableCell className="text-sm hidden xl:table-cell">{wo.assigneeName || '-'}</TableCell>
                            <TableCell className="text-sm hidden xl:table-cell">{wo.teamLeaderName || '-'}</TableCell>
                            <TableCell className="text-right hidden md:table-cell">{wo.estimatedHours ?? '-'}</TableCell>
                            <TableCell className="text-right hidden md:table-cell">{wo.actualHours ?? '-'}</TableCell>
                            <TableCell className="text-right hidden lg:table-cell">{formatCurrency(wo.totalCost)}</TableCell>
                            <TableCell className="text-xs text-muted-foreground hidden lg:table-cell whitespace-nowrap">{wo.createdAt ? formatDate(wo.createdAt) : '-'}</TableCell>
                            <TableCell className="text-xs text-muted-foreground hidden xl:table-cell whitespace-nowrap">{wo.completedDate ? formatDate(wo.completedDate) : '-'}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      )}

      {!loading && !reportData && (
        <EmptyState icon={ClipboardCheck} title="No data available" description="Generate a report with the date range above to see maintenance analytics." />
      )}
    </div>
  );
}
export function ReportsInventoryPage() {
  const moduleEnabled = useModuleEnabled(MODULE_CODES.INVENTORY);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState('');

  useEffect(() => {
    api.get<any[]>('/api/inventory').then(res => {
      if (res.success && res.data) setItems(res.data);
      setLoading(false);
    });
  }, []);

  const filtered = searchText.trim() ? items.filter(i => {
    const q = searchText.toLowerCase();
    return (i.name || '').toLowerCase().includes(q) || (i.itemCode || '').toLowerCase().includes(q) || (i.category || '').toLowerCase().includes(q);
  }) : items;

  const totalItems = items.length;
  const totalValue = items.reduce((sum, i) => sum + ((i.currentStock || 0) * (i.unitCost || 0)), 0);
  const lowStock = items.filter(i => i.currentStock > 0 && i.currentStock <= (i.minStockLevel || 0));
  const outOfStock = items.filter(i => i.currentStock <= 0);

  const summaryCards = [
    { label: 'Total Items', value: totalItems, icon: Package, color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 dark:text-emerald-400' },
    { label: 'Total Value', value: formatCurrency(totalValue), icon: DollarSign, color: 'text-sky-600 bg-sky-50 dark:bg-sky-900/30 dark:text-sky-400' },
    { label: 'Low Stock', value: lowStock.length, icon: AlertTriangle, color: 'text-amber-600 bg-amber-50 dark:bg-amber-900/30 dark:text-amber-400' },
    { label: 'Out of Stock', value: outOfStock.length, icon: XCircle, color: 'text-red-600 bg-red-50 dark:bg-red-900/30 dark:text-red-400' },
  ];

  if (!moduleEnabled) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <p className="text-muted-foreground">This module is not active.</p>
          <p className="text-sm text-muted-foreground mt-1">Enable it in Settings → Modules to view this report.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-content">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div><h1 className="text-2xl font-bold tracking-tight">Inventory Reports</h1><p className="text-muted-foreground mt-1">Reports on stock levels, movements, values, and procurement</p></div>
        <div className="relative min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search items..." value={searchText} onChange={e => setSearchText(e.target.value)} className="pl-9" />
        </div>
      </div>
      {loading ? <LoadingSkeleton /> : (<>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {summaryCards.map(k => { const I = k.icon; return (
            <Card key={k.label} className="cursor-pointer hover:shadow-md transition-all"><CardContent className="p-5"><div className="flex items-center gap-4"><div className={`h-11 w-11 rounded-xl ${k.color} flex items-center justify-center`}><I className="h-5 w-5" /></div><div><p className="text-2xl font-bold">{k.value}</p><p className="text-xs text-muted-foreground">{k.label}</p></div></div></CardContent></Card>
          ); })}
        </div>
        <Card className="border-0 shadow-sm"><Table><TableHeader><TableRow><TableHead>Code</TableHead><TableHead>Name</TableHead><TableHead className="hidden md:table-cell">Category</TableHead><TableHead className="text-right">Stock</TableHead><TableHead className="hidden sm:table-cell text-right">Min Stock</TableHead><TableHead className="text-right">Value</TableHead><TableHead className="hidden lg:table-cell">Status</TableHead></TableRow></TableHeader><TableBody>
          {filtered.length === 0 ? (
            <TableRow><TableCell colSpan={7} className="h-48"><EmptyState icon={Package} title="No inventory items found" description="Items will appear here once inventory is populated." /></TableCell></TableRow>
          ) : filtered.map(item => {
            const isLow = item.currentStock > 0 && item.currentStock <= (item.minStockLevel || 0);
            const isOut = item.currentStock <= 0;
            const value = (item.currentStock || 0) * (item.unitCost || 0);
            return (
              <TableRow key={item.id} className={`hover:bg-muted/30 ${isOut ? 'bg-red-50/50 dark:bg-red-950/20' : isLow ? 'bg-amber-50/50 dark:bg-amber-950/20' : ''}`}>
                <TableCell className="font-mono text-xs">{item.itemCode}</TableCell>
                <TableCell className="font-medium">{item.name}</TableCell>
                <TableCell className="text-sm hidden md:table-cell">{item.category || '-'}</TableCell>
                <TableCell className={`text-right font-medium ${isOut ? 'text-red-600' : isLow ? 'text-amber-600' : ''}`}>{item.currentStock || 0}</TableCell>
                <TableCell className="text-right text-muted-foreground hidden sm:table-cell">{item.minStockLevel || 0}</TableCell>
                <TableCell className="text-right font-medium">{formatCurrency(value)}</TableCell>
                <TableCell className="hidden lg:table-cell">{isOut ? <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">OUT OF STOCK</Badge> : isLow ? <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">LOW STOCK</Badge> : <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">OK</Badge>}</TableCell>
              </TableRow>
            );
          })}
        </TableBody></Table></Card>
      </>)}
    </div>
  );
}
export function ReportsProductionPage() {
  const moduleEnabled = useModuleEnabled(MODULE_CODES.PRODUCTION);
  const { startDate, setStartDate, endDate, setEndDate } = useDateRange();
  const [orders, setOrders] = useState<any[]>([]);
  const [kpi, setKpi] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.get<any>('/api/production-orders?limit=9999'),
      api.get<any>('/api/production-orders/kpi'),
    ]).then(([ordersRes, kpiRes]) => {
      if (ordersRes.success && Array.isArray(ordersRes.data)) {
        // Filter by date range client-side
        const filtered = filterByDateRange(ordersRes.data, startDate, endDate);
        setOrders(filtered);
      }
      if (kpiRes.success && kpiRes.data) setKpi(kpiRes.data);
      setLoading(false);
    });
  }, [startDate, endDate]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Status breakdown chart data
  const statusBreakdown = useMemo(() => {
    const map: Record<string, number> = {};
    orders.forEach(o => { const s = o.status || 'unknown'; map[s] = (map[s] || 0) + 1; });
    return Object.entries(map).map(([status, count]) => ({ status: status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()), count }));
  }, [orders]);

  const statusColors: Record<string, string> = { planned: 'bg-sky-500', released: 'bg-violet-500', in_progress: 'bg-amber-500', completed: 'bg-emerald-500', cancelled: 'bg-red-500' };

  // Monthly grouping
  const monthlyMap: Record<string, { completed: number; total: number; value: number }> = {};
  orders.forEach(o => {
    const dateStr = o.actualEnd || o.updatedAt || o.createdAt;
    if (!dateStr) return;
    const d = new Date(dateStr);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (!monthlyMap[key]) monthlyMap[key] = { completed: 0, total: 0, value: 0 };
    monthlyMap[key].total += 1;
    if (o.status === 'completed') monthlyMap[key].completed += 1;
    monthlyMap[key].value += (o.quantity || 0) * (o.unitCost || 0);
  });

  const monthlyData = Object.entries(monthlyMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-6)
    .map(([key, data]) => {
      const d = new Date(key + '-01');
      const label = format(d, 'MMM yyyy');
      const completionRate = data.total > 0 ? Math.round((data.completed / data.total) * 100) : 0;
      return { month: label, monthKey: key, total: data.total, completed: data.completed, value: data.value, completionRate };
    });

  const totalOrders = orders.length;
  const completedOrders = orders.filter(o => o.status === 'completed').length;
  const maxMonthly = monthlyData.length > 0 ? Math.max(...monthlyData.map(d => d.total), 1) : 1;

  const summaryCards = [
    { label: 'Total Orders', value: totalOrders.toString(), icon: Factory, color: 'bg-emerald-50 text-emerald-600' },
    { label: 'Completion Rate', value: kpi ? `${kpi.completionRate}%` : (totalOrders > 0 ? `${Math.round((completedOrders / totalOrders) * 100)}%` : '0%'), icon: Target, color: 'bg-sky-50 text-sky-600' },
    { label: 'On-Time Delivery', value: kpi ? `${kpi.onTimeDeliveryRate}%` : '—', icon: Clock, color: 'bg-amber-50 text-amber-600' },
    { label: 'Avg Yield', value: kpi ? `${kpi.avgYield}%` : '—', icon: TrendingUp, color: 'bg-red-50 text-red-600' },
  ];

  if (!moduleEnabled) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <p className="text-muted-foreground">This module is not active.</p>
          <p className="text-sm text-muted-foreground mt-1">Enable it in Settings → Modules to view this report.</p>
        </div>
      </div>
    );
  }

  if (loading) return <div className="page-content"><LoadingSkeleton /></div>;

  return (
    <div className="page-content">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div><h1 className="text-2xl font-bold tracking-tight">Production Reports</h1><p className="text-muted-foreground mt-1">Production orders status breakdown, completion rates, on-time delivery, and yield from real production data</p></div>
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        <Card className="border border-border/60 shadow-sm"><CardContent className="p-4">
          <DateRangePicker label="Date Range" from={startDate || undefined} to={endDate || undefined} onChange={(f, t) => { setStartDate(f || ''); setEndDate(t || ''); }} />
        </CardContent></Card>
        <Button variant="outline" size="sm" onClick={() => exportCSV('production-orders', ['Order Number', 'Product', 'Status', 'Priority', 'Start Date', 'End Date'], orders.map(o => [o.orderNumber || '', o.title || '', o.status || '', o.priority || '', o.scheduledStart ? new Date(o.scheduledStart).toISOString().slice(0, 10) : '', o.scheduledEnd ? new Date(o.scheduledEnd).toISOString().slice(0, 10) : '']))}>
          <Download className="h-4 w-4 mr-1.5" />Export CSV
        </Button>
        <Button variant="outline" size="sm" onClick={() => exportPDF({
          title: 'Production Reports',
          subtitle: `Date Range: ${startDate} to ${endDate}`,
          filename: 'production-orders',
          headers: ['Order Number', 'Product', 'Status', 'Priority', 'Start Date', 'End Date'],
          rows: orders.map(o => [o.orderNumber || '', o.title || '', o.status || '', o.priority || '', o.scheduledStart ? new Date(o.scheduledStart).toISOString().slice(0, 10) : '', o.scheduledEnd ? new Date(o.scheduledEnd).toISOString().slice(0, 10) : '']),
          summary: summaryCards.map(k => ({ label: k.label, value: String(k.value) })),
        })}>
          <FileDown className="h-4 w-4 mr-1.5" />Export PDF
        </Button>
      </div>
      {totalOrders === 0 ? (
        <EmptyState icon={Factory} title="No production data available for this date range" description="Create production orders to see production trends, completion rates, and yield metrics." />
      ) : (<>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {summaryCards.map(k => { const I = k.icon; return (
            <div key={k.label} className="bg-card text-card-foreground border border-border/60 rounded-xl shadow-sm p-5 cursor-pointer hover:shadow-md transition-all">
              <div className="flex items-center gap-4">
                <div className={`h-11 w-11 rounded-xl ${k.color} flex items-center justify-center`}><I className="h-5 w-5" /></div>
                <div><p className="text-2xl font-bold">{k.value}</p><p className="text-xs text-muted-foreground">{k.label}</p></div>
              </div>
            </div>
          ); })}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="border border-border/60 shadow-sm">
            <CardHeader className="pb-3"><CardTitle className="text-base">Monthly Production Orders</CardTitle><CardDescription className="text-xs">Orders by month in selected range</CardDescription></CardHeader>
            <CardContent>
              <div className="flex items-end gap-3 h-48">
                {monthlyData.map(d => (
                  <div key={d.monthKey} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-xs font-medium">{d.total}</span>
                    <div className="w-full bg-emerald-100 rounded-t-md" style={{ height: `${(d.total / maxMonthly) * 140}px` }}>
                      <div className="w-full h-full bg-emerald-500 rounded-t-md opacity-80" />
                    </div>
                    <span className="text-[10px] text-muted-foreground text-center">{d.month.split(' ')[0]}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
          <Card className="border border-border/60 shadow-sm">
            <CardHeader className="pb-3"><CardTitle className="text-base">Status Breakdown</CardTitle><CardDescription className="text-xs">Orders by status</CardDescription></CardHeader>
            <CardContent>
              <div className="space-y-3">
                {statusBreakdown.map(s => {
                  const maxStatus = statusBreakdown.length > 0 ? Math.max(...statusBreakdown.map(x => x.count)) : 1;
                  return (
                    <div key={s.status} className="flex items-center gap-3">
                      <span className="text-sm font-medium w-28">{s.status}</span>
                      <div className="flex-1 h-2.5 bg-muted rounded-full overflow-hidden"><div className={`h-full ${statusColors[s.status.toLowerCase().replace(/ /g, '_')] || 'bg-slate-400'} rounded-full transition-all`} style={{ width: `${(s.count / maxStatus) * 100}%` }} /></div>
                      <span className="text-sm font-semibold w-16 text-right">{s.count}</span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
        <Card className="border border-border/60 shadow-sm"><CardContent className="p-0">
          <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Month</TableHead><TableHead className="text-right">Total Orders</TableHead><TableHead className="text-right">Completed</TableHead><TableHead className="hidden sm:table-cell text-right">Completion Rate</TableHead><TableHead className="hidden md:table-cell text-right">Value</TableHead></TableRow></TableHeader><TableBody>
            {monthlyData.map(d => (
              <TableRow key={d.monthKey} className="hover:bg-muted/30">
                <TableCell className="font-medium">{d.month}</TableCell>
                <TableCell className="text-right font-medium">{d.total}</TableCell>
                <TableCell className="text-right text-emerald-600">{d.completed}</TableCell>
                <TableCell className={`text-right font-medium hidden sm:table-cell ${d.completionRate >= 90 ? 'text-emerald-600' : d.completionRate >= 70 ? 'text-amber-600' : 'text-red-600'}`}>{d.completionRate}%</TableCell>
                <TableCell className="text-right text-muted-foreground hidden md:table-cell">{d.value > 0 ? formatCurrency(d.value) : '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody></Table></div>
        </CardContent></Card>
      </>)}
    </div>
  );
}
export function ReportsQualityPage() {
  const moduleEnabled = useModuleEnabled(MODULE_CODES.QUALITY);
  const { startDate, setStartDate, endDate, setEndDate } = useDateRange();
  const [inspections, setInspections] = useState<any[]>([]);
  const [ncrs, setNcrs] = useState<any[]>([]);
  const [audits, setAudits] = useState<any[]>([]);
  const [inspKpis, setInspKpis] = useState<any>(null);
  const [ncrKpis, setNcrKpis] = useState<any>(null);
  const [auditKpis, setAuditKpis] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.get<any>('/api/quality-inspections?limit=9999'),
      api.get<any>('/api/quality-ncr?limit=9999'),
      api.get<any>('/api/quality-audits?limit=9999'),
    ]).then(([inspRes, ncrRes, auditRes]) => {
      const inspData = inspRes.success && Array.isArray(inspRes.data) ? filterByDateRange(inspRes.data, startDate, endDate) : [];
      const ncrData = ncrRes.success && Array.isArray(ncrRes.data) ? filterByDateRange(ncrRes.data, startDate, endDate) : [];
      const auditData = auditRes.success && Array.isArray(auditRes.data) ? filterByDateRange(auditRes.data, startDate, endDate) : [];
      setInspections(inspData);
      setNcrs(ncrData);
      setAudits(auditData);
      if (inspRes.kpis) setInspKpis(inspRes.kpis);
      if (ncrRes.kpis) setNcrKpis(ncrRes.kpis);
      if (auditRes.kpis) setAuditKpis(auditRes.kpis);
      setLoading(false);
    });
  }, [startDate, endDate]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Inspection pass/fail
  const inspPassed = inspections.filter(i => i.status === 'passed').length;
  const inspFailed = inspections.filter(i => i.status === 'failed').length;
  const inspPending = inspections.filter(i => i.status === 'pending' || i.status === 'in_progress').length;
  const inspPassRate = inspections.length > 0 ? Math.round((inspPassed / inspections.length) * 100) : 0;

  // NCR status breakdown
  const ncrStatusMap: Record<string, number> = {};
  ncrs.forEach(n => { const s = n.status || 'unknown'; ncrStatusMap[s] = (ncrStatusMap[s] || 0) + 1; });
  const ncrStatusBreakdown = Object.entries(ncrStatusMap).map(([status, count]) => ({
    status: status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()), count,
  }));
  const ncrColors: Record<string, string> = { open: 'bg-red-500', investigating: 'bg-amber-500', closed: 'bg-emerald-500' };

  // Audit completion rates
  const auditsCompleted = audits.filter(a => a.status === 'completed').length;
  const auditsInProgress = audits.filter(a => a.status === 'in_progress').length;
  const auditsPlanned = audits.filter(a => a.status === 'planned').length;
  const auditCompletionRate = audits.length > 0 ? Math.round((auditsCompleted / audits.length) * 100) : 0;

  // Monthly trend for inspections
  const monthlyMap: Record<string, { total: number; passed: number; failed: number }> = {};
  inspections.forEach(i => {
    const dateStr = i.createdAt;
    if (!dateStr) return;
    const d = new Date(dateStr);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (!monthlyMap[key]) monthlyMap[key] = { total: 0, passed: 0, failed: 0 };
    monthlyMap[key].total += 1;
    if (i.status === 'passed') monthlyMap[key].passed += 1;
    else if (i.status === 'failed') monthlyMap[key].failed += 1;
  });
  const monthlyData = Object.entries(monthlyMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-6)
    .map(([key, data]) => {
      const d = new Date(key + '-01');
      const label = format(d, 'MMM yyyy');
      const passRate = data.total > 0 ? Math.round((data.passed / data.total) * 100) : 0;
      return { month: label, monthKey: key, total: data.total, passed: data.passed, failed: data.failed, passRate };
    });

  const summaryCards = [
    { label: 'Inspections', value: inspections.length.toString(), icon: ClipboardCheck, color: 'bg-emerald-50 text-emerald-600' },
    { label: 'Pass Rate', value: `${inspPassRate}%`, icon: ShieldCheck, color: 'bg-sky-50 text-sky-600' },
    { label: 'Open NCRs', value: ncrs.filter(n => n.status === 'open' || n.status === 'investigating').length.toString(), icon: AlertTriangle, color: 'bg-amber-50 text-amber-600' },
    { label: 'Audit Completion', value: `${auditCompletionRate}%`, icon: CheckCircle2, color: 'bg-red-50 text-red-600' },
  ];

  if (!moduleEnabled) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <p className="text-muted-foreground">This module is not active.</p>
          <p className="text-sm text-muted-foreground mt-1">Enable it in Settings → Modules to view this report.</p>
        </div>
      </div>
    );
  }

  if (loading) return <div className="page-content"><LoadingSkeleton /></div>;

  return (
    <div className="page-content">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div><h1 className="text-2xl font-bold tracking-tight">Quality Reports</h1><p className="text-muted-foreground mt-1">Inspection pass/fail rates, NCR status breakdown, and audit completion from real quality data</p></div>
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        <Card className="border border-border/60 shadow-sm"><CardContent className="p-4">
          <DateRangePicker label="Date Range" from={startDate || undefined} to={endDate || undefined} onChange={(f, t) => { setStartDate(f || ''); setEndDate(t || ''); }} />
        </CardContent></Card>
        <Button variant="outline" size="sm" onClick={() => exportCSV('quality-inspections', ['ID', 'Type', 'Status', 'Result', 'Date', 'Inspector'], inspections.map(i => [i.inspectionNumber || i.id || '', i.type || '', i.status || '', i.result || i.status || '', i.createdAt ? new Date(i.createdAt).toISOString().slice(0, 10) : '', i.inspector || '']))}>
          <Download className="h-4 w-4 mr-1.5" />Export CSV
        </Button>
        <Button variant="outline" size="sm" onClick={() => exportPDF({
          title: 'Quality Reports',
          subtitle: `Date Range: ${startDate} to ${endDate}`,
          filename: 'quality-inspections',
          headers: ['ID', 'Type', 'Status', 'Result', 'Date', 'Inspector'],
          rows: inspections.map(i => [i.inspectionNumber || i.id || '', i.type || '', i.status || '', i.result || i.status || '', i.createdAt ? new Date(i.createdAt).toISOString().slice(0, 10) : '', i.inspector || '']),
          summary: summaryCards.map(k => ({ label: k.label, value: String(k.value) })),
        })}>
          <FileDown className="h-4 w-4 mr-1.5" />Export PDF
        </Button>
      </div>
      {inspections.length === 0 && ncrs.length === 0 && audits.length === 0 ? (
        <EmptyState icon={ClipboardCheck} title="No quality data available for this date range" description="Create inspections, NCRs, or audits to see quality metrics." />
      ) : (<>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {summaryCards.map(k => { const I = k.icon; return (
            <div key={k.label} className="bg-card text-card-foreground border border-border/60 rounded-xl shadow-sm p-5 cursor-pointer hover:shadow-md transition-all">
              <div className="flex items-center gap-4">
                <div className={`h-11 w-11 rounded-xl ${k.color} flex items-center justify-center`}><I className="h-5 w-5" /></div>
                <div><p className="text-2xl font-bold">{k.value}</p><p className="text-xs text-muted-foreground">{k.label}</p></div>
              </div>
            </div>
          ); })}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="border border-border/60 shadow-sm">
            <CardHeader className="pb-3"><CardTitle className="text-base">Inspection Pass/Fail Rates</CardTitle><CardDescription className="text-xs">Inspection outcomes in date range</CardDescription></CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium w-28">Passed</span>
                  <div className="flex-1 h-3 bg-muted rounded-full overflow-hidden"><div className="h-full bg-emerald-500 rounded-full" style={{ width: `${inspections.length > 0 ? (inspPassed / inspections.length) * 100 : 0}%` }} /></div>
                  <span className="text-sm font-semibold w-16 text-right">{inspPassed}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium w-28">Failed</span>
                  <div className="flex-1 h-3 bg-muted rounded-full overflow-hidden"><div className="h-full bg-red-500 rounded-full" style={{ width: `${inspections.length > 0 ? (inspFailed / inspections.length) * 100 : 0}%` }} /></div>
                  <span className="text-sm font-semibold w-16 text-right">{inspFailed}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium w-28">Pending</span>
                  <div className="flex-1 h-3 bg-muted rounded-full overflow-hidden"><div className="h-full bg-amber-500 rounded-full" style={{ width: `${inspections.length > 0 ? (inspPending / inspections.length) * 100 : 0}%` }} /></div>
                  <span className="text-sm font-semibold w-16 text-right">{inspPending}</span>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border border-border/60 shadow-sm">
            <CardHeader className="pb-3"><CardTitle className="text-base">NCR Status Breakdown</CardTitle><CardDescription className="text-xs">Non-conformance reports by status</CardDescription></CardHeader>
            <CardContent>
              <div className="space-y-3">
                {ncrStatusBreakdown.length === 0 && <p className="text-sm text-muted-foreground">No NCRs in date range.</p>}
                {ncrStatusBreakdown.map(cat => {
                  const maxNcr = ncrStatusBreakdown.length > 0 ? Math.max(...ncrStatusBreakdown.map(c => c.count)) : 1;
                  return (
                    <div key={cat.status} className="flex items-center gap-3">
                      <span className="text-sm font-medium w-28">{cat.status}</span>
                      <div className="flex-1 h-3 bg-muted rounded-full overflow-hidden"><div className={`h-full ${ncrColors[cat.status.toLowerCase().replace(/ /g, '_')] || 'bg-slate-400'} rounded-full`} style={{ width: `${(cat.count / maxNcr) * 100}%` }} /></div>
                      <span className="text-sm font-semibold w-16 text-right">{cat.count}</span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="border border-border/60 shadow-sm">
            <CardHeader className="pb-3"><CardTitle className="text-base">Audit Completion</CardTitle><CardDescription className="text-xs">{audits.length} audits in range</CardDescription></CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium w-28">Completed</span>
                  <div className="flex-1 h-3 bg-muted rounded-full overflow-hidden"><div className="h-full bg-emerald-500 rounded-full" style={{ width: `${auditCompletionRate}%` }} /></div>
                  <span className="text-sm font-semibold w-16 text-right">{auditsCompleted}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium w-28">In Progress</span>
                  <div className="flex-1 h-3 bg-muted rounded-full overflow-hidden"><div className="h-full bg-amber-500 rounded-full" style={{ width: `${audits.length > 0 ? (auditsInProgress / audits.length) * 100 : 0}%` }} /></div>
                  <span className="text-sm font-semibold w-16 text-right">{auditsInProgress}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium w-28">Planned</span>
                  <div className="flex-1 h-3 bg-muted rounded-full overflow-hidden"><div className="h-full bg-sky-500 rounded-full" style={{ width: `${audits.length > 0 ? (auditsPlanned / audits.length) * 100 : 0}%` }} /></div>
                  <span className="text-sm font-semibold w-16 text-right">{auditsPlanned}</span>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border border-border/60 shadow-sm">
            <CardHeader className="pb-3"><CardTitle className="text-base">Monthly Inspection Trend</CardTitle><CardDescription className="text-xs">Inspections by month</CardDescription></CardHeader>
            <CardContent>
              {monthlyData.length === 0 ? <p className="text-sm text-muted-foreground">No inspection data for chart.</p> : (
                <div className="flex items-end gap-3 h-40">
                  {monthlyData.map(d => {
                    const maxM = Math.max(...monthlyData.map(x => x.total), 1);
                    return (
                      <div key={d.monthKey} className="flex-1 flex flex-col items-center gap-1">
                        <span className="text-xs font-medium">{d.passed}/{d.total}</span>
                        <div className="w-full bg-emerald-100 rounded-t-md" style={{ height: `${(d.total / maxM) * 100}px` }}>
                          <div className="w-full h-full bg-emerald-500 rounded-t-md opacity-80" />
                        </div>
                        <span className="text-[10px] text-muted-foreground text-center">{d.month.split(' ')[0]}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
        <Card className="border border-border/60 shadow-sm"><CardContent className="p-0">
          <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Month</TableHead><TableHead className="text-right">Total</TableHead><TableHead className="hidden sm:table-cell text-right">Passed</TableHead><TableHead className="hidden sm:table-cell text-right">Failed</TableHead><TableHead className="text-right">Pass Rate</TableHead></TableRow></TableHeader><TableBody>
            {monthlyData.length === 0 ? (
              <TableRow><TableCell colSpan={5}><EmptyState icon={ClipboardCheck} title="No monthly data" description="Inspection data will appear by month." /></TableCell></TableRow>
            ) : monthlyData.map(d => (
              <TableRow key={d.monthKey} className="hover:bg-muted/30">
                <TableCell className="font-medium">{d.month}</TableCell>
                <TableCell className="text-right">{d.total}</TableCell>
                <TableCell className="text-right text-emerald-600 hidden sm:table-cell">{d.passed}</TableCell>
                <TableCell className="text-right text-red-600 hidden sm:table-cell">{d.failed}</TableCell>
                <TableCell className={`text-right font-medium ${d.passRate >= 95 ? 'text-emerald-600' : d.passRate >= 80 ? 'text-amber-600' : 'text-red-600'}`}>{d.passRate}%</TableCell>
              </TableRow>
            ))}
          </TableBody></Table></div>
        </CardContent></Card>
      </>)}
    </div>
  );
}
export function ReportsSafetyPage() {
  const moduleEnabled = useModuleEnabled(MODULE_CODES.SAFETY);
  const { startDate, setStartDate, endDate, setEndDate } = useDateRange();
  const [incidents, setIncidents] = useState<any[]>([]);
  const [inspections, setInspections] = useState<any[]>([]);
  const [training, setTraining] = useState<any[]>([]);
  const [incidentKpis, setIncidentKpis] = useState<any>(null);
  const [inspKpis, setInspKpis] = useState<any>(null);
  const [trainingKpis, setTrainingKpis] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.get<any>('/api/safety-incidents?limit=9999'),
      api.get<any>('/api/safety-inspections?limit=9999'),
      api.get<any>('/api/safety-training?limit=9999'),
    ]).then(([incRes, inspRes, trainRes]) => {
      const incData = incRes.success && Array.isArray(incRes.data) ? filterByDateRange(incRes.data, startDate, endDate) : [];
      const inspData = inspRes.success && Array.isArray(inspRes.data) ? filterByDateRange(inspRes.data, startDate, endDate) : [];
      const trainData = trainRes.success && Array.isArray(trainRes.data) ? filterByDateRange(trainRes.data, startDate, endDate) : [];
      setIncidents(incData);
      setInspections(inspData);
      setTraining(trainData);
      if (incRes.kpis) setIncidentKpis(incRes.kpis);
      if (inspRes.kpis) setInspKpis(inspRes.kpis);
      if (trainRes.kpis) setTrainingKpis(trainRes.kpis);
      setLoading(false);
    });
  }, [startDate, endDate]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Severity breakdown
  const severityMap: Record<string, number> = {};
  incidents.forEach(i => { const s = i.severity || 'unknown'; severityMap[s] = (severityMap[s] || 0) + 1; });
  const severityBreakdown = Object.entries(severityMap).map(([sev, count]) => ({
    name: sev.charAt(0).toUpperCase() + sev.slice(1), count,
  }));
  const sevColors: Record<string, string> = { critical: 'bg-red-500', high: 'bg-orange-500', medium: 'bg-amber-500', low: 'bg-emerald-500', minor: 'bg-sky-500' };

  // Incident status
  const openIncidents = incidents.filter(i => i.status === 'open').length;
  const investigatingIncidents = incidents.filter(i => i.status === 'investigating').length;
  const closedIncidents = incidents.filter(i => i.status === 'closed').length;

  // Inspection completion
  const inspCompleted = inspections.filter(i => i.status === 'completed').length;
  const inspScheduled = inspections.filter(i => i.status === 'scheduled').length;
  const inspFailed = inspections.filter(i => i.status === 'failed').length;
  const inspCompletionRate = inspections.length > 0 ? Math.round((inspCompleted / inspections.length) * 100) : 0;

  // Training compliance
  const trainCompleted = training.filter(t => t.status === 'completed').length;
  const trainPlanned = training.filter(t => t.status === 'planned').length;
  const trainInProgress = training.filter(t => t.status === 'in_progress').length;
  const trainingCompliance = training.length > 0 ? Math.round((trainCompleted / training.length) * 100) : 0;

  // Total training hours
  const totalTrainingHrs = training.reduce((sum, t) => sum + (t.durationHours || 0), 0);

  // Monthly incident trend
  const monthlyMap: Record<string, { incidents: number; closed: number; inspections: number; trainingHrs: number }> = {};
  incidents.forEach(i => {
    const dateStr = i.createdAt;
    if (!dateStr) return;
    const d = new Date(dateStr);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (!monthlyMap[key]) monthlyMap[key] = { incidents: 0, closed: 0, inspections: 0, trainingHrs: 0 };
    monthlyMap[key].incidents += 1;
    if (i.status === 'closed') monthlyMap[key].closed += 1;
  });
  inspections.forEach(i => {
    const dateStr = i.createdAt;
    if (!dateStr) return;
    const d = new Date(dateStr);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (!monthlyMap[key]) monthlyMap[key] = { incidents: 0, closed: 0, inspections: 0, trainingHrs: 0 };
    monthlyMap[key].inspections += 1;
  });
  training.forEach(t => {
    const dateStr = t.createdAt;
    if (!dateStr) return;
    const d = new Date(dateStr);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (!monthlyMap[key]) monthlyMap[key] = { incidents: 0, closed: 0, inspections: 0, trainingHrs: 0 };
    monthlyMap[key].trainingHrs += t.durationHours || 0;
  });

  const monthlyData = Object.entries(monthlyMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-6)
    .map(([key, data]) => {
      const d = new Date(key + '-01');
      const label = format(d, 'MMM yyyy');
      return { month: label, monthKey: key, ...data };
    });

  const totalIncidents = incidents.length;
  const daysSinceLast = incidentKpis?.daysSinceLast ?? '—';

  const summaryCards = [
    { label: 'Total Incidents', value: totalIncidents.toString(), icon: AlertTriangle, color: 'bg-red-50 text-red-600' },
    { label: 'Open Cases', value: (openIncidents + investigatingIncidents).toString(), icon: ShieldAlert, color: 'bg-amber-50 text-amber-600' },
    { label: 'Inspections Done', value: `${inspCompletionRate}%`, icon: ClipboardCheck, color: 'bg-emerald-50 text-emerald-600' },
    { label: 'Training Compliance', value: `${trainingCompliance}%`, icon: GraduationCap, color: 'bg-sky-50 text-sky-600' },
  ];

  if (!moduleEnabled) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <p className="text-muted-foreground">This module is not active.</p>
          <p className="text-sm text-muted-foreground mt-1">Enable it in Settings → Modules to view this report.</p>
        </div>
      </div>
    );
  }

  if (loading) return <div className="page-content"><LoadingSkeleton /></div>;

  return (
    <div className="page-content">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div><h1 className="text-2xl font-bold tracking-tight">Safety Reports</h1><p className="text-muted-foreground mt-1">Incident trends, severity breakdown, inspection completion, and training compliance from real safety data</p></div>
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        <Card className="border border-border/60 shadow-sm"><CardContent className="p-4">
          <DateRangePicker label="Date Range" from={startDate || undefined} to={endDate || undefined} onChange={(f, t) => { setStartDate(f || ''); setEndDate(t || ''); }} />
        </CardContent></Card>
        <Button variant="outline" size="sm" onClick={() => exportCSV('safety-incidents', ['ID', 'Title', 'Severity', 'Status', 'Date', 'Reported By'], incidents.map(i => [i.incidentNumber || i.id || '', i.title || '', i.severity || '', i.status || '', i.createdAt ? new Date(i.createdAt).toISOString().slice(0, 10) : '', i.reportedBy || '']))}>
          <Download className="h-4 w-4 mr-1.5" />Export CSV
        </Button>
        <Button variant="outline" size="sm" onClick={() => exportPDF({
          title: 'Safety Reports',
          subtitle: `Date Range: ${startDate} to ${endDate}`,
          filename: 'safety-incidents',
          headers: ['ID', 'Title', 'Severity', 'Status', 'Date', 'Reported By'],
          rows: incidents.map(i => [i.incidentNumber || i.id || '', i.title || '', i.severity || '', i.status || '', i.createdAt ? new Date(i.createdAt).toISOString().slice(0, 10) : '', i.reportedBy || '']),
          summary: summaryCards.map(k => ({ label: k.label, value: String(k.value) })),
        })}>
          <FileDown className="h-4 w-4 mr-1.5" />Export PDF
        </Button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {summaryCards.map(k => { const I = k.icon; return (
          <div key={k.label} className="bg-card text-card-foreground border border-border/60 rounded-xl shadow-sm p-5 cursor-pointer hover:shadow-md transition-all">
            <div className="flex items-center gap-4">
              <div className={`h-11 w-11 rounded-xl ${k.color} flex items-center justify-center`}><I className="h-5 w-5" /></div>
              <div><p className="text-2xl font-bold">{k.value}</p><p className="text-xs text-muted-foreground">{k.label}</p></div>
            </div>
          </div>
        ); })}
      </div>
      {totalIncidents === 0 && inspections.length === 0 && training.length === 0 ? (
        <EmptyState icon={ShieldAlert} title="No safety data available for this date range" description="Record incidents, inspections, or training to see safety metrics." />
      ) : (<>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="border border-border/60 shadow-sm">
            <CardHeader className="pb-3"><CardTitle className="text-base">Severity Breakdown</CardTitle><CardDescription className="text-xs">Incidents by severity level</CardDescription></CardHeader>
            <CardContent>
              {severityBreakdown.length === 0 ? <p className="text-sm text-muted-foreground">No incidents in date range.</p> : (
                <div className="space-y-3">
                  {severityBreakdown.map(s => {
                    const maxSev = Math.max(...severityBreakdown.map(x => x.count), 1);
                    return (
                      <div key={s.name} className="flex items-center gap-3">
                        <span className="text-sm font-medium w-24">{s.name}</span>
                        <div className="flex-1 h-2.5 bg-muted rounded-full overflow-hidden"><div className={`h-full ${sevColors[s.name.toLowerCase()] || 'bg-slate-400'} rounded-full transition-all`} style={{ width: `${(s.count / maxSev) * 100}%` }} /></div>
                        <span className="text-sm font-semibold w-16 text-right">{s.count}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
          <Card className="border border-border/60 shadow-sm">
            <CardHeader className="pb-3"><CardTitle className="text-base">Inspection & Training</CardTitle><CardDescription className="text-xs">{inspections.length} inspections, {training.length} training sessions</CardDescription></CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium w-28">Completed</span>
                  <div className="flex-1 h-2.5 bg-muted rounded-full overflow-hidden"><div className="h-full bg-emerald-500 rounded-full" style={{ width: `${inspCompletionRate}%` }} /></div>
                  <span className="text-sm font-semibold w-16 text-right">{inspCompleted}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium w-28">Scheduled</span>
                  <div className="flex-1 h-2.5 bg-muted rounded-full overflow-hidden"><div className="h-full bg-sky-500 rounded-full" style={{ width: `${inspections.length > 0 ? (inspScheduled / inspections.length) * 100 : 0}%` }} /></div>
                  <span className="text-sm font-semibold w-16 text-right">{inspScheduled}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium w-28">Failed</span>
                  <div className="flex-1 h-2.5 bg-muted rounded-full overflow-hidden"><div className="h-full bg-red-500 rounded-full" style={{ width: `${inspections.length > 0 ? (inspFailed / inspections.length) * 100 : 0}%` }} /></div>
                  <span className="text-sm font-semibold w-16 text-right">{inspFailed}</span>
                </div>
                <Separator />
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium w-28">Training Done</span>
                  <div className="flex-1 h-2.5 bg-muted rounded-full overflow-hidden"><div className="h-full bg-violet-500 rounded-full" style={{ width: `${trainingCompliance}%` }} /></div>
                  <span className="text-sm font-semibold w-16 text-right">{trainCompleted}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Total Training Hours</span>
                  <span className="font-semibold">{totalTrainingHrs} hrs</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
        <Card className="border border-border/60 shadow-sm">
          <CardHeader className="pb-3"><CardTitle className="text-base">Monthly Safety Trend</CardTitle><CardDescription className="text-xs">Incidents, inspections, and training by month</CardDescription></CardHeader>
          <CardContent>
            <div className="flex items-end gap-3 h-40">
              {monthlyData.map(d => {
                const maxM = Math.max(...monthlyData.map(x => x.inspections + x.incidents), 1);
                return (
                  <div key={d.monthKey} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-xs font-medium">{d.incidents}/{d.inspections}</span>
                    <div className="w-full bg-amber-100 rounded-t-md" style={{ height: `${((d.inspections + d.incidents) / maxM) * 100}px` }}>
                      <div className="w-full h-full bg-amber-500 rounded-t-md opacity-80" />
                    </div>
                    <span className="text-[10px] text-muted-foreground text-center">{d.month.split(' ')[0]}</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
        <Card className="border border-border/60 shadow-sm"><CardContent className="p-0">
          <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Month</TableHead><TableHead className="text-right">Incidents</TableHead><TableHead className="hidden sm:table-cell text-right">Closed</TableHead><TableHead className="text-right">Inspections</TableHead><TableHead className="hidden md:table-cell text-right">Training Hrs</TableHead></TableRow></TableHeader><TableBody>
            {monthlyData.length === 0 ? (
              <TableRow><TableCell colSpan={5}><EmptyState icon={Calendar} title="No monthly data" description="Safety data will appear by month." /></TableCell></TableRow>
            ) : monthlyData.map(d => (
              <TableRow key={d.monthKey} className="hover:bg-muted/30">
                <TableCell className="font-medium">{d.month}</TableCell>
                <TableCell className={`text-right font-medium ${d.incidents > 0 ? 'text-red-600' : 'text-foreground'}`}>{d.incidents}</TableCell>
                <TableCell className="text-right text-emerald-600 hidden sm:table-cell">{d.closed}</TableCell>
                <TableCell className="text-right">{d.inspections}</TableCell>
                <TableCell className="text-right text-muted-foreground hidden md:table-cell">{d.trainingHrs} hrs</TableCell>
              </TableRow>
            ))}
          </TableBody></Table></div>
        </CardContent></Card>
      </>)}
    </div>
  );
}
export function ReportsFinancialPage() {
  const woEnabled = useModuleEnabled(MODULE_CODES.WORK_ORDERS);
  const invEnabled = useModuleEnabled(MODULE_CODES.INVENTORY);
  const prodEnabled = useModuleEnabled(MODULE_CODES.PRODUCTION);
  const pmEnabled = useModuleEnabled(MODULE_CODES.PM_SCHEDULES);
  const repairsEnabled = useModuleEnabled(MODULE_CODES.REPAIRS);
  const moduleEnabled = woEnabled || invEnabled || prodEnabled;
  const { startDate, setStartDate, endDate, setEndDate } = useDateRange();
  const [workOrders, setWorkOrders] = useState<any[]>([]);
  const [assets, setAssets] = useState<any[]>([]);
  const [inventory, setInventory] = useState<any[]>([]);
  const [inventoryKpi, setInventoryKpi] = useState<any>(null);
  const [prodKpi, setProdKpi] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.get<any>('/api/work-orders?limit=9999'),
      api.get<any>('/api/assets?limit=9999'),
      api.get<any>('/api/inventory?limit=9999'),
      api.get<any>('/api/inventory/kpi'),
      api.get<any>('/api/production-orders/kpi'),
    ]).then(([woRes, assetRes, invRes, invKpiRes, prodKpiRes]) => {
      // Filter WOs by date range client-side
      let woData = woRes.success && Array.isArray(woRes.data) ? filterByDateRange(woRes.data, startDate, endDate) : [];
      // Filter out PM WOs if PM module is disabled, repair WOs if repairs module is disabled
      woData = woData.filter((wo: any) => {
        if (!pmEnabled && wo.type === 'preventive') return false;
        if (!repairsEnabled && (wo.type === 'corrective' || wo.type === 'emergency')) return false;
        return true;
      });
      setWorkOrders(woData);
      if (assetRes.success && Array.isArray(assetRes.data)) setAssets(assetRes.data);
      if (invRes.success && Array.isArray(invRes.data)) setInventory(invRes.data);
      if (invKpiRes.success && invKpiRes.data) setInventoryKpi(invKpiRes.data);
      if (prodKpiRes.success && prodKpiRes.data) setProdKpi(prodKpiRes.data);
      setLoading(false);
    });
  }, [startDate, endDate, pmEnabled, repairsEnabled]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const totalCost = workOrders.reduce((sum, wo) => sum + (wo.totalCost || 0), 0);
  const materialCost = workOrders.reduce((sum, wo) => sum + (wo.materialCost || 0), 0);
  const laborCost = workOrders.reduce((sum, wo) => sum + (wo.laborCost || 0), 0);
  const avgCost = workOrders.length > 0 ? totalCost / workOrders.length : 0;

  // Asset values
  const totalAssetPurchaseCost = assets.reduce((sum, a) => sum + (a.purchaseCost || 0), 0);
  const totalAssetCurrentValue = assets.reduce((sum, a) => sum + (a.currentValue || 0), 0);

  // Inventory value
  const totalInventoryValue = inventoryKpi ? (inventoryKpi.totalValue || 0) : inventory.reduce((sum, i) => sum + ((i.currentStock || 0) * (i.unitCost || 0)), 0);

  // Production value from KPI
  const productionValue = prodKpi ? (prodKpi.completedValue || 0) : 0;

  const costByType: Record<string, { cost: number; count: number }> = {};
  workOrders.forEach(wo => {
    const t = wo.type || 'other';
    if (!costByType[t]) costByType[t] = { cost: 0, count: 0 };
    costByType[t].cost += wo.totalCost || 0;
    costByType[t].count += 1;
  });
  const typeEntries = Object.entries(costByType).sort((a, b) => b[1].cost - a[1].cost);

  // Monthly cost trends from filtered WOs
  const monthlyCostMap: Record<string, { totalCost: number; laborCost: number; materialCost: number; count: number }> = {};
  workOrders.forEach(wo => {
    const dateStr = wo.actualEnd || wo.updatedAt || wo.createdAt;
    if (!dateStr) return;
    const d = new Date(dateStr);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (!monthlyCostMap[key]) monthlyCostMap[key] = { totalCost: 0, laborCost: 0, materialCost: 0, count: 0 };
    monthlyCostMap[key].totalCost += wo.totalCost || 0;
    monthlyCostMap[key].laborCost += wo.laborCost || 0;
    monthlyCostMap[key].materialCost += wo.materialCost || 0;
    monthlyCostMap[key].count += 1;
  });

  const monthlyCostData = Object.entries(monthlyCostMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-6)
    .map(([key, data]) => {
      const d = new Date(key + '-01');
      const label = format(d, 'MMM yyyy');
      return { month: label, monthKey: key, ...data };
    });

  const maxMonthlyCost = monthlyCostData.length > 0 ? Math.max(...monthlyCostData.map(d => d.totalCost), 1) : 1;

  const highCostWOs = [...workOrders].sort((a, b) => (b.totalCost || 0) - (a.totalCost || 0)).slice(0, 15);

  const typeColors: Record<string, string> = { preventive: 'bg-emerald-500', corrective: 'bg-amber-500', emergency: 'bg-red-500', inspection: 'bg-sky-500', predictive: 'bg-violet-500', project: 'bg-teal-500' };
  const getWoModuleLabel = (type: string): string | null => {
    if (type === 'preventive') return 'PM';
    if (type === 'corrective' || type === 'emergency') return 'Repair';
    return null;
  };

  const summaryCards = [
    { label: 'Maintenance Cost', value: formatCurrency(totalCost), icon: DollarSign, color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 dark:text-emerald-400' },
    { label: 'Inventory Value', value: formatCurrency(Math.round(totalInventoryValue)), icon: Boxes, color: 'text-amber-600 bg-amber-50 dark:bg-amber-900/30 dark:text-amber-400' },
    { label: 'Production Value', value: formatCurrency(productionValue), icon: Factory, color: 'text-sky-600 bg-sky-50 dark:bg-sky-900/30 dark:text-sky-400' },
    { label: 'Avg WO Cost', value: formatCurrency(avgCost), icon: TrendingUp, color: 'text-violet-600 bg-violet-50 dark:bg-violet-900/30 dark:text-violet-400' },
  ];

  if (!moduleEnabled) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <p className="text-muted-foreground">This module is not active.</p>
          <p className="text-sm text-muted-foreground mt-1">Enable it in Settings → Modules to view this report.</p>
        </div>
      </div>
    );
  }

  if (loading) return <div className="page-content"><LoadingSkeleton /></div>;

  return (
    <div className="page-content">
      <div><h1 className="text-2xl font-bold tracking-tight">Financial Reports</h1><p className="text-muted-foreground mt-1">Maintenance cost breakdown, inventory value, production value, and budget trends from real financial data</p></div>
      <div className="flex items-center gap-3 flex-wrap">
        <Card className="border border-border/60 shadow-sm"><CardContent className="p-4">
          <DateRangePicker label="Date Range" from={startDate || undefined} to={endDate || undefined} onChange={(f, t) => { setStartDate(f || ''); setEndDate(t || ''); }} />
        </CardContent></Card>
        <Button variant="outline" size="sm" onClick={() => exportCSV('financial-work-orders', ['WO Number', 'Title', 'Type', 'Priority', 'Cost', 'Status'], workOrders.map(wo => [wo.woNumber || '', wo.title || '', wo.type || '', wo.priority || '', (wo.totalCost || 0).toString(), wo.status || '']))}>
          <Download className="h-4 w-4 mr-1.5" />Export CSV
        </Button>
        <Button variant="outline" size="sm" onClick={() => exportPDF({
          title: 'Financial Reports',
          subtitle: `Date Range: ${startDate} to ${endDate}`,
          filename: 'financial-work-orders',
          headers: ['WO Number', 'Title', 'Type', 'Priority', 'Cost', 'Status'],
          rows: workOrders.map(wo => [wo.woNumber || '', wo.title || '', wo.type || '', wo.priority || '', formatCurrency(wo.totalCost), wo.status || '']),
          summary: summaryCards.map(k => ({ label: k.label, value: String(k.value) })),
        })}>
          <FileDown className="h-4 w-4 mr-1.5" />Export PDF
        </Button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {summaryCards.map(k => { const I = k.icon; return (
          <Card key={k.label} className="cursor-pointer hover:shadow-md transition-all"><CardContent className="p-5"><div className="flex items-center gap-4"><div className={`h-11 w-11 rounded-xl ${k.color} flex items-center justify-center`}><I className="h-5 w-5" /></div><div><p className="text-2xl font-bold">{k.value}</p><p className="text-xs text-muted-foreground">{k.label}</p></div></div></CardContent></Card>
        ); })}
      </div>
      {monthlyCostData.length > 0 && (
        <Card className="border border-border/60 shadow-sm">
          <CardHeader className="pb-3"><CardTitle className="text-base">Monthly Cost Trends</CardTitle><CardDescription className="text-xs">Maintenance expenditure by month (filtered by date range)</CardDescription></CardHeader>
          <CardContent>
            <div className="flex items-end gap-3 h-48">
              {monthlyCostData.map(d => (
                <div key={d.monthKey} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-xs font-medium">{formatCurrency(d.totalCost)}</span>
                  <div className="w-full bg-emerald-100 rounded-t-md" style={{ height: `${(d.totalCost / maxMonthlyCost) * 140}px` }}>
                    <div className="w-full h-full bg-emerald-500 rounded-t-md opacity-80" />
                  </div>
                  <span className="text-[10px] text-muted-foreground text-center">{d.month.split(' ')[0]}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border"><CardHeader><CardTitle className="text-base">Cost by WO Type</CardTitle><CardDescription className="text-xs">Maintenance expenditure breakdown by type</CardDescription></CardHeader><CardContent>
          <div className="space-y-3">
            {typeEntries.map(([type, data]) => {
              const pct = totalCost > 0 ? Math.round((data.cost / totalCost) * 100) : 0;
              return (
                <div key={type} className="flex items-center gap-3">
                  <span className="text-sm font-medium w-28 capitalize">{type.replace('_', ' ')}</span>
                  <div className="flex-1 h-2.5 bg-muted rounded-full overflow-hidden"><div className={`h-full ${typeColors[type] || 'bg-slate-400'} rounded-full transition-all`} style={{ width: `${pct}%` }} /></div>
                  <span className="text-sm font-semibold w-28 text-right">{formatCurrency(data.cost)} ({pct}%)</span>
                </div>
              );
            })}
            {typeEntries.length === 0 && <p className="text-sm text-muted-foreground">No cost data available for date range.</p>}
          </div>
        </CardContent></Card>
        <Card className="border"><CardHeader><CardTitle className="text-base">Portfolio Value</CardTitle><CardDescription className="text-xs">Asset, inventory, and production value summary</CardDescription></CardHeader><CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Total Assets</span>
              <span className="text-sm font-semibold">{assets.length}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Asset Purchase Cost</span>
              <span className="text-sm font-semibold">{formatCurrency(totalAssetPurchaseCost)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Asset Current Value</span>
              <span className="text-sm font-semibold">{formatCurrency(totalAssetCurrentValue)}</span>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Inventory Value</span>
              <span className="text-sm font-semibold">{formatCurrency(Math.round(totalInventoryValue))}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Production Value (completed)</span>
              <span className="text-sm font-semibold">{formatCurrency(productionValue)}</span>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Total Portfolio Value</span>
              <span className="text-lg font-bold">{formatCurrency(totalAssetCurrentValue + Math.round(totalInventoryValue) + productionValue)}</span>
            </div>
          </div>
        </CardContent></Card>
      </div>
      <Card className="border"><CardHeader><CardTitle className="text-base">High-Cost Work Orders</CardTitle><CardDescription className="text-xs">Top work orders by total cost (filtered by date range)</CardDescription></CardHeader><CardContent>
        <div className="max-h-96 overflow-y-auto">
          <Table><TableHeader><TableRow><TableHead>WO #</TableHead><TableHead>Title</TableHead><TableHead className="hidden sm:table-cell">Type</TableHead><TableHead className="hidden md:table-cell">Priority</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Material</TableHead><TableHead className="text-right">Labor</TableHead><TableHead className="text-right">Total</TableHead></TableRow></TableHeader><TableBody>
            {highCostWOs.length === 0 ? (
              <TableRow><TableCell colSpan={8}><EmptyState icon={DollarSign} title="No cost data" description="Cost data will appear once work orders have costs assigned." /></TableCell></TableRow>
            ) : highCostWOs.map(wo => (
              <TableRow key={wo.id} className="hover:bg-muted/30">
                <TableCell className="font-mono text-xs">{wo.woNumber}</TableCell>
                <TableCell className="font-medium max-w-[200px] truncate">{wo.title}</TableCell>
                <TableCell className="text-xs capitalize hidden sm:table-cell">
                  <div className="flex items-center gap-1">
                    <span className="inline-block px-1.5 py-0.5 rounded text-[10px] text-white mr-0.5" style={{ backgroundColor: typeColors[wo.type] ? undefined : '#64748b', background: typeColors[wo.type] || '#64748b' }}>{(wo.type || '').replace('_', ' ').toUpperCase()}</span>
                    {getWoModuleLabel(wo.type) && (
                      <Badge variant="outline" className={`${getWoModuleLabel(wo.type) === 'PM' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-amber-100 text-amber-700 border-amber-200'} text-[9px] px-1.5`}>
                        {getWoModuleLabel(wo.type)}
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell className="hidden md:table-cell"><PriorityBadge priority={wo.priority} /></TableCell>
                <TableCell><StatusBadge status={wo.status} /></TableCell>
                <TableCell className="text-right text-muted-foreground">{formatCurrency(wo.materialCost)}</TableCell>
                <TableCell className="text-right text-muted-foreground">{formatCurrency(wo.laborCost)}</TableCell>
                <TableCell className="text-right font-semibold">{formatCurrency(wo.totalCost)}</TableCell>
              </TableRow>
            ))}
          </TableBody></Table>
        </div>
      </CardContent></Card>
    </div>
  );
}
export function ReportsCustomPage() {
  const [dataSource, setDataSource] = useState<'work_orders' | 'assets' | 'inventory' | 'maintenance_requests'>('work_orders');
  const [metric, setMetric] = useState('count');
  const [loading, setLoading] = useState(true);
  const [summaryRows, setSummaryRows] = useState<{ key: string; label: string; value: string | number }[]>([]);
  const [totalCount, setTotalCount] = useState(0);

  const dataSourceLabels: Record<string, string> = {
    work_orders: 'Work Orders',
    assets: 'Assets',
    inventory: 'Inventory Items',
    maintenance_requests: 'Maintenance Requests',
  };

  const metricLabels: Record<string, string> = {
    count: 'Count by Status',
    cost: 'Cost Breakdown',
    hours: 'Hours Analysis',
    priority: 'Priority Distribution',
  };

  useEffect(() => {
    let endpoint = '';
    if (dataSource === 'work_orders') endpoint = '/api/work-orders?limit=9999';
    else if (dataSource === 'assets') endpoint = '/api/assets?limit=9999';
    else if (dataSource === 'inventory') endpoint = '/api/inventory?limit=9999';
    else if (dataSource === 'maintenance_requests') endpoint = '/api/maintenance-requests?limit=9999';

    api.get(endpoint).then(res => {
      const data = Array.isArray(res.data) ? res.data : [];
      setTotalCount(data.length);

      const rows: { key: string; label: string; value: string | number }[] = [];

      if (dataSource === 'work_orders') {
        const wos = data as WorkOrder[];
        if (metric === 'count') {
          const statusMap: Record<string, number> = {};
          wos.forEach(wo => { const s = wo.status || 'unknown'; statusMap[s] = (statusMap[s] || 0) + 1; });
          Object.entries(statusMap).sort((a, b) => b[1] - a[1]).forEach(([s, c]) => rows.push({ key: s, label: s.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()), value: c }));
        } else if (metric === 'cost') {
          const totalCost = wos.reduce((s, wo) => s + (wo.totalCost || 0), 0);
          rows.push({ key: 'total', label: 'Total Cost', value: formatCurrency(totalCost) });
          rows.push({ key: 'labor', label: 'Total Labor Cost', value: formatCurrency(wos.reduce((s, wo) => s + (wo.laborCost || 0), 0)) });
          rows.push({ key: 'material', label: 'Total Material Cost', value: formatCurrency(wos.reduce((s, wo) => s + (wo.materialCost || 0), 0)) });
          rows.push({ key: 'avg', label: 'Avg Cost per WO', value: wos.length > 0 ? formatCurrency(Math.round(totalCost / wos.length)) : '₵0' });
        } else if (metric === 'hours') {
          const totalActual = wos.reduce((s, wo) => s + (wo.actualHours || 0), 0);
          const totalEst = wos.reduce((s, wo) => s + (wo.estimatedHours || 0), 0);
          rows.push({ key: 'totalActual', label: 'Total Actual Hours', value: `${totalActual.toFixed(1)} hrs` });
          rows.push({ key: 'totalEst', label: 'Total Estimated Hours', value: `${totalEst.toFixed(1)} hrs` });
          rows.push({ key: 'avg', label: 'Avg Actual per WO', value: wos.length > 0 ? `${(totalActual / wos.length).toFixed(1)} hrs` : '0 hrs' });
        } else if (metric === 'priority') {
          const prioMap: Record<string, number> = {};
          wos.forEach(wo => { const p = wo.priority || 'unknown'; prioMap[p] = (prioMap[p] || 0) + 1; });
          Object.entries(prioMap).sort((a, b) => b[1] - a[1]).forEach(([p, c]) => rows.push({ key: p, label: p.charAt(0).toUpperCase() + p.slice(1), value: c }));
        }
      } else if (dataSource === 'assets') {
        const items = data as Asset[];
        if (metric === 'count') {
          const statusMap: Record<string, number> = {};
          items.forEach(a => { const s = a.status || 'unknown'; statusMap[s] = (statusMap[s] || 0) + 1; });
          Object.entries(statusMap).sort((a, b) => b[1] - a[1]).forEach(([s, c]) => rows.push({ key: s, label: s.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()), value: c }));
        } else if (metric === 'cost') {
          const totalPurchase = items.reduce((s, a) => s + (a.purchaseCost || 0), 0);
          const totalCurrent = items.reduce((s, a) => s + (a.currentValue || 0), 0);
          rows.push({ key: 'purchase', label: 'Total Purchase Cost', value: formatCurrency(totalPurchase) });
          rows.push({ key: 'current', label: 'Total Current Value', value: formatCurrency(totalCurrent) });
          rows.push({ key: 'avg', label: 'Avg per Asset', value: items.length > 0 ? formatCurrency(Math.round(totalCurrent / items.length)) : '₵0' });
        } else if (metric === 'priority') {
          const condMap: Record<string, number> = {};
          items.forEach(a => { const c = a.condition || 'unknown'; condMap[c] = (condMap[c] || 0) + 1; });
          Object.entries(condMap).sort((a, b) => b[1] - a[1]).forEach(([c, n]) => rows.push({ key: c, label: c.charAt(0).toUpperCase() + c.slice(1), value: n }));
        } else {
          rows.push({ key: 'total', label: 'Total Assets', value: items.length });
        }
      } else if (dataSource === 'inventory') {
        const items = data as InventoryItem[];
        if (metric === 'count') {
          const catMap: Record<string, number> = {};
          items.forEach(i => { const c = i.category || 'unknown'; catMap[c] = (catMap[c] || 0) + 1; });
          Object.entries(catMap).sort((a, b) => b[1] - a[1]).forEach(([c, n]) => rows.push({ key: c, label: c, value: n }));
        } else if (metric === 'cost') {
          const totalValue = items.reduce((s, i) => s + ((i.currentStock || 0) * (i.unitCost || 0)), 0);
          const lowStock = items.filter(i => i.currentStock <= i.minStockLevel).length;
          rows.push({ key: 'totalValue', label: 'Total Inventory Value', value: formatCurrency(totalValue) });
          rows.push({ key: 'lowStock', label: 'Low Stock Items', value: lowStock });
          rows.push({ key: 'avg', label: 'Avg Value per Item', value: items.length > 0 ? formatCurrency(Math.round(totalValue / items.length)) : '₵0' });
        } else {
          rows.push({ key: 'total', label: 'Total Items', value: items.length });
          rows.push({ key: 'totalStock', label: 'Total Stock Units', value: items.reduce((s, i) => s + (i.currentStock || 0), 0) });
          rows.push({ key: 'lowStock', label: 'Low Stock Count', value: items.filter(i => i.currentStock <= i.minStockLevel).length });
        }
      } else if (dataSource === 'maintenance_requests') {
        const items = data as MaintenanceRequest[];
        if (metric === 'count') {
          const statusMap: Record<string, number> = {};
          items.forEach(mr => { const s = mr.status || 'unknown'; statusMap[s] = (statusMap[s] || 0) + 1; });
          Object.entries(statusMap).sort((a, b) => b[1] - a[1]).forEach(([s, c]) => rows.push({ key: s, label: s.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()), value: c }));
        } else if (metric === 'priority') {
          const prioMap: Record<string, number> = {};
          items.forEach(mr => { const p = mr.priority || 'unknown'; prioMap[p] = (prioMap[p] || 0) + 1; });
          Object.entries(prioMap).sort((a, b) => b[1] - a[1]).forEach(([p, c]) => rows.push({ key: p, label: p.charAt(0).toUpperCase() + p.slice(1), value: c }));
        } else {
          rows.push({ key: 'total', label: 'Total MRs', value: items.length });
          rows.push({ key: 'pending', label: 'Pending', value: items.filter(mr => mr.status === 'pending').length });
          rows.push({ key: 'approved', label: 'Approved', value: items.filter(mr => mr.status === 'approved').length });
        }
      }

      setSummaryRows(rows);
      setLoading(false);
    });
  }, [dataSource, metric]);

  const kpis = [
    { label: 'Data Source', value: dataSourceLabels[dataSource], icon: Database, color: 'bg-emerald-50 text-emerald-600' },
    { label: 'Metric', value: metricLabels[metric], icon: BarChart3, color: 'bg-sky-50 text-sky-600' },
    { label: 'Total Records', value: totalCount.toString(), icon: FileSpreadsheet, color: 'bg-amber-50 text-amber-600' },
    { label: 'Summary Rows', value: summaryRows.length.toString(), icon: CheckCircle2, color: 'bg-violet-50 text-violet-600' },
  ];

  return (
    <div className="page-content">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div><h1 className="text-2xl font-bold tracking-tight">Custom Reports</h1><p className="text-muted-foreground mt-1">Build custom reports by selecting a data source and metric — results are generated in real time</p></div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {kpis.map(k => { const I = k.icon; return (
          <div key={k.label} className="bg-card text-card-foreground border border-border/60 rounded-xl shadow-sm p-5">
            <div className="flex items-center gap-4">
              <div className={`h-11 w-11 rounded-xl ${k.color} flex items-center justify-center`}><I className="h-5 w-5" /></div>
              <div><p className="text-2xl font-bold">{k.value}</p><p className="text-xs text-muted-foreground">{k.label}</p></div>
            </div>
          </div>
        ); })}
      </div>
      <Card className="border border-border/60 shadow-sm">
        <CardHeader><CardTitle className="text-base">Report Builder</CardTitle><CardDescription className="text-xs">Select data source and metric to generate a report</CardDescription></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <div className="space-y-2">
              <Label>Data Source</Label>
              <Select value={dataSource} onValueChange={(v: any) => setDataSource(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="work_orders">Work Orders</SelectItem>
                  <SelectItem value="assets">Assets</SelectItem>
                  <SelectItem value="inventory">Inventory</SelectItem>
                  <SelectItem value="maintenance_requests">Maintenance Requests</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Metric</Label>
              <Select value={metric} onValueChange={setMetric}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="count">Count by Status</SelectItem>
                  <SelectItem value="cost">Cost Breakdown</SelectItem>
                  <SelectItem value="hours">Hours Analysis</SelectItem>
                  <SelectItem value="priority">Priority Distribution</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader><TableRow><TableHead className="w-12">#</TableHead><TableHead>Metric / Category</TableHead><TableHead className="text-right">Value</TableHead></TableRow></TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={3}><div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground mr-2" />Loading data...</div></TableCell></TableRow>
                ) : summaryRows.length === 0 ? (
                  <TableRow><TableCell colSpan={3}><EmptyState icon={FileSpreadsheet} title="No data available" description="No data found for the selected source and metric." /></TableCell></TableRow>
                ) : summaryRows.map((row, idx) => (
                  <TableRow key={row.key} className="hover:bg-muted/30">
                    <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                    <TableCell className="font-medium">{row.label}</TableCell>
                    <TableCell className="text-right font-semibold">{typeof row.value === 'number' ? row.value.toLocaleString() : row.value}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================================
// EQUIPMENT HISTORY REPORT — Full Machine Lifecycle
// ============================================================================

const EH_CHART_COLORS = ['#059669', '#0ea5e9', '#f59e0b', '#ef4444', '#8b5cf6', '#14b8a6', '#f97316', '#6366f1', '#ec4899', '#64748b'];

const EH_TYPE_COLORS: Record<string, string> = { preventive: 'bg-emerald-500', corrective: 'bg-amber-500', emergency: 'bg-red-500', inspection: 'bg-sky-500', predictive: 'bg-violet-500', project: 'bg-teal-500' };

const EH_SEVERITY_COLORS: Record<string, string> = { low: 'bg-slate-400', medium: 'bg-sky-500', high: 'bg-amber-500', critical: 'bg-red-500' };

const EH_CONDITION_COLORS: Record<string, string> = { excellent: 'bg-emerald-500', good: 'bg-sky-500', fair: 'bg-amber-500', poor: 'bg-orange-500', critical: 'bg-red-500' };

export function EquipmentHistoryPage() {
  const moduleEnabled = useModuleEnabled(MODULE_CODES.ASSETS);
  const pmEnabled = useModuleEnabled(MODULE_CODES.PM_SCHEDULES);
  const repairsEnabled = useModuleEnabled(MODULE_CODES.REPAIRS);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [selectedAsset, setSelectedAsset] = useState<any>(null);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [woFilterStatus, setWoFilterStatus] = useState<string>('all');
  const [woFilterType, setWoFilterType] = useState<string>('all');

  // Asset search
  const searchTimeout = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleSearch = (query: string) => {
    setSearchQuery(query);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (!query.trim()) { setSearchResults([]); return; }
    searchTimeout.current = setTimeout(() => {
      api.get<any[]>(`/api/assets?search=${encodeURIComponent(query.trim())}&limit=20`).then(res => {
        if (res.success && res.data) setSearchResults(res.data);
        else setSearchResults([]);
      }).catch(() => setSearchResults([]));
    }, 300);
  };

  const handleSelectAsset = (asset: any) => {
    setSelectedAsset(asset);
    setSearchResults([]);
    setSearchQuery('');
    setLoading(true);
    setError(null);
    setData(null);
    setActiveTab('overview');
    api.get<any>(`/api/assets/${asset.id}/history`).then(res => {
      if (res.success && res.data) setData(res.data);
      else setError(res.error || 'Failed to load history');
      setLoading(false);
    }).catch((err: any) => { setError(err.message || 'Network error'); setLoading(false); });
  };

  // PM types and repair types for module filtering
  const PM_TYPES = ['preventive'];
  const REPAIR_TYPES = ['corrective', 'emergency'];

  // Filtered work orders
  const filteredWOs = useMemo(() => {
    if (!data?.workOrders) return [];
    return data.workOrders.filter((wo: any) => {
      if (woFilterStatus !== 'all' && wo.status !== woFilterStatus) return false;
      if (woFilterType !== 'all' && wo.type !== woFilterType) return false;
      // Filter out PM WOs if PM module is disabled
      if (!pmEnabled && PM_TYPES.includes(wo.type)) return false;
      // Filter out repair WOs if repairs module is disabled
      if (!repairsEnabled && REPAIR_TYPES.includes(wo.type)) return false;
      return true;
    });
  }, [data, woFilterStatus, woFilterType, pmEnabled, repairsEnabled]);

  const s = data?.summary;

  // Helper to get PM/Repair label for a WO type
  const getWoModuleLabel = (type: string): string | null => {
    if (PM_TYPES.includes(type)) return 'PM';
    if (REPAIR_TYPES.includes(type)) return 'Repair';
    return null;
  };

  // KPI cards
  const kpiCards = [
    { label: 'Total WOs', value: filteredWOs.length, icon: ClipboardList, color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 dark:text-emerald-400', tab: 'workorders' as const },
    { label: 'Completion Rate', value: `${s?.completionRate ?? 0}%`, icon: CheckCircle2, color: 'text-sky-600 bg-sky-50 dark:bg-sky-900/30 dark:text-sky-400', tab: 'workorders' as const },
    { label: 'Total Cost', value: formatCurrency(s?.totalCost), icon: DollarSign, color: 'text-amber-600 bg-amber-50 dark:bg-amber-900/30 dark:text-amber-400', tab: 'costs' as const },
    { label: 'Total Downtime', value: `${Math.round((s?.totalDowntimeMinutes ?? 0) / 60)}h`, icon: TrendingDown, color: 'text-red-600 bg-red-50 dark:bg-red-900/30 dark:text-red-400', tab: 'workorders' as const },
    { label: 'MTBF', value: `${s?.mtbfDays ?? 0}d`, icon: Timer, color: 'text-violet-600 bg-violet-50 dark:bg-violet-900/30 dark:text-violet-400', tab: 'overview' as const },
    { label: 'Failures', value: s?.totalFailures ?? 0, icon: AlertTriangle, color: 'text-orange-600 bg-orange-50 dark:bg-orange-900/30 dark:text-orange-400', tab: 'failures' as const },
  ];

  // ── EXPORT HANDLERS ───────────────────────────────────────────────────
  const handleExportCSV = () => {
    if (!data || !selectedAsset) return;
    const rows: string[][] = [];
    rows.push(['--- Equipment History Report ---']);
    rows.push(['Asset', selectedAsset.name, 'Tag', selectedAsset.assetTag || '']);
    rows.push(['Manufacturer', selectedAsset.manufacturer || '', 'Model', selectedAsset.model || '']);
    rows.push(['Serial #', selectedAsset.serialNumber || '', 'Category', selectedAsset.categoryName || '']);
    rows.push([]);
    rows.push(['--- Summary ---']);
    rows.push(['Total WOs', String(s?.totalWOs ?? 0), 'Completed', String(s?.completedWOs ?? 0), 'Rate', `${s?.completionRate ?? 0}%`]);
    rows.push(['Total Cost', String(s?.totalCost ?? 0), 'Labor', String(s?.laborCost ?? 0), 'Parts', String(s?.partsCost ?? 0)]);
    rows.push(['Downtime (min)', String(s?.totalDowntimeMinutes ?? 0), 'MTBF (days)', String(s?.mtbfDays ?? 0), 'Failures', String(s?.totalFailures ?? 0)]);
    rows.push([]);
    rows.push(['--- Work Orders ---']);
    rows.push(['WO #', 'Title', 'Type', 'Priority', 'Status', 'Cost', 'Hours', 'Downtime (min)', 'Assignee', 'Created']);
    (data.workOrders || []).forEach((wo: any) => rows.push([wo.woNumber, wo.title, wo.type, wo.priority, wo.status, String(wo.totalCost), String(wo.actualHours), String(wo.downtimeMinutes), wo.assigneeName || '', wo.createdAt ? formatDate(wo.createdAt) : '']));
    rows.push([]);
    rows.push(['--- Failure Records ---']);
    rows.push(['Failure Code', 'Mode', 'Severity', 'Downtime (min)', 'Repair Cost', 'Detected', 'Resolved', 'Root Cause']);
    (data.failureRecords || []).forEach((fr: any) => rows.push([fr.failureCode || '', fr.failureMode, fr.failureSeverity, String(fr.downtimeMinutes), String(fr.repairCost), fr.detectedAt ? formatDate(fr.detectedAt) : '', fr.resolvedAt ? formatDate(fr.resolvedAt) : '', fr.rootCause || '']));
    rows.push([]);
    rows.push(['--- Parts Consumed ---']);
    rows.push(['Item', 'Item Code', 'Qty', 'Cost', 'WO Count', 'Supplier']);
    (data.partsConsumed || []).forEach((p: any) => rows.push([p.itemName, p.itemCode || '', String(p.totalQuantity), String(p.totalCost), String(p.woCount), p.supplier || '']));
    rows.push([]);
    rows.push(['--- TCO ---']);
    rows.push(['Purchase Cost', String(data.tco?.purchaseCost ?? ''), 'Maintenance Cost', String(data.tco?.totalMaintenanceCost ?? ''), 'Ratio', `${data.tco?.maintenanceCostRatio ?? 0}%`]);
    exportCSV(`equipment-history-${selectedAsset.name.replace(/[^a-zA-Z0-9]/g, '_')}`, ['Section', 'Field1', 'Value1', 'Field2', 'Value2'], rows);
  };

  const handlePrint = () => { window.print(); };

  const handleExportPDF = () => {
    if (!data || !selectedAsset || !s) return;
    exportPDF({
      title: `Equipment History — ${selectedAsset.name}`,
      subtitle: `${selectedAsset.manufacturer || ''} ${selectedAsset.model || ''} | ${selectedAsset.serialNumber || ''} | Category: ${selectedAsset.categoryName || '-'}`,
      filename: `equipment-history-${selectedAsset.name.replace(/[^a-zA-Z0-9]/g, '_')}`,
      orientation: 'landscape',
      summary: [
        { label: 'Total Work Orders', value: String(s.totalWOs) },
        { label: 'Completion Rate', value: `${s.completionRate}%` },
        { label: 'Total Cost', value: formatCurrency(s.totalCost) },
        { label: 'Total Downtime', value: `${Math.round(s.totalDowntimeMinutes / 60)} hours` },
        { label: 'MTBF', value: `${s.mtbfDays} days` },
        { label: 'Failures', value: String(s.totalFailures) },
        { label: 'Avg Cost/WO', value: formatCurrency(s.avgCostPerWO) },
      ],
      headers: ['WO #', 'Title', 'Type', 'Priority', 'Status', 'Assignee', 'Cost', 'Hours', 'Downtime', 'Created'],
      rows: (data.workOrders || []).slice(0, 100).map((wo: any) => [wo.woNumber, wo.title, wo.type, wo.priority, wo.status, wo.assigneeName || '-', formatCurrency(wo.totalCost), String(wo.actualHours), `${Math.round(wo.downtimeMinutes)}m`, wo.createdAt ? formatDate(wo.createdAt) : '-']),
    });
  };

  // Failure mode distribution for chart
  const failureModeData = useMemo(() => {
    const map: Record<string, number> = {};
    (data?.failureRecords || []).forEach((fr: any) => { map[fr.failureMode] = (map[fr.failureMode] || 0) + 1; });
    return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [data]);

  // Severity distribution
  const severityData = useMemo(() => {
    const map: Record<string, number> = {};
    (data?.failureRecords || []).forEach((fr: any) => { map[fr.failureSeverity] = (map[fr.failureSeverity] || 0) + 1; });
    return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [data]);

  const asset = data?.asset;

  if (!moduleEnabled) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <p className="text-muted-foreground">This module is not active.</p>
          <p className="text-sm text-muted-foreground mt-1">Enable it in Settings → Modules to view this report.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-content" id="equipment-history-printable">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3 print:hidden">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Equipment History</h1>
          <p className="text-muted-foreground mt-1">Complete maintenance lifecycle report for any asset</p>
        </div>
        {data && (
          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="sm" onClick={handleExportCSV} title="Export to CSV">
              <FileSpreadsheet className="h-3.5 w-3.5 mr-1" />Excel
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportPDF} title="Export to PDF">
              <FileDown className="h-3.5 w-3.5 mr-1" />PDF
            </Button>
            <Button variant="outline" size="sm" onClick={handlePrint} title="Print">
              <Printer className="h-3.5 w-3.5 mr-1" />Print
            </Button>
          </div>
        )}
      </div>

      {/* Asset Search */}
      <Card className="border border-border/60 shadow-sm print:shadow-none print:border">
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search assets by name or tag..."
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              className="pl-9"
            />
            {searchResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-background border rounded-lg shadow-lg z-50 max-h-64 overflow-y-auto">
                {searchResults.map((a: any) => (
                  <button
                    key={a.id}
                    className="w-full text-left px-4 py-2.5 hover:bg-muted/50 border-b last:border-b-0 flex items-center gap-3"
                    onClick={() => handleSelectAsset(a)}
                  >
                    <div>
                      <p className="text-sm font-medium">{a.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {a.assetTag || ''} {a.manufacturer || ''} {a.model || ''} — {typeof a.category === 'string' ? a.category : a.category?.name || 'Uncategorized'}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
          {selectedAsset && !loading && (
            <div className="flex items-center gap-2 mt-3">
              <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-xs">
                {selectedAsset.name}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {selectedAsset.assetTag && `${selectedAsset.assetTag} · `}{selectedAsset.manufacturer || ''}{selectedAsset.model ? ` ${selectedAsset.model}` : ''}
              </span>
              <Button variant="ghost" size="sm" className="h-6 text-xs text-muted-foreground" onClick={() => { setSelectedAsset(null); setData(null); }}>
                <XCircle className="h-3 w-3 mr-1" />Clear
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Loading State */}
      {loading && <LoadingSkeleton />}

      {/* Error State */}
      {error && !loading && (
        <Card className="border-red-200 bg-red-50/50"><CardContent className="p-6 text-center">
          <AlertTriangle className="h-8 w-8 text-red-400 mx-auto mb-2" />
          <p className="text-sm text-red-700">{error}</p>
        </CardContent></Card>
      )}

      {/* Main Content */}
      {data && asset && !loading && !error && (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-4 print:grid-cols-3 print:gap-2">
            {kpiCards.map(k => { const I = k.icon; return (
              <Card key={k.label} className="border border-border/60 shadow-sm print:shadow-none print:border cursor-pointer hover:shadow-md transition-all" onClick={() => k.tab && setActiveTab(k.tab)}><CardContent className="p-4 print:p-2">
                <div className="flex items-center gap-3">
                  <div className={`h-10 w-10 rounded-xl ${k.color} flex items-center justify-center shrink-0 print:hidden`}><I className="h-4.5 w-4.5" /></div>
                  <div className="min-w-0">
                    <p className="text-xl font-bold truncate">{k.value}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{k.label}</p>
                  </div>
                </div>
              </CardContent></Card>
            ); })}
          </div>

          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="flex-wrap h-auto gap-1 print:hidden">
              <TabsTrigger value="overview" className="text-xs"><BarChart3 className="h-3.5 w-3.5 mr-1" />Overview</TabsTrigger>
              <TabsTrigger value="workorders" className="text-xs"><ClipboardList className="h-3.5 w-3.5 mr-1" />Work Orders</TabsTrigger>
              <TabsTrigger value="failures" className="text-xs"><AlertTriangle className="h-3.5 w-3.5 mr-1" />Failure Analysis</TabsTrigger>
              <TabsTrigger value="parts" className="text-xs"><PackageSearch className="h-3.5 w-3.5 mr-1" />Parts & Materials</TabsTrigger>
              <TabsTrigger value="costs" className="text-xs"><DollarSign className="h-3.5 w-3.5 mr-1" />Cost Analysis</TabsTrigger>
              <TabsTrigger value="tco" className="text-xs"><CircleDollarSign className="h-3.5 w-3.5 mr-1" />TCO</TabsTrigger>
            </TabsList>

            {/* ─── TAB: Overview ──────────────────────────────────────── */}
            <TabsContent value="overview" className="space-y-6 mt-6">
              {/* Asset Details Card */}
              <Card className="border border-border/60 shadow-sm print:shadow-none print:border">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-emerald-600" />
                    {asset.name}
                    <Badge variant="outline" className={`ml-2 text-[10px] ${EH_CONDITION_COLORS[asset.condition] || 'bg-slate-100 text-slate-700'} text-white border-0`}>
                      {(asset.condition || 'N/A').toUpperCase()}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 text-sm">
                    <div><p className="text-xs text-muted-foreground mb-0.5">Manufacturer</p><p className="font-medium">{asset.manufacturer || '-'}</p></div>
                    <div><p className="text-xs text-muted-foreground mb-0.5">Model</p><p className="font-medium">{asset.model || '-'}</p></div>
                    <div><p className="text-xs text-muted-foreground mb-0.5">Serial Number</p><p className="font-medium font-mono text-xs">{asset.serialNumber || '-'}</p></div>
                    <div><p className="text-xs text-muted-foreground mb-0.5">Asset Tag</p><p className="font-medium font-mono text-xs">{asset.assetTag || '-'}</p></div>
                    <div><p className="text-xs text-muted-foreground mb-0.5">Category</p><p className="font-medium">{asset.categoryName || '-'}</p></div>
                    <div><p className="text-xs text-muted-foreground mb-0.5">Criticality</p><p className="font-medium capitalize">{asset.criticality || '-'}</p></div>
                    <div><p className="text-xs text-muted-foreground mb-0.5">Status</p><p className="font-medium capitalize">{asset.status || '-'}</p></div>
                    <div><p className="text-xs text-muted-foreground mb-0.5">Location</p><p className="font-medium">{[asset.location, asset.building, asset.floor, asset.area].filter(Boolean).join(' / ') || '-'}</p></div>
                    <div><p className="text-xs text-muted-foreground mb-0.5">Purchase Cost</p><p className="font-medium">{formatCurrency(asset.purchaseCost)}</p></div>
                    <div><p className="text-xs text-muted-foreground mb-0.5">Current Value</p><p className="font-medium">{formatCurrency(asset.currentValue)}</p></div>
                    <div><p className="text-xs text-muted-foreground mb-0.5">Warranty Expiry</p><p className="font-medium">{asset.warrantyExpiry ? formatDate(asset.warrantyExpiry) : '-'}</p></div>
                    <div><p className="text-xs text-muted-foreground mb-0.5">Expected Life</p><p className="font-medium">{asset.expectedLifeYears ? `${asset.expectedLifeYears} years` : '-'}</p></div>
                    <div><p className="text-xs text-muted-foreground mb-0.5">Year Manufactured</p><p className="font-medium">{asset.yearManufactured || '-'}</p></div>
                    <div><p className="text-xs text-muted-foreground mb-0.5">First WO</p><p className="font-medium">{s?.firstWODate ? formatDate(s.firstWODate) : '-'}</p></div>
                    <div><p className="text-xs text-muted-foreground mb-0.5">Last WO</p><p className="font-medium">{s?.lastWODate ? formatDate(s.lastWODate) : '-'}</p></div>
                  </div>
                </CardContent>
              </Card>

              {/* Charts Row */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Cost by Type Pie Chart */}
                <Card className="border border-border/60 shadow-sm print:shadow-none print:border">
                  <CardHeader className="pb-3"><CardTitle className="text-base">Cost by WO Type</CardTitle></CardHeader>
                  <CardContent>
                    {(data.costByType || []).length > 0 ? (
                      <ResponsiveContainer width="100%" height={240}>
                        <PieChart>
                          <Pie data={data.costByType} dataKey="totalCost" nameKey="type" cx="50%" cy="50%" outerRadius={90} label={({ type, percent }) => `${type} (${(percent * 100).toFixed(0)}%)`} labelLine={false} fontSize={11}>
                            {(data.costByType || []).map((_: any, i: number) => <Cell key={i} fill={EH_CHART_COLORS[i % EH_CHART_COLORS.length]} />)}
                          </Pie>
                          <Tooltip formatter={(val: number) => formatCurrency(val)} />
                        </PieChart>
                      </ResponsiveContainer>
                    ) : <EmptyState icon={PieChart} title="No cost data" description="No work order cost data available." />}
                  </CardContent>
                </Card>

                {/* Cost Trend Line Chart */}
                <Card className="border border-border/60 shadow-sm print:shadow-none print:border">
                  <CardHeader className="pb-3"><CardTitle className="text-base">Monthly Cost Trend</CardTitle></CardHeader>
                  <CardContent>
                    {(data.costByMonth || []).length > 0 ? (
                      <ResponsiveContainer width="100%" height={240}>
                        <LineChart data={data.costByMonth} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                          <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                          <YAxis tick={{ fontSize: 11 }} />
                          <Tooltip formatter={(val: number) => formatCurrency(val)} />
                          <Legend wrapperStyle={{ fontSize: 11 }} />
                          <Line type="monotone" dataKey="laborCost" name="Labor" stroke="#059669" strokeWidth={2} dot={false} />
                          <Line type="monotone" dataKey="partsCost" name="Parts" stroke="#0ea5e9" strokeWidth={2} dot={false} />
                          <Line type="monotone" dataKey="contractorCost" name="Contractor" stroke="#f59e0b" strokeWidth={2} dot={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    ) : <EmptyState icon={TrendingUp} title="No trend data" description="No monthly cost data available." />}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* ─── TAB: Work Orders ────────────────────────────────────── */}
            <TabsContent value="workorders" className="space-y-4 mt-6">
              <div className="flex items-center gap-2 flex-wrap print:hidden">
                <Select value={woFilterStatus} onValueChange={setWoFilterStatus}>
                  <SelectTrigger className="w-36"><SelectValue placeholder="Status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="assigned">Assigned</SelectItem>
                    <SelectItem value="closed">Closed</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                    <SelectItem value="draft">Draft</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={woFilterType} onValueChange={setWoFilterType}>
                  <SelectTrigger className="w-36"><SelectValue placeholder="Type" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    {pmEnabled && <SelectItem value="preventive">Preventive</SelectItem>}
                    {repairsEnabled && <SelectItem value="corrective">Corrective</SelectItem>}
                    {repairsEnabled && <SelectItem value="emergency">Emergency</SelectItem>}
                    <SelectItem value="inspection">Inspection</SelectItem>
                    <SelectItem value="predictive">Predictive</SelectItem>
                    <SelectItem value="project">Project</SelectItem>
                  </SelectContent>
                </Select>
                <span className="text-xs text-muted-foreground ml-auto">{filteredWOs.length} work orders</span>
              </div>

              <Card className="border border-border/60 shadow-sm print:shadow-none print:border">
                <CardContent className="p-0">
                  <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                    <Table>
                      <TableHeader className="sticky top-0 bg-background z-10">
                        <TableRow>
                          <TableHead className="text-xs">WO #</TableHead>
                          <TableHead className="text-xs">Title</TableHead>
                          <TableHead className="text-xs hidden sm:table-cell">Type</TableHead>
                          <TableHead className="text-xs">Priority</TableHead>
                          <TableHead className="text-xs">Status</TableHead>
                          <TableHead className="text-xs hidden md:table-cell">Assignee</TableHead>
                          <TableHead className="text-xs text-right hidden md:table-cell">Cost</TableHead>
                          <TableHead className="text-xs text-right hidden lg:table-cell">Hours</TableHead>
                          <TableHead className="text-xs text-right hidden lg:table-cell">Downtime</TableHead>
                          <TableHead className="text-xs hidden xl:table-cell">Trade</TableHead>
                          <TableHead className="text-xs hidden xl:table-cell">Created</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredWOs.length === 0 ? (
                          <TableRow><TableCell colSpan={11}><EmptyState icon={ClipboardList} title="No work orders" description="No work orders match the selected filters." /></TableCell></TableRow>
                        ) : filteredWOs.map((wo: any) => (
                          <TableRow key={wo.id} className="hover:bg-muted/30">
                            <TableCell className="font-mono text-xs">{wo.woNumber}</TableCell>
                            <TableCell className="text-sm max-w-[180px] truncate">{wo.title}</TableCell>
                            <TableCell className="hidden sm:table-cell">
                              <div className="flex items-center gap-1">
                                <Badge variant="outline" className={`${EH_TYPE_COLORS[wo.type] || 'bg-slate-100 text-slate-700'} text-white border-0 text-[10px]`}>{(wo.type || '').toUpperCase()}</Badge>
                                {getWoModuleLabel(wo.type) && (
                                  <Badge variant="outline" className={`${getWoModuleLabel(wo.type) === 'PM' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-amber-100 text-amber-700 border-amber-200'} text-[9px] px-1.5`}>
                                    {getWoModuleLabel(wo.type)}
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell><PriorityBadge priority={wo.priority} /></TableCell>
                            <TableCell><StatusBadge status={wo.status} /></TableCell>
                            <TableCell className="text-xs hidden md:table-cell">{wo.assigneeName || '-'}</TableCell>
                            <TableCell className="text-xs text-right hidden md:table-cell">{formatCurrency(wo.totalCost)}</TableCell>
                            <TableCell className="text-xs text-right hidden lg:table-cell">{wo.actualHours || '-'}</TableCell>
                            <TableCell className="text-xs text-right hidden lg:table-cell">{wo.downtimeMinutes > 0 ? `${Math.round(wo.downtimeMinutes)}m` : '-'}</TableCell>
                            <TableCell className="text-xs hidden xl:table-cell capitalize">{wo.tradeActivity || '-'}</TableCell>
                            <TableCell className="text-xs text-muted-foreground hidden xl:table-cell whitespace-nowrap">{wo.createdAt ? formatDate(wo.createdAt) : '-'}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* ─── TAB: Failure Analysis ───────────────────────────────── */}
            <TabsContent value="failures" className="space-y-6 mt-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Failure Mode Distribution */}
                <Card className="border border-border/60 shadow-sm print:shadow-none print:border">
                  <CardHeader className="pb-3"><CardTitle className="text-base">Failure Mode Distribution</CardTitle></CardHeader>
                  <CardContent>
                    {failureModeData.length > 0 ? (
                      <ResponsiveContainer width="100%" height={220}>
                        <PieChart>
                          <Pie data={failureModeData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={85} label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`} labelLine={false} fontSize={11}>
                            {failureModeData.map((_: any, i: number) => <Cell key={i} fill={EH_CHART_COLORS[i % EH_CHART_COLORS.length]} />)}
                          </Pie>
                          <Tooltip />
                        </PieChart>
                      </ResponsiveContainer>
                    ) : <EmptyState icon={Zap} title="No failure data" description="No failure records found for this asset." />}
                  </CardContent>
                </Card>

                {/* Severity Distribution */}
                <Card className="border border-border/60 shadow-sm print:shadow-none print:border">
                  <CardHeader className="pb-3"><CardTitle className="text-base">Severity Distribution</CardTitle></CardHeader>
                  <CardContent>
                    {severityData.length > 0 ? (
                      <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={severityData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                          <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                          <YAxis tick={{ fontSize: 11 }} />
                          <Tooltip />
                          <Bar dataKey="value" name="Count" radius={[4, 4, 0, 0]}>
                            {severityData.map((entry: any) => <Cell key={entry.name} fill={EH_SEVERITY_COLORS[entry.name] || EH_CHART_COLORS[0]} />)}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    ) : <EmptyState icon={BarChart3} title="No severity data" description="No failure records found." />}
                  </CardContent>
                </Card>
              </div>

              {/* Failure Records Table */}
              <Card className="border border-border/60 shadow-sm print:shadow-none print:border">
                <CardHeader className="pb-3"><CardTitle className="text-base">Failure Records</CardTitle><CardDescription className="text-xs">{(data.failureRecords || []).length} failure records</CardDescription></CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                    <Table>
                      <TableHeader className="sticky top-0 bg-background z-10">
                        <TableRow>
                          <TableHead className="text-xs">Code</TableHead>
                          <TableHead className="text-xs">Mode</TableHead>
                          <TableHead className="text-xs">Severity</TableHead>
                          <TableHead className="text-xs hidden sm:table-cell">Component</TableHead>
                          <TableHead className="text-xs text-right hidden sm:table-cell">Downtime</TableHead>
                          <TableHead className="text-xs text-right hidden md:table-cell">Cost</TableHead>
                          <TableHead className="text-xs hidden md:table-cell">Detected</TableHead>
                          <TableHead className="text-xs hidden lg:table-cell">Root Cause</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(data.failureRecords || []).length === 0 ? (
                          <TableRow><TableCell colSpan={8}><EmptyState icon={ShieldAlert} title="No failures" description="No failure records for this asset." /></TableCell></TableRow>
                        ) : (data.failureRecords || []).map((fr: any) => (
                          <TableRow key={fr.id} className="hover:bg-muted/30">
                            <TableCell className="font-mono text-xs">{fr.failureCode || '-'}</TableCell>
                            <TableCell className="text-xs capitalize">{fr.failureMode}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className={`${EH_SEVERITY_COLORS[fr.failureSeverity] || 'bg-slate-100 text-slate-700'} text-white border-0 text-[10px]`}>
                                {(fr.failureSeverity || '').toUpperCase()}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs hidden sm:table-cell">{fr.componentName || '-'}</TableCell>
                            <TableCell className="text-xs text-right hidden sm:table-cell">{fr.downtimeMinutes > 0 ? `${Math.round(fr.downtimeMinutes)}m` : '-'}</TableCell>
                            <TableCell className="text-xs text-right hidden md:table-cell">{formatCurrency(fr.repairCost)}</TableCell>
                            <TableCell className="text-xs text-muted-foreground hidden md:table-cell whitespace-nowrap">{fr.detectedAt ? formatDate(fr.detectedAt) : '-'}</TableCell>
                            <TableCell className="text-xs hidden lg:table-cell max-w-[200px] truncate">{fr.rootCause || '-'}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* ─── TAB: Parts & Materials ──────────────────────────────── */}
            <TabsContent value="parts" className="space-y-4 mt-6">
              <Card className="border border-border/60 shadow-sm print:shadow-none print:border">
                <CardHeader className="pb-3"><CardTitle className="text-base">Parts & Materials Consumed</CardTitle><CardDescription className="text-xs">{(data.partsConsumed || []).length} unique parts used across all work orders</CardDescription></CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                    <Table>
                      <TableHeader className="sticky top-0 bg-background z-10">
                        <TableRow>
                          <TableHead className="text-xs">Item Name</TableHead>
                          <TableHead className="text-xs hidden sm:table-cell">Item Code</TableHead>
                          <TableHead className="text-xs text-right">Qty</TableHead>
                          <TableHead className="text-xs text-right">Total Cost</TableHead>
                          <TableHead className="text-xs text-right hidden sm:table-cell">WO Count</TableHead>
                          <TableHead className="text-xs hidden md:table-cell">Supplier</TableHead>
                          <TableHead className="text-xs hidden lg:table-cell">Last Used</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(data.partsConsumed || []).length === 0 ? (
                          <TableRow><TableCell colSpan={7}><EmptyState icon={PackageSearch} title="No parts data" description="No materials consumed for this asset." /></TableCell></TableRow>
                        ) : (data.partsConsumed || []).map((p: any, idx: number) => (
                          <TableRow key={idx} className="hover:bg-muted/30">
                            <TableCell className="text-sm font-medium">{p.itemName}</TableCell>
                            <TableCell className="font-mono text-xs hidden sm:table-cell">{p.itemCode || '-'}</TableCell>
                            <TableCell className="text-sm text-right">{p.totalQuantity}</TableCell>
                            <TableCell className="text-sm text-right font-medium">{formatCurrency(p.totalCost)}</TableCell>
                            <TableCell className="text-sm text-right hidden sm:table-cell">{p.woCount}</TableCell>
                            <TableCell className="text-xs text-muted-foreground hidden md:table-cell">{p.supplier || '-'}</TableCell>
                            <TableCell className="text-xs text-muted-foreground hidden lg:table-cell whitespace-nowrap">{p.lastUsedDate ? formatDate(p.lastUsedDate) : '-'}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* ─── TAB: Cost Analysis ──────────────────────────────────── */}
            <TabsContent value="costs" className="space-y-6 mt-6">
              {/* Cost Breakdown Summary */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card className="border border-border/60 shadow-sm print:shadow-none print:border"><CardContent className="p-4 text-center">
                  <p className="text-xs text-muted-foreground mb-1">Labor Cost</p>
                  <p className="text-lg font-bold text-emerald-600">{formatCurrency(s?.laborCost)}</p>
                </CardContent></Card>
                <Card className="border border-border/60 shadow-sm print:shadow-none print:border"><CardContent className="p-4 text-center">
                  <p className="text-xs text-muted-foreground mb-1">Parts Cost</p>
                  <p className="text-lg font-bold text-sky-600">{formatCurrency(s?.partsCost)}</p>
                </CardContent></Card>
                <Card className="border border-border/60 shadow-sm print:shadow-none print:border"><CardContent className="p-4 text-center">
                  <p className="text-xs text-muted-foreground mb-1">Contractor Cost</p>
                  <p className="text-lg font-bold text-amber-600">{formatCurrency(s?.contractorCost)}</p>
                </CardContent></Card>
                <Card className="border border-border/60 shadow-sm print:shadow-none print:border"><CardContent className="p-4 text-center">
                  <p className="text-xs text-muted-foreground mb-1">Total Cost</p>
                  <p className="text-lg font-bold">{formatCurrency(s?.totalCost)}</p>
                </CardContent></Card>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Cost by Type */}
                <Card className="border border-border/60 shadow-sm print:shadow-none print:border">
                  <CardHeader className="pb-3"><CardTitle className="text-base">Cost by WO Type</CardTitle></CardHeader>
                  <CardContent className="p-0">
                    <div className="max-h-[300px] overflow-y-auto">
                      <Table>
                        <TableHeader className="sticky top-0 bg-background z-10"><TableRow><TableHead className="text-xs">Type</TableHead><TableHead className="text-xs text-right">Count</TableHead><TableHead className="text-xs text-right">Total Cost</TableHead></TableRow></TableHeader>
                        <TableBody>
                          {(data.costByType || []).length === 0 ? (
                            <TableRow><TableCell colSpan={3} className="text-center py-6 text-sm text-muted-foreground">No data</TableCell></TableRow>
                          ) : (data.costByType || []).map((ct: any) => (
                            <TableRow key={ct.type} className="hover:bg-muted/30">
                              <TableCell className="text-sm capitalize">
                                <Badge variant="outline" className={`${EH_TYPE_COLORS[ct.type] || 'bg-slate-100 text-slate-700'} text-white border-0 text-[10px] mr-2`}>{ct.type?.toUpperCase()}</Badge>{ct.type}
                              </TableCell>
                              <TableCell className="text-sm text-right">{ct.count}</TableCell>
                              <TableCell className="text-sm text-right font-medium">{formatCurrency(ct.totalCost)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>

                {/* Cost by Trade */}
                <Card className="border border-border/60 shadow-sm print:shadow-none print:border">
                  <CardHeader className="pb-3"><CardTitle className="text-base">Cost by Trade / Activity</CardTitle></CardHeader>
                  <CardContent className="p-0">
                    <div className="max-h-[300px] overflow-y-auto">
                      <Table>
                        <TableHeader className="sticky top-0 bg-background z-10"><TableRow><TableHead className="text-xs">Trade</TableHead><TableHead className="text-xs text-right">Count</TableHead><TableHead className="text-xs text-right">Cost</TableHead><TableHead className="text-xs text-right">Hours</TableHead></TableRow></TableHeader>
                        <TableBody>
                          {(data.costByTrade || []).length === 0 ? (
                            <TableRow><TableCell colSpan={4} className="text-center py-6 text-sm text-muted-foreground">No data</TableCell></TableRow>
                          ) : (data.costByTrade || []).map((ct: any) => (
                            <TableRow key={ct.trade} className="hover:bg-muted/30">
                              <TableCell className="text-sm capitalize font-medium">{ct.trade}</TableCell>
                              <TableCell className="text-sm text-right">{ct.count}</TableCell>
                              <TableCell className="text-sm text-right font-medium">{formatCurrency(ct.totalCost)}</TableCell>
                              <TableCell className="text-sm text-right">{ct.totalHours}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Monthly Cost Trend */}
              <Card className="border border-border/60 shadow-sm print:shadow-none print:border">
                <CardHeader className="pb-3"><CardTitle className="text-base">Monthly Cost Breakdown</CardTitle></CardHeader>
                <CardContent>
                  {(data.costByMonth || []).length > 0 ? (
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={data.costByMonth} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip formatter={(val: number) => formatCurrency(val)} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Bar dataKey="laborCost" name="Labor" stackId="cost" fill="#059669" />
                        <Bar dataKey="partsCost" name="Parts" stackId="cost" fill="#0ea5e9" />
                        <Bar dataKey="contractorCost" name="Contractor" stackId="cost" fill="#f59e0b" />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : <EmptyState icon={BarChart3} title="No monthly data" description="No monthly cost breakdown available." />}
                </CardContent>
              </Card>

              {/* Downtime by Category */}
              {(data.downtimeByCategory || []).length > 0 && (
                <Card className="border border-border/60 shadow-sm print:shadow-none print:border">
                  <CardHeader className="pb-3"><CardTitle className="text-base">Downtime by Category</CardTitle></CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={data.downtimeByCategory} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis dataKey="category" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip formatter={(val: number, name: string) => [`${val} min`, name === 'totalMinutes' ? 'Total Min' : name]} />
                        <Bar dataKey="totalMinutes" name="Total Min" fill="#ef4444" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* ─── TAB: TCO ────────────────────────────────────────────── */}
            <TabsContent value="tco" className="space-y-6 mt-6">
              {data.tco && (
                <>
                  {/* TCO KPI Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <Card className="border border-border/60 shadow-sm print:shadow-none print:border"><CardContent className="p-5">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="h-10 w-10 rounded-xl bg-emerald-50 dark:bg-emerald-900/30 dark:text-emerald-400 text-emerald-600 flex items-center justify-center"><Calculator className="h-5 w-5" /></div>
                        <p className="text-sm text-muted-foreground">Purchase Cost</p>
                      </div>
                      <p className="text-2xl font-bold">{formatCurrency(data.tco.purchaseCost)}</p>
                    </CardContent></Card>

                    <Card className="border border-border/60 shadow-sm print:shadow-none print:border"><CardContent className="p-5">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="h-10 w-10 rounded-xl bg-sky-50 dark:bg-sky-900/30 dark:text-sky-400 text-sky-600 flex items-center justify-center"><Wrench className="h-5 w-5" /></div>
                        <p className="text-sm text-muted-foreground">Total Maintenance Cost</p>
                      </div>
                      <p className="text-2xl font-bold">{formatCurrency(data.tco.totalMaintenanceCost)}</p>
                    </CardContent></Card>

                    <Card className="border border-border/60 shadow-sm print:shadow-none print:border"><CardContent className="p-5">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="h-10 w-10 rounded-xl bg-violet-50 dark:bg-violet-900/30 dark:text-violet-400 text-violet-600 flex items-center justify-center"><Gauge className="h-5 w-5" /></div>
                        <p className="text-sm text-muted-foreground">Current Value</p>
                      </div>
                      <p className="text-2xl font-bold">{formatCurrency(data.tco.currentValue)}</p>
                    </CardContent></Card>

                    <Card className="border border-border/60 shadow-sm print:shadow-none print:border"><CardContent className="p-5">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="h-10 w-10 rounded-xl bg-amber-50 dark:bg-amber-900/30 dark:text-amber-400 text-amber-600 flex items-center justify-center"><TrendingUp className="h-5 w-5" /></div>
                        <p className="text-sm text-muted-foreground">Maintenance / Purchase Ratio</p>
                      </div>
                      <p className="text-2xl font-bold">{data.tco.maintenanceCostRatio}%</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {data.tco.maintenanceCostRatio < 25 ? '✓ Healthy — below 25%' : data.tco.maintenanceCostRatio < 50 ? '⚠ Moderate — 25–50%' : '✗ High — over 50%'}
                      </p>
                    </CardContent></Card>

                    <Card className="border border-border/60 shadow-sm print:shadow-none print:border"><CardContent className="p-5">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="h-10 w-10 rounded-xl bg-teal-50 dark:bg-teal-900/30 dark:text-teal-400 text-teal-600 flex items-center justify-center"><Calendar className="h-5 w-5" /></div>
                        <p className="text-sm text-muted-foreground">Annual Maintenance Cost</p>
                      </div>
                      <p className="text-2xl font-bold">{formatCurrency(data.tco.annualMaintenanceCost)}</p>
                      <p className="text-xs text-muted-foreground mt-1">Based on asset age{asset.yearManufactured ? ` (${new Date().getFullYear() - asset.yearManufactured} years)` : ''}</p>
                    </CardContent></Card>

                    <Card className="border border-border/60 shadow-sm print:shadow-none print:border"><CardContent className="p-5">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="h-10 w-10 rounded-xl bg-red-50 dark:bg-red-900/30 dark:text-red-400 text-red-600 flex items-center justify-center"><Clock className="h-5 w-5" /></div>
                        <p className="text-sm text-muted-foreground">Remaining Life</p>
                      </div>
                      <p className="text-2xl font-bold">{data.tco.remainingLife !== null ? `${data.tco.remainingLife} years` : 'N/A'}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {data.tco.remainingLife !== null && asset.expectedLifeYears ? `Expected life: ${asset.expectedLifeYears} years` : 'No expected life data'}
                      </p>
                    </CardContent></Card>
                  </div>

                  {/* TCO Visual Summary */}
                  <Card className="border border-border/60 shadow-sm print:shadow-none print:border">
                    <CardHeader className="pb-3"><CardTitle className="text-base">TCO Breakdown</CardTitle></CardHeader>
                    <CardContent>
                      {data.tco.purchaseCost ? (
                        <ResponsiveContainer width="100%" height={200}>
                          <BarChart data={[
                            { name: 'Purchase Cost', value: data.tco.purchaseCost, fill: '#059669' },
                            { name: 'Maintenance Cost', value: data.tco.totalMaintenanceCost, fill: '#f59e0b' },
                            { name: 'Current Value', value: data.tco.currentValue || 0, fill: '#0ea5e9' },
                          ].filter(d => d.value > 0)} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                            <YAxis tick={{ fontSize: 11 }} />
                            <Tooltip formatter={(val: number) => formatCurrency(val)} />
                            <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                              {[
                                { name: 'Purchase Cost', fill: '#059669' },
                                { name: 'Maintenance Cost', fill: '#f59e0b' },
                                { name: 'Current Value', fill: '#0ea5e9' },
                              ].filter(d => d.value > 0).map((entry: any, i: number) => <Cell key={i} fill={entry.fill} />)}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="flex items-center justify-center h-[200px]">
                          <p className="text-sm text-muted-foreground">Purchase cost not set — TCO comparison unavailable</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </>
              )}
            </TabsContent>
          </Tabs>
        </>
      )}

      {/* Empty state when no asset selected */}
      {!selectedAsset && !loading && !error && (
        <Card className="border border-border/60 shadow-sm">
          <CardContent className="py-16 text-center">
            <History className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-1">Select an Asset</h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Search for an asset by name or tag above to view its complete maintenance lifecycle, including work orders, failures, parts consumed, and total cost of ownership.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ============================================================================
// FAILURE ANALYSIS REPORT PAGE
// ============================================================================

const CHART_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#8b5cf6', '#ec4899', '#6b7280'];
const SEVERITY_COLORS: Record<string, string> = { critical: '#ef4444', high: '#f97316', medium: '#eab308', low: '#22c55e' };

export function FailureAnalysisPage() {
  const assetsEnabled = useModuleEnabled(MODULE_CODES.ASSETS);
  const downtimeEnabled = useModuleEnabled(MODULE_CODES.DOWNTIME);
  const repairsEnabled = useModuleEnabled(MODULE_CODES.REPAIRS);
  const moduleEnabled = repairsEnabled && (assetsEnabled || downtimeEnabled);
  const { startDate, setStartDate, endDate, setEndDate } = useDateRange();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('overview');

  const fetchData = useCallback(() => {
    setLoading(true);
    setError(null);
    api.get<any>(`/api/reports/failure-analysis?from=${startDate}&to=${endDate}`).then(res => {
      if (res.success && res.data) setData(res.data);
      else setError(res.error || 'Failed to load data');
      setLoading(false);
    }).catch((err: any) => { setError(err.message || 'Network error'); setLoading(false); });
  }, [startDate, endDate]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const s = data?.summary;

  // KPI cards
  const kpiCards = [
    { label: 'Total Failures', value: s?.totalFailures ?? 0, icon: AlertTriangle, color: 'text-red-600 bg-red-50 dark:bg-red-900/30 dark:text-red-400', tab: 'failure-modes' as const },
    { label: 'Total Downtime', value: `${Math.round((s?.totalDowntimeMinutes ?? 0) / 60)}h`, icon: TrendingDown, color: 'text-orange-600 bg-orange-50 dark:bg-orange-900/30 dark:text-orange-400', tab: 'by-asset' as const },
    { label: 'Total Repair Cost', value: formatCurrency(s?.totalRepairCost), icon: DollarSign, color: 'text-amber-600 bg-amber-50 dark:bg-amber-900/30 dark:text-amber-400', tab: 'by-asset' as const },
    { label: 'Avg Downtime/Failure', value: `${s?.avgDowntimePerFailure ?? 0}m`, icon: Clock, color: 'text-sky-600 bg-sky-50 dark:bg-sky-900/30 dark:text-sky-400', tab: 'overview' as const },
    { label: 'Top Failure Mode', value: s?.mostCommonMode || 'N/A', icon: Zap, color: 'text-violet-600 bg-violet-50 dark:bg-violet-900/30 dark:text-violet-400', tab: 'failure-modes' as const },
    { label: 'Top Root Cause', value: s?.mostCommonCause ? (s.mostCommonCause.length > 20 ? s.mostCommonCause.slice(0, 20) + '…' : s.mostCommonCause) : 'N/A', icon: Target, color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 dark:text-emerald-400', tab: 'root-causes' as const },
  ];

  // Chart data
  const severityChartData = useMemo(() => (data?.bySeverity || []).map((d: any) => ({ name: d.severity, value: d.count, fill: SEVERITY_COLORS[d.severity] || '#6b7280' })), [data]);

  const monthlyChartData = useMemo(() => (data?.monthlyTrend || []).map((d: any) => ({
    month: d.month,
    failures: d.failureCount,
    downtime: Math.round(d.downtimeMinutes / 60),
    cost: d.repairCost,
  })), [data]);

  const handleExportCSV = () => {
    if (!data) return;
    const rows: string[][] = [];
    rows.push(['--- Failure Code / Root Cause Analysis Report ---']);
    rows.push(['Date Range', startDate, 'to', endDate]);
    rows.push([]);
    rows.push(['--- Summary ---']);
    rows.push(['Total Failures', String(s?.totalFailures ?? 0), 'Total Downtime (min)', String(s?.totalDowntimeMinutes ?? 0), 'Total Repair Cost', String(s?.totalRepairCost ?? 0)]);
    rows.push(['Avg Downtime/Failure', String(s?.avgDowntimePerFailure ?? 0), 'Top Mode', s?.mostCommonMode || '', 'Top Cause', s?.mostCommonCause || '']);
    rows.push([]);
    rows.push(['--- By Failure Mode ---']);
    rows.push(['Mode', 'Count', 'Downtime (min)', 'Repair Cost', 'Avg Downtime', 'Critical', 'High', 'Medium', 'Low']);
    (data.byFailureMode || []).forEach((d: any) => rows.push([d.mode, String(d.count), String(d.totalDowntimeMinutes), String(d.totalRepairCost), String(d.avgDowntime), String(d.severityDistribution.critical), String(d.severityDistribution.high), String(d.severityDistribution.medium), String(d.severityDistribution.low)]));
    rows.push([]);
    rows.push(['--- By Root Cause ---']);
    rows.push(['Cause', 'Count', 'Downtime (min)', 'Repair Cost', 'Corrective Actions']);
    (data.byRootCause || []).forEach((d: any) => rows.push([d.cause, String(d.count), String(d.totalDowntimeMinutes), String(d.totalRepairCost), d.correctiveActions.join('; ')]));
    rows.push([]);
    rows.push(['--- By Asset ---']);
    rows.push(['Asset Name', 'Tag', 'Manufacturer', 'Model', 'Category', 'Criticality', 'Location', 'Failure Count', 'Downtime (min)', 'Repair Cost', 'Dominant Mode', 'Dominant Cause', 'MTBF (days)']);
    (data.byAsset || []).forEach((d: any) => rows.push([d.assetName, d.assetTag, d.manufacturer, d.model, d.category, d.criticality, d.location, String(d.failureCount), String(d.totalDowntimeMinutes), String(d.totalRepairCost), d.dominantMode, d.dominantCause, String(d.mtbfDays)]));
    rows.push([]);
    rows.push(['--- By Component ---']);
    rows.push(['Component', 'Code', 'Asset', 'Failure Count', 'Repair Cost', 'Most Common Mode']);
    (data.byComponent || []).forEach((d: any) => rows.push([d.componentName, d.componentCode, d.assetName, String(d.failureCount), String(d.totalRepairCost), d.mostCommonMode]));
    exportCSV(`failure-analysis-${startDate}-to-${endDate}`, ['Field1', 'Field2', 'Field3', 'Field4', 'Field5', 'Field6', 'Field7', 'Field8', 'Field9', 'Field10', 'Field11', 'Field12', 'Field13'], rows);
  };

  if (!moduleEnabled) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <p className="text-muted-foreground">Repairs module is not active.</p>
          <p className="text-sm text-muted-foreground mt-1">Enable it in Settings → Modules to view this report.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-content">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Failure Code / Root Cause Analysis</h1>
          <p className="text-muted-foreground mt-1">Analyze failure patterns, root causes, and corrective actions</p>
        </div>
        {data && (
          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="sm" onClick={handleExportCSV} title="Export to CSV">
              <FileSpreadsheet className="h-3.5 w-3.5 mr-1" />Excel
            </Button>
            <Button variant="outline" size="sm" onClick={fetchData} title="Refresh">
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        )}
      </div>

      {/* Date range filter */}
      <Card className="border border-border/60 shadow-sm mt-4">
        <CardContent className="p-4 flex items-end gap-4 flex-wrap">
          <div className="flex-1 min-w-[160px]">
            <Label className="text-xs mb-1 block">From</Label>
            <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="h-9" />
          </div>
          <div className="flex-1 min-w-[160px]">
            <Label className="text-xs mb-1 block">To</Label>
            <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="h-9" />
          </div>
          <Button size="sm" onClick={fetchData} disabled={loading} className="h-9">Go</Button>
        </CardContent>
      </Card>

      {loading && <LoadingSkeleton />}
      {error && <Card className="mt-4"><CardContent className="py-8 text-center text-destructive">{error}</CardContent></Card>}

      {data && !loading && !error && (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mt-4">
            {kpiCards.map((kpi) => {
              return (
              <Card key={kpi.label} className="border border-border/60 shadow-sm cursor-pointer hover:shadow-md transition-all" onClick={() => kpi.tab && setActiveTab(kpi.tab)}>
                <CardContent className="p-4 flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${kpi.color}`}><kpi.icon className="h-4 w-4" /></div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground truncate">{kpi.label}</p>
                    <p className="text-sm font-semibold truncate">{kpi.value}</p>
                  </div>
                </CardContent>
              </Card>
              );
            })}
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-4">
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="failure-modes">Failure Modes</TabsTrigger>
              <TabsTrigger value="root-causes">Root Causes</TabsTrigger>
              <TabsTrigger value="by-asset">By Asset</TabsTrigger>
              <TabsTrigger value="pareto">Pareto</TabsTrigger>
              <TabsTrigger value="rework">Rework</TabsTrigger>
            </TabsList>

            {/* ── OVERVIEW TAB ── */}
            <TabsContent value="overview">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card className="border border-border/60 shadow-sm">
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Severity Distribution</CardTitle></CardHeader>
                  <CardContent>
                    {severityChartData.length > 0 ? (
                      <ResponsiveContainer width="100%" height={280}>
                        <PieChart>
                          <Pie data={severityChartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={({ name, value }) => `${name}: ${value}`}>
                            {severityChartData.map((entry: any, i: number) => <Cell key={i} fill={entry.fill} />)}
                          </Pie>
                          <Tooltip />
                          <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    ) : <p className="text-sm text-muted-foreground text-center py-8">No failure data</p>}
                  </CardContent>
                </Card>
                <Card className="border border-border/60 shadow-sm">
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Monthly Failure Trend</CardTitle></CardHeader>
                  <CardContent>
                    {monthlyChartData.length > 0 ? (
                      <ResponsiveContainer width="100%" height={280}>
                        <LineChart data={monthlyChartData}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                          <YAxis tick={{ fontSize: 11 }} />
                          <Tooltip />
                          <Legend />
                          <Line type="monotone" dataKey="failures" stroke="#ef4444" name="Failures" strokeWidth={2} />
                          <Line type="monotone" dataKey="downtime" stroke="#f97316" name="Downtime (h)" strokeWidth={2} />
                        </LineChart>
                      </ResponsiveContainer>
                    ) : <p className="text-sm text-muted-foreground text-center py-8">No trend data</p>}
                  </CardContent>
                </Card>
              </div>
              {/* Severity table */}
              <Card className="border border-border/60 shadow-sm mt-4">
                <CardHeader className="pb-2"><CardTitle className="text-sm">By Severity</CardTitle></CardHeader>
                <CardContent className="p-0">
                  <div className="max-h-64 overflow-y-auto">
                    <Table>
                      <TableHeader><TableRow><TableHead>Severity</TableHead><TableHead className="text-right">Count</TableHead><TableHead className="text-right">Downtime (min)</TableHead><TableHead className="text-right">Repair Cost</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {(data.bySeverity || []).map((d: any) => (
                          <TableRow key={d.severity}>
                            <TableCell><Badge variant="outline" style={{ borderColor: SEVERITY_COLORS[d.severity], color: SEVERITY_COLORS[d.severity] }}>{d.severity}</Badge></TableCell>
                            <TableCell className="text-right font-medium">{d.count}</TableCell>
                            <TableCell className="text-right">{d.totalDowntimeMinutes.toLocaleString()}</TableCell>
                            <TableCell className="text-right">{formatCurrency(d.totalRepairCost)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── FAILURE MODES TAB ── */}
            <TabsContent value="failure-modes">
              <Card className="border border-border/60 shadow-sm">
                <CardHeader className="pb-2"><CardTitle className="text-sm">Failure Modes Breakdown</CardTitle></CardHeader>
                <CardContent>
                  {(data.byFailureMode || []).length > 0 ? (
                    <ResponsiveContainer width="100%" height={320}>
                      <BarChart data={data.byFailureMode} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis type="number" tick={{ fontSize: 11 }} />
                        <YAxis type="category" dataKey="mode" tick={{ fontSize: 11 }} width={100} />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="count" fill="#ef4444" name="Count" />
                        <Bar dataKey="totalDowntimeMinutes" fill="#f97316" name="Downtime (min)" />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : <p className="text-sm text-muted-foreground text-center py-8">No failure mode data</p>}
                </CardContent>
              </Card>
              <Card className="border border-border/60 shadow-sm mt-4">
                <CardContent className="p-0">
                  <div className="max-h-96 overflow-y-auto">
                    <Table>
                      <TableHeader><TableRow><TableHead>Mode</TableHead><TableHead className="text-right">Count</TableHead><TableHead className="text-right">Downtime (min)</TableHead><TableHead className="text-right">Repair Cost</TableHead><TableHead className="text-right">Avg Downtime</TableHead><TableHead>Critical</TableHead><TableHead>High</TableHead><TableHead>Medium</TableHead><TableHead>Low</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {(data.byFailureMode || []).map((d: any) => (
                          <TableRow key={d.mode}>
                            <TableCell className="font-medium">{d.mode}</TableCell>
                            <TableCell className="text-right">{d.count}</TableCell>
                            <TableCell className="text-right">{d.totalDowntimeMinutes.toLocaleString()}</TableCell>
                            <TableCell className="text-right">{formatCurrency(d.totalRepairCost)}</TableCell>
                            <TableCell className="text-right">{d.avgDowntime}m</TableCell>
                            <TableCell>{d.severityDistribution.critical}</TableCell>
                            <TableCell>{d.severityDistribution.high}</TableCell>
                            <TableCell>{d.severityDistribution.medium}</TableCell>
                            <TableCell>{d.severityDistribution.low}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── ROOT CAUSES TAB ── */}
            <TabsContent value="root-causes">
              <Card className="border border-border/60 shadow-sm">
                <CardHeader className="pb-2"><CardTitle className="text-sm">Root Causes</CardTitle></CardHeader>
                <CardContent>
                  {(data.byRootCause || []).length > 0 ? (
                    <ResponsiveContainer width="100%" height={320}>
                      <BarChart data={(data.byRootCause || []).slice(0, 10)} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis type="number" tick={{ fontSize: 11 }} />
                        <YAxis type="category" dataKey="cause" tick={{ fontSize: 10 }} width={200} />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="count" fill="#8b5cf6" name="Count" />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : <p className="text-sm text-muted-foreground text-center py-8">No root cause data</p>}
                </CardContent>
              </Card>
              <Card className="border border-border/60 shadow-sm mt-4">
                <CardContent className="p-0">
                  <div className="max-h-96 overflow-y-auto">
                    <Table>
                      <TableHeader><TableRow><TableHead>Root Cause</TableHead><TableHead className="text-right">Count</TableHead><TableHead className="text-right">Downtime (min)</TableHead><TableHead className="text-right">Repair Cost</TableHead><TableHead>Corrective Actions</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {(data.byRootCause || []).map((d: any) => (
                          <TableRow key={d.cause}>
                            <TableCell className="font-medium max-w-[200px] truncate" title={d.cause}>{d.cause}</TableCell>
                            <TableCell className="text-right">{d.count}</TableCell>
                            <TableCell className="text-right">{d.totalDowntimeMinutes.toLocaleString()}</TableCell>
                            <TableCell className="text-right">{formatCurrency(d.totalRepairCost)}</TableCell>
                            <TableCell className="max-w-[300px]">
                              {d.correctiveActions.length > 0 ? (
                                <div className="flex flex-wrap gap-1">{d.correctiveActions.slice(0, 3).map((a: string, i: number) => <Badge key={i} variant="outline" className="text-xs max-w-[200px] truncate" title={a}>{a.length > 40 ? a.slice(0, 40) + '…' : a}</Badge>)}{d.correctiveActions.length > 3 && <Badge variant="secondary" className="text-xs">+{d.correctiveActions.length - 3}</Badge>}</div>
                              ) : <span className="text-xs text-muted-foreground">—</span>}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── BY ASSET TAB ── */}
            <TabsContent value="by-asset">
              <Card className="border border-border/60 shadow-sm">
                <CardHeader className="pb-2"><CardTitle className="text-sm">Failures by Asset</CardTitle></CardHeader>
                <CardContent>
                  {(data.byAsset || []).length > 0 ? (
                    <ResponsiveContainer width="100%" height={320}>
                      <BarChart data={(data.byAsset || []).slice(0, 15)}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="assetName" tick={{ fontSize: 10 }} angle={-35} textAnchor="end" height={80} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="failureCount" fill="#ef4444" name="Failures" />
                        <Bar dataKey="totalDowntimeMinutes" fill="#f97316" name="Downtime (min)" />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : <p className="text-sm text-muted-foreground text-center py-8">No asset data</p>}
                </CardContent>
              </Card>
              <Card className="border border-border/60 shadow-sm mt-4">
                <CardContent className="p-0">
                  <div className="max-h-96 overflow-y-auto">
                    <Table>
                      <TableHeader><TableRow><TableHead>Asset</TableHead><TableHead>Tag</TableHead><TableHead>Manufacturer</TableHead><TableHead>Model</TableHead><TableHead>Category</TableHead><TableHead>Criticality</TableHead><TableHead className="text-right">Failures</TableHead><TableHead className="text-right">Downtime (min)</TableHead><TableHead className="text-right">Repair Cost</TableHead><TableHead>Dominant Mode</TableHead><TableHead>Dominant Cause</TableHead><TableHead className="text-right">MTBF (d)</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {(data.byAsset || []).map((d: any) => (
                          <TableRow key={d.assetId}>
                            <TableCell className="font-medium">{d.assetName}</TableCell>
                            <TableCell>{d.assetTag}</TableCell>
                            <TableCell>{d.manufacturer}</TableCell>
                            <TableCell>{d.model}</TableCell>
                            <TableCell>{d.category?.name || d.category || '-'}</TableCell>
                            <TableCell><Badge variant="outline" style={{ borderColor: SEVERITY_COLORS[d.criticality], color: SEVERITY_COLORS[d.criticality] }}>{d.criticality}</Badge></TableCell>
                            <TableCell className="text-right font-medium">{d.failureCount}</TableCell>
                            <TableCell className="text-right">{d.totalDowntimeMinutes.toLocaleString()}</TableCell>
                            <TableCell className="text-right">{formatCurrency(d.totalRepairCost)}</TableCell>
                            <TableCell>{d.dominantMode}</TableCell>
                            <TableCell className="max-w-[150px] truncate" title={d.dominantCause}>{d.dominantCause}</TableCell>
                            <TableCell className="text-right">{d.mtbfDays}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
              {/* By Component sub-table */}
              {(data.byComponent || []).length > 0 && (
                <Card className="border border-border/60 shadow-sm mt-4">
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Failures by Component</CardTitle></CardHeader>
                  <CardContent className="p-0">
                    <div className="max-h-64 overflow-y-auto">
                      <Table>
                        <TableHeader><TableRow><TableHead>Component</TableHead><TableHead>Code</TableHead><TableHead>Asset</TableHead><TableHead className="text-right">Failures</TableHead><TableHead className="text-right">Repair Cost</TableHead><TableHead>Most Common Mode</TableHead></TableRow></TableHeader>
                        <TableBody>
                          {(data.byComponent || []).map((d: any, i: number) => (
                            <TableRow key={i}>
                              <TableCell className="font-medium">{d.componentName}</TableCell>
                              <TableCell>{d.componentCode}</TableCell>
                              <TableCell>{d.assetName}</TableCell>
                              <TableCell className="text-right">{d.failureCount}</TableCell>
                              <TableCell className="text-right">{formatCurrency(d.totalRepairCost)}</TableCell>
                              <TableCell>{d.mostCommonMode}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* ── PARETO TAB ── */}
            <TabsContent value="pareto">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card className="border border-border/60 shadow-sm">
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Pareto — Failure Modes</CardTitle></CardHeader>
                  <CardContent>
                    {(data.paretoModes || []).length > 0 ? (
                      <ResponsiveContainer width="100%" height={320}>
                        <ComposedChart data={data.paretoModes}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="mode" tick={{ fontSize: 10 }} angle={-35} textAnchor="end" height={70} />
                          <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
                          <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} domain={[0, 100]} unit="%" />
                          <Tooltip />
                          <Legend />
                          <Bar yAxisId="left" dataKey="count" fill="#ef4444" name="Count" />
                          <Line yAxisId="right" type="monotone" dataKey="cumulativePercent" stroke="#8b5cf6" name="Cumulative %" strokeWidth={2} dot={{ r: 3 }} />
                        </ComposedChart>
                      </ResponsiveContainer>
                    ) : <p className="text-sm text-muted-foreground text-center py-8">No data</p>}
                  </CardContent>
                </Card>
                <Card className="border border-border/60 shadow-sm">
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Pareto — Root Causes</CardTitle></CardHeader>
                  <CardContent>
                    {(data.paretoCauses || []).length > 0 ? (
                      <ResponsiveContainer width="100%" height={320}>
                        <ComposedChart data={(data.paretoCauses || []).slice(0, 12)}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="cause" tick={{ fontSize: 9 }} angle={-40} textAnchor="end" height={80} />
                          <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
                          <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} domain={[0, 100]} unit="%" />
                          <Tooltip />
                          <Legend />
                          <Bar yAxisId="left" dataKey="count" fill="#8b5cf6" name="Count" />
                          <Line yAxisId="right" type="monotone" dataKey="cumulativePercent" stroke="#ef4444" name="Cumulative %" strokeWidth={2} dot={{ r: 3 }} />
                        </ComposedChart>
                      </ResponsiveContainer>
                    ) : <p className="text-sm text-muted-foreground text-center py-8">No data</p>}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* ── REWORK TAB ── */}
            <TabsContent value="rework">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Card className="border border-border/60 shadow-sm">
                  <CardContent className="p-4 text-center">
                    <p className="text-xs text-muted-foreground">Completed WOs</p>
                    <p className="text-2xl font-bold mt-1">{data.reworkAnalysis?.totalCompleted ?? 0}</p>
                  </CardContent>
                </Card>
                <Card className="border border-border/60 shadow-sm">
                  <CardContent className="p-4 text-center">
                    <p className="text-xs text-muted-foreground">Rework Count</p>
                    <p className="text-2xl font-bold mt-1 text-orange-600">{data.reworkAnalysis?.reworkCount ?? 0}</p>
                  </CardContent>
                </Card>
                <Card className="border border-border/60 shadow-sm">
                  <CardContent className="p-4 text-center">
                    <p className="text-xs text-muted-foreground">Rework Rate</p>
                    <p className="text-2xl font-bold mt-1 text-red-600">{data.reworkAnalysis?.reworkRate ?? 0}%</p>
                  </CardContent>
                </Card>
              </div>
              {(data.reworkAnalysis?.reworkByAsset || []).length > 0 && (
                <Card className="border border-border/60 shadow-sm mt-4">
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Rework by Asset</CardTitle></CardHeader>
                  <CardContent className="p-0">
                    <div className="max-h-64 overflow-y-auto">
                      <Table>
                        <TableHeader><TableRow><TableHead>Asset</TableHead><TableHead className="text-right">Rework Count</TableHead><TableHead className="text-right">Total Cost</TableHead></TableRow></TableHeader>
                        <TableBody>
                          {(data.reworkAnalysis.reworkByAsset || []).map((d: any, i: number) => (
                            <TableRow key={i}>
                              <TableCell className="font-medium">{d.assetName}</TableCell>
                              <TableCell className="text-right text-orange-600 font-medium">{d.reworkCount}</TableCell>
                              <TableCell className="text-right">{formatCurrency(d.totalCost)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}

// ============================================================================
// SETTINGS SUBPAGES
// ============================================================================



