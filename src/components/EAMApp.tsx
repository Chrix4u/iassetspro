'use client';

import React, { useState, useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useNavigationStore } from '@/stores/navigationStore';
import { getInitials } from '@/components/shared/helpers';
import { LoadingScreen, LoadingSkeleton } from '@/components/shared/helpers';
import Sidebar from '@/components/shared/Sidebar';
import { MobileBottomNav } from '@/components/shared/MobileBottomNav';
import NotificationPopover from '@/components/shared/NotificationPopover';
import GlobalSearch from '@/components/shared/GlobalSearch';
import CommandPalette from '@/components/CommandPalette';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Menu, ChevronLeft, ChevronRight, ChevronDown, Sun, Moon, Bell, LogOut,
  LayoutDashboard, Building2, History, Search,
} from 'lucide-react';
import type { PageName } from '@/types';

// ============================================================================
// PAGE TITLE MAP — module-level (no hook dependency)
// ============================================================================
const PAGE_TITLES: Record<string, string> = {
  // Core
  'dashboard': 'Dashboard',
  'chat': 'Chat',
  'notifications': 'Notifications',
  // Assets
  'asset-categories': 'Asset Categories',
  'assets-machines': 'Machines',
  'assets-hierarchy': 'Asset Hierarchy',
  'assets-bom': 'Bill of Materials',
  'assets-condition-monitoring': 'Condition Monitoring',
  'assets-digital-twin': 'Digital Twin',
  'digital-twin-viewer': 'Digital Twin Viewer',
  'system-diagrams': 'System Diagrams',
  'assets-health': 'Asset Health',
  // AI Intelligence
  'ai-hub': 'AI Intelligence Hub',
  'ai-config': 'AI Configuration',
  'ai-history': 'AI Generation History',
  // Maintenance
  'maintenance-work-orders': 'Work Orders',
  'wo-detail': 'Work Order Details',
  'maintenance-requests': 'Requests',
  'mr-detail': 'Request Details',
  'create-mr': 'New Request',
  'maintenance-dashboard': 'Maintenance Dashboard',
  'maintenance-analytics': 'Maintenance Analytics',
  'maintenance-calibration': 'Calibration',
  'maintenance-risk-assessment': 'Risk Assessment',
  'maintenance-tools': 'Tools',
  'pm-schedules': 'PM Schedules',
  'pm-templates': 'PM Templates',
  'pm-triggers': 'PM Triggers',
  'pm-calendar': 'PM Calendar',
  // Planner Workbench
  'planner-workbench': 'Planner Workbench',
  'enterprise-reports': 'Reports',
  // Repairs Module
  'repairs-material-requests': 'Material Requests',
  'repairs-tool-requests': 'Tool Requests',
  'repairs-tool-transfers': 'Tool Transfers',
  'repairs-downtime': 'Downtime Tracking',
  'repairs-completion': 'Completion & Closure',
  'repairs-analytics': 'Repairs Analytics',
  'repairs-spare-part-returns': 'Spare Part Returns',
  'repairs-damaged-tools': 'Damaged Tool Reports',
  'repairs-reports': 'Repair Lifecycle',
  'repairs-detail-report': 'Repair Detail Report',
  'wo-reports': 'Work Order Reports',
  // IoT
  'iot-devices': 'IoT Devices',
  'iot-monitoring': 'IoT Monitoring',
  'iot-rules': 'IoT Rules',
  // Industrial Connectivity
  'connectivity': 'Connectivity',
  // Analytics
  'analytics-kpi': 'KPI Dashboard',
  'analytics-oee': 'OEE',
  'analytics-downtime': 'Downtime Analysis',
  'analytics-energy': 'Energy Analytics',
  // Operations
  'operations-meter-readings': 'Meter Readings',
  'operations-training': 'Training',
  'operations-surveys': 'Surveys',
  'operations-time-logs': 'Time Logs',
  'operations-shift-handover': 'Shift Handover',
  'operations-checklists': 'Checklists',
  // Production
  'production-work-centers': 'Work Centers',
  'production-resource-planning': 'Resource Planning',
  'production-scheduling': 'Production Scheduling',
  'production-capacity': 'Capacity Management',
  'production-efficiency': 'Production Efficiency',
  'production-bottlenecks': 'Bottleneck Analysis',
  'production-orders': 'Production Orders',
  'production-batches': 'Batch Management',
  // Quality
  'quality-inspections': 'Inspections',
  'quality-ncr': 'Non-Conformance Reports',
  'quality-audits': 'Quality Audits',
  'quality-control-plans': 'Control Plans',
  'quality-spc': 'Statistical Process Control',
  'quality-capa': 'CAPA',
  // Safety
  'safety-incidents': 'Incidents',
  'safety-inspections': 'Safety Inspections',
  'safety-training': 'Safety Training',
  'safety-equipment': 'Safety Equipment',
  'safety-permits': 'Permits',
  // Reliability Engineering
  'reliability-engineering': 'Reliability Engineering',
  // Inventory
  'inventory-items': 'Inventory Items',
  'inventory-categories': 'Categories',
  'inventory-locations': 'Locations',
  'inventory-transactions': 'Transactions',
  'inventory-adjustments': 'Adjustments',
  'inventory-requests': 'Requests',
  'inventory-transfers': 'Transfers',
  'inventory-suppliers': 'Suppliers',
  'inventory-purchase-orders': 'Purchase Orders',
  'inventory-receiving': 'Receiving',
  // Reports
  'reports-asset': 'Asset Reports',
  'equipment-history': 'Equipment History',
  'failure-analysis': 'Failure Analysis',
  'reports-maintenance': 'Maintenance Reports',
  'reports-inventory': 'Inventory Reports',
  'reports-production': 'Production Reports',
  'reports-quality': 'Quality Reports',
  'reports-safety': 'Safety Reports',
  'reports-financial': 'Financial Reports',
  'reports-custom': 'Custom Reports',
  // Settings
  'settings-general': 'General Settings',
  'settings-users': 'Users',
  'settings-roles': 'Roles & Permissions',
  'settings-modules': 'Module Management',
  'settings-company': 'Company Profile',
  'settings-plants': 'Plants',
  'settings-departments': 'Departments',
  'settings-notifications': 'Notifications',
  'settings-integrations': 'Integrations',
  'settings-backup': 'Backup & Restore',
  'settings-audit': 'Audit Logs',
  'settings-security': 'Security',
  'settings-health': 'System Health',
  'settings-queues': 'Queue Manager',
  'settings-preferences': 'My Preferences',
  // Observability
  'observability-dashboard': 'Observability',
  // Historian
  'historian-dashboard': 'Historian Dashboard',
  // Legacy
  'assets': 'Asset Register',
  'asset-detail': 'Asset Details',
  'inventory': 'Inventory',
  'analytics': 'Analytics',
};

