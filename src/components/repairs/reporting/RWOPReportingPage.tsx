'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Clock,
  Download,
  FileSpreadsheet,
  FileText,
  Filter,
  Loader2,
  Printer,
  RefreshCw,
  ShieldCheck,
  Wrench,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DateRangePicker } from '@/components/ui/datetime-picker';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyState, LoadingSkeleton, formatCurrency, formatDate } from '@/components/shared/helpers';

type Plant = {
  id: string;
  name: string;
  code?: string | null;
};

type Department = {
  id: string;
  name: string;
  code?: string | null;
  plantId?: string | null;
  plant?: Plant | null;
};

type WorkOrderRow = {
  id: string;
  woNumber?: string | null;
  title?: string | null;
  type?: string | null;
  priority?: string | null;
  status?: string | null;
  assetName?: string | null;
  assetTag?: string | null;
  assigneeName?: string | null;
  teamLeaderName?: string | null;
  estimatedHours?: number | null;
  actualHours?: number | null;
  totalCost?: number | null;
  createdAt?: string | null;
};

type ReportData = {
  summary?: {
    totalWOs?: number;
    completedWOs?: number;
    completionRate?: number;
    avgCompletionHours?: number;
    totalCost?: number;
    overdueWOs?: number;
    slaComplianceRate?: number;
    openWOs?: number;
  };
  woByType?: Array<{ type: string; count: number }>;
  woByStatus?: Array<{ status: string; count: number }>;
  recentWorkOrders?: WorkOrderRow[];
};

type ModuleFilter = 'all' | 'repairs' | 'pm';
type ExportFormat = 'csv' | 'xlsx' | 'pdf';

type ReportFilters = {
  startDate: string;
  endDate: string;
  plantId: string;
  departmentId: string;
  moduleFilter: ModuleFilter;
};

const STATUS_COLORS = ['#059669', '#0ea5e9', '#f59e0b', '#ef4444', '#8b5cf6', '#64748b', '#14b8a6'];
const TYPE_COLORS: Record<string, string> = {
  corrective: '#f59e0b',
  emergency: '#ef4444',
  preventive: '#059669',
  predictive: '#8b5cf6',
  inspection: '#0ea5e9',
  project: '#14b8a6',
};

function defaultFilters(): ReportFilters {
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - 30);
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
    plantId: 'all',
    departmentId: 'all',
    moduleFilter: 'repairs',
  };
}

function plantHeader(plantId: string): Record<string, string> {
  // api.get/getRaw inject the stored primary plant by default. Emptying the
  // header is intentional when the user requests their full accessible set.
  return { 'X-Plant-ID': plantId === 'all' ? '' : plantId };
}

function buildQuery(filters: ReportFilters): string {
  const params = new URLSearchParams();
  if (filters.startDate) params.set('startDate', filters.startDate);
  if (filters.endDate) params.set('endDate', filters.endDate);
  if (filters.plantId !== 'all') params.set('plantId', filters.plantId);
  if (filters.departmentId !== 'all') params.set('departmentId', filters.departmentId);
  if (filters.moduleFilter !== 'all') params.set('moduleFilter', filters.moduleFilter);
  return params.toString();
}

function prettify(value?: string | null): string {
  if (!value) return '—';
  return value.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
}

function statusBadge(status?: string | null): 'default' | 'destructive' | 'outline' {
  if (status === 'closed' || status === 'completed') return 'default';
  if (status === 'cancelled') return 'destructive';
  return 'outline';
}

function filtersEqual(a: ReportFilters, b: ReportFilters): boolean {
  return a.startDate === b.startDate
    && a.endDate === b.endDate
    && a.plantId === b.plantId
    && a.departmentId === b.departmentId
    && a.moduleFilter === b.moduleFilter;
}

