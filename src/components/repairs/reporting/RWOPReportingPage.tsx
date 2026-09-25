'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
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
  ClipboardList,
  Boxes,
  UserRoundCheck,
  TrendingDown,
  Coins,
  History,
  Wrench,
  ExternalLink,
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
  backlogAging?: {
    totalOpen: number;
    overdueOpen: number;
    avgOpenAgeDays: number;
    oldestOpenDays: number;
    buckets: Array<{ bucket: string; count: number }>;
  };
  responseAndSla?: {
    avgResponseHours: number;
    avgEmergencyResponseHours: number;
    avgPlannerClosureLagHours: number;
    slaComplianceRate: number;
    slaBreachedWOs: number;
    overdueOpen: number;
  };
  breakdownPerformance?: {
    breakdownCount: number;
    avgResponseMinutes: number;
    avgRepairMinutes: number;
    avgRestorationMinutes: number;
    recordedDowntimeMinutes: number;
    missingStartCount: number;
    missingCompletionCount: number;
    weekly: Array<{
      week: string;
      breakdowns: number;
      avgResponseMinutes: number;
      avgRepairMinutes: number;
      avgRestorationMinutes: number;
      recordedDowntimeMinutes: number;
    }>;
    byAsset: Array<{
      assetId: string;
      assetName: string;
      assetTag?: string | null;
      breakdowns: number;
      avgResponseMinutes: number;
      avgRepairMinutes: number;
      avgRestorationMinutes: number;
      recordedDowntimeMinutes: number;
    }>;
  };
  monthlyOperationalTrends?: Array<{
    month: string;
    opened: number;
    completed: number;
    closed: number;
    emergency: number;
    totalCost: number;
    downtimeMinutes: number;
    productionLoss: number;
  }>;
  assetReliability?: Array<{
    assetId: string;
    assetName: string;
    assetTag?: string | null;
    criticality?: string | null;
    failureCount: number;
    repeatFailure: boolean;
    mtbfDays?: number | null;
    mttrHours: number;
    downtimeMinutes: number;
    productionLoss: number;
    totalCost: number;
    lastFailureAt?: string | null;
  }>;
  costAnalysis?: {
    recordedMaintenanceCost: number;
    laborCost: number;
    materialCost: number;
    toolUsageCost: number;
    damagedToolRepairCost: number;
    sparePartRefurbishmentCost: number;
    downtimeProductionLoss: number;
    trackedEconomicImpact: number;
    avgRecordedCostPerWo: number;
  };
  resourceFlow?: {
    materials: {
      totalRequests: number;
      pendingRequests: number;
      issuedRequests: number;
      pendingReconciliation: number;
      avgIssueHours: number;
      wasteCost: number;
      returnValue: number;
    };
    tools: {
      totalRequests: number;
      pendingRequests: number;
      issuedRequests: number;
      outstandingCustody: number;
      returnedRequests: number;
      avgIssueHours: number;
    };
    assistance: {
      totalRequests: number;
      pending: number;
      approved: number;
      rejected: number;
      cancelled: number;
      avgReviewHours: number;
    };
    handovers: { total: number; pending: number; confirmed: number };
  };
  returnsAndDamage?: {
    spareParts: {
      totalReturns: number;
      pending: number;
      returnedToStore: number;
      disposed: number;
      refurbishmentNeeded: number;
      refurbishmentCost: number;
    };
    damagedTools: {
      totalReports: number;
      openReports: number;
      repaired: number;
      writtenOff: number;
      criticalDamage: number;
      repairCost: number;
    };
  };
  closureCompliance?: {
    eligibleWOs: number;
    compliantWOs: number;
    complianceRate: number;
    missingRca: number;
    awaitingSupervisorApproval: number;
    awaitingPlannerClosure: number;
    reworkWOs: number;
    totalReworkInstances: number;
  };
  closureExceptionWatchlist?: Array<{
    id: string;
    woNumber?: string | null;
    title?: string | null;
    assetName: string;
    assetTag?: string | null;
    type: string;
    priority: string;
    status: string;
    completedAt?: string | null;
    missingRca: boolean;
    awaitingSupervisorApproval: boolean;
    awaitingPlannerClosure: boolean;
    reworkCount: number;
  }>;
  exceptionWatchlist?: Array<{
    id: string;
    woNumber?: string | null;
    title?: string | null;
    assetName: string;
    priority: string;
    status: string;
    ageDays: number;
    pendingMaterials: number;
    outstandingTools: number;
    pendingAssistance: number;
    pendingHandovers: number;
    downtimeMinutes: number;
    riskLevel: string;
    reasons: string[];
  }>;
};

type ModuleFilter = 'all' | 'repairs' | 'pm';
type AttentionFilter = 'all' | 'critical' | 'overdue' | 'materials' | 'tools' | 'assistance' | 'handovers' | 'downtime';
type ClosureFilter = 'all' | 'missing-rca' | 'supervisor' | 'planner' | 'rework';

type SavedReportView = {
  id: string;
  name: string;
  filters: ReportFilters;
};
type ExportFormat = 'csv' | 'xlsx' | 'pdf';
type OperationalXlsxReportType =
  | 'work-order'
  | 'maintenance-request'
  | 'labor'
  | 'downtime'
  | 'material'
  | 'tool'
  | 'failure-analysis'
  | 'cost'
  | 'backlog-aging'
  | 'sla'
  | 'operations-summary'
  | 'asset-history'
  | 'department-cost'
  | 'material-reconciliation'
  | 'tool-custody'
  | 'assistance'
  | 'shift-handover'
  | 'closure-audit'
  | 'breakdown-performance';

type OperationalPdfReportType =
  | 'lifecycle'
  | 'execution'
  | 'materials'
  | 'tools'
  | 'downtime'
  | 'technician_performance';

type OperationalReportCategory =
  | 'Operations & Performance'
  | 'Resources & Stores'
  | 'Reliability & Assets'
  | 'Cost & Compliance';