// ============================================================================
// PAGE LOADER — manual dynamic imports WITHOUT React.lazy/Suspense
// ============================================================================
// React.lazy + Suspense causes Error #306 when combined with Zustand's
// useSyncExternalStore because Zustand forces synchronous re-renders.
// Instead, we use a useEffect-based loader that never suspends.
// Components are cached after first load so navigation is instant.
// ============================================================================

type PageComponent = React.ComponentType;

// Cache loaded components so revisiting a page is instant
const pageCache = new Map<string, PageComponent>();

// Registry of dynamic importers — returns the named export from each module
const pageLoaders: Record<string, () => Promise<PageComponent>> = {
  // Core
  'dashboard': () => import('./modules/DashboardPages').then(m => m.DashboardPage),
  'chat': () => import('./modules/ChatPage').then(m => m.ChatPage),
  'notifications': () => import('./modules/SettingsPages').then(m => m.NotificationsPage),
  // Assets
  'asset-categories': () => import('./modules/AssetCategoriesPage').then(m => m.default),
  'assets-machines': () => import('./modules/AssetPages').then(m => m.AssetsMachinesPage),
  'assets-hierarchy': () => import('./modules/AssetPages').then(m => m.AssetsHierarchyPage),
  'assets-bom': () => import('./modules/AssetPages').then(m => m.AssetsBomPage),
  'assets-condition-monitoring': () => import('./modules/AssetPages').then(m => m.AssetsConditionMonitoringPage),
  'assets-digital-twin': () => import('./digital-twin/DigitalTwinMainPage').then(m => m.DigitalTwinMainPage),
  'digital-twin-viewer': () => import('./digital-twin/DigitalTwinMainPage').then(m => m.DigitalTwinMainPage),
  'system-diagrams': () => import('./digital-twin/SystemDiagramPage').then(m => m.default),
  'assets-health': () => import('./modules/AssetPages').then(m => m.AssetHealthPage),
  // AI Intelligence
  'ai-hub': () => import('./modules/AIHubPage').then(m => m.AIHubPage),
  'ai-config': () => import('./modules/AIConfigPage').then(m => m.AIConfigPage),
  'ai-history': () => import('./modules/AIHistoryPage').then(m => m.AIHistoryPage),
  // Maintenance
  'maintenance-work-orders': () => import('./modules/MaintenancePages').then(m => m.MaintenanceWorkOrdersPage),
  'wo-detail': () => import('./modules/TechnicianWorkOrderPage').then(m => m.TechnicianWorkOrderPage),
  'maintenance-requests': () => import('./modules/MaintenancePages').then(m => m.MaintenanceRequestsPage),
  'mr-detail': () => import('./modules/MaintenancePages').then(m => m.MaintenanceRequestsPage),
  'create-mr': () => import('./modules/MaintenancePages').then(m => m.MaintenanceRequestsPage),
  'maintenance-dashboard': () => import('./modules/MaintenancePages').then(m => m.MaintenanceDashboardPage),
  'maintenance-analytics': () => import('./modules/MaintenancePages').then(m => m.MaintenanceAnalyticsPage),
  'maintenance-calibration': () => import('./modules/MaintenancePages').then(m => m.MaintenanceCalibrationPage),
  'maintenance-risk-assessment': () => import('./modules/MaintenancePages').then(m => m.MaintenanceRiskAssessmentPage),
  'maintenance-tools': () => import('./modules/MaintenancePages').then(m => m.MaintenanceToolsPage),
  'pm-schedules': () => import('./modules/MaintenancePages').then(m => m.PmSchedulesPage),
  'pm-templates': () => import('./modules/MaintenancePages').then(m => m.PmTemplatesPage),
  'pm-triggers': () => import('./modules/PmTriggersPage').then(m => m.default),
  'pm-calendar': () => import('./modules/PmCalendarPage').then(m => m.default),
  // Planner Workbench
  'planner-workbench': () => import('./modules/PlannerWorkbench').then(m => m.default),
  'enterprise-reports': () => import('./modules/EnterpriseReports').then(m => m.default),
  // Repairs
  'repairs-material-requests': () => import('./modules/RepairsPages').then(m => m.RepairMaterialRequestsPage),
  'repairs-tool-requests': () => import('./modules/RepairsPages').then(m => m.RepairToolRequestsPage),
  'repairs-tool-transfers': () => import('./modules/RepairsPages').then(m => m.RepairToolTransfersPage),
  'repairs-downtime': () => import('./modules/RepairsPages').then(m => m.RepairDowntimePage),
  'repairs-completion': () => import('./modules/RepairsPages').then(m => m.RepairCompletionPage),
  'technician-timesheet': () => import('./modules/TimesheetPage').then(m => m.TimesheetPage),
  'repairs-analytics': () => import('./modules/RepairsPages').then(m => m.RepairAnalyticsPage),
  'repairs-spare-part-returns': () => import('./modules/RepairsPages').then(m => m.SparePartReturnsPage),
  'repairs-damaged-tools': () => import('./modules/RepairsPages').then(m => m.DamagedToolReportsPage),
  'repairs-reports': () => import('./modules/RepairsPages').then(m => m.MaintenanceReportsPage),
  'repairs-detail-report': () => import('./modules/RepairDetailReportPage').then(m => m.default),
  'wo-reports': () => import('./modules/WOReportsPage').then(m => m.WOReportsPage),
  // IoT
  'iot-devices': () => import('./modules/IoTPages').then(m => m.IotDevicesPage),
  'iot-monitoring': () => import('./modules/IoTPages').then(m => m.IotMonitoringPage),
  'iot-rules': () => import('./modules/IoTPages').then(m => m.IotRulesPage),
  // Industrial Connectivity
  'connectivity': () => import('./modules/ConnectivityPages').then(m => m.ConnectivityPage),
  // Analytics
  'analytics-kpi': () => import('./modules/AnalyticsPages').then(m => m.AnalyticsKpiPage),
  'analytics-oee': () => import('./modules/AnalyticsPages').then(m => m.AnalyticsOeePage),
  'analytics-downtime': () => import('./modules/AnalyticsPages').then(m => m.AnalyticsDowntimePage),
  'analytics-energy': () => import('./modules/AnalyticsPages').then(m => m.AnalyticsEnergyPage),
  // Operations
  'operations-meter-readings': () => import('./modules/OperationsPages').then(m => m.OperationsMeterReadingsPage),
  'operations-training': () => import('./modules/OperationsPages').then(m => m.OperationsTrainingPage),
  'operations-surveys': () => import('./modules/OperationsPages').then(m => m.OperationsSurveysPage),
  'operations-time-logs': () => import('./modules/OperationsPages').then(m => m.OperationsTimeLogsPage),
  'operations-shift-handover': () => import('./modules/OperationsPages').then(m => m.OperationsShiftHandoverPage),
  'operations-checklists': () => import('./modules/OperationsPages').then(m => m.OperationsChecklistsPage),
  // Production
  'production-work-centers': () => import('./modules/ProductionPages').then(m => m.ProductionWorkCentersPage),
  'production-resource-planning': () => import('./modules/ProductionPages').then(m => m.ProductionResourcePlanningPage),
  'production-scheduling': () => import('./modules/ProductionPages').then(m => m.ProductionSchedulingPage),
  'production-capacity': () => import('./modules/ProductionPages').then(m => m.ProductionCapacityPage),
  'production-efficiency': () => import('./modules/ProductionPages').then(m => m.ProductionEfficiencyPage),
  'production-bottlenecks': () => import('./modules/ProductionPages').then(m => m.ProductionBottlenecksPage),
  'production-orders': () => import('./modules/ProductionPages').then(m => m.ProductionOrdersPage),
  'production-batches': () => import('./modules/ProductionPages').then(m => m.ProductionBatchesPage),
  // Quality
  'quality-inspections': () => import('./modules/QualityPages').then(m => m.QualityInspectionsPage),
  'quality-ncr': () => import('./modules/QualityPages').then(m => m.QualityNcrPage),
  'quality-audits': () => import('./modules/QualityPages').then(m => m.QualityAuditsPage),
  'quality-control-plans': () => import('./modules/QualityPages').then(m => m.QualityControlPlansPage),
  'quality-spc': () => import('./modules/QualityPages').then(m => m.QualitySpcPage),
  'quality-capa': () => import('./modules/QualityPages').then(m => m.QualityCapaPage),
  // Safety
  'safety-incidents': () => import('./modules/SafetyPages').then(m => m.SafetyIncidentsPage),
  'safety-inspections': () => import('./modules/SafetyPages').then(m => m.SafetyInspectionsPage),
  'safety-training': () => import('./modules/SafetyPages').then(m => m.SafetyTrainingPage),
  'safety-equipment': () => import('./modules/SafetyPages').then(m => m.SafetyEquipmentPage),
  'safety-permits': () => import('./modules/SafetyPages').then(m => m.SafetyPermitsPage),
  // Reliability Engineering
  'reliability-engineering': () => import('./modules/ReliabilityEngineeringPage').then(m => m.default),
  // Inventory
  'inventory-items': () => import('./modules/InventoryPages').then(m => m.InventoryItemsPage),
  'inventory-categories': () => import('./modules/InventoryPages').then(m => m.InventoryCategoriesPage),
  'inventory-locations': () => import('./modules/InventoryPages').then(m => m.InventoryLocationsPage),
  'inventory-transactions': () => import('./modules/InventoryPages').then(m => m.InventoryTransactionsPage),
  'inventory-adjustments': () => import('./modules/InventoryPages').then(m => m.InventoryAdjustmentsPage),
  'inventory-requests': () => import('./modules/InventoryPages').then(m => m.InventoryRequestsPage),
  'inventory-transfers': () => import('./modules/InventoryPages').then(m => m.InventoryTransfersPage),
  'inventory-suppliers': () => import('./modules/InventoryPages').then(m => m.InventorySuppliersPage),
  'inventory-purchase-orders': () => import('./modules/InventoryPages').then(m => m.InventoryPurchaseOrdersPage),
  'inventory-receiving': () => import('./modules/InventoryPages').then(m => m.InventoryReceivingPage),
  // Reports
  'reports-asset': () => import('./modules/ReportPages').then(m => m.ReportsAssetPage),
  'machine-availability': () => import('./modules/MachineAvailabilityPage').then(m => m.MachineAvailabilityPage),
  'equipment-history': () => import('./modules/ReportPages').then(m => m.EquipmentHistoryPage),
  'failure-analysis': () => import('./modules/ReportPages').then(m => m.FailureAnalysisPage),
  'reports-maintenance': () => import('./modules/ReportPages').then(m => m.ReportsMaintenancePage),
  'reports-inventory': () => import('./modules/ReportPages').then(m => m.ReportsInventoryPage),
  'reports-production': () => import('./modules/ReportPages').then(m => m.ReportsProductionPage),
  'reports-quality': () => import('./modules/ReportPages').then(m => m.ReportsQualityPage),
  'reports-safety': () => import('./modules/ReportPages').then(m => m.ReportsSafetyPage),
  'reports-financial': () => import('./modules/ReportPages').then(m => m.ReportsFinancialPage),
  'reports-custom': () => import('./modules/ReportPages').then(m => m.ReportsCustomPage),
  // Settings
  'settings-general': () => import('./modules/SettingsPages').then(m => m.SettingsGeneralPage),
  'settings-users': () => import('./modules/SettingsPages').then(m => m.SettingsUsersPage),
  'settings-roles': () => import('./modules/SettingsPages').then(m => m.SettingsRolesPage),
  'settings-modules': () => import('./modules/SettingsPages').then(m => m.SettingsModulesPage),
  'settings-company': () => import('./modules/SettingsPages').then(m => m.CompanyProfilePage),
  'settings-plants': () => import('./modules/SettingsPages').then(m => m.SettingsPlantsPage),
  'settings-departments': () => import('./modules/SettingsPages').then(m => m.SettingsDepartmentsPage),
  'settings-notifications': () => import('./modules/SettingsPages').then(m => m.SettingsNotificationsPage),
  'settings-integrations': () => import('./modules/SettingsPages').then(m => m.SettingsIntegrationsPage),
  'settings-backup': () => import('./modules/SettingsPages').then(m => m.SettingsBackupPage),
  'settings-audit': () => import('./modules/SettingsPages').then(m => m.AuditLogsPage),
  'settings-security': () => import('./modules/SettingsPages').then(m => m.SecuritySettingsPage),
  'settings-health': () => import('./modules/SettingsPages').then(m => m.SystemHealthPage),
  'settings-queues': () => import('./modules/QueueManagerPage').then(m => m.default),
  'settings-preferences': () => import('./modules/SettingsPages').then(m => m.UserPreferencesPage),
  // Observability
  'observability-dashboard': () => import('./modules/ObservabilityPages').then(m => m.ObservabilityDashboard),
  // Historian
  'historian-dashboard': () => import('./modules/HistorianPages').then(m => m.default),
  // Legacy fallbacks
  'assets': () => import('./modules/AssetPages').then(m => m.AssetsPage),
  'asset-detail': () => import('./modules/AssetPages').then(m => m.AssetsPage),
  'inventory': () => import('./modules/InventoryPages').then(m => m.InventoryPage),
  'analytics': () => import('./modules/AnalyticsPages').then(m => m.AnalyticsPage),
};

