'use client';

import React, { useState, useCallback, useMemo } from 'react';
import { useIsMobile } from '@/components/shared/ResponsiveDialog';
import { useNavigationStore } from '@/stores/navigationStore';
import { useAuthStore } from '@/stores/authStore';
import type { PageName } from '@/types';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import {
  LayoutDashboard,
  Wrench,
  ClipboardList,
  Building2,
  Menu,
  ArrowRightLeft,
  Package,
  Clock,
  FileBarChart,
  HardHat,
  Zap,
  ShieldCheck,
  Radio,
  Settings,
  GraduationCap,
  BarChart3,
  Factory,
  TrendingUp,
  Search,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================

interface MobileBottomNavProps {
  onMenuOpen?: () => void;
}

interface NavItem {
  page: PageName;
  label: string;
  icon: LucideIcon;
  perm: string;
  permOr?: string[];
  /** Pages that should be considered "active" for this item */
  activePages?: PageName[];
  moduleCode?: string;
}

interface MoreItem {
  page: PageName;
  label: string;
  icon: LucideIcon;
  perm: string;
  permOr?: string[];
  activePages?: PageName[];
  moduleCode?: string;
  adminOnly?: boolean;
}

// ============================================================================
// Bottom Tab Items
// ============================================================================

const BOTTOM_TABS: NavItem[] = [
  {
    page: 'dashboard',
    label: 'Home',
    icon: LayoutDashboard,
    perm: 'dashboard.view',
  },
  {
    page: 'maintenance-requests',
    label: 'Requests',
    icon: Wrench,
    perm: 'maintenance_requests.view',
    permOr: ['maintenance_requests.view', 'maintenance_requests.view_own'],
    activePages: ['maintenance-requests', 'mr-detail', 'create-mr'],
    moduleCode: 'maintenance_requests',
  },
  {
    page: 'maintenance-work-orders',
    label: 'Work Orders',
    icon: ClipboardList,
    perm: 'work_orders.view',
    permOr: ['work_orders.view', 'work_orders.view_own'],
    activePages: ['maintenance-work-orders', 'wo-detail'],
    moduleCode: 'work_orders',
  },
  {
    page: 'assets-machines',
    label: 'Assets',
    icon: Building2,
    perm: 'assets.view',
    activePages: ['assets-machines', 'assets-hierarchy', 'assets-bom', 'assets-condition-monitoring', 'assets-digital-twin', 'assets-health', 'assets', 'asset-detail'],
    moduleCode: 'assets',
  },
];

// ============================================================================
// More Sheet Items
// ============================================================================

const MORE_ITEMS: MoreItem[] = [
  // Repairs & Tools
  { page: 'repairs-material-requests', label: 'Repair Resources', icon: ArrowRightLeft, perm: 'repair_material_requests.view', permOr: ['repair_material_requests.view', 'repair_material_requests.view_all', 'repair_material_requests.view_own'], activePages: ['repairs-material-requests', 'repairs-tool-requests', 'repairs-tool-transfers', 'repairs-downtime', 'repairs-completion', 'repairs-analytics', 'repairs-spare-part-returns', 'repairs-damaged-tools', 'technician-timesheet'], moduleCode: 'repairs' },
  // Inventory
  { page: 'inventory-items', label: 'Inventory', icon: Package, perm: 'inventory.view_all', permOr: ['inventory.view_all', 'inventory.manage', 'inventory.stock_in', 'inventory.stock_out', 'inventory_locations.view', 'stock_transactions.view', 'inventory_adjustments.view', 'inventory_transfers.view', 'material_requisitions.view', 'vendors.view', 'purchase_orders.view'], activePages: ['inventory-items', 'inventory-categories', 'inventory-locations', 'inventory-transactions', 'inventory-adjustments', 'inventory-requests', 'inventory-transfers', 'inventory-suppliers', 'inventory-purchase-orders', 'inventory-receiving'], moduleCode: 'inventory' },
  // PM Module
  { page: 'pm-schedules', label: 'Preventive Maintenance (PM)', icon: Clock, perm: 'pm_schedules.view', permOr: ['pm_schedules.view', 'pm_templates.view', 'pm_triggers.view'], activePages: ['pm-schedules', 'pm-templates', 'pm-triggers', 'pm-calendar'], moduleCode: 'pm_schedules' },
  // Reports
  { page: 'reports-maintenance', label: 'Reports', icon: FileBarChart, perm: 'reports.view', activePages: ['reports-asset', 'reports-maintenance', 'reports-inventory', 'reports-production', 'reports-quality', 'reports-safety', 'reports-financial', 'reports-custom', 'wo-reports', 'repairs-reports'], moduleCode: 'reports' },
  // Safety
  { page: 'safety-incidents', label: 'Safety', icon: HardHat, perm: 'safety.view', activePages: ['safety-incidents', 'safety-inspections', 'safety-training', 'safety-equipment', 'safety-permits'], moduleCode: 'safety' },
  // Production
  { page: 'production-orders', label: 'Production', icon: Factory, perm: 'production.view', activePages: ['production-work-centers', 'production-resource-planning', 'production-scheduling', 'production-capacity', 'production-efficiency', 'production-bottlenecks', 'production-orders', 'production-batches'], moduleCode: 'production' },
  // Quality
  { page: 'quality-inspections', label: 'Quality', icon: ShieldCheck, perm: 'quality.view', activePages: ['quality-inspections', 'quality-ncr', 'quality-audits', 'quality-control-plans', 'quality-spc', 'quality-capa'], moduleCode: 'quality' },
  // IoT
  { page: 'iot-devices', label: 'IoT', icon: Radio, perm: 'iot_devices.view', activePages: ['iot-devices', 'iot-monitoring', 'iot-rules'], moduleCode: 'iot_sensors' },
  // Analytics
  { page: 'analytics-kpi', label: 'Analytics', icon: BarChart3, perm: 'analytics.view', activePages: ['analytics-kpi', 'analytics-oee', 'analytics-downtime', 'analytics-energy'], moduleCode: 'analytics' },
  // Operations
  { page: 'operations-checklists', label: 'Operations', icon: GraduationCap, perm: 'work_orders.view', permOr: ['work_orders.view', 'work_orders.view_own'], activePages: ['operations-meter-readings', 'operations-training', 'operations-surveys', 'operations-time-logs', 'operations-shift-handover', 'operations-checklists'], moduleCode: 'work_orders' },
  // Settings
  { page: 'settings-general', label: 'Settings', icon: Settings, perm: 'system_settings.view', activePages: ['settings-general', 'settings-users', 'settings-roles', 'settings-modules', 'settings-company', 'settings-plants', 'settings-departments', 'settings-notifications', 'settings-integrations', 'settings-backup', 'settings-audit', 'settings-security', 'settings-health', 'settings-preferences'], moduleCode: 'core', adminOnly: true },
];

// ============================================================================
// Helper: check if a tab is active for current page
// ============================================================================

function isTabActive(currentPage: PageName, item: NavItem | MoreItem): boolean {
  if (item.activePages && item.activePages.includes(currentPage)) return true;
  if (item.page === currentPage) return true;
  // Special case: maintenance requests parent pages
  if (item.activePages?.includes('maintenance-requests') && (currentPage === 'mr-detail' || currentPage === 'create-mr')) return true;
  if (item.activePages?.includes('maintenance-work-orders') && currentPage === 'wo-detail') return true;
  return false;
}

// ============================================================================
// Component
// ============================================================================

export function MobileBottomNav({ onMenuOpen }: MobileBottomNavProps) {
  const isMobile = useIsMobile();
  const { currentPage, navigate, enabledModules } = useNavigationStore();
  const { hasPermission, isAdmin } = useAuthStore();
  const [moreOpen, setMoreOpen] = useState(false);

  const handleNavigate = useCallback((page: PageName) => {
    navigate(page);
  }, [navigate]);

  const handleMoreNavigate = useCallback((page: PageName) => {
    navigate(page);
    setMoreOpen(false);
  }, [navigate]);

  // Filter visible bottom tabs by permission and module
  const visibleTabs = useMemo(() => {
    return BOTTOM_TABS.filter(tab => {
      const permOk = isAdmin() || (tab.permOr
        ? tab.permOr.some(p => hasPermission(p))
        : hasPermission(tab.perm));
      if (!permOk) return false;
      if (tab.moduleCode && tab.moduleCode !== 'core') {
        if (!enabledModules) return false;
        if (!enabledModules.has(tab.moduleCode.toLowerCase())) return false;
      }
      return true;
    });
  }, [hasPermission, isAdmin, enabledModules]);

  // Filter visible more items by permission
  const visibleMoreItems = useMemo(() => {
    return MORE_ITEMS.filter(item => {
      if (item.adminOnly && !isAdmin()) return false;
      const permOk = isAdmin() || (item.permOr
        ? item.permOr.some(p => hasPermission(p))
        : hasPermission(item.perm));
      if (!permOk) return false;
      if (item.moduleCode && item.moduleCode !== 'core') {
        if (!enabledModules) return false;
        return enabledModules.has(item.moduleCode.toLowerCase());
      }
      return true;
    });
  }, [hasPermission, isAdmin, enabledModules]);

  // Don't render at all on desktop
  if (!isMobile) return null;

  return (
    <>
      {/* Fixed bottom navigation bar */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-40 bg-background/95 backdrop-blur-md border-t border-border/60 lg:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        aria-label="Mobile navigation"
      >
        <div className="flex items-stretch justify-around h-16">
          {visibleTabs.map((tab) => {
            const Icon = tab.icon;
            const active = isTabActive(currentPage, tab);
            return (
              <button
                key={tab.page}
                onClick={() => handleNavigate(tab.page)}
                className={cn(
                  'flex flex-col items-center justify-center flex-1 min-w-0 gap-0.5 relative transition-colors duration-200',
                  'active:scale-95 transition-transform',
                  active
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-muted-foreground hover:text-foreground/80',
                )}
                aria-label={tab.label}
                aria-current={active ? 'page' : undefined}
              >
                {/* Active indicator dot */}
                {active && (
                  <span className="absolute top-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-emerald-600 dark:bg-emerald-400" />
                )}
                <Icon
                  className={cn(
                    'h-5 w-5 transition-all duration-200',
                    active && 'drop-shadow-sm',
                  )}
                  strokeWidth={active ? 2.5 : 2}
                />
                <span
                  className={cn(
                    'text-[10px] leading-none font-medium truncate max-w-full px-1',
                    active ? 'font-semibold' : '',
                  )}
                >
                  {tab.label}
                </span>
              </button>
            );
          })}

          {/* More button */}
          <button
            onClick={() => setMoreOpen(true)}
            className={cn(
              'flex flex-col items-center justify-center flex-1 min-w-0 gap-0.5 relative transition-colors duration-200',
              'active:scale-95 transition-transform',
              'text-muted-foreground hover:text-foreground/80',
            )}
            aria-label="More modules"
          >
            <Menu className="h-5 w-5" strokeWidth={2} />
            <span className="text-[10px] leading-none font-medium truncate max-w-full px-1">
              More
            </span>
          </button>
        </div>
      </nav>

      {/* More Sheet */}
      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent
          side="bottom"
          hideClose
          className="max-h-[75vh] rounded-t-2xl"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          {/* Drag handle */}
          <div className="mx-auto mt-3 h-1.5 w-10 shrink-0 rounded-full bg-muted-foreground/30" />

          <SheetHeader className="px-4 pt-2 pb-1">
            <SheetTitle className="text-base">All Modules</SheetTitle>
            <SheetDescription className="text-sm">
              Navigate to any module
            </SheetDescription>
          </SheetHeader>

          <div className="px-4 pb-6 overflow-y-auto overscroll-contain">
            <div className="grid grid-cols-4 gap-3">
              {visibleMoreItems.map((item) => {
                const Icon = item.icon;
                const active = isTabActive(currentPage, item);
                return (
                  <button
                    key={item.page}
                    onClick={() => handleMoreNavigate(item.page)}
                    className={cn(
                      'flex flex-col items-center justify-center gap-2 p-3 rounded-xl transition-all duration-200 min-h-[72px]',
                      'active:scale-95 transition-transform',
                      active
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-200 dark:ring-emerald-800'
                        : 'bg-muted/50 hover:bg-muted text-foreground/80 hover:text-foreground',
                    )}
                  >
                    <div
                      className={cn(
                        'flex items-center justify-center h-9 w-9 rounded-lg transition-colors',
                        active
                          ? 'bg-emerald-100 dark:bg-emerald-900/50'
                          : 'bg-background',
                      )}
                    >
                      <Icon
                        className={cn(
                          'h-4.5 w-4.5',
                          active ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground',
                        )}
                        strokeWidth={active ? 2.5 : 2}
                      />
                    </div>
                    <span className="text-[11px] font-medium leading-tight text-center line-clamp-2">
                      {item.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