type OperationalReportDefinition = {
  id: string;
  category: OperationalReportCategory;
  title: string;
  description: string;
  xlsxType?: OperationalXlsxReportType;
  customXlsxEndpoint?: 'machine-component-detail';
  pdfType?: OperationalPdfReportType;
  icon: React.ComponentType<{ className?: string }>;
};


const REPORT_CATEGORIES: OperationalReportCategory[] = [
  'Operations & Performance',
  'Resources & Stores',
  'Reliability & Assets',
  'Cost & Compliance',
];

const OPERATIONAL_REPORTS: OperationalReportDefinition[] = [
  { id: 'work-orders', category: 'Operations & Performance', title: 'Work Orders', description: 'Detailed repairs work orders with status, asset, labor, cost and timeline.', xlsxType: 'work-order', pdfType: 'execution', icon: ClipboardList },
  { id: 'maintenance-requests', category: 'Operations & Performance', title: 'Maintenance Requests', description: 'Request intake, approvals, planner conversion and WO linkage.', xlsxType: 'maintenance-request', pdfType: 'lifecycle', icon: FileText },
  { id: 'labor', category: 'Operations & Performance', title: 'Technician Labor & Time', description: 'Technician time logs, activity, breaks, team logs and labor hours.', xlsxType: 'labor', pdfType: 'technician_performance', icon: UserRoundCheck },
  { id: 'downtime', category: 'Reliability & Assets', title: 'Downtime & Production Loss', description: 'Downtime events, duration, impact level and production-loss exposure.', xlsxType: 'downtime', pdfType: 'downtime', icon: TrendingDown },
  { id: 'materials', category: 'Resources & Stores', title: 'Materials Usage & Returns', description: 'Requested, issued, consumed, wasted and returned materials with costs.', xlsxType: 'material', pdfType: 'materials', icon: Boxes },
  { id: 'tools', category: 'Resources & Stores', title: 'Tools, Damage & Transfers', description: 'Tool requests, transfers, damage, repair cost and write-off exposure.', xlsxType: 'tool', pdfType: 'tools', icon: Wrench },
  { id: 'breakdown-performance', category: 'Operations & Performance', title: 'Breakdown Performance & Response', description: 'breakdown count, weekly trend, machine frequency, response time, repair time/MTTR and downtime in one management workbook.', xlsxType: 'breakdown-performance', icon: TrendingDown },
  { id: 'failure-analysis', category: 'Reliability & Assets', title: 'Failure Analysis', description: 'Failure modes, recurrence and downtime evidence for RCA and reliability review.', xlsxType: 'failure-analysis', icon: AlertTriangle },
  { id: 'cost', category: 'Cost & Compliance', title: 'Repair Cost Analysis', description: 'Labor, parts, contractors, tools and total work-order cost analysis.', xlsxType: 'cost', icon: Coins },
  { id: 'backlog-aging', category: 'Operations & Performance', title: 'Backlog & Aging', description: 'Open repairs, overdue work and aging buckets for planner follow-up.', xlsxType: 'backlog-aging', icon: History },
  { id: 'sla', category: 'Operations & Performance', title: 'SLA Compliance', description: 'Response/closure compliance against priority-based service targets.', xlsxType: 'sla', icon: ShieldCheck },
  { id: 'operations-summary', category: 'Operations & Performance', title: 'Daily / Weekly Operations', description: 'Daily maintenance pulse covering opened/completed WOs, emergencies, labor, downtime, production loss and cost.', xlsxType: 'operations-summary', icon: Clock },
  { id: 'asset-history', category: 'Reliability & Assets', title: 'Asset Repair History', description: 'Full repair and failure history by asset with RCA, technician, downtime, materials and cost.', xlsxType: 'asset-history', icon: History },
  { id: 'machine-component-detail', category: 'Reliability & Assets', title: 'Machine & Component Repair Detail', description: 'Completed repairs by machine and component/part with failure mode, RCA, materials, labor, downtime and cost.', customXlsxEndpoint: 'machine-component-detail', icon: ClipboardList },
  { id: 'department-cost', category: 'Cost & Compliance', title: 'Department / Cost-Center Cost', description: 'Maintenance spend by department/cost center with labor, parts, contractor, tools and average WO cost.', xlsxType: 'department-cost', icon: Coins },
  { id: 'material-reconciliation', category: 'Resources & Stores', title: 'Material Reconciliation Audit', description: 'Issued versus consumed, wasted and returned quantities with cost and variance exceptions.', xlsxType: 'material-reconciliation', icon: Boxes },
  { id: 'tool-custody', category: 'Resources & Stores', title: 'Tool Custody & Returns', description: 'Issued tool custody, technician returns, store confirmation, duration and condition exceptions.', xlsxType: 'tool-custody', icon: Wrench },
  { id: 'assistance', category: 'Resources & Stores', title: 'Assistance Request Turnaround', description: 'Technician assistance requests, approval outcomes and review turnaround time.', xlsxType: 'assistance', icon: UserRoundCheck },
  { id: 'shift-handover', category: 'Resources & Stores', title: 'Shift Handover Audit', description: 'Repair handovers with pending issues, safety notes, receiver confirmation and shift continuity.', xlsxType: 'shift-handover', icon: History },
  { id: 'closure-audit', category: 'Cost & Compliance', title: 'Closure / RCA Compliance Audit', description: 'RCA completeness, supervisor review, planner closure, rework and compliance exceptions.', xlsxType: 'closure-audit', icon: ShieldCheck },
];

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
  // getAuthHeaders() uses the lowercase key. Use the exact same key here so
  // object spread replaces the stored primary plant rather than producing a
  // case-insensitive duplicate header such as "plant-a, plant-b".
  return { 'x-plant-id': plantId === 'all' ? '' : plantId };
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

