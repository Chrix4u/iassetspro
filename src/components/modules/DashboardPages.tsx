'use client';

import React, { useCallback, useEffect, useState, useMemo } from 'react';
import { format, subDays } from 'date-fns';
import { useAuthStore } from '@/stores/authStore';
import { useNavigationStore } from '@/stores/navigationStore';
import { MODULE_CODES } from '@/hooks/useModuleEnabled';
import { api } from '@/lib/api';
import { timeAgo, formatCurrency } from '@/components/shared/helpers';
import type { DashboardStats, PageName } from '@/types';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  PieChart, Pie, Cell,
} from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent } from '@/components/ui/chart';
import {
  ClipboardList, Wrench, Eye, Plus, CheckCircle2, AlertTriangle, RefreshCw,
  TrendingUp, Factory, Shield, BarChart3, Package, Zap,
  AlertCircle, Wifi, Activity, Clock, ArrowUpRight, ArrowDownRight,
  Target, Gauge, DollarSign, CalendarClock, WrenchIcon,
  Timer, Users, LayoutDashboard, Bell, Settings, FileText,
  Hammer, HardHat, ClipboardCheck, PieChartIcon, ChevronRight,
} from 'lucide-react';
import { EmptyState, StatusBadge, MiniBarChart, ProgressRing, LoadingSkeleton } from '@/components/shared/helpers';

const CHART_COLORS = ['#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#f97316'];

const woStatusChartConfig = {
  draft: { label: 'Draft', color: '#94a3b8' },
  requested: { label: 'Requested', color: '#06b6d4' },
  approved: { label: 'Approved', color: '#8b5cf6' },
  assigned: { label: 'Assigned', color: '#3b82f6' },
  in_progress: { label: 'In Progress', color: '#f59e0b' },
  completed: { label: 'Completed', color: '#10b981' },
  closed: { label: 'Closed', color: '#6b7280' },
} as const;

const woTypeChartConfig = {
  preventive: { label: 'Preventive', color: '#10b981' },
  corrective: { label: 'Corrective', color: '#f59e0b' },
  emergency: { label: 'Emergency', color: '#ef4444' },
  inspection: { label: 'Inspection', color: '#8b5cf6' },
  predictive: { label: 'Predictive', color: '#06b6d4' },
} as const;

const mrStatusChartConfig = {
  pending: { label: 'Pending', color: '#f59e0b' },
  approved: { label: 'Approved', color: '#10b981' },
  rejected: { label: 'Rejected', color: '#ef4444' },
  converted: { label: 'Converted', color: '#06b6d4' },
} as const;

const weeklyTrendConfig = {
  workOrders: { label: 'Work Orders', color: '#10b981' },
  maintenanceRequests: { label: 'Requests', color: '#f59e0b' },
  productionOrders: { label: 'Production', color: '#06b6d4' },
} as const;

const assetConditionConfig = {
  new: { label: 'New', color: '#10b981' },
  good: { label: 'Good', color: '#14b8a6' },
  fair: { label: 'Fair', color: '#f59e0b' },
  poor: { label: 'Poor', color: '#f97316' },
  out_of_service: { label: 'Out of Service', color: '#ef4444' },
} as const;

