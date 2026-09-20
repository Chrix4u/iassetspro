'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigationStore } from '@/stores/navigationStore';
import { useAuthStore } from '@/stores/authStore';
import type { PageName } from '@/types';
import { pageHasPermission, pageModuleIsEnabled } from '@/lib/page-access';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command';
import {
  LayoutDashboard,
  Building2,
  Wrench,
  ClipboardList,
  MessageSquare,
  ArrowRightLeft,
  Package,
  Wifi,
  BarChart3,
  Zap,
  ShieldCheck,
  HardHat,
  Settings,
  Users,
  Shield,
  Database,
  BellRing,
  Link2,
  FileBarChart,
  Factory,
  Search,
  Plus,
  HeartPulse,
  ShieldAlert,
  Timer,
  Clock,
  Gauge,
  GitBranch,
  ListChecks,
  Activity,
  Box,
  Crosshair,
  TriangleAlert,
  GraduationCap,
  FileText,
  CheckSquare,
  Calendar,
  TrendingUp,
  TrendingDown,
  Eye,
  FolderOpen,
  MapPin,
  ArrowUpDown,
  Truck,
  Download,
  ShoppingCart,
  Building,
  FileSpreadsheet,
  ScrollText,
  Radio,
  Smartphone,
  Monitor,
  Layers,
  Star,
  History,
  Recycle,
} from 'lucide-react';

// ============================================================================
// Types
// ============================================================================

interface PaletteItem {
  id: string;
  label: string;
  icon: React.ElementType;
  group: 'recent' | 'navigation' | 'reports' | 'actions' | 'settings';
  page?: PageName;
  action?: () => void;
  keywords?: string[];
}

// ============================================================================
// Recent items helpers (localStorage)
// ============================================================================

const RECENT_KEY = 'eam_palette_recent';
const MAX_RECENT = 10;