/**
 * PageSwitcher — loads page components via useEffect + dynamic imports.
 * Never uses React.lazy/Suspense, so it NEVER suspends during a click event.
 * Loaded components are cached for instant subsequent navigation.
 * Includes a permission guard: unauthorized pages redirect to dashboard.
 */
function PageSwitcher({ page }: { page: string }) {
  const [Component, setComponent] = useState<PageComponent | null>(
    () => pageCache.get(page) || null
  );
  const [error, setError] = useState<string | null>(null);
  const { hasPermission, isAdmin } = useAuthStore();
  const navigate = useNavigationStore((s) => s.navigate);
  const enabledModules = useNavigationStore((s) => s.enabledModules);
  const fetchModules = useNavigationStore((s) => s.fetchModules);

  // Page-to-permission mapping for route guard
  const pagePermissions: Record<string, string[]> = {
    // Core
    'dashboard': ['dashboard.view'],
    'chat': ['chat.view'],
    'notifications': ['notifications.view'],
    // Assets
    'asset-categories': ['assets.view'],
    'assets-machines': ['assets.view'],
    'assets-hierarchy': ['assets.view'],
    'assets-bom': ['bom.view'],
    'assets-condition-monitoring': ['condition_monitoring.view'],
    'assets-digital-twin': ['digital_twin.view'],
    'digital-twin-viewer': ['digital_twin.view'],
    'system-diagrams': ['digital_twin.view'],
    'assets-health': ['asset_health.view'],
    // AI Intelligence
    'ai-hub': ['assets.view'],
    'ai-config': ['system_settings.view'],
    'ai-history': ['assets.view'],
    // Maintenance
    'maintenance-work-orders': ['work_orders.view', 'work_orders.view_own'],
    'maintenance-requests': ['maintenance_requests.view', 'maintenance_requests.view_own'],
    'create-mr': ['maintenance_requests.create'],
    'mr-detail': ['maintenance_requests.view', 'maintenance_requests.view_own'],
    'wo-detail': ['work_orders.view', 'work_orders.view_own'],
    'maintenance-dashboard': ['work_orders.view', 'work_orders.view_own'],
    'maintenance-analytics': ['work_orders.view', 'work_orders.view_own'],
    'maintenance-calibration': ['calibration.view'],
    'maintenance-risk-assessment': ['work_orders.view', 'work_orders.view_own'],
    'maintenance-tools': ['tools.view'],
    'pm-schedules': ['pm_schedules.view'],
    'pm-templates': ['pm_templates.view'],
    'pm-triggers': ['pm_triggers.view'],
    'pm-calendar': ['pm_schedules.view'],
    // Planner
    'planner-workbench': ['work_orders.view', 'work_orders.view_own'],
    'enterprise-reports': ['reports.view'],
    // Repairs
    'repairs-material-requests': ['repair_material_requests.view', 'repair_material_requests.view_all', 'repair_material_requests.view_own'],
    'repairs-tool-requests': ['repair_tool_requests.view', 'repair_tool_requests.view_all', 'repair_tool_requests.view_own'],
    'repairs-tool-transfers': ['repair_tool_transfers.view', 'repair_tool_transfers.view_all', 'repair_tool_transfers.view_own'],
    'repairs-downtime': ['work_orders.view', 'work_orders.view_own'],
    'repairs-completion': ['work_orders.view', 'work_orders.view_own'],
    'repairs-spare-part-returns': ['spare_part_returns.view', 'spare_part_returns.view_all', 'spare_part_returns.view_own'],
    'repairs-damaged-tools': ['damaged_tool_reports.view', 'damaged_tool_reports.view_all'],
    'repairs-analytics': ['work_orders.view', 'work_orders.view_own'],
    'repairs-reports': ['reports.view', 'work_orders.view'],
    'repairs-detail-report': ['reports.view', 'work_orders.view'],
    'wo-reports': ['reports.view', 'work_orders.view', 'work_orders.view_own'],
    'technician-timesheet': ['time_logs.view', 'time_logs.create', 'work_orders.view', 'work_orders.view_own'],
    // IoT
    'iot-devices': ['iot_devices.view'],
    'iot-monitoring': ['iot_monitoring.view'],
    'iot-rules': ['iot_rules.view'],
    // Industrial Connectivity
    'connectivity': ['iot.view'],
    // Analytics
    'analytics-kpi': ['analytics.view'],
    'analytics-oee': ['oee.view'],
    'analytics-downtime': ['downtime.view'],
    'analytics-energy': ['energy.view'],
    // Operations
    'operations-meter-readings': ['meters.view'],
    'operations-training': ['training.view'],
    'operations-surveys': ['production_surveys.view'],
    'operations-time-logs': ['time_logs.view'],
    'operations-shift-handover': ['shift_handovers.view'],
    'operations-checklists': ['work_orders.view'],
    // Production
    'production-work-centers': ['work_centers.view'],
    'production-resource-planning': ['production.view'],
    'production-scheduling': ['production.view'],
    'production-capacity': ['production.view'],
    'production-efficiency': ['production.view'],
    'production-bottlenecks': ['production.view'],
    'production-orders': ['production.view'],
    'production-batches': ['production_batches.view'],
    // Quality
    'quality-inspections': ['quality_inspections.view'],
    'quality-ncr': ['quality_ncr.view'],
    'quality-audits': ['quality_audits.view'],
    'quality-control-plans': ['quality_control_plans.view'],
    'quality-spc': ['spc.view'],
    'quality-capa': ['quality_ncr.view'],
    // Safety
    'safety-incidents': ['safety_incidents.view'],
    'safety-inspections': ['safety_inspections.view'],
    'safety-training': ['training.view'],
    'safety-equipment': ['safety_equipment.view'],
    'safety-permits': ['safety_permits.view'],
    // Reliability Engineering
    'reliability-engineering': ['digital_twin.view'],
    // Inventory
    'inventory-items': ['inventory.view_all', 'inventory.manage', 'inventory.stock_in', 'inventory.stock_out'],
    'inventory-categories': ['parts_categories.view'],
    'inventory-locations': ['inventory_locations.view'],
    'inventory-transactions': ['stock_transactions.view'],
    'inventory-adjustments': ['inventory_adjustments.view'],
    'inventory-requests': ['material_requisitions.view'],
    'inventory-transfers': ['inventory_transfers.view'],
    'inventory-suppliers': ['vendors.view'],
    'inventory-purchase-orders': ['purchase_orders.view'],
    'inventory-receiving': ['purchase_orders.view'],
    // Reports
    'reports-asset': ['reports.view'],
    'equipment-history': ['reports.view'],
    'machine-availability': ['reports.view'],
    'failure-analysis': ['reports.view'],
    'reports-maintenance': ['reports.view'],
    'reports-inventory': ['reports.view'],
    'reports-production': ['reports.view'],
    'reports-quality': ['reports.view'],
    'reports-safety': ['reports.view'],
    'reports-financial': ['reports.view'],
    'reports-custom': ['reports.view'],
    // Settings (admin-only gate is handled separately above)
    'settings-general': ['system_settings.view'],
    'settings-users': ['users.manage'],
    'settings-roles': ['roles.manage'],
    'settings-modules': ['system_settings.view'],
    'settings-company': ['system_settings.view'],
    'settings-plants': ['plants.manage'],
    'settings-departments': ['departments.manage'],
    'settings-notifications': ['system_settings.view'],
    'settings-integrations': ['system_settings.view'],
    'settings-backup': ['system_settings.view'],
    'settings-audit': ['audit_logs.view'],
    'settings-security': ['system_settings.view'],
    'settings-health': ['system_settings.view'],
    'settings-queues': ['system_settings.view'],
    'settings-preferences': ['system_settings.view'],
    // Observability & Historian (admin-only)
    'observability-dashboard': ['system_settings.view'],
    'historian-dashboard': ['system_settings.view'],
    // Legacy fallbacks
    'assets': ['assets.view'],
    'asset-detail': ['assets.view'],
    'inventory': ['inventory.view_all', 'inventory.manage', 'inventory.stock_in', 'inventory.stock_out'],
    'analytics': ['analytics.view'],
  };

  // Page-to-module mapping. Optional modules are deny-by-default until the
  // server confirms that the company has them licensed/enabled.
  const pageModules: Record<string, string | string[]> = {
    'dashboard': 'core', 'chat': 'core', 'notifications': 'notifications',
    'assets-machines': 'assets', 'assets-hierarchy': 'assets', 'asset-categories': 'assets',
    'assets-bom': ['assets', 'bom'], 'assets-condition-monitoring': ['assets', 'condition_monitoring'], 'assets-health': 'assets',
    'assets-digital-twin': ['assets', 'digital_twin'], 'digital-twin-viewer': ['assets', 'digital_twin'], 'system-diagrams': ['assets', 'digital_twin'],
    'ai-hub': 'assets', 'ai-config': 'assets', 'ai-history': 'assets',
    'maintenance-work-orders': 'work_orders', 'wo-detail': 'work_orders',
    'maintenance-requests': 'maintenance_requests', 'mr-detail': 'maintenance_requests', 'create-mr': 'maintenance_requests',
    'maintenance-dashboard': 'work_orders', 'maintenance-analytics': 'work_orders',
    'maintenance-calibration': ['work_orders', 'calibration'], 'maintenance-risk-assessment': ['work_orders', 'risk_assessment'], 'maintenance-tools': ['work_orders', 'tools'],
    'pm-schedules': 'pm_schedules', 'pm-templates': 'pm_schedules', 'pm-triggers': 'pm_schedules', 'pm-calendar': 'pm_schedules',
    'planner-workbench': 'work_orders', 'enterprise-reports': 'reports',
    'repairs-material-requests': 'repairs', 'repairs-tool-requests': 'repairs', 'repairs-tool-transfers': 'repairs',
    'repairs-downtime': 'repairs', 'repairs-completion': 'repairs', 'technician-timesheet': 'repairs',
    'repairs-analytics': 'repairs', 'repairs-spare-part-returns': 'repairs', 'repairs-damaged-tools': 'repairs',
    'repairs-reports': ['reports', 'repairs'], 'repairs-detail-report': ['reports', 'repairs'],
    'iot-devices': 'iot_sensors', 'iot-monitoring': 'iot_sensors', 'iot-rules': 'iot_sensors', 'connectivity': 'iot_sensors',
    'reliability-engineering': 'digital_twin',
    'analytics-kpi': 'analytics', 'analytics-oee': 'oee', 'analytics-downtime': 'downtime', 'analytics-energy': 'energy',
    'operations-meter-readings': 'meter_readings', 'operations-training': 'training',
    'operations-surveys': 'production', 'operations-time-logs': 'work_orders',
    'operations-shift-handover': 'shift_management', 'operations-checklists': 'work_orders',
    'production-work-centers': 'production', 'production-resource-planning': 'production', 'production-scheduling': 'production',
    'production-capacity': 'production', 'production-efficiency': 'production', 'production-bottlenecks': 'production',
    'production-orders': 'production', 'production-batches': 'production',
    'quality-inspections': 'quality', 'quality-ncr': 'quality', 'quality-audits': 'quality',
    'quality-control-plans': 'quality', 'quality-spc': 'quality', 'quality-capa': ['quality', 'capa'],
    'safety-incidents': 'safety', 'safety-inspections': 'safety', 'safety-training': 'safety',
    'safety-equipment': 'safety', 'safety-permits': 'safety',
    'inventory-items': 'inventory', 'inventory-categories': 'inventory', 'inventory-locations': 'inventory',
    'inventory-transactions': 'inventory', 'inventory-adjustments': 'inventory', 'inventory-requests': 'inventory',
    'inventory-transfers': 'inventory', 'inventory-suppliers': 'inventory', 'inventory-purchase-orders': 'inventory',
    'inventory-receiving': 'inventory',
    'reports-asset': ['reports', 'assets'], 'equipment-history': ['reports', 'assets'], 'machine-availability': ['reports', 'assets'], 'failure-analysis': ['reports', 'failure_analysis'],
    'reports-maintenance': ['reports', 'work_orders'], 'reports-inventory': ['reports', 'inventory'], 'reports-production': ['reports', 'production'],
    'reports-quality': ['reports', 'quality'], 'reports-safety': ['reports', 'safety'], 'reports-financial': 'reports', 'reports-custom': 'reports',
    'wo-reports': ['reports', 'work_orders'],
    'settings-general': 'core', 'settings-users': 'core', 'settings-roles': 'core', 'settings-modules': 'core',
    'settings-company': 'core', 'settings-plants': 'core', 'settings-departments': 'core',
    'settings-notifications': 'core', 'settings-integrations': 'core', 'settings-backup': 'core',
    'settings-audit': 'core', 'settings-security': 'core', 'settings-health': 'core',
    'settings-queues': 'core', 'settings-preferences': 'core',
    'assets': 'assets', 'asset-detail': 'assets', 'inventory': 'inventory', 'analytics': 'analytics',
  };

  const requiredPermsForPage = pagePermissions[page] ?? (page.startsWith('settings-') ? ['system_settings.view'] : undefined);
  const settingsAdminDenied = page.startsWith('settings-') && page !== 'settings-preferences' && !isAdmin();
  const permissionAccessDenied = !isAdmin() && Boolean(
    settingsAdminDenied ||
    (requiredPermsForPage && !requiredPermsForPage.some(p => hasPermission(p)))
  );

  const requiredModule = pageModules[page];
  const requiredModules = requiredModule
    ? (Array.isArray(requiredModule) ? requiredModule : [requiredModule])
    : [];
  const moduleStateReady = enabledModules !== null;
  const moduleAccessDenied = Boolean(
    moduleStateReady &&
    requiredModules.some(code => code !== 'core' && !enabledModules!.has(code.toLowerCase()))
  );


  useEffect(() => {
    fetchModules();
  }, [fetchModules]);

  // Permission + module guard: check before loading the page
  useEffect(() => {
    if (!moduleStateReady) return;
    if (moduleAccessDenied || permissionAccessDenied) {
      navigate('dashboard');
      return;
    }
    // Admin-only gate: all settings-* pages (except user-level preferences) require admin
    if (page.startsWith('settings-') && page !== 'settings-preferences') {
      if (!isAdmin()) {
        navigate('dashboard');
        return;
      }
    }

    let requiredPerms = pagePermissions[page];
    // Wildcard: any settings-* page not explicitly listed requires system_settings.view
    if (!requiredPerms && page.startsWith('settings-')) {
      requiredPerms = ['system_settings.view'];
    }
    if (requiredPerms && !isAdmin()) {
      const hasAccess = requiredPerms.some(p => hasPermission(p));
      if (!hasAccess) {
        // Redirect to dashboard if no permission
        navigate('dashboard');
        return;
      }
    }
  }, [page, hasPermission, isAdmin, navigate, moduleStateReady, moduleAccessDenied, permissionAccessDenied]);

  useEffect(() => {
    // Do not even import/render optional-module pages until licensing state
    // confirms the module is enabled.
    if (!moduleStateReady || moduleAccessDenied || permissionAccessDenied) {
      setComponent(null);
      setError(null);
      return;
    }

    // If already cached, use it immediately
    if (pageCache.has(page)) {
      setComponent(() => pageCache.get(page)!);
      setError(null);
      return;
    }

    // Show loading while importing
    setComponent(null);
    setError(null);

    let cancelled = false;
    const loader = pageLoaders[page] || pageLoaders['dashboard'];
    loader()
      .then(C => {
        if (!cancelled) {
          pageCache.set(page, C);
          setComponent(() => C);
        }
      })
      .catch(err => {
        if (!cancelled) {
          console.error(`[PageSwitcher] Failed to load page "${page}":`, err);
          setError(err instanceof Error ? err.message : 'Failed to load page');
        }
      });

    return () => { cancelled = true; };
  }, [page, moduleStateReady, moduleAccessDenied, permissionAccessDenied]);

  if (!moduleStateReady) return <LoadingSkeleton />;
  if (moduleAccessDenied || permissionAccessDenied) return <LoadingSkeleton />;

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <div className="text-center space-y-3 p-6 max-w-md">
          <div className="h-10 w-10 mx-auto rounded-full bg-red-100 dark:bg-red-950/30 flex items-center justify-center">
            <svg className="h-5 w-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="text-sm font-medium">Page failed to load</p>
          <p className="text-xs text-muted-foreground">This usually happens after an update. Try reloading.</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium rounded-lg transition-colors"
          >
            Reload Page
          </button>
        </div>
      </div>
    );
  }

  if (!Component) return <LoadingSkeleton />;
  return <Component />;
}