// ===== Helper: TrendIndicator component =====
function TrendIndicator({ value, label }: { value: number; label?: string }) {
  if (value === 0) return <span className="text-xs text-muted-foreground">{label || 'No change'}</span>;
  const isPositive = value > 0;
  return (
    <span className={`text-xs font-semibold flex items-center gap-0.5 ${isPositive ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
      {isPositive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
      {Math.abs(value)}%{label && ` ${label}`}
    </span>
  );
}

// ===== Helper: Clickable KPI Card =====
function KPICard({ label, value, sublabel, color, bgColor, borderColor, iconBg, iconColor, icon, barData, showRing, ringValue, trend, onClick }: {
  label: string;
  value: string | number;
  sublabel?: string;
  color: string;
  bgColor: string;
  borderColor: string;
  iconBg: string;
  iconColor: string;
  icon: React.ElementType;
  barData?: number[];
  showRing?: boolean;
  ringValue?: number;
  trend?: number;
  onClick?: () => void;
}) {
  const Icon = icon;
  const content = (
    <Card className={`border ${borderColor} ${bgColor} hover:shadow-lg transition-all duration-300 group overflow-hidden relative h-full flex flex-col ${onClick ? 'cursor-pointer' : ''}`}>
      <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-white/40 to-transparent dark:from-white/5 dark:to-transparent rounded-bl-full" />
      <CardContent className="p-5 relative flex-1 flex flex-col">
        <div className="flex items-start justify-between mb-4">
          <div className={`h-10 w-10 rounded-xl ${iconBg} flex items-center justify-center group-hover:scale-110 transition-transform duration-300`}>
            <Icon className={`h-5 w-5 ${iconColor}`} />
          </div>
          {showRing ? (
            <ProgressRing value={ringValue || 0} color={color} size={48} strokeWidth={4} />
          ) : barData && barData.some(v => v > 0) ? (
            <MiniBarChart data={barData} color={color} maxVal={Math.max(...barData, 1)} />
          ) : null}
        </div>
        <div className="space-y-1 mt-auto">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
          <p className="text-3xl font-bold tracking-tight" style={{ color: color }}>{value}</p>
          <div className="flex items-center gap-2">
            {sublabel && <p className="text-xs text-muted-foreground font-medium">{sublabel}</p>}
            {trend !== undefined && <TrendIndicator value={trend} />}
          </div>
        </div>
      </CardContent>
    </Card>
  );
  if (onClick) {
    return <div onClick={onClick} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}>{content}</div>;
  }
  return content;
}

export function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const user = useAuthStore((s) => s.user);
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const { navigate, enabledModules: storeEnabledModules } = useNavigationStore();
  // Fail closed while authoritative module/license state is loading.
  const enabledModules = storeEnabledModules ?? new Set<string>(['core']);

  const fetchStats = useCallback(() => {
    let active = true;
    setLoading(true);
    setError(null);
    api.get<DashboardStats>('/api/dashboard/stats', { timeout: 30_000 }).then(res => {
      if (!active) return;
      if (res.success && res.data) {
        setStats(res.data);
      } else {
        setError(res.error || 'Failed to load dashboard data');
      }
    }).catch((err) => {
      if (!active) return;
      setError(err?.message || 'Network error — check your connection');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const cleanup = fetchStats();
    return cleanup;
  }, [fetchStats]);

  // Generate day labels for weekly trend chart (must be before early return for hooks rule)
  const weekLabels = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = subDays(new Date(), 6 - i);
      return format(d, 'EEE');
    });
  }, []);

  const weeklyTrendData = useMemo(() => {
    const wt = stats?.weeklyTrends;
    if (!wt) return [];
    return weekLabels.map((label, i) => ({
      day: label,
      workOrders: wt.workOrders[i] ?? 0,
      maintenanceRequests: wt.maintenanceRequests[i] ?? 0,
      productionOrders: wt.productionOrders[i] ?? 0,
    }));
  }, [stats?.weeklyTrends, weekLabels]);

  // Asset condition data for pie chart (before early return for hooks rule)
  const assetConditionData = useMemo(() => {
    const byCond = stats?.assetHealth?.byCondition || {};
    return Object.entries(byCond)
      .map(([condition, count]) => ({ condition, count }))
      .filter(d => d.count > 0);
  }, [stats?.assetHealth?.byCondition]);

  // Role detection
  const userRoles = stats?.userRoles || [];
  const isTechnician = userRoles.includes('maintenance_technician');
  const isSupervisor = userRoles.includes('maintenance_supervisor');
  const isPlanner = userRoles.includes('maintenance_planner');
  const isManager = isAdmin() || userRoles.includes('maintenance_manager');
  const isOperator = userRoles.includes('production_operator');

  if (loading) return <LoadingSkeleton />;

  // Show error state instead of misleading zeros when API fails
  if (error && !stats) {
    return (
      <div className="p-6 lg:p-8 max-w-[1600px] mx-auto">
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="h-14 w-14 rounded-2xl bg-red-50 dark:bg-red-950/30 flex items-center justify-center mb-4">
            <AlertTriangle className="h-7 w-7 text-red-500" />
          </div>
          <h2 className="text-lg font-semibold text-foreground mb-1">Unable to Load Dashboard</h2>
          <p className="text-sm text-muted-foreground max-w-md mb-5">{error}</p>
          <Button onClick={fetchStats} variant="outline" className="gap-2">
            <RefreshCw className="h-3.5 w-3.5" />
            Retry
          </Button>
        </div>
      </div>
    );
  }

  const totalWOs = stats?.totalWorkOrders || 0;
  const completedWOs = stats?.completedWorkOrders || 0;
  const completionRate = totalWOs > 0 ? Math.round((completedWOs / totalWOs) * 100) : 0;
  const activeWOs = stats?.activeWorkOrders || 0;
  const overdueWOs = stats?.overdueWorkOrders || 0;
  const pendingReqs = stats?.pendingRequests || 0;
  const pendingApprovals = stats?.pendingApprovals || 0;

  // Chart Data
  const woStatusData = [
    { status: 'draft', count: stats?.draftWO || 0 },
    { status: 'requested', count: stats?.requestedWO || 0 },
    { status: 'approved', count: stats?.approvedWO || 0 },
    { status: 'assigned', count: stats?.assignedWO || 0 },
    { status: 'in_progress', count: stats?.inProgressWO || 0 },
    { status: 'completed', count: stats?.completedWO || 0 },
    { status: 'closed', count: stats?.closedWO || 0 },
  ].filter(d => d.count > 0);

  const woTypeData = [
    { type: 'preventive', count: stats?.preventiveWO || 0 },
    { type: 'corrective', count: stats?.correctiveWO || 0 },
    { type: 'emergency', count: stats?.emergencyWO || 0 },
    { type: 'inspection', count: stats?.inspectionWO || 0 },
    { type: 'predictive', count: stats?.predictiveWO || 0 },
  ].filter(d => d.count > 0);

  const mrStatusData = [
    { status: 'pending', count: stats?.pendingMR || 0 },
    { status: 'approved', count: stats?.approvedMR || 0 },
    { status: 'rejected', count: stats?.rejectedMR || 0 },
    { status: 'converted', count: stats?.convertedMR || 0 },
  ];

  // Cross-module values
  const assetsAtRisk = stats?.assetHealth?.atRisk || 0;
  const safetyIncidents = stats?.safetyAlerts?.openIncidents || 0;
  const activeProduction = stats?.production?.activeOrders || 0;
  const iotAlerts = stats?.iotStatus?.alertCount || 0;
  const qualityIssues = stats?.quality?.openNcrs || 0;
  const lowStockItems = stats?.inventoryAlerts?.lowStock || 0;

  // Cost change trend
  const costTrend = stats?.costAnalysis?.changePercent || 0;

  // ===== Role-Based Personal KPI Cards =====
  const myKPIs = stats?.myKPIs || { activeWorkOrders: 0, pendingTasks: 0, completedThisWeek: 0, toolsCheckedOut: 0, unreadNotifications: 0 };
  const supervisorKPIs = stats?.supervisorKPIs || { pendingApprovals: 0, teamActiveWOs: 0 };
  const plannerKPIs = stats?.plannerKPIs || { planningQueue: 0, pmSchedulesDue: 0, pendingTeamRequests: 0 };
  const pendingTeamRequestsDetail = stats?.pendingTeamRequestsDetail || [];
  const maintenanceKPIs = stats?.maintenanceKPIs || { mtbf: 0, mttr: 0, plannedRatio: 0, preventiveCount: 0, reactiveCount: 0 };
  const pmAlerts = stats?.pmScheduleAlerts || { dueSoon: 0, overdue: 0 };
  const costAnalysis = stats?.costAnalysis || { thisMonthTotal: 0, lastMonthTotal: 0, changePercent: 0, thisMonthLabor: 0, thisMonthParts: 0, thisMonthContractor: 0, byCategory: {} };

  // Primary KPI cards (always visible)
  const primaryKPICards = [
    {
      label: isManager ? 'Active Work Orders' : 'My Active WOs', value: isManager ? activeWOs : myKPIs.activeWorkOrders,
      sublabel: isManager ? 'In progress, assigned, on hold' : 'Assigned to me',
      color: '#10b981', bgColor: 'bg-emerald-50 dark:bg-emerald-950/30',
      borderColor: 'border-emerald-100 dark:border-emerald-900/40',
      iconBg: 'bg-emerald-100 dark:bg-emerald-900/50', iconColor: 'text-emerald-600 dark:text-emerald-400',
      icon: Wrench, permission: 'work_orders.view',
      barData: stats?.weeklyTrends?.workOrders || [0, 0, 0, 0, 0, 0, 0],
      onClick: isManager ? () => navigate('maintenance-work-orders', { status: 'in_progress,assigned,waiting_parts,on_hold' }) : () => navigate('maintenance-work-orders', { status: 'in_progress,assigned,waiting_parts,on_hold', assignedTo: 'me' }),
    },
    {
      label: 'Completion Rate', value: `${completionRate}%`,
      sublabel: `${completedWOs} of ${totalWOs} completed`,
      color: '#14b8a6', bgColor: 'bg-teal-50 dark:bg-teal-950/30',
      borderColor: 'border-teal-100 dark:border-teal-900/40',
      iconBg: 'bg-teal-100 dark:bg-teal-900/50', iconColor: 'text-teal-600 dark:text-teal-400',
      icon: CheckCircle2, permission: 'work_orders.view',
      showRing: true, ringValue: completionRate,
    },
    {
      label: 'Overdue', value: overdueWOs,
      sublabel: overdueWOs > 0 ? 'Need attention' : 'All on track',
      color: overdueWOs > 0 ? '#ef4444' : '#10b981',
      bgColor: overdueWOs > 0 ? 'bg-red-50 dark:bg-red-950/30' : 'bg-emerald-50 dark:bg-emerald-950/30',
      borderColor: overdueWOs > 0 ? 'border-red-100 dark:border-red-900/40' : 'border-emerald-100 dark:border-emerald-900/40',
      iconBg: overdueWOs > 0 ? 'bg-red-100 dark:bg-red-900/50' : 'bg-emerald-100 dark:bg-emerald-900/50',
      iconColor: overdueWOs > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400',
      icon: AlertTriangle, permission: 'work_orders.view',
      onClick: () => navigate('maintenance-work-orders', { overdue: 'true' }),
    },
    {
      label: 'Pending & Approved', value: pendingReqs,
      sublabel: `${stats?.newTodayPending || 0} new today`,
      color: '#f59e0b', bgColor: 'bg-amber-50 dark:bg-amber-950/30',
      borderColor: 'border-amber-100 dark:border-amber-900/40',
      iconBg: 'bg-amber-100 dark:bg-amber-900/50', iconColor: 'text-amber-600 dark:text-amber-400',
      icon: ClipboardList, permission: 'maintenance_requests.view',
      barData: stats?.weeklyTrends?.maintenanceRequests || [0, 0, 0, 0, 0, 0, 0],
      onClick: () => navigate('maintenance-requests', { status: 'pending,approved' }),
    },
  ];

  const visiblePrimaryKPIs = primaryKPICards.filter(c => hasPermission(c.permission));

  // ===== Role-Based Quick Actions =====
  const allQuickActions = [
    // Common actions
    { label: 'New Request', icon: Plus, permission: 'maintenance_requests.create', page: 'create-mr' as PageName, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/30 dark:hover:bg-amber-950/50', border: 'border-amber-200 hover:border-amber-300 dark:border-amber-900/40', roles: ['all'] },
    { label: 'View WOs', icon: Wrench, permission: 'work_orders.view', page: 'maintenance-work-orders' as PageName, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/30 dark:hover:bg-emerald-950/50', border: 'border-emerald-200 hover:border-emerald-300 dark:border-emerald-900/40', roles: ['all'] },
    { label: 'View Requests', icon: ClipboardList, permission: 'maintenance_requests.view', page: 'maintenance-requests' as PageName, color: 'text-sky-600 dark:text-sky-400', bg: 'bg-sky-50 hover:bg-sky-100 dark:bg-sky-950/30 dark:hover:bg-sky-950/50', border: 'border-sky-200 hover:border-sky-300 dark:border-sky-900/40', roles: ['all'] },
    // Technician actions
    { label: 'My Active WOs', icon: HardHat, permission: 'work_orders.view', page: 'maintenance-work-orders' as PageName, params: { assignedTo: 'me' }, color: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-50 hover:bg-orange-100 dark:bg-orange-950/30 dark:hover:bg-orange-950/50', border: 'border-orange-200 hover:border-orange-300 dark:border-orange-900/40', roles: ['maintenance_technician'] },
    // Supervisor actions
    { label: 'Approvals', icon: ClipboardCheck, permission: 'maintenance_requests.view', page: 'maintenance-requests' as PageName, color: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-50 hover:bg-violet-100 dark:bg-violet-950/30 dark:hover:bg-violet-950/50', border: 'border-violet-200 hover:border-violet-300 dark:border-violet-900/40', roles: ['maintenance_supervisor', 'admin'] },
    { label: 'Team WOs', icon: Users, permission: 'work_orders.view', page: 'maintenance-work-orders' as PageName, color: 'text-cyan-600 dark:text-cyan-400', bg: 'bg-cyan-50 hover:bg-cyan-100 dark:bg-cyan-950/30 dark:hover:bg-cyan-950/50', border: 'border-cyan-200 hover:border-cyan-300 dark:border-cyan-900/40', roles: ['maintenance_supervisor', 'admin'] },
    // Planner actions
    { label: 'PM Schedules', icon: CalendarClock, permission: 'pm_schedules.view', page: 'pm-schedules' as PageName, color: 'text-teal-600 dark:text-teal-400', bg: 'bg-teal-50 hover:bg-teal-100 dark:bg-teal-950/30 dark:hover:bg-teal-950/50', border: 'border-teal-200 hover:border-teal-300 dark:border-teal-900/40', roles: ['maintenance_planner', 'admin'] },
    // Manager/Admin actions
    { label: 'Reports', icon: FileText, permission: 'reports.view', page: 'reports-maintenance' as PageName, color: 'text-fuchsia-600 dark:text-fuchsia-400', bg: 'bg-fuchsia-50 hover:bg-fuchsia-100 dark:bg-fuchsia-950/30 dark:hover:bg-fuchsia-950/50', border: 'border-fuchsia-200 hover:border-fuchsia-300 dark:border-fuchsia-900/40', roles: ['maintenance_manager', 'admin'] },
    { label: 'Settings', icon: Settings, permission: 'system_settings.view', page: 'settings-general' as PageName, color: 'text-slate-600 dark:text-slate-400', bg: 'bg-slate-50 hover:bg-slate-100 dark:bg-slate-950/30 dark:hover:bg-slate-950/50', border: 'border-slate-200 hover:border-slate-300 dark:border-slate-900/40', roles: ['admin'] },
  ];

  const visibleQuickActions = allQuickActions
    .filter(a => hasPermission(a.permission))
    .filter(a => a.roles.includes('all') || a.roles.some(r => userRoles.includes(r)))
    .filter(a => {
      if (a.page === 'pm-schedules') return enabledModules.has(MODULE_CODES.PM_SCHEDULES);
      if (a.page === 'maintenance-work-orders') return enabledModules.has(MODULE_CODES.WORK_ORDERS);
      if (a.page === 'maintenance-requests' || a.page === 'create-mr') return enabledModules.has(MODULE_CODES.MAINTENANCE_REQUESTS);
      return true;
    });

  // Cross-module overview data
  const moduleMap: Record<string, string> = {
    'Assets': 'assets',
    'Safety': 'safety',
    'Production': 'production',
    'IoT': 'iot_sensors',
    'Quality': 'quality',
    'Inventory': 'inventory',
  };

  const crossModuleData = [
    { label: 'Assets', value: stats?.assetHealth?.total || 0, detail: `${assetsAtRisk} at risk`, color: 'bg-orange-500', textColor: 'text-orange-600 dark:text-orange-400', bgColor: 'bg-orange-50 dark:bg-orange-950/30', borderColor: 'border-orange-100 dark:border-orange-900/40', page: 'assets' as PageName, params: assetsAtRisk > 0 ? { condition: 'at_risk' } : undefined },
    { label: 'Safety', value: safetyIncidents, detail: `${stats?.safetyAlerts?.overdueInspections || 0} inspections overdue`, color: 'bg-red-500', textColor: 'text-red-600 dark:text-red-400', bgColor: 'bg-red-50 dark:bg-red-950/30', borderColor: 'border-red-100 dark:border-red-900/40', page: 'safety-incidents' as PageName },
    { label: 'Production', value: activeProduction, detail: `${stats?.production?.overdueOrders || 0} overdue`, color: 'bg-cyan-500', textColor: 'text-cyan-600 dark:text-cyan-400', bgColor: 'bg-cyan-50 dark:bg-cyan-950/30', borderColor: 'border-cyan-100 dark:border-cyan-900/40', page: 'production-orders' as PageName },
    { label: 'IoT', value: stats?.iotStatus?.totalDevices || 0, detail: `${stats?.iotStatus?.offlineCount || 0} offline`, color: 'bg-violet-500', textColor: 'text-violet-600 dark:text-violet-400', bgColor: 'bg-violet-50 dark:bg-violet-950/30', borderColor: 'border-violet-100 dark:border-violet-900/40', page: 'iot-devices' as PageName },
    { label: 'Quality', value: qualityIssues, detail: `${stats?.quality?.failedInspections || 0} failed inspections`, color: 'bg-pink-500', textColor: 'text-pink-600 dark:text-pink-400', bgColor: 'bg-pink-50 dark:bg-pink-950/30', borderColor: 'border-pink-100 dark:border-pink-900/40', page: 'quality-ncr' as PageName },
    { label: 'Inventory', value: lowStockItems, detail: `${stats?.inventoryAlerts?.pendingRequests || 0} pending reqs`, color: 'bg-amber-500', textColor: 'text-amber-600 dark:text-amber-400', bgColor: 'bg-amber-50 dark:bg-amber-950/30', borderColor: 'border-amber-100 dark:border-amber-900/40', page: 'inventory-items' as PageName, params: lowStockItems > 0 ? { filter: 'low_stock' } : undefined },
  ];

  // Filter cross-module cards to only show enabled modules
  const filteredCrossModuleData = crossModuleData.filter(mod => {
    const code = moduleMap[mod.label];
    return !code || enabledModules.has(code.toLowerCase());
  });

  // Module-aware visibility for enhanced KPIs (fail closed).
  const analyticsEnabled = enabledModules.has(MODULE_CODES.ANALYTICS);
  const safetyEnabled = enabledModules.has(MODULE_CODES.SAFETY);
  const productionEnabled = enabledModules.has(MODULE_CODES.PRODUCTION);
  const qualityEnabled = enabledModules.has(MODULE_CODES.QUALITY);
  const pmEnabled = enabledModules.has(MODULE_CODES.PM_SCHEDULES);

  return (
    <div className="p-6 lg:p-8 space-y-8 max-w-[1600px] mx-auto">
      {/* ===== Welcome Header ===== */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Operations Dashboard</span>
            <Badge variant="outline" className="text-[10px] font-mono gap-1 border-primary/20 bg-primary/5 text-primary ml-1">
              {userRoles[0]?.replace(/_/g, ' ') || 'User'}
            </Badge>
          </div>
          <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">
            Welcome back, <span className="text-primary">{user?.fullName?.split(' ')[0] || 'User'}</span>
          </h1>
          <p className="text-sm text-muted-foreground">Real-time maintenance operations overview &middot; {format(new Date(), 'EEEE, MMMM d, yyyy')}</p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          {myKPIs.unreadNotifications > 0 && (
            <Badge variant="destructive" className="text-[11px] font-mono gap-1.5">
              <Bell className="h-3 w-3" />
              {myKPIs.unreadNotifications} new
            </Badge>
          )}
          <Badge variant="outline" className="text-[11px] font-mono gap-1.5 border-primary/20 bg-primary/5 text-primary">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Live
          </Badge>
        </div>
      </div>

      {/* ===== My Personal KPIs (Role-Based) ===== */}
      <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
        {/* Always visible: My Active WOs */}
        <button onClick={() => navigate('maintenance-work-orders', { assignedTo: 'me' })} className="flex items-center gap-3 px-4 py-3.5 rounded-xl border border-emerald-100 dark:border-emerald-900/40 bg-emerald-50 dark:bg-emerald-950/30 transition-all hover:shadow-sm cursor-pointer text-left hover:scale-[1.02] active:scale-[0.98] w-full">
          <div className="h-9 w-9 rounded-lg bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center shrink-0">
            <Wrench className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{isManager ? 'Active WOs' : 'My Active WOs'}</p>
            <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400">{isManager ? activeWOs : myKPIs.activeWorkOrders}</p>
          </div>
          <ChevronRight className="h-3.5 w-3.5 text-emerald-400/50 shrink-0" />
        </button>
        {/* Always visible: Pending Tasks */}
        <button onClick={() => navigate('maintenance-requests', { status: 'pending,approved' })} className="flex items-center gap-3 px-4 py-3.5 rounded-xl border border-amber-100 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-950/30 transition-all hover:shadow-sm cursor-pointer text-left hover:scale-[1.02] active:scale-[0.98] w-full">
          <div className="h-9 w-9 rounded-lg bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center shrink-0">
            <ClipboardList className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Pending Tasks</p>
            <p className="text-xl font-bold text-amber-600 dark:text-amber-400">{myKPIs.pendingTasks}</p>
          </div>
          <ChevronRight className="h-3.5 w-3.5 text-amber-400/50 shrink-0" />
        </button>
        {/* Always visible: Completed This Week */}
        <button onClick={() => navigate('maintenance-work-orders', { status: 'completed,verified', assignedTo: 'me' })} className="flex items-center gap-3 px-4 py-3.5 rounded-xl border border-teal-100 dark:border-teal-900/40 bg-teal-50 dark:bg-teal-950/30 transition-all hover:shadow-sm cursor-pointer text-left hover:scale-[1.02] active:scale-[0.98] w-full">
          <div className="h-9 w-9 rounded-lg bg-teal-100 dark:bg-teal-900/50 flex items-center justify-center shrink-0">
            <CheckCircle2 className="h-4 w-4 text-teal-600 dark:text-teal-400" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Done This Week</p>
            <p className="text-xl font-bold text-teal-600 dark:text-teal-400">{myKPIs.completedThisWeek}</p>
          </div>
          <ChevronRight className="h-3.5 w-3.5 text-teal-400/50 shrink-0" />
        </button>

        {/* Technician: Tools Checked Out */}
        {isTechnician && (
          <button onClick={() => navigate('maintenance-tools')} className="flex items-center gap-3 px-4 py-3.5 rounded-xl border border-violet-100 dark:border-violet-900/40 bg-violet-50 dark:bg-violet-950/30 transition-all hover:shadow-sm cursor-pointer text-left hover:scale-[1.02] active:scale-[0.98] w-full">
            <div className="h-9 w-9 rounded-lg bg-violet-100 dark:bg-violet-900/50 flex items-center justify-center shrink-0">
              <Hammer className="h-4 w-4 text-violet-600 dark:text-violet-400" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Tools Out</p>
              <p className="text-xl font-bold text-violet-600 dark:text-violet-400">{myKPIs.toolsCheckedOut}</p>
            </div>
            <ChevronRight className="h-3.5 w-3.5 text-violet-400/50 shrink-0" />
          </button>
        )}

        {/* Supervisor: Team Workload */}
        {isSupervisor && (
          <>
            <button onClick={() => navigate('maintenance-requests', { status: 'pending,in_progress' })} className="flex items-center gap-3 px-4 py-3.5 rounded-xl border border-orange-100 dark:border-orange-900/40 bg-orange-50 dark:bg-orange-950/30 transition-all hover:shadow-sm cursor-pointer text-left hover:scale-[1.02] active:scale-[0.98] w-full">
              <div className="h-9 w-9 rounded-lg bg-orange-100 dark:bg-orange-900/50 flex items-center justify-center shrink-0">
                <ClipboardCheck className="h-4 w-4 text-orange-600 dark:text-orange-400" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Pending Approvals</p>
                <p className="text-xl font-bold text-orange-600 dark:text-orange-400">{supervisorKPIs.pendingApprovals}</p>
              </div>
              <ChevronRight className="h-3.5 w-3.5 text-orange-400/50 shrink-0" />
            </button>
            <button onClick={() => navigate('maintenance-work-orders', { assignedTo: 'team' })} className="flex items-center gap-3 px-4 py-3.5 rounded-xl border border-cyan-100 dark:border-cyan-900/40 bg-cyan-50 dark:bg-cyan-950/30 transition-all hover:shadow-sm cursor-pointer text-left hover:scale-[1.02] active:scale-[0.98] w-full">
              <div className="h-9 w-9 rounded-lg bg-cyan-100 dark:bg-cyan-900/50 flex items-center justify-center shrink-0">
                <Users className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Team Active WOs</p>
                <p className="text-xl font-bold text-cyan-600 dark:text-cyan-400">{supervisorKPIs.teamActiveWOs}</p>
              </div>
              <ChevronRight className="h-3.5 w-3.5 text-cyan-400/50 shrink-0" />
            </button>
          </>
        )}

        {/* Planner: Planning Queue */}
        {isPlanner && (
          <>
            <button onClick={() => navigate('planner-workbench')} className="flex items-center gap-3 px-4 py-3.5 rounded-xl border border-sky-100 dark:border-sky-900/40 bg-sky-50 dark:bg-sky-950/30 transition-all hover:shadow-sm cursor-pointer text-left hover:scale-[1.02] active:scale-[0.98] w-full">
              <div className="h-9 w-9 rounded-lg bg-sky-100 dark:bg-sky-900/50 flex items-center justify-center shrink-0">
                <LayoutDashboard className="h-4 w-4 text-sky-600 dark:text-sky-400" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Planning Queue</p>
                <p className="text-xl font-bold text-sky-600 dark:text-sky-400">{plannerKPIs.planningQueue}</p>
              </div>
              <ChevronRight className="h-3.5 w-3.5 text-sky-400/50 shrink-0" />
            </button>
            <button onClick={() => navigate('pm-schedules')} className="flex items-center gap-3 px-4 py-3.5 rounded-xl border border-teal-100 dark:border-teal-900/40 bg-teal-50 dark:bg-teal-950/30 transition-all hover:shadow-sm cursor-pointer text-left hover:scale-[1.02] active:scale-[0.98] w-full">
              <div className="h-9 w-9 rounded-lg bg-teal-100 dark:bg-teal-900/50 flex items-center justify-center shrink-0">
                <CalendarClock className="h-4 w-4 text-teal-600 dark:text-teal-400" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">PMs Due</p>
                <p className="text-xl font-bold text-teal-600 dark:text-teal-400">{plannerKPIs.pmSchedulesDue}</p>
              </div>
              <ChevronRight className="h-3.5 w-3.5 text-teal-400/50 shrink-0" />
            </button>
            {plannerKPIs.pendingTeamRequests > 0 && (
              <button
                onClick={() => document.getElementById('pending-team-requests-section')?.scrollIntoView({ behavior: 'smooth' })}
                className="flex items-center gap-3 px-4 py-3.5 rounded-xl border border-violet-200 dark:border-violet-900/40 bg-violet-50 dark:bg-violet-950/30 transition-all hover:shadow-sm hover:border-violet-300 dark:hover:border-violet-800/50 cursor-pointer"
              >
                <div className="h-9 w-9 rounded-lg bg-violet-100 dark:bg-violet-900/50 flex items-center justify-center shrink-0">
                  <Users className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Team Requests</p>
                  <p className="text-xl font-bold text-violet-600 dark:text-violet-400">{plannerKPIs.pendingTeamRequests}</p>
                </div>
                <span className="h-1.5 w-1.5 rounded-full bg-violet-500 animate-pulse" />
              </button>
            )}
          </>
        )}

        {/* Operator fallback */}
        {isOperator && (
          <div className="flex items-center gap-3 px-4 py-3.5 rounded-xl border border-pink-100 dark:border-pink-900/40 bg-pink-50 dark:bg-pink-950/30 transition-all hover:shadow-sm">
            <div className="h-9 w-9 rounded-lg bg-pink-100 dark:bg-pink-900/50 flex items-center justify-center shrink-0">
              <Bell className="h-4 w-4 text-pink-600 dark:text-pink-400" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Notifications</p>
              <p className="text-xl font-bold text-pink-600 dark:text-pink-400">{myKPIs.unreadNotifications}</p>
            </div>
          </div>
        )}
      </div>

      {/* ===== Pending Team Member Requests Alert (Planner/Admin) ===== */}
      {(isPlanner || isManager) && plannerKPIs.pendingTeamRequests > 0 && (
        <div id="pending-team-requests-section" className="space-y-3">
          <button
            onClick={() => {
              const firstReq = pendingTeamRequestsDetail[0];
              if (firstReq) navigate('wo-detail', { id: firstReq.workOrder.id });
            }}
            className="w-full flex items-center gap-4 px-5 py-4 rounded-xl border border-violet-200 dark:border-violet-900/40 bg-gradient-to-r from-violet-50 to-purple-50 dark:from-violet-950/20 dark:to-purple-950/20 hover:shadow-md hover:border-violet-300 dark:hover:border-violet-800/50 transition-all duration-300 cursor-pointer group"
          >
            <div className="h-11 w-11 rounded-xl bg-violet-100 dark:bg-violet-900/50 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
              <Users className="h-5 w-5 text-violet-600 dark:text-violet-400" />
            </div>
            <div className="flex-1 min-w-0 text-left">
              <div className="flex items-center gap-2">
                <p className="text-sm font-bold text-violet-800 dark:text-violet-200">{plannerKPIs.pendingTeamRequests} Pending Team Request{plannerKPIs.pendingTeamRequests > 1 ? 's' : ''}</p>
                <span className="h-1.5 w-1.5 rounded-full bg-violet-500 animate-pulse" />
              </div>
              <p className="text-xs text-violet-600/70 dark:text-violet-400/70 mt-0.5">Click to review and approve team member requests</p>
            </div>
            <div className="h-8 w-8 rounded-lg bg-violet-100 dark:bg-violet-900/40 flex items-center justify-center shrink-0 group-hover:bg-violet-200 dark:group-hover:bg-violet-900/60 transition-colors">
              <ChevronRight className="h-4 w-4 text-violet-600 dark:text-violet-400" />
            </div>
          </button>
          {/* Recent team requests list */}
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {pendingTeamRequestsDetail.slice(0, 5).map((req: { id: string; requestedTrade?: string | null; workOrder: { id: string; woNumber?: string; title?: string }; requestedByUser: { fullName: string } }) => (
              <button
                key={req.id}
                onClick={() => navigate('wo-detail', { id: req.workOrder.id })}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-lg border border-violet-100 dark:border-violet-900/30 bg-white dark:bg-gray-900/50 hover:border-violet-200 dark:hover:border-violet-800/50 hover:shadow-sm transition-all cursor-pointer group text-left"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold text-violet-600 dark:text-violet-400">WO #{req.workOrder.woNumber || '—'}</span>
                    {req.requestedTrade && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-violet-100 dark:bg-violet-900/50 text-violet-700 dark:text-violet-300">
                        {req.requestedTrade}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">{req.workOrder.title || 'Untitled'}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[10px] text-muted-foreground">Requested by</p>
                  <p className="text-xs font-medium text-foreground">{req.requestedByUser.fullName}</p>
                </div>
                <ChevronRight className="h-3.5 w-3.5 text-violet-400 shrink-0 group-hover:translate-x-0.5 transition-transform" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ===== Pending Requests Alert (Supervisor/Admin) ===== */}
      {(isSupervisor || isManager) && pendingReqs > 0 && (
        <button
          onClick={() => navigate('maintenance-requests', { status: 'pending,approved' })}
          className="w-full flex items-center gap-4 px-5 py-4 rounded-xl border border-amber-200 dark:border-amber-900/40 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/20 dark:to-orange-950/20 hover:shadow-md hover:border-amber-300 dark:hover:border-amber-800/50 transition-all duration-300 cursor-pointer group"
        >
          <div className="h-11 w-11 rounded-xl bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
            <ClipboardList className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="flex-1 min-w-0 text-left">
            <div className="flex items-center gap-2">
              <p className="text-sm font-bold text-amber-800 dark:text-amber-200">{pendingReqs} Pending & Approved Request{pendingReqs > 1 ? 's' : ''}</p>
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
            </div>
            <p className="text-xs text-amber-600/70 dark:text-amber-400/70 mt-0.5">Click to review and approve requests from your team</p>
          </div>
          <div className="h-8 w-8 rounded-lg bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center shrink-0 group-hover:bg-amber-200 dark:group-hover:bg-amber-900/60 transition-colors">
            <ChevronRight className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          </div>
        </button>
      )}

      {/* ===== Primary KPI Cards Row ===== */}
      {visiblePrimaryKPIs.length > 0 && (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 items-stretch">
          {visiblePrimaryKPIs.map((card) => (
            <KPICard key={card.label} {...card} />
          ))}
        </div>
      )}

      {/* ===== Cross-Module Overview Section ===== */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Cross-Module Overview</h3>
        </div>
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
          {filteredCrossModuleData.map((mod) => (
            <button
              key={mod.label}
              onClick={() => mod.page && navigate(mod.page, (mod as any).params)}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${mod.borderColor} ${mod.bgColor} transition-all hover:shadow-sm cursor-pointer text-left ${mod.page ? 'hover:scale-[1.02] active:scale-[0.98]' : ''}`}
            >
              <div className={`h-2.5 w-2.5 rounded-full ${mod.color} shrink-0`} />
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{mod.label}</p>
                <p className={`text-lg font-bold ${mod.textColor}`}>{mod.value}</p>
                <p className="text-[10px] text-muted-foreground truncate">{mod.detail}</p>
              </div>
              {mod.page && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />}
            </button>
          ))}
        </div>
      </div>

      {/* ===== Enhanced KPIs Row (Manager/Admin only or all) ===== */}
      {(isManager || isPlanner || isSupervisor) && (() => {
        const enhancedCards = [];
        if (analyticsEnabled) {
          enhancedCards.push(
            <KPICard
              key="mttr"
              label="MTTR (Avg Repair Time)"
              value={`${maintenanceKPIs.mttr}h`}
              sublabel="Mean Time To Repair"
              color="#f59e0b"
              bgColor="bg-amber-50 dark:bg-amber-950/30"
              borderColor="border-amber-100 dark:border-amber-900/40"
              iconBg="bg-amber-100 dark:bg-amber-900/50"
              iconColor="text-amber-600 dark:text-amber-400"
              icon={Timer}
            />,
            <KPICard
              key="mtbf"
              label="MTBF (Uptime)"
              value={maintenanceKPIs.mtbf >= 24 ? `${Math.round(maintenanceKPIs.mtbf / 24)}d` : `${maintenanceKPIs.mtbf}h`}
              sublabel="Mean Time Between Failures"
              color="#10b981"
              bgColor="bg-emerald-50 dark:bg-emerald-950/30"
              borderColor="border-emerald-100 dark:border-emerald-900/40"
              iconBg="bg-emerald-100 dark:bg-emerald-900/50"
              iconColor="text-emerald-600 dark:text-emerald-400"
              icon={Gauge}
              showRing
              ringValue={Math.min(100, Math.round(maintenanceKPIs.mtbf / 72 * 100))}
            />,
            <KPICard
              key="planned-ratio"
              label="Planned Ratio"
              value={`${maintenanceKPIs.plannedRatio}%`}
              sublabel={`${maintenanceKPIs.preventiveCount} prev vs ${maintenanceKPIs.reactiveCount} reactive`}
              color="#14b8a6"
              bgColor="bg-teal-50 dark:bg-teal-950/30"
              borderColor="border-teal-100 dark:border-teal-900/40"
              iconBg="bg-teal-100 dark:bg-teal-900/50"
              iconColor="text-teal-600 dark:text-teal-400"
              icon={Target}
              showRing
              ringValue={maintenanceKPIs.plannedRatio}
            />,
          );
        }
        enhancedCards.push(
          <KPICard
            key="maint-cost"
            label="Maintenance Cost"
            value={formatCurrency(costAnalysis.thisMonthTotal)}
            sublabel={costAnalysis.lastMonthTotal > 0 ? `vs ${formatCurrency(costAnalysis.lastMonthTotal)} last month` : 'This month'}
            color={costTrend > 0 ? '#ef4444' : '#10b981'}
            bgColor={costTrend > 0 ? 'bg-red-50 dark:bg-red-950/30' : 'bg-emerald-50 dark:bg-emerald-950/30'}
            borderColor={costTrend > 0 ? 'border-red-100 dark:border-red-900/40' : 'border-emerald-100 dark:border-emerald-900/40'}
            iconBg={costTrend > 0 ? 'bg-red-100 dark:bg-red-900/50' : 'bg-emerald-100 dark:bg-emerald-900/50'}
            iconColor={costTrend > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}
            icon={DollarSign}
            trend={costTrend}
            onClick={() => navigate('reports-financial' as PageName)}
          />,
        );
        return enhancedCards.length > 0 ? (
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 items-stretch">
            {enhancedCards}
          </div>
        ) : null;
      })()}

      {/* ===== PM Alerts & Compliance Row ===== */}
      {(isManager || isPlanner) && (() => {
        const pmComplianceCards = [];
        if (pmEnabled) {
          pmComplianceCards.push(
            <KPICard
              key="pm-overdue"
              label="PM Overdue"
              value={pmAlerts.overdue}
              sublabel={pmAlerts.overdue > 0 ? 'Action required' : 'All on schedule'}
              color={pmAlerts.overdue > 0 ? '#ef4444' : '#10b981'}
              bgColor={pmAlerts.overdue > 0 ? 'bg-red-50 dark:bg-red-950/30' : 'bg-emerald-50 dark:bg-emerald-950/30'}
              borderColor={pmAlerts.overdue > 0 ? 'border-red-100 dark:border-red-900/40' : 'border-emerald-100 dark:border-emerald-900/40'}
              iconBg={pmAlerts.overdue > 0 ? 'bg-red-100 dark:bg-red-900/50' : 'bg-emerald-100 dark:bg-emerald-900/50'}
              iconColor={pmAlerts.overdue > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}
              icon={CalendarClock}
              onClick={pmAlerts.overdue > 0 ? () => navigate('pm-schedules') : undefined}
            />,
            <KPICard
              key="pm-due-soon"
              label="PM Due Soon (7d)"
              value={pmAlerts.dueSoon}
              sublabel="Within next 7 days"
              color="#f59e0b"
              bgColor="bg-amber-50 dark:bg-amber-950/30"
              borderColor="border-amber-100 dark:border-amber-900/40"
              iconBg="bg-amber-100 dark:bg-amber-900/50"
              iconColor="text-amber-600 dark:text-amber-400"
              icon={Clock}
              onClick={() => navigate('pm-schedules')}
            />,
          );
        }
        pmComplianceCards.push(
          <KPICard
            key="assets-at-risk"
            label="Assets at Risk"
            value={assetsAtRisk}
            sublabel={`${stats?.assetHealth?.poor || 0} poor, ${stats?.assetHealth?.critical || 0} critical`}
            color="#f97316"
            bgColor="bg-orange-50 dark:bg-orange-950/30"
            borderColor="border-orange-100 dark:border-orange-900/40"
            iconBg="bg-orange-100 dark:bg-orange-900/50"
            iconColor="text-orange-600 dark:text-orange-400"
            icon={AlertTriangle}
            onClick={() => navigate('assets', { condition: 'at_risk' })}
          />,
        );
        if (safetyEnabled) {
          pmComplianceCards.push(
            <KPICard
              key="compliance"
              label="Compliance"
              value={stats?.safetyAlerts?.overdueInspections || 0}
              sublabel="Overdue inspections"
              color={(stats?.safetyAlerts?.overdueInspections || 0) > 0 ? '#ef4444' : '#10b981'}
              bgColor={(stats?.safetyAlerts?.overdueInspections || 0) > 0 ? 'bg-red-50 dark:bg-red-950/30' : 'bg-emerald-50 dark:bg-emerald-950/30'}
              borderColor={(stats?.safetyAlerts?.overdueInspections || 0) > 0 ? 'border-red-100 dark:border-red-900/40' : 'border-emerald-100 dark:border-emerald-900/40'}
              iconBg={(stats?.safetyAlerts?.overdueInspections || 0) > 0 ? 'bg-red-100 dark:bg-red-900/50' : 'bg-emerald-100 dark:bg-emerald-900/50'}
              iconColor={(stats?.safetyAlerts?.overdueInspections || 0) > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}
              icon={Shield}
              onClick={() => navigate('safety-inspections')}
            />,
          );
        }
        return pmComplianceCards.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-stretch">
            {pmComplianceCards}
          </div>
        ) : null;
      })()}

      {/* ===== Weekly Trends Chart ===== */}
      <Card className="border">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center">
              <TrendingUp className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <CardTitle className="text-base font-semibold">7-Day Activity Trends</CardTitle>
              <CardDescription className="text-xs mt-0.5">Work orders, requests &amp; production created per day</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <ChartContainer config={weeklyTrendConfig} className="h-[280px] w-full">
            <BarChart data={weeklyTrendData} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border/30" />
              <XAxis dataKey="day" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} className="fill-muted-foreground" />
              <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} className="fill-muted-foreground" />
              <ChartTooltip content={<ChartTooltipContent />} />
              <ChartLegend content={<ChartLegendContent />} />
              <Bar dataKey="workOrders" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={28} />
              <Bar dataKey="maintenanceRequests" fill="#f59e0b" radius={[4, 4, 0, 0]} maxBarSize={28} />
              <Bar dataKey="productionOrders" fill="#06b6d4" radius={[4, 4, 0, 0]} maxBarSize={28} />
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>

      {/* ===== Charts Row ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
        {/* WO Status Bar Chart */}
        <Card className="border lg:col-span-2 h-full flex flex-col">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center">
                <BarChart3 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <CardTitle className="text-base font-semibold">Work Orders by Status</CardTitle>
                <CardDescription className="text-xs mt-0.5">Current distribution across all work order stages</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0 flex-1">
            <ChartContainer config={woStatusChartConfig} className="h-full min-h-[280px] w-full">
              <BarChart data={woStatusData} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border/30" />
                <XAxis dataKey="status" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v) => v.replace(/_/g, ' ')} className="fill-muted-foreground" />
                <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} className="fill-muted-foreground" />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="count" radius={[6, 6, 0, 0]} maxBarSize={48}>
                  {woStatusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} className="fill-primary" />
                  ))}
                </Bar>
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* WO Type Donut Chart */}
        <Card className="border h-full flex flex-col">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-violet-100 dark:bg-violet-900/50 flex items-center justify-center">
                <PieChartIcon className="h-4 w-4 text-violet-600 dark:text-violet-400" />
              </div>
              <div>
                <CardTitle className="text-base font-semibold">WO by Type</CardTitle>
                <CardDescription className="text-xs mt-0.5">Breakdown by work order type</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0 flex-1">
            <ChartContainer config={woTypeChartConfig} className="h-full min-h-[280px] w-full">
              <PieChart>
                <ChartTooltip content={<ChartTooltipContent />} />
                <Pie
                  data={woTypeData}
                  cx="50%"
                  cy="45%"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={3}
                  dataKey="count"
                  nameKey="type"
                >
                  {woTypeData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <ChartLegend content={<ChartLegendContent nameKey="type" />} className="flex-wrap gap-x-4 gap-y-1" />
              </PieChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>

      {/* ===== Second Charts Row ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
        {/* MR Status + Priority */}
        <Card className="border h-full flex flex-col">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center">
                <ClipboardList className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <CardTitle className="text-base font-semibold">Request Status & Priority</CardTitle>
                <CardDescription className="text-xs mt-0.5">Maintenance request breakdown</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0 space-y-6">
            <ChartContainer config={mrStatusChartConfig} className="h-[180px] w-full">
              <BarChart data={mrStatusData} layout="vertical" margin={{ top: 4, right: 4, bottom: 4, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} className="stroke-border/30" />
                <XAxis type="number" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} className="fill-muted-foreground" />
                <YAxis type="category" dataKey="status" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={80} className="fill-muted-foreground" tickFormatter={(v) => v.charAt(0).toUpperCase() + v.slice(1)} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="count" radius={[0, 6, 6, 0]} maxBarSize={28}>
                  {mrStatusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={CHART_COLORS[index + 1]} />
                  ))}
                </Bar>
              </BarChart>
            </ChartContainer>
            <div className="flex items-center gap-3">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider shrink-0">Priority Mix</span>
              <div className="flex-1 h-3 rounded-full overflow-hidden bg-muted flex">
                {(stats?.highPriorityMR || 0) > 0 && (
                  <div className="bg-red-500 h-full" style={{ width: `${Math.max(5, (stats?.highPriorityMR || 0) / Math.max(1, (stats?.totalRequests || 1)) * 100)}%` }} />
                )}
                {(stats?.mediumPriorityMR || 0) > 0 && (
                  <div className="bg-amber-500 h-full" style={{ width: `${Math.max(5, (stats?.mediumPriorityMR || 0) / Math.max(1, (stats?.totalRequests || 1)) * 100)}%` }} />
                )}
                {(stats?.lowPriorityMR || 0) > 0 && (
                  <div className="bg-emerald-500 h-full" style={{ width: `${Math.max(5, (stats?.lowPriorityMR || 0) / Math.max(1, (stats?.totalRequests || 1)) * 100)}%` }} />
                )}
              </div>
              <div className="flex items-center gap-2 text-[10px] shrink-0">
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-500" />{stats?.highPriorityMR || 0}</span>
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-500" />{stats?.mediumPriorityMR || 0}</span>
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500" />{stats?.lowPriorityMR || 0}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Operations Summary + Completion */}
        <Card className="border h-full flex flex-col">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-sky-100 dark:bg-sky-900/50 flex items-center justify-center">
                <TrendingUp className="h-4 w-4 text-sky-600 dark:text-sky-400" />
              </div>
              <div>
                <CardTitle className="text-base font-semibold">Operations Summary</CardTitle>
                <CardDescription className="text-xs mt-0.5">Key metrics at a glance</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0 space-y-5">
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Pending Approvals', value: pendingApprovals, color: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-50 dark:bg-orange-950/30', border: 'border-orange-100 dark:border-orange-900/40', page: 'maintenance-requests' as PageName, params: { status: 'pending,in_progress' } },
                { label: 'Total Requests', value: stats?.totalRequests || 0, color: 'text-sky-600 dark:text-sky-400', bg: 'bg-sky-50 dark:bg-sky-950/30', border: 'border-sky-100 dark:border-sky-900/40', page: 'maintenance-requests' as PageName },
                { label: 'Approved', value: stats?.approvedRequests || 0, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950/30', border: 'border-emerald-100 dark:border-emerald-900/40', page: 'maintenance-requests' as PageName, params: { status: 'approved' } },
                { label: 'Converted to WO', value: stats?.convertedRequests || 0, color: 'text-teal-600 dark:text-teal-400', bg: 'bg-teal-50 dark:bg-teal-950/30', border: 'border-teal-100 dark:border-teal-900/40', page: 'maintenance-requests' as PageName, params: { status: 'converted' } },
              ].map(item => (
                <button key={item.label} onClick={() => navigate(item.page, (item as any).params)} className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${item.border} ${item.bg} transition-all hover:shadow-sm cursor-pointer text-left w-full hover:scale-[1.02] active:scale-[0.98]`}>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{item.label}</p>
                    <p className={`text-xl font-bold ${item.color}`}>{item.value}</p>
                  </div>
                  <ChevronRight className="h-3 w-3 text-muted-foreground/40 shrink-0" />
                </button>
              ))}
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground">Overall Completion</span>
                <span className="text-sm font-bold text-primary">{completionRate}%</span>
              </div>
              <div className="h-3 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600 transition-all duration-1000 ease-out"
                  style={{ width: `${completionRate}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>{completedWOs} completed</span>
                <span>{totalWOs - completedWOs} not completed</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ===== Asset Health + Cost Breakdown Row (Manager/Admin) ===== */}
      {(isManager || isPlanner) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Asset Health Distribution */}
          <Card className="border">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-orange-100 dark:bg-orange-900/50 flex items-center justify-center">
                  <WrenchIcon className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                </div>
                <div>
                  <CardTitle className="text-base font-semibold">Asset Health Distribution</CardTitle>
                  <CardDescription className="text-xs mt-0.5">{stats?.assetHealth?.total || 0} total active assets</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {assetConditionData.length > 0 ? (
                <ChartContainer config={assetConditionConfig} className="h-[240px] w-full">
                  <PieChart>
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Pie
                      data={assetConditionData}
                      cx="50%"
                      cy="45%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={3}
                      dataKey="count"
                      nameKey="condition"
                    >
                      {assetConditionData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <ChartLegend content={<ChartLegendContent nameKey="condition" />} className="flex-wrap gap-x-4 gap-y-1" />
                  </PieChart>
                </ChartContainer>
              ) : (
                <EmptyState icon={WrenchIcon} title="No assets" description="No active assets found." />
              )}
            </CardContent>
          </Card>

          {/* Cost Breakdown */}
          <Card className="border">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center">
                  <DollarSign className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <CardTitle className="text-base font-semibold">Cost Breakdown</CardTitle>
                  <CardDescription className="text-xs mt-0.5">This month maintenance spending</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0 space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="px-3 py-3 rounded-xl border border-sky-100 dark:border-sky-900/40 bg-sky-50 dark:bg-sky-950/30 text-center">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Labor</p>
                  <p className="text-lg font-bold text-sky-600 dark:text-sky-400">{formatCurrency(costAnalysis.thisMonthLabor)}</p>
                </div>
                <div className="px-3 py-3 rounded-xl border border-amber-100 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-950/30 text-center">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Parts</p>
                  <p className="text-lg font-bold text-amber-600 dark:text-amber-400">{formatCurrency(costAnalysis.thisMonthParts)}</p>
                </div>
                <div className="px-3 py-3 rounded-xl border border-violet-100 dark:border-violet-900/40 bg-violet-50 dark:bg-violet-950/30 text-center">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Contractor</p>
                  <p className="text-lg font-bold text-violet-600 dark:text-violet-400">{formatCurrency(costAnalysis.thisMonthContractor)}</p>
                </div>
              </div>
              {/* Cost by type stacked bar */}
              <div className="space-y-2">
                {Object.entries(costAnalysis.byCategory)
                  .filter(([, v]) => v.totalCost > 0)
                  .sort((a, b) => b[1].totalCost - a[1].totalCost)
                  .slice(0, 5)
                  .map(([type, costs]) => {
                    const maxCost = Math.max(...Object.values(costAnalysis.byCategory).map(v => v.totalCost), 1);
                    return (
                      <div key={type} className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium capitalize">{type.replace(/_/g, ' ')}</span>
                          <span className="text-xs font-bold text-muted-foreground">{formatCurrency(Math.round(costs.totalCost))}</span>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all duration-700"
                            style={{ width: `${(costs.totalCost / maxCost) * 100}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                {Object.keys(costAnalysis.byCategory).length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-4">No cost data available</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ===== Quick Actions ===== */}
      {visibleQuickActions.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" />
            Quick Actions
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {visibleQuickActions.map(action => {
              const Icon = action.icon;
              return (
                <button
                  key={action.label}
                  onClick={() => navigate(action.page, (action as any).params)}
                  className={`flex items-center gap-3 px-4 py-3.5 rounded-xl border ${action.border} ${action.bg} transition-all duration-200 group cursor-pointer text-left`}
                >
                  <div className={`h-9 w-9 rounded-lg bg-white/80 dark:bg-white/5 shadow-sm flex items-center justify-center shrink-0 ${action.color}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <span className={`text-sm font-semibold ${action.color}`}>{action.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ===== Recent Activity Panels ===== */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-stretch">
        {hasPermission('maintenance_requests.view') && (
          <Card className="border shadow-sm hover:shadow-md transition-shadow h-full flex flex-col">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-lg bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center">
                    <ClipboardList className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div>
                    <CardTitle className="text-base font-semibold">Recent Requests</CardTitle>
                    <CardDescription className="text-xs mt-0.5">Latest maintenance requests</CardDescription>
                  </div>
                </div>
                <Button variant="ghost" size="sm" className="text-xs text-primary hover:text-primary/80 font-medium" onClick={() => navigate('maintenance-requests')}>
                  View All
                </Button>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {!stats?.recentRequests?.length ? (
                <EmptyState icon={ClipboardList} title="No recent requests" description="Maintenance requests you create will appear here." />
              ) : (
                <div className="space-y-1.5 max-h-80 overflow-y-auto">
                  {stats.recentRequests.map(mr => (
                    <div
                      key={mr.id}
                      className="flex items-center gap-3 py-2.5 px-3 rounded-lg hover:bg-muted/50 cursor-pointer transition-all duration-150 group"
                      onClick={() => navigate('mr-detail', { id: mr.id })}
                    >
                      <div className="h-9 w-9 rounded-lg bg-amber-50 dark:bg-amber-900/30 border border-amber-100 dark:border-amber-900/40 flex items-center justify-center shrink-0">
                        <ClipboardList className="h-4 w-4 text-amber-500 dark:text-amber-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">{mr.title}</p>
                        <p className="text-[11px] text-muted-foreground">{mr.requestNumber} &middot; {mr.requester?.fullName} &middot; {timeAgo(mr.createdAt)}</p>
                      </div>
                      <StatusBadge status={mr.status} />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {hasPermission('work_orders.view') && (
          <Card className="border shadow-sm hover:shadow-md transition-shadow h-full flex flex-col">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center">
                    <Wrench className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div>
                    <CardTitle className="text-base font-semibold">Recent Work Orders</CardTitle>
                    <CardDescription className="text-xs mt-0.5">Latest work order activity</CardDescription>
                  </div>
                </div>
                <Button variant="ghost" size="sm" className="text-xs text-primary hover:text-primary/80 font-medium" onClick={() => navigate('maintenance-work-orders')}>
                  View All
                </Button>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {!stats?.recentWorkOrders?.length ? (
                <EmptyState icon={Wrench} title="No recent work orders" description="Work orders created from approved requests will appear here." />
              ) : (
                <div className="space-y-1.5 max-h-80 overflow-y-auto">
                  {stats.recentWorkOrders.map(wo => (
                    <div
                      key={wo.id}
                      className="flex items-center gap-3 py-2.5 px-3 rounded-lg hover:bg-muted/50 cursor-pointer transition-all duration-150 group"
                      onClick={() => navigate('wo-detail', { id: wo.id })}
                    >
                      <div className="h-9 w-9 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-100 dark:border-emerald-900/40 flex items-center justify-center shrink-0">
                        <Wrench className="h-4 w-4 text-emerald-500 dark:text-emerald-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">{wo.title}</p>
                        <p className="text-[11px] text-muted-foreground">{wo.woNumber} &middot; {wo.type.replace(/_/g, ' ')} &middot; {timeAgo(wo.createdAt)}</p>
                      </div>
                      <StatusBadge status={wo.status} />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* ===== System Health Footer ===== */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border bg-gradient-to-br from-emerald-50/80 to-teal-50/30 dark:from-emerald-950/30 dark:to-teal-950/10 border-emerald-100 dark:border-emerald-900/40">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center shrink-0">
              <Factory className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">System Health</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <p className="text-sm font-bold text-emerald-700 dark:text-emerald-400">All Systems Operational</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border bg-gradient-to-br from-sky-50/80 to-blue-50/30 dark:from-sky-950/30 dark:to-blue-950/10 border-sky-100 dark:border-sky-900/40">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-sky-100 dark:bg-sky-900/50 flex items-center justify-center shrink-0">
              <Shield className="h-5 w-5 text-sky-600 dark:text-sky-400" />
            </div>
            <div>
              <p className="text-xs font-semibold text-sky-800 dark:text-sky-300">Security Status</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <div className="h-1.5 w-1.5 rounded-full bg-sky-500" />
                <p className="text-sm font-bold text-sky-700 dark:text-sky-400">No Security Alerts</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border bg-gradient-to-br from-violet-50/80 to-purple-50/30 dark:from-violet-950/30 dark:to-purple-950/10 border-violet-100 dark:border-violet-900/40">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-violet-100 dark:bg-violet-900/50 flex items-center justify-center shrink-0">
              <BarChart3 className="h-5 w-5 text-violet-600 dark:text-violet-400" />
            </div>
            <div>
              <p className="text-xs font-semibold text-violet-800 dark:text-violet-300">Maintenance Efficiency</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <div className="h-1.5 w-1.5 rounded-full bg-violet-500" />
                <p className="text-sm font-bold text-violet-700 dark:text-violet-400">{completionRate >= 80 ? 'Excellent' : completionRate >= 50 ? 'Good' : 'Needs Improvement'}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