function getRecentItems(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function addRecentItem(id: string) {
  const items = getRecentItems().filter(i => i !== id);
  items.unshift(id);
  if (items.length > MAX_RECENT) items.length = MAX_RECENT;
  localStorage.setItem(RECENT_KEY, JSON.stringify(items));
}

// ============================================================================
// Navigation items
// ============================================================================

function buildNavigationItems(): PaletteItem[] {
  return [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, group: 'navigation', page: 'dashboard', keywords: ['home', 'overview'] },
    { id: 'chat', label: 'Chat', icon: MessageSquare, group: 'navigation', page: 'chat' },
    { id: 'notifications', label: 'Notifications', icon: BellRing, group: 'navigation', page: 'notifications' },
    { id: 'assets-machines', label: 'Assets - Machines', icon: Building2, group: 'navigation', page: 'assets-machines', keywords: ['asset', 'machine', 'equipment'] },
    { id: 'assets-hierarchy', label: 'Assets - Hierarchy', icon: GitBranch, group: 'navigation', page: 'assets-hierarchy', keywords: ['asset', 'tree', 'parent', 'child'] },
    { id: 'assets-bom', label: 'Assets - Bill of Materials', icon: ListChecks, group: 'navigation', page: 'assets-bom', keywords: ['bom', 'materials', 'components'] },
    { id: 'assets-condition-monitoring', label: 'Assets - Condition Monitoring', icon: Activity, group: 'navigation', page: 'assets-condition-monitoring', keywords: ['condition', 'sensor', 'monitoring'] },
    { id: 'assets-digital-twin', label: 'Assets - Digital Twin', icon: Box, group: 'navigation', page: 'assets-digital-twin', keywords: ['twin', '3d', 'model'] },
    { id: 'assets-health', label: 'Assets - Health', icon: HeartPulse, group: 'navigation', page: 'assets-health', keywords: ['health', 'reliability', 'condition'] },
    { id: 'maintenance-work-orders', label: 'Work Orders', icon: ClipboardList, group: 'navigation', page: 'maintenance-work-orders', keywords: ['wo', 'work order', 'task', 'job'] },
    { id: 'maintenance-requests', label: 'Maintenance Requests', icon: MessageSquare, group: 'navigation', page: 'maintenance-requests', keywords: ['mr', 'request', 'ticket'] },
    { id: 'maintenance-dashboard', label: 'Maintenance Dashboard', icon: LayoutDashboard, group: 'navigation', page: 'maintenance-dashboard' },
    { id: 'maintenance-analytics', label: 'Maintenance Analytics', icon: BarChart3, group: 'navigation', page: 'maintenance-analytics' },
    { id: 'maintenance-calibration', label: 'Calibration', icon: Crosshair, group: 'navigation', page: 'maintenance-calibration' },
    { id: 'maintenance-risk-assessment', label: 'Risk Assessment', icon: TriangleAlert, group: 'navigation', page: 'maintenance-risk-assessment' },
    { id: 'maintenance-tools', label: 'Maintenance Tools', icon: Wrench, group: 'navigation', page: 'maintenance-tools' },
    { id: 'pm-schedules', label: 'PM Schedules', icon: Clock, group: 'navigation', page: 'pm-schedules', keywords: ['preventive', 'schedule', 'planned'] },
    { id: 'repairs-material-requests', label: 'Repairs - Material Requests', icon: Package, group: 'navigation', page: 'repairs-material-requests', keywords: ['repair', 'material', 'spare'] },
    { id: 'repairs-tool-requests', label: 'Repairs - Tool Requests', icon: Wrench, group: 'navigation', page: 'repairs-tool-requests', keywords: ['repair', 'tool'] },
    { id: 'repairs-tool-transfers', label: 'Repairs - Tool Transfers', icon: ArrowRightLeft, group: 'navigation', page: 'repairs-tool-transfers', keywords: ['repair', 'transfer'] },
    { id: 'repairs-downtime', label: 'Repairs - Downtime', icon: Timer, group: 'navigation', page: 'repairs-downtime', keywords: ['downtime', 'outage'] },
    { id: 'repairs-completion', label: 'Repairs - Completion', icon: CheckSquare, group: 'navigation', page: 'repairs-completion', keywords: ['completion', 'close'] },
    { id: 'repairs-analytics', label: 'Repairs - Analytics', icon: BarChart3, group: 'navigation', page: 'repairs-analytics' },
    { id: 'wo-reports', label: 'Work Order Reports', icon: FileBarChart, group: 'reports', page: 'wo-reports', keywords: ['work order', 'reports', 'downtime', 'man hours', 'breakdown'] },
    { id: 'repairs-spare-part-returns', label: 'Repairs - Spare Part Returns', icon: Recycle, group: 'navigation', page: 'repairs-spare-part-returns', keywords: ['spare', 'part', 'return', 'refurbish'] },
    { id: 'repairs-damaged-tools', label: 'Repairs - Damaged Tools', icon: TriangleAlert, group: 'navigation', page: 'repairs-damaged-tools', keywords: ['damage', 'tool', 'broken'] },
    { id: 'repairs-reports', label: 'Repair Lifecycle', icon: Activity, group: 'reports', page: 'repairs-reports', keywords: ['repair', 'lifecycle', 'maintenance', 'report'] },
    { id: 'iot-devices', label: 'IoT Devices', icon: Smartphone, group: 'navigation', page: 'iot-devices', keywords: ['iot', 'device', 'sensor'] },
    { id: 'iot-monitoring', label: 'IoT Monitoring', icon: Monitor, group: 'navigation', page: 'iot-monitoring', keywords: ['iot', 'monitoring', 'realtime'] },
    { id: 'iot-rules', label: 'IoT Rules', icon: Radio, group: 'navigation', page: 'iot-rules', keywords: ['iot', 'rule', 'alert'] },
    { id: 'analytics-kpi', label: 'KPI Dashboard', icon: Gauge, group: 'navigation', page: 'analytics-kpi', keywords: ['kpi', 'metric', 'dashboard'] },
    { id: 'analytics-oee', label: 'OEE', icon: Gauge, group: 'navigation', page: 'analytics-oee', keywords: ['oee', 'overall equipment effectiveness'] },
    { id: 'analytics-downtime', label: 'Downtime Analysis', icon: TrendingDown, group: 'navigation', page: 'analytics-downtime' },
    { id: 'analytics-energy', label: 'Energy Analytics', icon: Zap, group: 'navigation', page: 'analytics-energy' },
    { id: 'operations-meter-readings', label: 'Operations - Meter Readings', icon: Gauge, group: 'navigation', page: 'operations-meter-readings', keywords: ['meter', 'reading'] },
    { id: 'operations-training', label: 'Operations - Training', icon: GraduationCap, group: 'navigation', page: 'operations-training' },
    { id: 'operations-surveys', label: 'Operations - Surveys', icon: FileText, group: 'navigation', page: 'operations-surveys' },
    { id: 'operations-time-logs', label: 'Operations - Time Logs', icon: Clock, group: 'navigation', page: 'operations-time-logs', keywords: ['time', 'log'] },
    { id: 'operations-shift-handover', label: 'Operations - Shift Handover', icon: ArrowRightLeft, group: 'navigation', page: 'operations-shift-handover', keywords: ['shift', 'handover'] },
    { id: 'operations-checklists', label: 'Operations - Checklists', icon: CheckSquare, group: 'navigation', page: 'operations-checklists' },
    { id: 'production-work-centers', label: 'Production - Work Centers', icon: Factory, group: 'navigation', page: 'production-work-centers', keywords: ['work center', 'line'] },
    { id: 'production-resource-planning', label: 'Production - Resource Planning', icon: Layers, group: 'navigation', page: 'production-resource-planning' },
    { id: 'production-scheduling', label: 'Production - Scheduling', icon: Calendar, group: 'navigation', page: 'production-scheduling' },
    { id: 'production-capacity', label: 'Production - Capacity', icon: Box, group: 'navigation', page: 'production-capacity' },
    { id: 'production-efficiency', label: 'Production - Efficiency', icon: TrendingUp, group: 'navigation', page: 'production-efficiency' },
    { id: 'production-bottlenecks', label: 'Production - Bottlenecks', icon: TriangleAlert, group: 'navigation', page: 'production-bottlenecks' },
    { id: 'production-orders', label: 'Production Orders', icon: ClipboardList, group: 'navigation', page: 'production-orders' },
    { id: 'production-batches', label: 'Production Batches', icon: Package, group: 'navigation', page: 'production-batches' },
    { id: 'quality-inspections', label: 'Quality - Inspections', icon: Search, group: 'navigation', page: 'quality-inspections', keywords: ['inspection', 'qa', 'qc'] },
    { id: 'quality-ncr', label: 'Quality - NCR', icon: FileText, group: 'navigation', page: 'quality-ncr', keywords: ['ncr', 'non-conformance'] },
    { id: 'quality-audits', label: 'Quality - Audits', icon: ShieldAlert, group: 'navigation', page: 'quality-audits' },
    { id: 'quality-control-plans', label: 'Quality - Control Plans', icon: ScrollText, group: 'navigation', page: 'quality-control-plans' },
    { id: 'quality-spc', label: 'Quality - SPC', icon: BarChart3, group: 'navigation', page: 'quality-spc', keywords: ['spc', 'statistical', 'process control'] },
    { id: 'quality-capa', label: 'Quality - CAPA', icon: HardHat, group: 'navigation', page: 'quality-capa', keywords: ['capa', 'corrective', 'preventive'] },
    { id: 'safety-incidents', label: 'Safety - Incidents', icon: TriangleAlert, group: 'navigation', page: 'safety-incidents', keywords: ['incident', 'accident', 'safety'] },
    { id: 'safety-inspections', label: 'Safety - Inspections', icon: Search, group: 'navigation', page: 'safety-inspections' },
    { id: 'safety-training', label: 'Safety - Training', icon: GraduationCap, group: 'navigation', page: 'safety-training' },
    { id: 'safety-equipment', label: 'Safety - Equipment', icon: HardHat, group: 'navigation', page: 'safety-equipment' },
    { id: 'safety-permits', label: 'Safety - Permits', icon: FileText, group: 'navigation', page: 'safety-permits' },
    { id: 'inventory-items', label: 'Inventory - Items', icon: Package, group: 'navigation', page: 'inventory-items', keywords: ['inventory', 'stock', 'spare parts'] },
    { id: 'inventory-categories', label: 'Inventory - Categories', icon: FolderOpen, group: 'navigation', page: 'inventory-categories' },
    { id: 'inventory-locations', label: 'Inventory - Locations', icon: MapPin, group: 'navigation', page: 'inventory-locations' },
    { id: 'inventory-transactions', label: 'Inventory - Transactions', icon: ArrowRightLeft, group: 'navigation', page: 'inventory-transactions' },
    { id: 'inventory-adjustments', label: 'Inventory - Adjustments', icon: ArrowUpDown, group: 'navigation', page: 'inventory-adjustments' },
    { id: 'inventory-requests', label: 'Inventory - Requests', icon: FileText, group: 'navigation', page: 'inventory-requests' },
    { id: 'inventory-transfers', label: 'Inventory - Transfers', icon: Truck, group: 'navigation', page: 'inventory-transfers' },
    { id: 'inventory-suppliers', label: 'Inventory - Suppliers', icon: Building, group: 'navigation', page: 'inventory-suppliers' },
    { id: 'inventory-purchase-orders', label: 'Inventory - Purchase Orders', icon: ShoppingCart, group: 'navigation', page: 'inventory-purchase-orders', keywords: ['po', 'purchase', 'order'] },
    { id: 'inventory-receiving', label: 'Inventory - Receiving', icon: Download, group: 'navigation', page: 'inventory-receiving' },
    { id: 'reports-asset', label: 'Reports - Asset', icon: FileBarChart, group: 'navigation', page: 'reports-asset' },
    { id: 'reports-maintenance', label: 'Reports - Maintenance', icon: FileBarChart, group: 'navigation', page: 'reports-maintenance' },
    { id: 'reports-inventory', label: 'Reports - Inventory', icon: FileBarChart, group: 'navigation', page: 'reports-inventory' },
    { id: 'reports-production', label: 'Reports - Production', icon: FileBarChart, group: 'navigation', page: 'reports-production' },
    { id: 'reports-quality', label: 'Reports - Quality', icon: FileBarChart, group: 'navigation', page: 'reports-quality' },
    { id: 'reports-safety', label: 'Reports - Safety', icon: FileBarChart, group: 'navigation', page: 'reports-safety' },
    { id: 'reports-financial', label: 'Reports - Financial', icon: FileSpreadsheet, group: 'navigation', page: 'reports-financial' },
    { id: 'reports-custom', label: 'Reports - Custom', icon: FileSpreadsheet, group: 'navigation', page: 'reports-custom' },
    { id: 'settings-general', label: 'Settings - General', icon: Settings, group: 'navigation', page: 'settings-general' },
    { id: 'settings-users', label: 'Settings - Users', icon: Users, group: 'navigation', page: 'settings-users' },
    { id: 'settings-roles', label: 'Settings - Roles', icon: Shield, group: 'navigation', page: 'settings-roles', keywords: ['permissions', 'rbac'] },
    { id: 'settings-modules', label: 'Settings - Modules', icon: Box, group: 'navigation', page: 'settings-modules' },
    { id: 'settings-company', label: 'Settings - Company Profile', icon: Building2, group: 'navigation', page: 'settings-company' },
    { id: 'settings-plants', label: 'Settings - Plants', icon: Factory, group: 'navigation', page: 'settings-plants' },
    { id: 'settings-departments', label: 'Settings - Departments', icon: Building, group: 'navigation', page: 'settings-departments' },
    { id: 'settings-notifications', label: 'Settings - Notifications', icon: BellRing, group: 'navigation', page: 'settings-notifications' },
    { id: 'settings-integrations', label: 'Settings - Integrations', icon: Link2, group: 'navigation', page: 'settings-integrations' },
    { id: 'settings-backup', label: 'Settings - Backup', icon: Database, group: 'navigation', page: 'settings-backup', keywords: ['backup', 'restore', 'export'] },
    { id: 'settings-audit', label: 'Settings - Audit Logs', icon: Eye, group: 'navigation', page: 'settings-audit', keywords: ['audit', 'log', 'history'] },
    { id: 'settings-security', label: 'Settings - Security', icon: ShieldAlert, group: 'navigation', page: 'settings-security' },
    { id: 'settings-health', label: 'Settings - System Health', icon: HeartPulse, group: 'navigation', page: 'settings-health' },
    { id: 'settings-preferences', label: 'My Preferences', icon: Star, group: 'navigation', page: 'settings-preferences', keywords: ['preferences', 'settings', 'display', 'theme'] },
  ];
}