const SAVED_REPORT_VIEWS_KEY = 'iassetspro:rwop-report-saved-views';

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
  const [operationalDownloading, setOperationalDownloading] = useState<string | null>(null);
  const [savedViews, setSavedViews] = useState<SavedReportView[]>([]);
  const [selectedSavedViewId, setSelectedSavedViewId] = useState('');
  const [attentionFilter, setAttentionFilter] = useState<AttentionFilter>('all');
  const [closureFilter, setClosureFilter] = useState<ClosureFilter>('all');
  const initialLoadStarted = useRef(false);
  const attentionRef = useRef<HTMLDivElement>(null);

  const canView = isAdmin()
    || hasPermission('reports.view')
    || hasPermission('reports.export')
    || hasPermission('analytics.view');
  const canExport = isAdmin() || hasPermission('reports.export');

  useEffect(() => {
    if (!isAuthenticated && !authLoading) void fetchMe();
  }, [authLoading, fetchMe, isAuthenticated]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(SAVED_REPORT_VIEWS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        setSavedViews(parsed.filter((item): item is SavedReportView =>
          Boolean(item?.id && item?.name && item?.filters?.startDate && item?.filters?.endDate)
        ));
      }
    } catch {
      // Ignore malformed local saved-view data and keep reporting usable.
    }
  }, []);

  const loadPlants = useCallback(async () => {
    const response = await api.get<Plant[]>('/api/plants', {
      headers: { 'x-plant-id': '' },
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

  const exceptionRows = useMemo(() => {
    const rows = report?.exceptionWatchlist || [];
    switch (attentionFilter) {
      case 'critical':
        return rows.filter(item => item.riskLevel === 'critical');
      case 'overdue':
        return rows.filter(item => item.reasons.includes('Overdue'));
      case 'materials':
        return rows.filter(item => item.pendingMaterials > 0);
      case 'tools':
        return rows.filter(item => item.outstandingTools > 0);
      case 'assistance':
        return rows.filter(item => item.pendingAssistance > 0);
      case 'handovers':
        return rows.filter(item => item.pendingHandovers > 0);
      case 'downtime':
        return rows.filter(item => item.downtimeMinutes >= 240);
      default:
        return rows;
    }
  }, [attentionFilter, report?.exceptionWatchlist]);

  const attentionCounts = useMemo(() => {
    const rows = report?.exceptionWatchlist || [];
    return {
      all: rows.length,
      critical: rows.filter(item => item.riskLevel === 'critical').length,
      overdue: rows.filter(item => item.reasons.includes('Overdue')).length,
      materials: rows.filter(item => item.pendingMaterials > 0).length,
      tools: rows.filter(item => item.outstandingTools > 0).length,
      assistance: rows.filter(item => item.pendingAssistance > 0).length,
      handovers: rows.filter(item => item.pendingHandovers > 0).length,
      downtime: rows.filter(item => item.downtimeMinutes >= 240).length,
    };
  }, [report?.exceptionWatchlist]);

  const closureExceptionRows = useMemo(() => {
    const rows = report?.closureExceptionWatchlist || [];
    switch (closureFilter) {
      case 'missing-rca':
        return rows.filter(item => item.missingRca);
      case 'supervisor':
        return rows.filter(item => item.awaitingSupervisorApproval);
      case 'planner':
        return rows.filter(item => item.awaitingPlannerClosure);
      case 'rework':
        return rows.filter(item => item.reworkCount > 0);
      default:
        return rows;
    }
  }, [closureFilter, report?.closureExceptionWatchlist]);

  const closureExceptionCounts = useMemo(() => {
    const rows = report?.closureExceptionWatchlist || [];
    return {
      all: rows.length,
      missingRca: rows.filter(item => item.missingRca).length,
      supervisor: rows.filter(item => item.awaitingSupervisorApproval).length,
      planner: rows.filter(item => item.awaitingPlannerClosure).length,
      rework: rows.filter(item => item.reworkCount > 0).length,
    };
  }, [report?.closureExceptionWatchlist]);

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


  const persistSavedViews = (views: SavedReportView[]) => {
    setSavedViews(views);
    window.localStorage.setItem(SAVED_REPORT_VIEWS_KEY, JSON.stringify(views));
  };

  const saveCurrentView = () => {
    const nextNumber = savedViews.length + 1;
    const view: SavedReportView = {
      id: `view-${Date.now()}`,
      name: `Saved view ${nextNumber}`,
      filters: { ...filters },
    };
    persistSavedViews([...savedViews, view]);
    setSelectedSavedViewId(view.id);
    toast.success(`${view.name} saved`);
  };

  const applySavedView = (viewId: string) => {
    setSelectedSavedViewId(viewId);
    const view = savedViews.find(item => item.id === viewId);
    if (!view) return;
    setFilters({ ...view.filters });
    void loadReport(view.filters);
  };

  const deleteSelectedView = () => {
    if (!selectedSavedViewId) return;
    const view = savedViews.find(item => item.id === selectedSavedViewId);
    const remaining = savedViews.filter(item => item.id !== selectedSavedViewId);
    persistSavedViews(remaining);
    setSelectedSavedViewId('');
    if (view) toast.success(`${view.name} removed`);
  };

  const openAttentionView = (filter: AttentionFilter) => {
    setAttentionFilter(filter);
    window.requestAnimationFrame(() => {
      attentionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const applyQuickPeriod = (period: 'today' | 'week' | 'month') => {
    const end = new Date();
    const start = new Date(end);

    if (period === 'week') {
      const day = start.getDay();
      const daysSinceMonday = day === 0 ? 6 : day - 1;
      start.setDate(start.getDate() - daysSinceMonday);
    } else if (period === 'month') {
      start.setDate(1);
    }

    const next = {
      ...filters,
      startDate: start.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10),
      moduleFilter: 'repairs' as ModuleFilter,
    };
    setFilters(next);
    void loadReport(next);
  };

  const downloadOperationalXlsx = async (definition: OperationalReportDefinition) => {
    if (!canExport) {
      toast.error('reports.export permission is required');
      return;
    }

    setOperationalDownloading(`${definition.id}:xlsx`);
    try {
      let response: Response;
      if (definition.customXlsxEndpoint === 'machine-component-detail') {
        const params = new URLSearchParams({ format: 'xlsx' });
        if (filters.startDate) params.set('dateFrom', filters.startDate);
        if (filters.endDate) params.set('dateTo', filters.endDate);
        if (filters.plantId !== 'all') params.set('plantId', filters.plantId);
        if (filters.departmentId !== 'all') params.set('departmentId', filters.departmentId);
        response = await api.getRaw(`/api/repairs/reports/detailed?${params.toString()}`, {
          headers: plantHeader(filters.plantId),
          timeout: 60_000,
        });
      } else {
        if (!definition.xlsxType) throw new Error('Excel report type is not configured');
        response = await api.getRaw('/api/repairs/reports/xlsx', {
          method: 'POST',
          headers: {
            ...plantHeader(filters.plantId),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            reportType: definition.xlsxType,
            filters: {
              dateFrom: filters.startDate || undefined,
              dateTo: filters.endDate || undefined,
              plantId: filters.plantId === 'all' ? undefined : filters.plantId,
              departmentId: filters.departmentId === 'all' ? undefined : filters.departmentId,
              maintenanceScope: 'repairs',
            },
          }),
          timeout: 60_000,
        });
      }

      if (!response.ok) {
        let message = `Excel export failed (${response.status})`;
        try {
          const body = await response.json();
          if (body?.error) message = body.error;
        } catch {
          // Keep HTTP fallback.
        }
        throw new Error(message);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const disposition = response.headers.get('content-disposition') || '';
      const serverName = /filename="?([^";]+)"?/i.exec(disposition)?.[1];
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = serverName || `${definition.xlsxType || 'machine-component-repair-detail'}-report.xlsx`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      toast.success(`${definition.title} Excel report exported`);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Excel export failed');
    } finally {
      setOperationalDownloading(null);
    }
  };

  const downloadOperationalPdf = async (definition: OperationalReportDefinition) => {
    if (!canExport || !definition.pdfType) return;

    setOperationalDownloading(`${definition.id}:pdf`);
    try {
      const params = new URLSearchParams({
        type: definition.pdfType,
        format: 'pdf',
      });
      if (filters.startDate) params.set('from', filters.startDate);
      if (filters.endDate) params.set('to', filters.endDate);
      if (filters.plantId !== 'all') params.set('plantId', filters.plantId);
      if (filters.departmentId !== 'all') params.set('department', filters.departmentId);

      const response = await api.getRaw(`/api/repairs/reports?${params.toString()}`, {
        headers: plantHeader(filters.plantId),
        timeout: 60_000,
      });

      if (!response.ok) {
        let message = `PDF export failed (${response.status})`;
        try {
          const body = await response.json();
          if (body?.error) message = body.error;
        } catch {
          // Keep HTTP fallback.
        }
        throw new Error(message);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `repair-${definition.pdfType}-report.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      toast.success(`${definition.title} PDF report exported`);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'PDF export failed');
    } finally {
      setOperationalDownloading(null);
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

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">Quick periods:</span>
            <Button type="button" variant="outline" size="sm" onClick={() => applyQuickPeriod('today')}>Today</Button>
            <Button type="button" variant="outline" size="sm" onClick={() => applyQuickPeriod('week')}>This Week</Button>
            <Button type="button" variant="outline" size="sm" onClick={() => applyQuickPeriod('month')}>This Month</Button>
          </div>

          <div className="mt-3 flex flex-wrap items-end gap-2">
            <div className="min-w-[240px] space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">Saved report views</span>
              <Select value={selectedSavedViewId || undefined} onValueChange={applySavedView}>
                <SelectTrigger><SelectValue placeholder={savedViews.length ? 'Choose a saved view' : 'No saved views yet'} /></SelectTrigger>
                <SelectContent>
                  {savedViews.map(view => (
                    <SelectItem key={view.id} value={view.id}>
                      {view.name} · {view.filters.startDate} → {view.filters.endDate}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={saveCurrentView}>Save Current View</Button>
            <Button type="button" variant="ghost" size="sm" onClick={deleteSelectedView} disabled={!selectedSavedViewId}>Remove Saved View</Button>
            <span className="text-[11px] text-muted-foreground">Saved on this device and browser.</span>
          </div>

          {filtersDirty && (
            <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
              Filters have changed. Select Generate to refresh the report. Export buttons continue to use the currently displayed report filters.
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-border/60 shadow-sm print:hidden">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Repairs Report Library</CardTitle>
          <CardDescription>
            Operational reports use the currently selected date, plant and department filters. Excel exports contain the full filtered dataset.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {REPORT_CATEGORIES.map(category => {
              const categoryReports = OPERATIONAL_REPORTS.filter(definition => definition.category === category);
              return (
                <section key={category} className="space-y-3">
                  <div className="flex items-center gap-3">
                    <h3 className="text-sm font-semibold">{category}</h3>
                    <div className="h-px flex-1 bg-border/60" />
                    <Badge variant="outline" className="text-[10px]">{categoryReports.length} reports</Badge>
                  </div>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {categoryReports.map(definition => {
                      const Icon = definition.icon;
                      const xlsxBusy = operationalDownloading === `${definition.id}:xlsx`;
                      const pdfBusy = operationalDownloading === `${definition.id}:pdf`;
                      return (
                        <div key={definition.id} className="flex min-h-[170px] flex-col rounded-lg border border-border/60 p-4">
                          <div className="flex items-start gap-3">
                            <div className="rounded-md border bg-muted/40 p-2"><Icon className="h-4 w-4" /></div>
                            <div className="min-w-0 flex-1">
                              <p className="font-semibold">{definition.title}</p>
                              <p className="mt-1 text-xs leading-5 text-muted-foreground">{definition.description}</p>
                            </div>
                          </div>
                          <div className="mt-auto flex flex-wrap gap-2 pt-4">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={!canExport || operationalDownloading !== null}
                              onClick={() => void downloadOperationalXlsx(definition)}
                            >
                              {xlsxBusy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5" />}
                              Excel
                            </Button>
                            {definition.pdfType && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={!canExport || operationalDownloading !== null}
                                onClick={() => void downloadOperationalPdf(definition)}
                              >
                                {pdfBusy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <FileText className="mr-1.5 h-3.5 w-3.5" />}
                                PDF
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
          {!canExport && (
            <p className="mt-3 text-xs text-muted-foreground">You can view reporting analytics, but report file downloads require reports.export permission.</p>
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

          <Card className="border-border/60 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-base">Breakdown Performance & Response</CardTitle>
                  <CardDescription>breakdown frequency with separated response, repair/MTTR and recorded downtime</CardDescription>
                </div>
                <Badge variant="outline">{report.breakdownPerformance?.breakdownCount ?? 0} breakdown(s)</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                {[
                  ['Breakdowns', report.breakdownPerformance?.breakdownCount ?? 0],
                  ['Avg Response', `${report.breakdownPerformance?.avgResponseMinutes ?? 0} min`],
                  ['Avg Repair / MTTR', `${report.breakdownPerformance?.avgRepairMinutes ?? 0} min`],
                  ['Avg Restore', `${report.breakdownPerformance?.avgRestorationMinutes ?? 0} min`],
                  ['Recorded Downtime', `${Math.round(report.breakdownPerformance?.recordedDowntimeMinutes ?? 0)} min`],
                  ['Missing Start / End', `${report.breakdownPerformance?.missingStartCount ?? 0} / ${report.breakdownPerformance?.missingCompletionCount ?? 0}`],
                ].map(([label, value]) => (
                  <div key={String(label)} className="rounded-lg border p-3">
                    <p className="text-[11px] text-muted-foreground">{label}</p>
                    <p className="mt-1 text-lg font-bold">{value}</p>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.35fr_1fr]">
                <div>
                  <p className="mb-2 text-xs font-medium text-muted-foreground">Weekly Breakdown Count</p>
                  {(report.breakdownPerformance?.weekly || []).length > 0 ? (
                    <ResponsiveContainer width="100%" height={260}>
                      <BarChart data={report.breakdownPerformance?.weekly || []} margin={{ top: 8, right: 8, bottom: 18, left: -12 }}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis dataKey="week" tick={{ fontSize: 10 }} angle={-35} textAnchor="end" height={55} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                        <RechartsTooltip />
                        <Bar dataKey="breakdowns" name="Breakdowns" fill="#dc2626" radius={[5, 5, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : <EmptyState icon={TrendingDown} title="No breakdown data" />}
                </div>

                <div>
                  <p className="mb-2 text-xs font-medium text-muted-foreground">Top Machines by Breakdown Count</p>
                  <div className="max-h-[275px] overflow-auto rounded-md border">
                    <Table>
                      <TableHeader className="sticky top-0 bg-background">
                        <TableRow>
                          <TableHead>Machine</TableHead>
                          <TableHead className="text-right">Breakdowns</TableHead>
                          <TableHead className="text-right">Downtime</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(report.breakdownPerformance?.byAsset || []).slice(0, 12).map(asset => (
                          <TableRow key={asset.assetId || asset.assetName}>
                            <TableCell>
                              <div className="font-medium">{asset.assetName}</div>
                              {asset.assetTag && <div className="font-mono text-[10px] text-muted-foreground">{asset.assetTag}</div>}
                            </TableCell>
                            <TableCell className="text-right font-mono">{asset.breakdowns}</TableCell>
                            <TableCell className="text-right font-mono text-xs">{Math.round(asset.recordedDowntimeMinutes)}m</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </div>

              {(report.breakdownPerformance?.missingStartCount || report.breakdownPerformance?.missingCompletionCount) ? (
                <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
                  Data quality: {report.breakdownPerformance?.missingStartCount ?? 0} breakdown(s) have no recorded work-start time and {report.breakdownPerformance?.missingCompletionCount ?? 0} have no complete start/end repair interval. These records remain counted but are excluded from the affected averages.
                </div>
              ) : null}
            </CardContent>
          </Card>

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

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <Card className="border-border/60 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Backlog, Aging & Response</CardTitle>
                <CardDescription>Open-work aging, response speed and closure/SLA pressure</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Open</p><p className="text-xl font-bold">{report.backlogAging?.totalOpen ?? 0}</p></div>
                  <button type="button" onClick={() => openAttentionView('overdue')} className="rounded-lg border p-3 text-left transition-colors hover:bg-muted/40 focus:outline-none focus:ring-2 focus:ring-emerald-500">
                    <p className="text-xs text-muted-foreground">Overdue</p>
                    <p className="text-xl font-bold text-red-600">{report.backlogAging?.overdueOpen ?? 0}</p>
                    <p className="mt-1 text-[10px] text-muted-foreground">View affected work orders</p>
                  </button>
                  <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Avg Open Age</p><p className="text-xl font-bold">{report.backlogAging?.avgOpenAgeDays ?? 0}d</p></div>
                  <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Oldest Open</p><p className="text-xl font-bold">{report.backlogAging?.oldestOpenDays ?? 0}d</p></div>
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <p className="mb-2 text-xs font-medium text-muted-foreground">Aging Buckets</p>
                    <div className="space-y-2">
                      {(report.backlogAging?.buckets || []).map(bucket => (
                        <div key={bucket.bucket} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                          <span>{bucket.bucket}</span><strong>{bucket.count}</strong>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <p className="mb-2 text-xs font-medium text-muted-foreground">Response & SLA</p>
                    {[
                      ['Avg response', `${report.responseAndSla?.avgResponseHours ?? 0}h`],
                      ['Emergency response', `${report.responseAndSla?.avgEmergencyResponseHours ?? 0}h`],
                      ['Planner closure lag', `${report.responseAndSla?.avgPlannerClosureLagHours ?? 0}h`],
                      ['SLA compliance', `${report.responseAndSla?.slaComplianceRate ?? 0}%`],
                    ].map(([label, value]) => (
                      <div key={label} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                        <span>{label}</span><strong>{value}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/60 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Cost & Economic Impact</CardTitle>
                <CardDescription>Recorded maintenance cost plus directly tracked operational impact</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    ['Recorded maintenance', report.costAnalysis?.recordedMaintenanceCost ?? 0],
                    ['Labor', report.costAnalysis?.laborCost ?? 0],
                    ['Materials', report.costAnalysis?.materialCost ?? 0],
                    ['Tool usage', report.costAnalysis?.toolUsageCost ?? 0],
                    ['Damaged-tool repair', report.costAnalysis?.damagedToolRepairCost ?? 0],
                    ['Spare refurbishment', report.costAnalysis?.sparePartRefurbishmentCost ?? 0],
                    ['Production loss', report.costAnalysis?.downtimeProductionLoss ?? 0],
                    ['Tracked economic impact', report.costAnalysis?.trackedEconomicImpact ?? 0],
                  ].map(([label, value]) => (
                    <div key={String(label)} className="rounded-lg border p-3">
                      <p className="text-xs text-muted-foreground">{label}</p>
                      <p className="mt-1 text-base font-bold">{formatCurrency(Number(value || 0))}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="border-border/60 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Monthly Repairs Trend</CardTitle>
              <CardDescription>Opened vs completed workload with emergency volume by month</CardDescription>
            </CardHeader>
            <CardContent>
              {(report.monthlyOperationalTrends || []).length ? (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={report.monthlyOperationalTrends} margin={{ top: 8, right: 8, bottom: 8, left: -12 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <RechartsTooltip />
                    <Bar dataKey="opened" name="Opened" fill="#64748b" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="completed" name="Completed" fill="#059669" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="emergency" name="Emergency" fill="#ef4444" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : <EmptyState icon={BarChart3} title="No monthly trend data" />}
            </CardContent>
          </Card>

          <Card className="border-border/60 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Asset Reliability & Repeat Failures</CardTitle>
              <CardDescription>Corrective/emergency failure frequency, MTBF interval, MTTR, downtime and repair cost</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-[520px] overflow-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-background">
                    <TableRow>
                      <TableHead>Asset</TableHead><TableHead>Criticality</TableHead><TableHead className="text-right">Failures</TableHead>
                      <TableHead>Repeat</TableHead><TableHead className="text-right">MTBF Days</TableHead><TableHead className="text-right">MTTR Hours</TableHead>
                      <TableHead className="text-right">Downtime</TableHead><TableHead className="text-right">Cost</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(report.assetReliability || []).slice(0, 30).map(asset => (
                      <TableRow key={asset.assetId || asset.assetName}>
                        <TableCell><div className="font-medium">{asset.assetName}</div>{asset.assetTag && <div className="font-mono text-[10px] text-muted-foreground">{asset.assetTag}</div>}</TableCell>
                        <TableCell className="text-xs">{prettify(asset.criticality)}</TableCell>
                        <TableCell className="text-right font-mono">{asset.failureCount}</TableCell>
                        <TableCell>{asset.repeatFailure ? <Badge variant="destructive">Repeat</Badge> : <Badge variant="outline">Single</Badge>}</TableCell>
                        <TableCell className="text-right font-mono text-xs">{asset.mtbfDays ?? '—'}</TableCell>
                        <TableCell className="text-right font-mono text-xs">{asset.mttrHours}</TableCell>
                        <TableCell className="text-right font-mono text-xs">{Math.round(asset.downtimeMinutes)}m</TableCell>
                        <TableCell className="text-right text-sm">{formatCurrency(asset.totalCost)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-4">
            {[
              {
                title: 'Materials',
                rows: [
                  ['Requests', report.resourceFlow?.materials.totalRequests ?? 0],
                  ['Pending', report.resourceFlow?.materials.pendingRequests ?? 0],
                  ['Pending reconciliation', report.resourceFlow?.materials.pendingReconciliation ?? 0],
                  ['Avg issue', `${report.resourceFlow?.materials.avgIssueHours ?? 0}h`],
                  ['Waste cost', formatCurrency(report.resourceFlow?.materials.wasteCost ?? 0)],
                  ['Return value', formatCurrency(report.resourceFlow?.materials.returnValue ?? 0)],
                ],
              },
              {
                title: 'Tools / Custody',
                rows: [
                  ['Requests', report.resourceFlow?.tools.totalRequests ?? 0],
                  ['Pending', report.resourceFlow?.tools.pendingRequests ?? 0],
                  ['Issued', report.resourceFlow?.tools.issuedRequests ?? 0],
                  ['Outstanding custody', report.resourceFlow?.tools.outstandingCustody ?? 0],
                  ['Returned', report.resourceFlow?.tools.returnedRequests ?? 0],
                  ['Avg issue', `${report.resourceFlow?.tools.avgIssueHours ?? 0}h`],
                ],
              },
              {
                title: 'Assistance',
                rows: [
                  ['Requests', report.resourceFlow?.assistance.totalRequests ?? 0],
                  ['Pending', report.resourceFlow?.assistance.pending ?? 0],
                  ['Approved', report.resourceFlow?.assistance.approved ?? 0],
                  ['Rejected', report.resourceFlow?.assistance.rejected ?? 0],
                  ['Cancelled', report.resourceFlow?.assistance.cancelled ?? 0],
                  ['Avg review', `${report.resourceFlow?.assistance.avgReviewHours ?? 0}h`],
                ],
              },
              {
                title: 'Shift Handovers',
                rows: [
                  ['Total', report.resourceFlow?.handovers.total ?? 0],
                  ['Pending', report.resourceFlow?.handovers.pending ?? 0],
                  ['Confirmed', report.resourceFlow?.handovers.confirmed ?? 0],
                ],
              },
            ].map(section => (
              <Card key={section.title} className="border-border/60 shadow-sm">
                <CardHeader className="pb-2"><CardTitle className="text-sm">{section.title}</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {section.rows.map(([label, value]) => (
                    <div key={String(label)} className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{label}</span><strong>{value}</strong>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <Card className="border-border/60 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Closure & RCA Compliance</CardTitle>
                <CardDescription>Completion quality, approvals and rework readiness</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Compliance</p><p className="text-xl font-bold">{report.closureCompliance?.complianceRate ?? 0}%</p></div>
                  <button type="button" onClick={() => setClosureFilter('missing-rca')} className="rounded-lg border p-3 text-left transition-colors hover:bg-muted/40 focus:outline-none focus:ring-2 focus:ring-emerald-500">
                    <p className="text-xs text-muted-foreground">Missing RCA</p>
                    <p className="text-xl font-bold text-amber-600">{report.closureCompliance?.missingRca ?? 0}</p>
                    <p className="mt-1 text-[10px] text-muted-foreground">Show affected WOs</p>
                  </button>
                  <button type="button" onClick={() => setClosureFilter('rework')} className="rounded-lg border p-3 text-left transition-colors hover:bg-muted/40 focus:outline-none focus:ring-2 focus:ring-emerald-500">
                    <p className="text-xs text-muted-foreground">Rework WOs</p>
                    <p className="text-xl font-bold">{report.closureCompliance?.reworkWOs ?? 0}</p>
                    <p className="mt-1 text-[10px] text-muted-foreground">Show affected WOs</p>
                  </button>
                  <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Rework Instances</p><p className="text-xl font-bold">{report.closureCompliance?.totalReworkInstances ?? 0}</p></div>
                </div>
                <div className="text-sm">
                  <div className="flex justify-between border-b py-2"><span>Eligible completed/closed WOs</span><strong>{report.closureCompliance?.eligibleWOs ?? 0}</strong></div>
                  <div className="flex justify-between border-b py-2"><span>Compliant WOs</span><strong>{report.closureCompliance?.compliantWOs ?? 0}</strong></div>
                  <button type="button" onClick={() => setClosureFilter('supervisor')} className="flex w-full justify-between border-b py-2 text-left hover:text-emerald-700"><span>Awaiting supervisor approval</span><strong>{report.closureCompliance?.awaitingSupervisorApproval ?? 0}</strong></button>
                  <button type="button" onClick={() => setClosureFilter('planner')} className="flex w-full justify-between py-2 text-left hover:text-emerald-700"><span>Planner closure exceptions</span><strong>{report.closureCompliance?.awaitingPlannerClosure ?? 0}</strong></button>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/60 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Returns & Damaged Tools</CardTitle>
                <CardDescription>Rotating spare recovery, refurbishment and tool-damage exposure</CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="rounded-lg border p-3 text-sm">
                  <p className="mb-2 font-semibold">Spare Part Returns</p>
                  <div className="flex justify-between py-1"><span>Total</span><strong>{report.returnsAndDamage?.spareParts.totalReturns ?? 0}</strong></div>
                  <div className="flex justify-between py-1"><span>Pending</span><strong>{report.returnsAndDamage?.spareParts.pending ?? 0}</strong></div>
                  <div className="flex justify-between py-1"><span>Returned to store</span><strong>{report.returnsAndDamage?.spareParts.returnedToStore ?? 0}</strong></div>
                  <div className="flex justify-between py-1"><span>Disposed</span><strong>{report.returnsAndDamage?.spareParts.disposed ?? 0}</strong></div>
                  <div className="flex justify-between py-1"><span>Refurbishment cost</span><strong>{formatCurrency(report.returnsAndDamage?.spareParts.refurbishmentCost ?? 0)}</strong></div>
                </div>
                <div className="rounded-lg border p-3 text-sm">
                  <p className="mb-2 font-semibold">Damaged Tools</p>
                  <div className="flex justify-between py-1"><span>Reports</span><strong>{report.returnsAndDamage?.damagedTools.totalReports ?? 0}</strong></div>
                  <div className="flex justify-between py-1"><span>Open</span><strong>{report.returnsAndDamage?.damagedTools.openReports ?? 0}</strong></div>
                  <div className="flex justify-between py-1"><span>Critical damage</span><strong>{report.returnsAndDamage?.damagedTools.criticalDamage ?? 0}</strong></div>
                  <div className="flex justify-between py-1"><span>Written off</span><strong>{report.returnsAndDamage?.damagedTools.writtenOff ?? 0}</strong></div>
                  <div className="flex justify-between py-1"><span>Repair cost</span><strong>{formatCurrency(report.returnsAndDamage?.damagedTools.repairCost ?? 0)}</strong></div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="border-border/60 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-base">Closure / RCA Exception Queue</CardTitle>
                  <CardDescription>Completed or closed repairs that still need RCA, approval, planner closure or rework follow-up</CardDescription>
                </div>
                <Badge variant={closureExceptionCounts.all > 0 ? 'outline' : 'secondary'}>
                  {closureExceptionRows.length} shown / {closureExceptionCounts.all} exception(s)
                </Badge>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 print:hidden">
                {([
                  ['all', 'All', closureExceptionCounts.all],
                  ['missing-rca', 'Missing RCA', closureExceptionCounts.missingRca],
                  ['supervisor', 'Supervisor Approval', closureExceptionCounts.supervisor],
                  ['planner', 'Planner Closure', closureExceptionCounts.planner],
                  ['rework', 'Rework', closureExceptionCounts.rework],
                ] as Array<[ClosureFilter, string, number]>).map(([key, label, count]) => (
                  <Button
                    key={key}
                    type="button"
                    variant={closureFilter === key ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setClosureFilter(key)}
                    className={closureFilter === key ? 'bg-emerald-600 text-white hover:bg-emerald-700' : ''}
                  >
                    {label} <Badge variant="secondary" className="ml-1.5">{count}</Badge>
                  </Button>
                ))}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-[460px] overflow-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-background">
                    <TableRow>
                      <TableHead>WO</TableHead>
                      <TableHead>Title / Asset</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Exceptions</TableHead>
                      <TableHead>Completed</TableHead>
                      <TableHead className="text-right print:hidden">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {closureExceptionRows.length === 0 ? (
                      <TableRow><TableCell colSpan={6}><EmptyState icon={CheckCircle2} title={closureFilter === 'all' ? 'No closure or RCA exceptions in this report period' : 'No closure exceptions match this filter'} /></TableCell></TableRow>
                    ) : closureExceptionRows.map(item => {
                      const issues = [
                        item.missingRca ? 'Missing RCA' : null,
                        item.awaitingSupervisorApproval ? 'Supervisor approval' : null,
                        item.awaitingPlannerClosure ? 'Planner closure' : null,
                        item.reworkCount > 0 ? `Rework × ${item.reworkCount}` : null,
                      ].filter(Boolean);
                      return (
                        <TableRow key={item.id}>
                          <TableCell className="font-mono text-xs">{item.woNumber || '—'}</TableCell>
                          <TableCell>
                            <div className="font-medium">{item.title || 'Untitled work order'}</div>
                            <div className="text-xs text-muted-foreground">{item.assetName}{item.assetTag ? ` · ${item.assetTag}` : ''}</div>
                          </TableCell>
                          <TableCell><Badge variant={statusBadge(item.status)} className="text-[10px]">{prettify(item.status)}</Badge></TableCell>
                          <TableCell className="max-w-[460px] text-xs">{issues.join(' · ')}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{item.completedAt ? formatDate(item.completedAt) : '—'}</TableCell>
                          <TableCell className="text-right print:hidden">
                            <Button asChild variant="outline" size="sm">
                              <Link href={`/work-orders/${item.id}`} aria-label={`Open closure exception work order ${item.woNumber || item.id}`}>
                                Open <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
                              </Link>
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <div ref={attentionRef} className="scroll-mt-6">
          <Card className="border-border/60 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-base">Management Exception Watchlist</CardTitle>
                  <CardDescription>Open repairs needing management attention because of age, priority, downtime or unresolved resources</CardDescription>
                </div>
                <Badge variant={attentionCounts.critical > 0 ? 'destructive' : 'outline'}>
                  {exceptionRows.length} shown / {attentionCounts.all} exception(s)
                </Badge>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 print:hidden">
                {([
                  ['all', 'All', attentionCounts.all],
                  ['critical', 'Critical', attentionCounts.critical],
                  ['overdue', 'Overdue', attentionCounts.overdue],
                  ['materials', 'Materials', attentionCounts.materials],
                  ['tools', 'Tools', attentionCounts.tools],
                  ['assistance', 'Assistance', attentionCounts.assistance],
                  ['handovers', 'Handovers', attentionCounts.handovers],
                  ['downtime', 'High Downtime', attentionCounts.downtime],
                ] as Array<[AttentionFilter, string, number]>).map(([key, label, count]) => (
                  <Button
                    key={key}
                    type="button"
                    variant={attentionFilter === key ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setAttentionFilter(key)}
                    className={attentionFilter === key ? 'bg-emerald-600 text-white hover:bg-emerald-700' : ''}
                  >
                    {label} <Badge variant="secondary" className="ml-1.5">{count}</Badge>
                  </Button>
                ))}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-[520px] overflow-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-background">
                    <TableRow>
                      <TableHead>WO</TableHead><TableHead>Title / Asset</TableHead><TableHead>Risk</TableHead><TableHead>Age</TableHead><TableHead>Why flagged</TableHead><TableHead className="text-right print:hidden">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {exceptionRows.length === 0 ? (
                      <TableRow><TableCell colSpan={6}><EmptyState icon={CheckCircle2} title={attentionFilter === 'all' ? 'No management exceptions in this report period' : 'No exceptions match this attention filter'} /></TableCell></TableRow>
                    ) : exceptionRows.map(item => (
                      <TableRow key={item.id}>
                        <TableCell className="font-mono text-xs">{item.woNumber || '—'}</TableCell>
                        <TableCell><div className="font-medium">{item.title || 'Untitled work order'}</div><div className="text-xs text-muted-foreground">{item.assetName}</div></TableCell>
                        <TableCell><Badge variant={item.riskLevel === 'critical' ? 'destructive' : 'outline'}>{prettify(item.riskLevel)}</Badge></TableCell>
                        <TableCell className="font-mono text-xs">{item.ageDays}d</TableCell>
                        <TableCell className="max-w-[520px] text-xs">{item.reasons.join(' · ')}</TableCell>
                        <TableCell className="text-right print:hidden">
                          <Button asChild variant="outline" size="sm">
                            <Link href={`/work-orders/${item.id}`} aria-label={`Open work order ${item.woNumber || item.id}`}>
                              Open <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
                            </Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
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
                      <TableHead className="text-right print:hidden">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {workOrders.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={11}><EmptyState icon={Wrench} title="No work orders match these filters" /></TableCell>
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
                        <TableCell className="text-right print:hidden">
                          <Button asChild variant="ghost" size="sm">
                            <Link href={`/work-orders/${wo.id}`} aria-label={`Open work order ${wo.woNumber || wo.id}`}>
                              Open <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
                            </Link>
                          </Button>
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

      <style>{`
        @media print {
          @page { size: landscape; margin: 10mm; }
          body { background: white !important; }
          [data-sonner-toaster] { display: none !important; }
        }
      `}</style>
    </div>
  );
}