export default function RWOPReportingPage() {
  const {
    isAuthenticated,
    isLoading: authLoading,
    fetchMe,
    hasPermission,
    isAdmin,
  } = useAuthStore();

  const [filters, setFilters] = useState<ReportFilters>(() => defaultFilters());
  const [appliedFilters, setAppliedFilters] = useState<ReportFilters | null>(null);
  const [plants, setPlants] = useState<Plant[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState<ExportFormat | null>(null);
  const initialLoadStarted = useRef(false);

  const canView = isAdmin()
    || hasPermission('reports.view')
    || hasPermission('reports.export')
    || hasPermission('analytics.view');
  const canExport = isAdmin() || hasPermission('reports.export');

  useEffect(() => {
    if (!isAuthenticated && !authLoading) void fetchMe();
  }, [authLoading, fetchMe, isAuthenticated]);

  const loadPlants = useCallback(async () => {
    const response = await api.get<Plant[]>('/api/plants', {
      headers: { 'X-Plant-ID': '' },
    });
    if (response.success && Array.isArray(response.data)) {
      setPlants(response.data);
    }
  }, []);

  const loadDepartments = useCallback(async (selectedPlant: string) => {
    const params = new URLSearchParams();
    if (selectedPlant !== 'all') params.set('plantId', selectedPlant);
    const suffix = params.toString() ? `?${params.toString()}` : '';
    const response = await api.get<Department[]>(`/api/departments${suffix}`, {
      headers: plantHeader(selectedPlant),
    });
    setDepartments(response.success && Array.isArray(response.data) ? response.data : []);
  }, []);

  const loadReport = useCallback(async (target: ReportFilters) => {
    if (!isAuthenticated || !canView) return;
    if (target.startDate && target.endDate && target.startDate > target.endDate) {
      toast.error('Start date cannot be after end date');
      return;
    }

    setLoading(true);
    try {
      const query = buildQuery(target);
      const response = await api.get<ReportData>(`/api/reports/maintenance?${query}`, {
        headers: plantHeader(target.plantId),
      });
      if (!response.success || !response.data) {
        setReport(null);
        toast.error(response.error || 'Unable to load RWOP report');
        return;
      }
      setReport(response.data);
      setAppliedFilters({ ...target });
    } catch (error: unknown) {
      setReport(null);
      toast.error(error instanceof Error ? error.message : 'Unable to load RWOP report');
    } finally {
      setLoading(false);
    }
  }, [canView, isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;
    void loadPlants();
  }, [isAuthenticated, loadPlants]);

  useEffect(() => {
    if (!isAuthenticated) return;
    void loadDepartments(filters.plantId);
  }, [filters.plantId, isAuthenticated, loadDepartments]);

  useEffect(() => {
    if (!isAuthenticated || !canView || initialLoadStarted.current) return;
    initialLoadStarted.current = true;
    void loadReport(filters);
  }, [canView, filters, isAuthenticated, loadReport]);

  const summary = report?.summary;
  const workOrders = report?.recentWorkOrders || [];
  const filtersDirty = appliedFilters ? !filtersEqual(filters, appliedFilters) : false;

  const appliedDescription = useMemo(() => {
    const source = appliedFilters || filters;
    const plant = source.plantId === 'all'
      ? 'All accessible plants'
      : plants.find(item => item.id === source.plantId)?.name || 'Selected plant';
    const department = source.departmentId === 'all'
      ? 'All departments'
      : departments.find(item => item.id === source.departmentId)?.name || 'Selected department';
    const moduleLabel = source.moduleFilter === 'repairs'
      ? 'Repairs / RWOP'
      : source.moduleFilter === 'pm'
        ? 'Preventive maintenance'
        : 'All maintenance';
    return `${moduleLabel} · ${plant} · ${department}`;
  }, [appliedFilters, departments, filters, plants]);

  const downloadExport = async (formatType: ExportFormat) => {
    if (!canExport || !report || !appliedFilters) {
      toast.error('Report export is not available');
      return;
    }

    setDownloading(formatType);
    try {
      const query = buildQuery(appliedFilters);
      const separator = query ? '&' : '';
      const response = await api.getRaw(
        `/api/reports/maintenance/export?${query}${separator}format=${formatType}`,
        { headers: plantHeader(appliedFilters.plantId), timeout: 60_000 },
      );

      if (!response.ok) {
        let message = `Export failed (${response.status})`;
        try {
          const body = await response.json();
          if (body?.error) message = body.error;
        } catch {
          // Preserve the HTTP fallback for non-JSON errors.
        }
        throw new Error(message);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const disposition = response.headers.get('content-disposition') || '';
      const serverName = /filename="?([^";]+)"?/i.exec(disposition)?.[1];
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = serverName || `rwop-report.${formatType}`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      toast.success(`${formatType.toUpperCase()} report exported`);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Export failed');
    } finally {
      setDownloading(null);
    }
  };

  if ((authLoading || !isAuthenticated) && !report) {
    return <div className="page-content"><LoadingSkeleton /></div>;
  }

  if (!canView) {
    return (
      <div className="page-content">
        <EmptyState
          icon={ShieldCheck}
          title="Reporting access required"
          description="You need reports.view, reports.export, analytics.view, or administrator access to open RWOP reporting."
        />
      </div>
    );
  }

  return (
    <div className="page-content space-y-6 print:p-0">
      <div className="flex flex-wrap items-start justify-between gap-3 print:block">
        <div>
          <div className="flex items-center gap-2">
            <Wrench className="h-6 w-6 text-emerald-600 print:hidden" />
            <h1 className="text-2xl font-bold tracking-tight">Repairs / RWOP Reporting</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">Plant-isolated maintenance reporting, analytics and audit-ready exports</p>
          {appliedFilters && (
            <p className="mt-1 text-xs text-muted-foreground">
              {appliedDescription} · {appliedFilters.startDate} to {appliedFilters.endDate}
            </p>
          )}
        </div>

        {canExport && (
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <Button variant="outline" size="sm" onClick={() => void downloadExport('xlsx')} disabled={downloading !== null || !report}>
              {downloading === 'xlsx' ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <FileSpreadsheet className="mr-1.5 h-4 w-4" />}
              Excel
            </Button>
            <Button variant="outline" size="sm" onClick={() => void downloadExport('csv')} disabled={downloading !== null || !report}>
              {downloading === 'csv' ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Download className="mr-1.5 h-4 w-4" />}
              CSV
            </Button>
            <Button variant="outline" size="sm" onClick={() => void downloadExport('pdf')} disabled={downloading !== null || !report}>
              {downloading === 'pdf' ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <FileText className="mr-1.5 h-4 w-4" />}
              PDF
            </Button>
            <Button variant="outline" size="sm" onClick={() => window.print()} disabled={!report}>
              <Printer className="mr-1.5 h-4 w-4" />Print
            </Button>
          </div>
        )}
      </div>

      <Card className="border-border/60 shadow-sm print:hidden">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base"><Filter className="h-4 w-4" />Report Filters</CardTitle>
          <CardDescription>
            Filters are enforced server-side. Changing a filter does not change the displayed report until you select Generate.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(260px,1.4fr)_1fr_1fr_1fr_auto] lg:items-end">
            <DateRangePicker
              label="Date Range"
              from={filters.startDate || undefined}
              to={filters.endDate || undefined}
              onChange={(from, to) => setFilters(current => ({
                ...current,
                startDate: from || '',
                endDate: to || '',
              }))}
            />

            <div className="space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">Plant</span>
              <Select
                value={filters.plantId}
                onValueChange={value => setFilters(current => ({
                  ...current,
                  plantId: value,
                  departmentId: 'all',
                }))}
              >
                <SelectTrigger><SelectValue placeholder="Plant" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All accessible plants</SelectItem>
                  {plants.map(plant => (
                    <SelectItem key={plant.id} value={plant.id}>
                      {plant.name}{plant.code ? ` (${plant.code})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">Department</span>
              <Select
                value={filters.departmentId}
                onValueChange={value => setFilters(current => ({ ...current, departmentId: value }))}
              >
                <SelectTrigger><SelectValue placeholder="Department" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All departments</SelectItem>
                  {departments.map(department => (
                    <SelectItem key={department.id} value={department.id}>
                      {department.name}{department.code ? ` (${department.code})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">Maintenance Scope</span>
              <Select
                value={filters.moduleFilter}
                onValueChange={value => setFilters(current => ({ ...current, moduleFilter: value as ModuleFilter }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="repairs">Repairs / RWOP</SelectItem>
                  <SelectItem value="pm">Preventive Maintenance</SelectItem>
                  <SelectItem value="all">All Maintenance</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button onClick={() => void loadReport(filters)} disabled={loading} className="bg-emerald-600 text-white hover:bg-emerald-700">
              {loading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1.5 h-4 w-4" />}
              Generate
            </Button>
          </div>

          {filtersDirty && (
            <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
              Filters have changed. Select Generate to refresh the report. Export buttons continue to use the currently displayed report filters.
            </div>
          )}
        </CardContent>
      </Card>

      {loading && !report ? (
        <LoadingSkeleton />
      ) : !report ? (
        <EmptyState icon={BarChart3} title="No report data" description="Generate a report for the selected filters." />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Card className="border-border/60"><CardContent className="p-4"><p className="text-xs text-muted-foreground">Total WOs</p><p className="mt-1 text-2xl font-bold">{summary?.totalWOs ?? 0}</p></CardContent></Card>
            <Card className="border-border/60"><CardContent className="p-4"><p className="text-xs text-muted-foreground">Completed</p><p className="mt-1 text-2xl font-bold text-emerald-600">{summary?.completedWOs ?? 0}</p></CardContent></Card>
            <Card className="border-border/60"><CardContent className="p-4"><p className="text-xs text-muted-foreground">Completion Rate</p><p className="mt-1 text-2xl font-bold">{summary?.completionRate ?? 0}%</p></CardContent></Card>
            <Card className="border-border/60"><CardContent className="p-4"><p className="text-xs text-muted-foreground">Open WOs</p><p className="mt-1 text-2xl font-bold text-amber-600">{summary?.openWOs ?? 0}</p></CardContent></Card>
            <Card className="border-border/60"><CardContent className="p-4"><p className="text-xs text-muted-foreground">SLA Compliance</p><p className="mt-1 text-2xl font-bold">{summary?.slaComplianceRate ?? 0}%</p></CardContent></Card>
            <Card className="border-border/60"><CardContent className="p-4"><p className="text-xs text-muted-foreground">Maintenance Cost</p><p className="mt-1 text-lg font-bold">{formatCurrency(summary?.totalCost ?? 0)}</p></CardContent></Card>
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2 print:grid-cols-2">
            <Card className="border-border/60 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Work Orders by Status</CardTitle>
                <CardDescription>Current lifecycle distribution for the generated period</CardDescription>
              </CardHeader>
              <CardContent>
                {(report.woByStatus || []).length > 0 ? (
                  <>
                    <ResponsiveContainer width="100%" height={250}>
                      <PieChart>
                        <Pie data={report.woByStatus} dataKey="count" nameKey="status" cx="50%" cy="50%" outerRadius={90}>
                          {(report.woByStatus || []).map((entry, index) => (
                            <Cell key={entry.status} fill={STATUS_COLORS[index % STATUS_COLORS.length]} />
                          ))}
                        </Pie>
                        <RechartsTooltip />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      {(report.woByStatus || []).map((entry, index) => (
                        <span key={entry.status} className="inline-flex items-center gap-1">
                          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: STATUS_COLORS[index % STATUS_COLORS.length] }} />
                          {prettify(entry.status)}: {entry.count}
                        </span>
                      ))}
                    </div>
                  </>
                ) : <EmptyState icon={BarChart3} title="No status data" />}
              </CardContent>
            </Card>

            <Card className="border-border/60 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Work Orders by Type</CardTitle>
                <CardDescription>Corrective, emergency and preventive workload mix</CardDescription>
              </CardHeader>
              <CardContent>
                {(report.woByType || []).length > 0 ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={report.woByType} margin={{ top: 8, right: 8, bottom: 8, left: -12 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="type" tickFormatter={prettify} tick={{ fontSize: 11 }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                      <RechartsTooltip labelFormatter={prettify} />
                      <Bar dataKey="count" name="Work Orders" radius={[5, 5, 0, 0]}>
                        {(report.woByType || []).map(entry => (
                          <Cell key={entry.type} fill={TYPE_COLORS[entry.type] || '#64748b'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : <EmptyState icon={BarChart3} title="No type data" />}
              </CardContent>
            </Card>
          </div>

          <Card className="border-border/60 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-base">Work Order Detail</CardTitle>
                  <CardDescription>Latest 200 records are shown here; Excel, CSV and PDF contain the complete filtered set.</CardDescription>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {summary?.overdueWOs ? (
                    <Badge variant="destructive"><AlertTriangle className="mr-1 h-3 w-3" />{summary.overdueWOs} overdue</Badge>
                  ) : (
                    <Badge variant="outline"><CheckCircle2 className="mr-1 h-3 w-3" />No overdue WOs</Badge>
                  )}
                  <Badge variant="outline"><Clock className="mr-1 h-3 w-3" />Avg {summary?.avgCompletionHours ?? 0}h</Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-[620px] overflow-auto print:max-h-none print:overflow-visible">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-background print:static">
                    <TableRow>
                      <TableHead>WO</TableHead>
                      <TableHead>Title</TableHead>
                      <TableHead>Asset</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Priority</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="hidden lg:table-cell">Assigned To</TableHead>
                      <TableHead className="text-right">Hours</TableHead>
                      <TableHead className="text-right">Cost</TableHead>
                      <TableHead className="hidden xl:table-cell">Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {workOrders.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={10}><EmptyState icon={Wrench} title="No work orders match these filters" /></TableCell>
                      </TableRow>
                    ) : workOrders.map(wo => (
                      <TableRow key={wo.id}>
                        <TableCell className="font-mono text-xs">{wo.woNumber || '—'}</TableCell>
                        <TableCell className="max-w-[280px] font-medium"><span className="line-clamp-2">{wo.title || 'Untitled work order'}</span></TableCell>
                        <TableCell>
                          <div>{wo.assetName || 'Unassigned'}</div>
                          {wo.assetTag && <div className="font-mono text-[10px] text-muted-foreground">{wo.assetTag}</div>}
                        </TableCell>
                        <TableCell className="text-xs">{prettify(wo.type)}</TableCell>
                        <TableCell className="text-xs">{prettify(wo.priority)}</TableCell>
                        <TableCell><Badge variant={statusBadge(wo.status)} className="text-[10px]">{prettify(wo.status)}</Badge></TableCell>
                        <TableCell className="hidden lg:table-cell text-sm">{wo.assigneeName || wo.teamLeaderName || '—'}</TableCell>
                        <TableCell className="text-right font-mono text-xs">{wo.actualHours ?? wo.estimatedHours ?? '—'}</TableCell>
                        <TableCell className="text-right text-sm font-medium">{formatCurrency(wo.totalCost ?? 0)}</TableCell>
                        <TableCell className="hidden xl:table-cell text-xs text-muted-foreground">{wo.createdAt ? formatDate(wo.createdAt) : '—'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      <style jsx global>{`
        @media print {
          @page { size: landscape; margin: 10mm; }
          body { background: white !important; }
          [data-sonner-toaster] { display: none !important; }
        }
      `}</style>
    </div>
  );
}