// ============================================================================
// MAIN APP SHELL
// ============================================================================

function AppShell() {
  const currentPage = useNavigationStore(s => s.currentPage);
  const sidebarOpen = useNavigationStore(s => s.sidebarOpen);
  const navigate = useNavigationStore((s) => s.navigate);
  const goBack = useNavigationStore((s) => s.goBack);
  const toggleSidebar = useNavigationStore((s) => s.toggleSidebar);
  const setMobileSidebarOpen = useNavigationStore((s) => s.setMobileSidebarOpen);
  const fetchModules = useNavigationStore((s) => s.fetchModules);
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);
  const logout = useAuthStore((s) => s.logout);
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const isAdmin = useAuthStore((s) => s.isAdmin);

  // Track if user has navigated away from dashboard (to show back button)
  const canGoBack = typeof window !== 'undefined' && window.location.hash !== '#/dashboard' && window.location.hash !== '#' && window.location.hash !== '';

  React.useEffect(() => {
    fetchModules();
  }, [fetchModules]);

  // Update document title on navigation
  React.useEffect(() => {
    const title = PAGE_TITLES[currentPage] || 'Dashboard';
    document.title = `${title} — iAssetsPro`;
  }, [currentPage]);

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <GlobalSearch />
      <CommandPalette />
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Bar */}
        <header className="h-14 border-b border-header-border flex items-center px-4 gap-3 shrink-0 bg-header z-10">
          <button
            className="lg:hidden p-2 rounded-lg hover:bg-muted transition-colors"
            onClick={() => setMobileSidebarOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </button>
          {/* Back button — visible on mobile when not on dashboard */}
          {canGoBack && (
            <button
              className="lg:hidden p-2 -ml-1 rounded-lg hover:bg-muted text-muted-foreground transition-colors"
              onClick={goBack}
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
          )}
          <button
            className="hidden lg:flex p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            onClick={toggleSidebar}
          >
            {sidebarOpen ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
          <div className="hidden sm:flex items-center gap-2">
            <h2 className="text-sm font-semibold text-foreground">{PAGE_TITLES[currentPage] || 'Dashboard'}</h2>
            <Separator orientation="vertical" className="h-4 bg-border/60" />
            <span className="text-xs text-muted-foreground">iAssetsPro</span>
          </div>
          <div className="flex-1" />
          {/* Command Palette trigger */}
          <TooltipProvider delayDuration={0}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="hidden sm:flex h-8 w-auto gap-2 px-3 text-muted-foreground hover:text-foreground hover:bg-muted"
                  onClick={() => {
                    if ((window as any).__openCommandPalette) (window as any).__openCommandPalette();
                  }}
                >
                  <Search className="h-3.5 w-3.5" />
                  <span className="text-xs">Navigate...</span>
                  <kbd className="pointer-events-none hidden sm:inline-flex h-5 select-none items-center gap-0.5 rounded border bg-muted/50 px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
                    ⌘⇧K
                  </kbd>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Command Palette (⌘⇧K)</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <div className="flex items-center gap-1">
            {/* Theme Toggle */}
            <TooltipProvider delayDuration={0}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 hover:bg-muted transition-colors"
                    onClick={() => {
                      const current = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
                      document.documentElement.classList.toggle('dark');
                      localStorage.setItem('iassetspro-theme', current === 'dark' ? 'light' : 'dark');
                    }}
                  >
                    <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0 text-muted-foreground" />
                    <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100 text-muted-foreground" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Toggle theme</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <NotificationPopover />
            <Separator orientation="vertical" className="h-6 mx-1 bg-border/40" />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2.5 pl-1 pr-1.5 py-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer">
                  <Avatar className="h-8 w-8 border-2 border-primary/20">
                    <AvatarFallback className="text-xs font-bold bg-primary/10 text-primary">{user ? getInitials(user.fullName) : '?'}</AvatarFallback>
                  </Avatar>
                  <div className="hidden md:block text-left">
                    <p className="text-sm font-medium leading-none">{user?.fullName}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{user?.roles?.[0]?.name || 'User'}</p>
                  </div>
                  <ChevronDown className="h-3.5 w-3 text-muted-foreground hidden md:block" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1.5 pb-1">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <span className="text-sm font-bold text-primary">{user ? getInitials(user.fullName) : '?'}</span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium leading-none">{user?.fullName}</p>
                        <p className="text-xs text-muted-foreground mt-1">{user?.username}</p>
                      </div>
                    </div>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate('dashboard')}><LayoutDashboard className="h-4 w-4 mr-2.5" />Dashboard</DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate('notifications')}><Bell className="h-4 w-4 mr-2.5" />Notifications</DropdownMenuItem>
                <DropdownMenuSeparator />
                {hasPermission('system_settings.view') && (
                  <>
                    <DropdownMenuItem onClick={() => navigate('settings-company')}><Building2 className="h-4 w-4 mr-2.5" />Company Profile</DropdownMenuItem>
                    {isAdmin() && <DropdownMenuItem onClick={() => navigate('settings-audit')}><History className="h-4 w-4 mr-2.5" />Audit Logs</DropdownMenuItem>}
                    <DropdownMenuSeparator />
                  </>
                )}
                <DropdownMenuItem className="text-red-600 focus:text-red-600 focus:bg-red-50 dark:focus:bg-red-950/30" onClick={logout}>
                  <LogOut className="h-4 w-4 mr-2.5" />Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 min-h-0 overflow-y-auto pb-16 lg:pb-0">
          <PageSwitcher page={currentPage} />
        </main>

        {/* Mobile Bottom Navigation */}
        <MobileBottomNav onMenuOpen={() => setMobileSidebarOpen(true)} />
      </div>
    </div>
  );
}

