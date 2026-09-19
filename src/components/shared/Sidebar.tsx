'use client';

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useNavigationStore } from '@/stores/navigationStore';
import { getInitials } from '@/components/shared/helpers';
import type { PageName } from '@/types';

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

import {
  LayoutDashboard,
  Wrench,
  ClipboardList,
  Settings,
  Users,
  Boxes,
  LogOut,
  ChevronRight,
  MessageSquare,
  Factory,
  BarChart3,
  Cog,
  ShoppingCart,
  Building2,
  Zap,
  Smartphone,
  Radio,
  Wifi,
  GraduationCap,
  FileText,
  ArrowRightLeft,
  CheckSquare,
  Calendar,
  TrendingUp,
  TrendingDown,
  ShieldCheck,
  FileCheck,
  ShieldAlert,
  TriangleAlert,
  HardHat,
  ScrollText,
  FolderOpen,
  Truck,
  Download,
  Database,
  Link2,
  BellRing,
  Layers,
  Box,
  Crosshair,
  Wrench as WrenchIcon,
  Monitor,
  Target,
  Gauge,
  Clock,
  GitBranch,
  ListChecks,
  Activity,
  HeartPulse,
  X,
  Building,
  FileBarChart,
  Eye,
  Package,
  Search,
  MapPin,
  LayoutGrid,
  ArrowUpDown,
  FileSpreadsheet,
  Shield,
  ClipboardCheck,
  Timer,
  Recycle,
  BrainCircuit,
  Settings2,
  History,
} from 'lucide-react';

// ============================================================================
// SIDEBAR
// ============================================================================