// ============================================================================
// Command Palette Component
// ============================================================================

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigationStore((s) => s.navigate);
  const enabledModules = useNavigationStore((s) => s.enabledModules);
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const isAdmin = useAuthStore((s) => s.isAdmin);

  const canOpenPage = useCallback((page: PageName) => {
    const admin = isAdmin();
    return pageHasPermission(page, hasPermission, admin)
      && pageModuleIsEnabled(page, enabledModules);
  }, [enabledModules, hasPermission, isAdmin]);

  // ---- Keyboard shortcut (Ctrl+Shift+K / Cmd+Shift+K) ----
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'k') {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Expose open method for external triggers (e.g., header button)
  const openRef = useRef<() => void>(() => setOpen(true));

  // Make it available globally
  useEffect(() => {
    openRef.current = () => setOpen(true);
    (window as any).__openCommandPalette = () => openRef.current();
    return () => { delete (window as any).__openCommandPalette; };
  }, []);

  // ---- Build items ----
  const navItems = useMemo(
    () => buildNavigationItems().filter((item) => !item.page || canOpenPage(item.page)),
    [canOpenPage],
  );

  const actionItems: PaletteItem[] = useMemo(() => [
    ...(hasPermission('maintenance_requests.create') && canOpenPage('create-mr') ? [
      { id: 'action-create-mr', label: 'Create Maintenance Request', icon: Plus, group: 'actions' as const, page: 'create-mr' as PageName, keywords: ['new', 'mr', 'request'] },
    ] : []),
    ...(hasPermission('work_orders.create') && canOpenPage('maintenance-work-orders') ? [
      { id: 'action-create-wo', label: 'Create Work Order', icon: Plus, group: 'actions' as const, page: 'maintenance-work-orders' as PageName, keywords: ['new', 'wo', 'work order'] },
    ] : []),
    ...(hasPermission('safety_incidents.create') && canOpenPage('safety-incidents') ? [
      { id: 'action-create-incident', label: 'Report Safety Incident', icon: TriangleAlert, group: 'actions' as const, page: 'safety-incidents' as PageName, keywords: ['new', 'safety', 'incident', 'report'] },
    ] : []),
    ...(hasPermission('inventory.create') && canOpenPage('inventory-items') ? [
      { id: 'action-create-inventory', label: 'Add Inventory Item', icon: Package, group: 'actions' as const, page: 'inventory-items' as PageName, keywords: ['new', 'inventory', 'item', 'stock'] },
    ] : []),
    ...(hasPermission('assets.create') && canOpenPage('assets-machines') ? [
      { id: 'action-create-asset', label: 'Register New Asset', icon: Building2, group: 'actions' as const, page: 'assets-machines' as PageName, keywords: ['new', 'asset', 'register', 'machine'] },
    ] : []),
  ], [hasPermission, canOpenPage]);

  const settingsItems = useMemo<PaletteItem[]>(() => [
    { id: 'settings-users', label: 'Manage Users', icon: Users, group: 'settings' as const, page: 'settings-users', keywords: ['admin', 'user'] },
    { id: 'settings-roles', label: 'Roles & Permissions', icon: Shield, group: 'settings' as const, page: 'settings-roles', keywords: ['role', 'permission', 'rbac'] },
    { id: 'settings-general', label: 'General Settings', icon: Settings, group: 'settings' as const, page: 'settings-general' },
    { id: 'settings-security', label: 'Security Settings', icon: ShieldAlert, group: 'settings' as const, page: 'settings-security' },
    { id: 'settings-health', label: 'System Health', icon: HeartPulse, group: 'settings' as const, page: 'settings-health', keywords: ['health', 'status', 'system'] },
    { id: 'settings-backup', label: 'Backup & Restore', icon: Database, group: 'settings' as const, page: 'settings-backup', keywords: ['backup', 'restore'] },
    { id: 'settings-preferences', label: 'My Preferences', icon: Star, group: 'settings' as const, page: 'settings-preferences', keywords: ['preferences', 'display', 'theme'] },
  ].filter((item) => !item.page || canOpenPage(item.page)), [canOpenPage]);

  // ---- Recent items ----
  const recentItems: PaletteItem[] = useMemo(() => {
    const recentIds = getRecentItems();
    const allItems = [...navItems, ...actionItems];
    return recentIds
      .map(id => allItems.find(item => item.id === id))
      .filter((item): item is PaletteItem => !!item);
  }, [navItems, actionItems]);

  // ---- Handle select ----
  const handleSelect = useCallback((item: PaletteItem) => {
    addRecentItem(item.id);
    if (item.page) {
      navigate(item.page);
    }
    if (item.action) {
      item.action();
    }
    setOpen(false);
  }, [navigate]);

  // ---- Filter items by query ----
  const [query, setQuery] = useState('');
  const filteredRecent = useMemo(() => {
    if (!query.trim()) return recentItems.slice(0, 5);
    const q = query.toLowerCase();
    return recentItems.filter(
      item =>
        item.label.toLowerCase().includes(q) ||
        item.keywords?.some(kw => kw.toLowerCase().includes(q))
    );
  }, [query, recentItems]);

  const filteredNav = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return navItems.filter(
      item =>
        item.label.toLowerCase().includes(q) ||
        item.keywords?.some(kw => kw.toLowerCase().includes(q))
    ).slice(0, 10);
  }, [query, navItems]);

  const filteredActions = useMemo(() => {
    if (!query.trim()) return actionItems;
    const q = query.toLowerCase();
    return actionItems.filter(
      item =>
        item.label.toLowerCase().includes(q) ||
        item.keywords?.some(kw => kw.toLowerCase().includes(q))
    );
  }, [query, actionItems]);

  const filteredSettings = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return settingsItems.filter(
      item =>
        item.label.toLowerCase().includes(q) ||
        item.keywords?.some(kw => kw.toLowerCase().includes(q))
    );
  }, [query, settingsItems]);

  const hasResults = filteredRecent.length + filteredNav.length + filteredActions.length + filteredSettings.length > 0;

  return (
    <CommandDialog open={open} onOpenChange={setOpen} title="Command Palette" description="Navigate, search, and take actions">
      <CommandInput
        placeholder="Type a command or search..."
        value={query}
        onValueChange={setQuery}
      />
      <CommandList className="max-h-[420px]">
        <CommandEmpty>
          <div className="py-4 text-center">
            <p className="text-sm font-medium">No results found</p>
            <p className="text-xs mt-1 text-muted-foreground">Try a different search term</p>
          </div>
        </CommandEmpty>

        {/* Recent */}
        {query.trim() === '' && filteredRecent.length > 0 && (
          <CommandGroup heading="Recent">
            {filteredRecent.map(item => {
              const Icon = item.icon;
              return (
                <CommandItem
                  key={`recent-${item.id}`}
                  value={item.label}
                  onSelect={() => handleSelect(item)}
                  className="flex items-center gap-3 cursor-pointer"
                >
                  <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="flex-1 truncate text-sm">{item.label}</span>
                  <History className="h-3 w-3 text-muted-foreground/50 shrink-0" />
                </CommandItem>
              );
            })}
          </CommandGroup>
        )}

        {query.trim() === '' && filteredRecent.length > 0 && <CommandSeparator />}

        {/* Actions (show when no query) */}
        {filteredActions.length > 0 && (
          <CommandGroup heading="Quick Actions">
            {filteredActions.map(item => {
              const Icon = item.icon;
              return (
                <CommandItem
                  key={`action-${item.id}`}
                  value={item.label}
                  onSelect={() => handleSelect(item)}
                  className="flex items-center gap-3 cursor-pointer"
                >
                  <div className="flex items-center justify-center h-6 w-6 rounded bg-emerald-100 dark:bg-emerald-950/40 shrink-0">
                    <Icon className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <span className="flex-1 truncate text-sm">{item.label}</span>
                  <CommandShortcut>Enter</CommandShortcut>
                </CommandItem>
              );
            })}
          </CommandGroup>
        )}

        {query.trim() === '' && filteredActions.length > 0 && <CommandSeparator />}

        {/* Navigation */}
        {filteredNav.length > 0 && (
          <CommandGroup heading="Navigation">
            {filteredNav.map(item => {
              const Icon = item.icon;
              return (
                <CommandItem
                  key={`nav-${item.id}`}
                  value={item.label}
                  onSelect={() => handleSelect(item)}
                  className="flex items-center gap-3 cursor-pointer"
                >
                  <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="flex-1 truncate text-sm">{item.label}</span>
                </CommandItem>
              );
            })}
          </CommandGroup>
        )}

        {/* Settings */}
        {filteredSettings.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Settings">
              {filteredSettings.map(item => {
                const Icon = item.icon;
                return (
                  <CommandItem
                    key={`settings-${item.id}`}
                    value={item.label}
                    onSelect={() => handleSelect(item)}
                    className="flex items-center gap-3 cursor-pointer"
                  >
                    <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="flex-1 truncate text-sm">{item.label}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </>
        )}

        {/* Footer hint */}
        {query.trim() === '' && (
          <div className="border-t px-3 py-2 text-[11px] text-muted-foreground/60 flex items-center justify-between">
            <span>Navigate with arrow keys</span>
            <span className="flex items-center gap-3">
              <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
                <span className="text-xs">↑↓</span> Navigate
              </kbd>
              <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
                <span className="text-xs">↵</span> Select
              </kbd>
              <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
                <span className="text-xs">esc</span> Close
              </kbd>
            </span>
          </div>
        )}
      </CommandList>
    </CommandDialog>
  );
}