// ============================================================================
// GLOBAL ERROR BOUNDARY — catches ALL errors including .map() crashes
// ============================================================================

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  componentStack: string | null;
  isChunkError: boolean;
}

  // Error message pattern for React #185
  const ERROR_185_PATTERN = /Cannot update a component (?:from within the render function|while rendering a different component)/;

class GlobalErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState & { retryTimer: ReturnType<typeof setTimeout> | null; retryCount: number }
> {
  private _retryTimer: ReturnType<typeof setTimeout> | null = null;
  private _retryCount: number = 0;

  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null, componentStack: null, isChunkError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    const msg = error?.message || '';
    const isChunkError =
      msg.includes('ChunkLoadError') ||
      msg.includes('Failed to load chunk') ||
      msg.includes('Loading chunk') ||
      msg.includes('Loading CSS chunk');

    // CRITICAL: For Error #185, do NOT show the error screen.
    // This error is caused by external store updates (Zustand set()) firing
    // during React's concurrent render phase — it's a timing issue, not a
    // real bug. Returning hasError: false lets React retry the render
    // automatically, which almost always succeeds.
    if (ERROR_185_PATTERN.test(msg)) {
      return { hasError: false, error, componentStack: null, isChunkError: false };
    }

    // Catch ALL other errors
    return { hasError: true, error, componentStack: null, isChunkError };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Log full error details to console and state
    console.error('=== EAM GLOBAL ERROR BOUNDARY ===');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    console.error('Component Stack:', info.componentStack);
    console.error('=== END ERROR ===');
    this.setState({ componentStack: info.componentStack });

    // For Error #185, schedule a silent retry after a short delay.
    // This handles the case where the automatic retry (hasError: false from
    // getDerivedStateFromError) still fails because the Zustand store update
    // hasn't completed yet. We force a re-render after 50ms which almost
    // always succeeds.
    if (ERROR_185_PATTERN.test(error.message)) {
      this._retryCount++;
      console.warn(`[ErrorBoundary] React #185 caught, scheduling silent retry #${this._retryCount}`);

      this._retryTimer = setTimeout(() => {
        this._retryTimer = null;
        // Force a re-render by toggling state
        this.setState((prev) => {
          if (prev.hasError) {
            return { hasError: false, error: null, componentStack: null, isChunkError: false };
          }
          return prev;
        });
      }, 50);
    }
  }

  componentWillUnmount() {
    if (this._retryTimer) {
      clearTimeout(this._retryTimer);
      this._retryTimer = null;
    }
  }

  handleRetry = () => {
    if (this._retryTimer) {
      clearTimeout(this._retryTimer);
      this._retryTimer = null;
    }
    // Always reload for chunk errors — the JS bundle is stale
    if (this.state.isChunkError) {
      window.location.reload();
      return;
    }
    // For runtime errors, try re-rendering
    this.setState({ hasError: false, error: null, componentStack: null, isChunkError: false });
  };

  handleHardRefresh = () => {
    window.location.href = window.location.href.split('?')[0] + '?_t=' + Date.now();
  };

  render() {
    if (this.state.hasError && this.state.error) {
      const isChunk = this.state.isChunkError;
      return (
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center space-y-4 p-6 max-w-lg">
            <div className={`h-12 w-12 mx-auto rounded-full flex items-center justify-center ${isChunk ? 'bg-amber-100 dark:bg-amber-950/30' : 'bg-red-100 dark:bg-red-950/30'}`}>
              <svg className={`h-6 w-6 ${isChunk ? 'text-amber-600' : 'text-red-600'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">{isChunk ? 'Module Loading Error' : 'Runtime Error'}</h3>
              <p className="text-xs text-red-600 font-mono mt-2 p-2 bg-red-50 dark:bg-red-950/20 rounded break-all text-left">
                {this.state.error.message}
              </p>
              {this.state.componentStack && (
                <pre className="text-[10px] text-muted-foreground mt-2 p-2 bg-muted rounded overflow-auto max-h-32 text-left whitespace-pre-wrap">
                  {this.state.componentStack}
                </pre>
              )}
            </div>
            <div className="flex gap-2 justify-center">
              <button
                onClick={this.handleRetry}
                className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-colors"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Retry
              </button>
              <button
                onClick={this.handleHardRefresh}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
              >
                Hard Refresh
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ============================================================================
// ROOT PAGE COMPONENT
// ============================================================================

export default function EAMApp() {
  return (
    <GlobalErrorBoundary>
      <AppShell />
    </GlobalErrorBoundary>
  );
}