// Sidebar inner content extracted as a separate component with collapsible submenus
function SidebarContent({ forceExpanded }: { forceExpanded?: boolean } = {}) {
  const currentPage = useNavigationStore((s) => s.currentPage);
  const navigate = useNavigationStore((s) => s.navigate);
  const sidebarOpen = useNavigationStore((s) => s.sidebarOpen);
  const storeModules = useNavigationStore((s) => s.enabledModules);
  const expanded = forceExpanded ?? sidebarOpen;
  const user = useAuthStore((s) => s.user);
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const logout = useAuthStore((s) => s.logout);
  // Manual toggle state — stores menus the user explicitly toggled open.
  // closedMenus tracks menus the user explicitly closed (prevents auto-expand).
  const [manualOpenMenus, setManualOpenMenus] = useState<Set<string>>(new Set());
  const [closedMenus, setClosedMenus] = useState<Set<string>>(new Set());

  // Subscribe to enabled modules from the navigation store.
  // The store fetches on app init and refreshes when modules are toggled,
  // so the sidebar stays in sync automatically.
  const enabledModules = useMemo<Set<string>>(() => {
    // Optional modules fail closed until licensing state is verified.
    // Core navigation remains available during module loading/failure.
    if (!storeModules) return new Set<string>(['core']);
    return storeModules;
  }, [storeModules]);

  // Menu group definition
  interface NavGroup {
    label: string;
    icon: React.ElementType;
    perm: string;
    permOr?: string[]; // alternative permissions — show group if user has ANY of these
    adminOnly?: boolean; // when true, only admins can see this group
    page?: PageName;
    moduleCode?: string; // maps to SystemModule.code (lowercase) for module-aware filtering
    moduleCodes?: string[]; // for groups spanning multiple modules (any match = visible)
    children?: {
      page: PageName;
      label: string;
      icon?: React.ElementType;
      pageAdminOnly?: boolean;
      moduleCode?: string;
      perm?: string;
      permOr?: string[];
    }[];
  }

  const menuGroups = useMemo<NavGroup[]>(() => [
    { label: 'Dashboard', icon: LayoutDashboard, perm: 'dashboard.view', page: 'dashboard', moduleCode: 'core' },
    { label: 'Chat', icon: MessageSquare, perm: 'chat.view', page: 'chat', moduleCode: 'core' },
    { label: 'Notifications', icon: BellRing, perm: 'notifications.view', page: 'notifications', moduleCode: 'notifications' },
    {
      label: 'Assets', icon: Building2, perm: 'assets.view', moduleCode: 'assets',
      children: [
        { page: 'assets-machines', label: 'Machines', icon: Building2 },
        { page: 'assets-hierarchy', label: 'Hierarchy', icon: GitBranch },
        { page: 'assets-bom', label: 'Bill of Materials', icon: ListChecks, moduleCode: 'bom', perm: 'bom.view' },
        { page: 'assets-condition-monitoring', label: 'Condition Monitoring', icon: Activity, moduleCode: 'condition_monitoring', perm: 'condition_monitoring.view' },
        { page: 'assets-digital-twin', label: 'Digital Twin', icon: Box, moduleCode: 'digital_twin', perm: 'digital_twin.view' },
        { page: 'system-diagrams', label: 'System Diagrams', icon: GitBranch, moduleCode: 'digital_twin', perm: 'digital_twin.view' },
        { page: 'asset-categories', label: 'Categories', icon: FolderOpen, perm: 'assets.view' },
        { page: 'assets-health', label: 'Asset Health', icon: HeartPulse, perm: 'asset_health.view' },
      ],
    },
    {
      label: 'AI Intelligence', icon: BrainCircuit, perm: 'assets.create', moduleCode: 'assets',
      children: [
        { page: 'ai-hub', label: 'AI Hub', icon: BrainCircuit },
        { page: 'ai-config', label: 'AI Configuration', icon: Settings2 },
        { page: 'ai-history', label: 'Generation History', icon: History },
      ],
    },
    {
      label: 'Repairs Maintenance', icon: Wrench, perm: 'work_orders.view', permOr: ['work_orders.view', 'work_orders.view_own', 'maintenance_requests.view', 'maintenance_requests.view_own'], moduleCodes: ['work_orders', 'maintenance_requests', 'repairs'],
      children: [
        { page: 'maintenance-work-orders', label: 'Work Orders', icon: ClipboardList, moduleCode: 'work_orders', permOr: ['work_orders.view', 'work_orders.view_own'] },
        { page: 'maintenance-requests', label: 'Repair Requests', icon: MessageSquare, moduleCode: 'maintenance_requests', permOr: ['maintenance_requests.view', 'maintenance_requests.view_own'] },
        { page: 'maintenance-dashboard', label: 'Repairs Dashboard', icon: LayoutDashboard, moduleCode: 'work_orders', permOr: ['work_orders.view', 'work_orders.view_own'] },
        { page: 'maintenance-analytics', label: 'Repairs Analytics', icon: BarChart3, moduleCode: 'work_orders', permOr: ['work_orders.view', 'work_orders.view_own'] },
        { page: 'maintenance-risk-assessment', label: 'Risk Assessment', icon: TriangleAlert, moduleCode: 'risk_assessment', permOr: ['work_orders.view', 'work_orders.view_own'] },
        { page: 'maintenance-tools', label: 'Maintenance Tools', icon: WrenchIcon, moduleCode: 'tools', perm: 'tools.view' },
        { page: 'maintenance-calibration', label: 'Calibration', icon: Crosshair, moduleCode: 'calibration', perm: 'calibration.view' },
      ],
    },
    {
      label: 'Preventive Maintenance (PM)', icon: Calendar, perm: 'pm_schedules.view', permOr: ['pm_schedules.view', 'pm_templates.view', 'pm_triggers.view'], moduleCode: 'pm_schedules',
      children: [
        { page: 'pm-schedules', label: 'PM Schedules', icon: Clock, moduleCode: 'pm_schedules', perm: 'pm_schedules.view' },
        { page: 'pm-templates', label: 'PM Templates', icon: ClipboardCheck, moduleCode: 'pm_schedules', perm: 'pm_templates.view' },
        { page: 'pm-triggers', label: 'PM Triggers', icon: Zap, moduleCode: 'pm_schedules', perm: 'pm_triggers.view' },
        { page: 'pm-calendar', label: 'PM Calendar', icon: Calendar, moduleCode: 'pm_schedules', perm: 'pm_schedules.view' },
      ],
    },
    {
      label: 'Planner', icon: LayoutGrid, perm: 'work_orders.view', moduleCodes: ['work_orders', 'reports'],
      children: [
        { page: 'planner-workbench', label: 'Workbench', icon: LayoutGrid, moduleCode: 'work_orders', permOr: ['work_orders.view', 'work_orders.view_own'] },
        { page: 'enterprise-reports', label: 'Reports', icon: Gauge, moduleCode: 'reports', perm: 'reports.view' },
      ],
    },
    {
      label: 'Repair Resources', icon: ArrowRightLeft, perm: 'work_orders.view', permOr: ['work_orders.view', 'work_orders.view_own', 'repair_material_requests.view', 'repair_material_requests.view_all', 'repair_material_requests.view_own', 'repair_tool_requests.view', 'repair_tool_requests.view_all', 'repair_tool_requests.view_own'], moduleCode: 'repairs',
      children: [
        { page: 'repairs-material-requests', label: 'Material Requests', icon: Package, permOr: ['repair_material_requests.view', 'repair_material_requests.view_all', 'repair_material_requests.view_own'] },
        { page: 'repairs-tool-requests', label: 'Tool Requests', icon: WrenchIcon, permOr: ['repair_tool_requests.view', 'repair_tool_requests.view_all', 'repair_tool_requests.view_own'] },
        { page: 'repairs-tool-transfers', label: 'Tool Transfers', icon: ArrowRightLeft, permOr: ['repair_tool_transfers.view', 'repair_tool_transfers.view_all', 'repair_tool_transfers.view_own'] },
        { page: 'repairs-downtime', label: 'Downtime', icon: Timer, permOr: ['work_orders.view', 'work_orders.view_own'] },
        { page: 'repairs-completion', label: 'Completion', icon: ClipboardCheck, permOr: ['work_orders.view', 'work_orders.view_own'] },
        { page: 'technician-timesheet', label: 'Timesheet', icon: Clock, permOr: ['time_logs.view', 'time_logs.create'] },
        { page: 'repairs-spare-part-returns', label: 'Spare Part Returns', icon: Recycle, permOr: ['spare_part_returns.view', 'spare_part_returns.view_all', 'spare_part_returns.view_own'] },
        { page: 'repairs-damaged-tools', label: 'Damaged Tools', icon: TriangleAlert, permOr: ['damaged_tool_reports.view', 'damaged_tool_reports.view_all', 'damaged_tool_reports.create'] },
        { page: 'repairs-analytics', label: 'Analytics', icon: BarChart3, permOr: ['work_orders.view', 'work_orders.view_own'] },
      ],
    },
    {
      label: 'IoT', icon: Wifi, perm: 'iot.view', moduleCode: 'iot_sensors',
      children: [
        { page: 'iot-devices', label: 'Devices', icon: Smartphone },
        { page: 'iot-monitoring', label: 'Monitoring', icon: Monitor },
        { page: 'iot-rules', label: 'Rules', icon: Radio },
      ],
    },
    {
      label: 'Reliability', icon: ShieldAlert, perm: 'digital_twin.view', moduleCodes: ['digital_twin'],
      children: [
        { page: 'reliability-engineering', label: 'Engineering', icon: ShieldAlert },
      ],
    },
    {
      label: 'Analytics', icon: BarChart3, perm: 'analytics.view', moduleCodes: ['analytics', 'kpi_dashboard', 'oee', 'downtime', 'energy'],
      children: [
        { page: 'analytics-kpi', label: 'KPI Dashboard', icon: Target, moduleCode: 'analytics', perm: 'analytics.view' },
        { page: 'analytics-oee', label: 'OEE', icon: Gauge, moduleCode: 'oee', perm: 'oee.view' },
        { page: 'analytics-downtime', label: 'Downtime', icon: TrendingDown, moduleCode: 'downtime', perm: 'downtime.view' },
        { page: 'analytics-energy', label: 'Energy', icon: Zap, moduleCode: 'energy', perm: 'energy.view' },
      ],
    },
    {
      label: 'Operations', icon: ClipboardCheck, perm: 'operations.view', permOr: ['operations.view', 'meters.view', 'training.view', 'production_surveys.view', 'time_logs.view', 'shift_handovers.view', 'work_orders.view'], moduleCodes: ['meter_readings', 'training', 'shift_management', 'production', 'work_orders'],
      children: [
        { page: 'operations-meter-readings', label: 'Meter Readings', icon: Gauge, moduleCode: 'meter_readings', perm: 'meters.view' },
        { page: 'operations-training', label: 'Training', icon: GraduationCap, moduleCode: 'training', perm: 'training.view' },
        { page: 'operations-surveys', label: 'Surveys', icon: FileText, moduleCode: 'production', perm: 'production_surveys.view' },
        { page: 'operations-time-logs', label: 'Time Logs', icon: Clock, moduleCode: 'work_orders', perm: 'time_logs.view' },
        { page: 'operations-shift-handover', label: 'Shift Handover', icon: ArrowRightLeft, moduleCode: 'shift_management', perm: 'shift_handovers.view' },
        { page: 'operations-checklists', label: 'Checklists', icon: CheckSquare, moduleCode: 'work_orders', perm: 'work_orders.view' },
      ],
    },
    {
      label: 'Production', icon: Zap, perm: 'production.view', moduleCode: 'production',
      children: [
        { page: 'production-work-centers', label: 'Work Centers', icon: Factory },
        { page: 'production-resource-planning', label: 'Resource Planning', icon: Layers },
        { page: 'production-scheduling', label: 'Scheduling', icon: Calendar },
        { page: 'production-capacity', label: 'Capacity', icon: Box },
        { page: 'production-efficiency', label: 'Efficiency', icon: TrendingUp },
        { page: 'production-bottlenecks', label: 'Bottlenecks', icon: TriangleAlert },
        { page: 'production-orders', label: 'Orders', icon: ClipboardList },
        { page: 'production-batches', label: 'Batches', icon: Package },
      ],
    },
    {
      label: 'Quality', icon: ShieldCheck, perm: 'quality.view', moduleCodes: ['quality', 'capa'],
      children: [
        { page: 'quality-inspections', label: 'Inspections', icon: Search },
        { page: 'quality-ncr', label: 'NCR', icon: FileCheck },
        { page: 'quality-audits', label: 'Audits', icon: ShieldAlert },
        { page: 'quality-control-plans', label: 'Control Plans', icon: ScrollText },
        { page: 'quality-spc', label: 'SPC', icon: BarChart3 },
        { page: 'quality-capa', label: 'CAPA', icon: HardHat, moduleCode: 'capa', perm: 'quality_ncr.view' },
      ],
    },
    {
      label: 'Safety', icon: HardHat, perm: 'safety.view', moduleCode: 'safety',
      children: [
        { page: 'safety-incidents', label: 'Incidents', icon: TriangleAlert },
        { page: 'safety-inspections', label: 'Inspections', icon: Search },
        { page: 'safety-training', label: 'Training', icon: GraduationCap },
        { page: 'safety-equipment', label: 'Equipment', icon: HardHat },
        { page: 'safety-permits', label: 'Permits', icon: FileCheck },
      ],
    },
    {
      label: 'Inventory', icon: Package, perm: 'inventory.view_all', permOr: ['inventory.view_all', 'inventory.manage', 'inventory.stock_in', 'inventory.stock_out', 'inventory_locations.view', 'stock_transactions.view', 'inventory_adjustments.view', 'inventory_transfers.view', 'material_requisitions.view', 'vendors.view', 'purchase_orders.view'], moduleCode: 'inventory',
      children: [
        { page: 'inventory-items', label: 'Items', icon: Package, permOr: ['inventory.view_all', 'inventory.manage', 'inventory.stock_in', 'inventory.stock_out'] },
        { page: 'inventory-categories', label: 'Categories', icon: FolderOpen, perm: 'parts_categories.view' },
        { page: 'inventory-locations', label: 'Locations', icon: MapPin, perm: 'inventory_locations.view' },
        { page: 'inventory-transactions', label: 'Transactions', icon: ArrowRightLeft, perm: 'stock_transactions.view' },
        { page: 'inventory-adjustments', label: 'Adjustments', icon: ArrowUpDown, perm: 'inventory_adjustments.view' },
        { page: 'inventory-requests', label: 'Requests', icon: FileText, perm: 'material_requisitions.view' },
        { page: 'inventory-transfers', label: 'Transfers', icon: Truck, perm: 'inventory_transfers.view' },
        { page: 'inventory-suppliers', label: 'Suppliers', icon: Building, perm: 'vendors.view' },
        { page: 'inventory-purchase-orders', label: 'Purchase Orders', icon: ShoppingCart, perm: 'purchase_orders.view' },
        { page: 'inventory-receiving', label: 'Receiving', icon: Download, perm: 'purchase_orders.view' },
      ],
    },
    {
      label: 'Reports', icon: FileBarChart, perm: 'reports.view', moduleCode: 'reports',
      children: [
        { page: 'reports-asset', label: 'Asset Reports', icon: Building2, moduleCode: 'assets', perm: 'reports.view' },
        { page: 'machine-availability', label: 'Machine Availability', icon: Activity, moduleCode: 'assets', perm: 'reports.view' },
        { page: 'equipment-history', label: 'Equipment History', icon: History, moduleCode: 'assets', perm: 'reports.view' },
        { page: 'failure-analysis', label: 'Failure Analysis', icon: TriangleAlert, moduleCode: 'failure_analysis', perm: 'reports.view' },
        { page: 'wo-reports', label: 'Work Order Reports', icon: ClipboardList, moduleCode: 'work_orders', perm: 'reports.view' },
        { page: 'reports-maintenance', label: 'Repairs Maintenance Reports', icon: Wrench, moduleCode: 'work_orders', perm: 'reports.view' },
        { page: 'repairs-reports', label: 'Repair Lifecycle', icon: Activity, moduleCode: 'repairs', perm: 'reports.view' },
        { page: 'reports-inventory', label: 'Inventory Reports', icon: Package, moduleCode: 'inventory', perm: 'reports.view' },
        { page: 'reports-production', label: 'Production Reports', icon: Factory, moduleCode: 'production', perm: 'reports.view' },
        { page: 'reports-quality', label: 'Quality Reports', icon: ShieldCheck, moduleCode: 'quality', perm: 'reports.view' },
        { page: 'reports-safety', label: 'Safety Reports', icon: HardHat, moduleCode: 'safety', perm: 'reports.view' },
        { page: 'reports-financial', label: 'Financial Reports', icon: TrendingUp, moduleCode: 'reports', perm: 'reports.view' },
        { page: 'reports-custom', label: 'Custom Reports', icon: FileSpreadsheet, moduleCode: 'reports', perm: 'reports.view' },
      ],
    },
    {
      label: 'Settings', icon: Cog, perm: 'system_settings.view', adminOnly: true, moduleCode: 'modules',
      children: [
        { page: 'settings-general', label: 'General', icon: Settings },
        { page: 'settings-users', label: 'Users', icon: Users },
        { page: 'settings-roles', label: 'Roles & Permissions', icon: Shield },
        { page: 'settings-modules', label: 'Module Management', icon: Boxes },
        { page: 'settings-company', label: 'Company Profile', icon: Building2 },
        { page: 'settings-plants', label: 'Plants', icon: Factory },
        { page: 'settings-departments', label: 'Departments', icon: Building },
        { page: 'settings-notifications', label: 'Notifications', icon: BellRing },
        { page: 'settings-integrations', label: 'Integrations', icon: Link2 },
        { page: 'settings-backup', label: 'Backup', icon: Database },
        { page: 'settings-audit', label: 'Audit Logs', icon: Eye },
        { page: 'settings-security', label: 'Security', icon: ShieldAlert },
        { page: 'settings-health', label: 'System Health', icon: HeartPulse },
        { page: 'settings-queues', label: 'Queue Manager', icon: Layers },
        { page: 'settings-preferences', label: 'My Preferences', icon: Settings },
      ],
    },
  ], []);

  // Compute the label of the group that should auto-expand (based on active child page).
  // This is pure derived state — NO setState, NO useEffect, NO queueMicrotask.
  // Fixes React Error #185 caused by queueMicrotask calling setOpenMenus during render.
  const autoExpandLabel = useMemo<string | null>(() => {
    for (const group of menuGroups) {
      if (!group.children) continue;
      const childMatch = group.children.some(c => {
        if (c.page === currentPage) return true;
        if (c.page === 'maintenance-requests' && (currentPage === 'mr-detail' || currentPage === 'create-mr')) return true;
        if (c.page === 'maintenance-work-orders' && currentPage === 'wo-detail') return true;
        return false;
      });
      if (childMatch) return group.label;
    }
    return null;
  }, [currentPage, menuGroups]);

  // Clear closedMenus when autoExpandLabel changes so auto-expand works
  // after navigating away and back to a section the user previously closed.
  useEffect(() => {
    if (autoExpandLabel && closedMenus.has(autoExpandLabel)) {
      setClosedMenus(prev => {
        const next = new Set(prev);
        next.delete(autoExpandLabel);
        return next;
      });
    }
  }, [autoExpandLabel]);

  // Final open menus = manually opened ∪ auto-expanded (but NOT manually closed)
  const openMenus = useMemo<string[]>(() => {
    const set = new Set(manualOpenMenus);
    if (autoExpandLabel && !closedMenus.has(autoExpandLabel)) set.add(autoExpandLabel);
    return Array.from(set);
  }, [manualOpenMenus, autoExpandLabel, closedMenus]);

  const toggleMenu = useCallback((label: string) => {
    // Determine actual current open state (manual + auto, minus closed)
    const isActuallyOpen =
      manualOpenMenus.has(label) ||
      (autoExpandLabel === label && !closedMenus.has(label));

    setManualOpenMenus(prev => {
      const next = new Set(prev);
      if (isActuallyOpen) next.delete(label);
      else next.add(label);
      return next;
    });
    setClosedMenus(prev => {
      const next = new Set(prev);
      if (isActuallyOpen) next.add(label);
      else next.delete(label);
      return next;
    });
  }, [manualOpenMenus, autoExpandLabel, closedMenus]);

  // Check if a group or its children are active
  const isGroupActive = useCallback((group: NavGroup) => {
    if (group.page) return currentPage === group.page;
    if (!group.children) return false;
    return group.children.some(c => {
      if (c.page === currentPage) return true;
      if (c.page === 'maintenance-requests' && (currentPage === 'mr-detail' || currentPage === 'create-mr')) return true;
      if (c.page === 'maintenance-work-orders' && currentPage === 'wo-detail') return true;
      return false;
    });
  }, [currentPage]);

  // Filter every navigation surface by BOTH RBAC and licensed/enabled modules.
  // Optional modules fail closed; child pages cannot inherit visibility from a broad parent.
  const visibleGroups = useMemo(() => {
    const isAdm = isAdmin();
    const moduleAllowed = (code?: string) => !code || code === 'core' || enabledModules.has(code.toLowerCase());
    const permissionAllowed = (perm?: string, permOr?: string[]) => {
      if (isAdm) return true;
      if (permOr?.length) return permOr.some(p => hasPermission(p));
      return perm ? hasPermission(perm) : false;
    };

    return menuGroups.flatMap(g => {
      if (g.adminOnly && !isAdm) return [];
      if (g.moduleCode && !moduleAllowed(g.moduleCode)) return [];
      if (g.moduleCodes?.length && !g.moduleCodes.some(code => moduleAllowed(code))) return [];

      if (!g.children) {
        return permissionAllowed(g.perm, g.permOr) ? [g] : [];
      }

      const children = g.children.filter(child => {
        if (child.pageAdminOnly && !isAdm) return false;
        if (!moduleAllowed(child.moduleCode)) return false;
        return permissionAllowed(child.perm ?? g.perm, child.permOr ?? g.permOr);
      });

      return children.length > 0 ? [{ ...g, children }] : [];
    });
  }, [menuGroups, hasPermission, isAdmin, enabledModules]);

  // Get tooltip text for collapsed sidebar
  const getGroupTooltip = (group: NavGroup) => {
    if (!group.children) return group.label;
    const activeChild = group.children.find(c => {
      if (c.page === currentPage) return true;
      if (c.page === 'maintenance-requests' && (currentPage === 'mr-detail' || currentPage === 'create-mr')) return true;
      if (c.page === 'maintenance-work-orders' && currentPage === 'wo-detail') return true;
      return false;
    });
    return activeChild ? `${group.label} → ${activeChild.label}` : group.label;
  };

  return (
    <div className="flex flex-col h-full">
      {/* Brand */}
      <div className="flex items-center gap-3 px-4 py-5 border-b border-sidebar-border shrink-0">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-400 to-emerald-600 shrink-0 shadow-lg shadow-emerald-900/30">
          <Factory className="h-5 w-5 text-white" />
        </div>
        {expanded && (
          <div className="overflow-hidden">
            <h1 className="text-base font-bold text-sidebar-foreground tracking-tight">iAssetsPro</h1>
            <p className="text-[10px] text-sidebar-foreground/40 uppercase tracking-widest font-medium">EAM</p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-4">
        <div className="space-y-0.5">
          {visibleGroups.map(group => {
            const Icon = group.icon;
            const active = isGroupActive(group);
            const isOpen = openMenus.includes(group.label);
            // Auto-collapse manually-opened menus whose children are no longer active
            // (handled implicitly since manualOpenMenus only changes on user click)
            const hasChildren = !!group.children;

            // Standalone item (no children)
            if (!hasChildren) {
              return (
                <TooltipProvider key={group.label} delayDuration={0}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => navigate(group.page!)}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all relative ${
                          active
                            ? 'bg-sidebar-accent text-sidebar-primary font-medium shadow-sm shadow-black/10'
                            : 'text-sidebar-foreground/60 hover:bg-sidebar-accent/40 hover:text-sidebar-foreground/90'
                        }`}
                      >
                        {active && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-sidebar-primary" />}
                        <Icon className={`h-[18px] w-[18px] shrink-0 ${active ? 'text-sidebar-primary' : ''}`} />
                        {expanded && <span className="flex-1 text-left">{group.label}</span>}
                      </button>
                    </TooltipTrigger>
                    {!expanded && <TooltipContent side="right">{group.label}</TooltipContent>}
                  </Tooltip>
                </TooltipProvider>
              );
            }

            // Collapsed sidebar — show only icon with tooltip
            if (!expanded) {
              return (
                <TooltipProvider key={group.label} delayDuration={0}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => {
                          const firstChild = group.children![0];
                          navigate(firstChild.page);
                        }}
                        className={`w-full flex items-center justify-center px-3 py-2.5 rounded-lg text-sm transition-all relative ${
                          active
                            ? 'bg-sidebar-accent text-sidebar-primary font-medium shadow-sm shadow-black/10'
                            : 'text-sidebar-foreground/60 hover:bg-sidebar-accent/40 hover:text-sidebar-foreground/90'
                        }`}
                      >
                        {active && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-sidebar-primary" />}
                        <Icon className={`h-[18px] w-[18px] shrink-0 ${active ? 'text-sidebar-primary' : ''}`} />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="right">{getGroupTooltip(group)}</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              );
            }

            // Expanded sidebar — show icon + label + chevron + children
            return (
              <div key={group.label}>
                <button
                  onClick={() => toggleMenu(group.label)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all relative ${
                    active
                      ? 'bg-sidebar-accent text-sidebar-primary font-medium shadow-sm shadow-black/10'
                      : 'text-sidebar-foreground/60 hover:bg-sidebar-accent/40 hover:text-sidebar-foreground/90'
                  }`}
                >
                  {active && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-sidebar-primary" />}
                  <Icon className={`h-[18px] w-[18px] shrink-0 ${active ? 'text-sidebar-primary' : ''}`} />
                  <span className="flex-1 text-left">{group.label}</span>
                  <ChevronRight className={`h-3.5 w-3.5 shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`} />
                </button>
                {isOpen && (
                  <div className="ml-4 mt-0.5 space-y-0.5 border-l border-sidebar-border pl-3">
                    {group.children!.map(child => {
                      const childActive = child.page === currentPage ||
                        (child.page === 'maintenance-requests' && (currentPage === 'mr-detail' || currentPage === 'create-mr')) ||
                        (child.page === 'maintenance-work-orders' && currentPage === 'wo-detail');
                      const ChildIcon = child.icon;
                      return (
                        <button
                          key={child.page}
                          onClick={() => navigate(child.page)}
                          className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-[13px] transition-all relative ${
                            childActive
                              ? 'bg-sidebar-accent text-sidebar-primary font-medium'
                              : 'text-sidebar-foreground/50 hover:bg-sidebar-accent/30 hover:text-sidebar-foreground/80'
                          }`}
                        >
                          {childActive && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-4 rounded-r-full bg-sidebar-primary" />}
                          {ChildIcon && <ChildIcon className={`h-[15px] w-[15px] shrink-0 ${childActive ? 'text-sidebar-primary' : ''}`} />}
                          <span className="flex-1 text-left">{child.label}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </nav>

      {/* User — Clean profile section */}
      <div className="border-t border-sidebar-border p-3">
        <div className="flex items-center gap-3 px-2">
          <div className="h-8 w-8 rounded-full bg-gradient-to-br from-emerald-500/80 to-emerald-700/80 flex items-center justify-center shrink-0 ring-1 ring-sidebar-border">
            <span className="text-xs font-bold text-white">{user ? getInitials(user.fullName) : '?'}</span>
          </div>
          {expanded && (
            <>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 min-w-0">
                  <p className="text-sm font-medium text-sidebar-foreground truncate">{user?.fullName}</p>
                  {user?.roles?.[0] && (
                    <span className="inline-flex items-center shrink-0 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600 ring-1 ring-emerald-500/20">
                      {user.roles[0].name}
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-sidebar-foreground/40 truncate">{user?.email}</p>
              </div>
              <TooltipProvider delayDuration={0}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      className="h-8 w-8 flex items-center justify-center rounded-lg text-sidebar-foreground/40 hover:text-red-400 hover:bg-red-500/10 transition-all"
                      onClick={logout}
                    >
                      <LogOut className="h-4 w-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top">Sign Out</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Sidebar() {
  const sidebarOpen = useNavigationStore((s) => s.sidebarOpen);
  const mobileSidebarOpen = useNavigationStore((s) => s.mobileSidebarOpen);
  const setMobileSidebarOpen = useNavigationStore((s) => s.setMobileSidebarOpen);

  return (
    <>
      {/* Desktop Sidebar */}
      <aside
        className={`hidden lg:flex flex-col border-r border-sidebar-border bg-sidebar transition-all duration-300 ease-in-out overflow-hidden ${
          sidebarOpen ? 'w-64' : 'w-[68px]'
        }`}
      >
        <SidebarContent />
      </aside>

      {/* Mobile sidebar */}
      {mobileSidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMobileSidebarOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-72 bg-sidebar z-50 shadow-2xl flex flex-col overflow-hidden">
            <button
              className="absolute top-4 right-3 text-sidebar-foreground/50 hover:text-sidebar-foreground z-10"
              onClick={() => setMobileSidebarOpen(false)}
            >
              <X className="h-5 w-5" />
            </button>
            <SidebarContent forceExpanded />
          </aside>
        </div>
      )}
    </>
  );
}
