import type { PageName } from '@/types';

export interface PageAccessRule {
  permissions: string[];
  modules: string[];
  adminOnly?: boolean;
}

const CORE_ALWAYS_AVAILABLE = new Set(['core', 'modules']);

export function isModuleAvailable(enabledModules: Set<string> | null, moduleCode: string): boolean {
  const code = moduleCode.toLowerCase();
  if (CORE_ALWAYS_AVAILABLE.has(code)) return true;
  if (!enabledModules) return false;
  return enabledModules.has(code);
}

export const PAGE_ACCESS_RULES: Record<PageName, PageAccessRule> = {
  // Core
  dashboard: { permissions: ['dashboard.view'], modules: ['core'] },
  chat: { permissions: ['chat.view'], modules: ['core'] },
  notifications: { permissions: ['notifications.view'], modules: ['core'] },

  // Assets
  'asset-categories': { permissions: ['assets.view'], modules: ['assets'] },
  'assets-machines': { permissions: ['assets.view'], modules: ['assets'] },
  'assets-hierarchy': { permissions: ['assets.view'], modules: ['assets'] },
  'assets-bom': { permissions: ['bom.view'], modules: ['assets', 'bom'] },
  'assets-condition-monitoring': { permissions: ['condition_monitoring.view'], modules: ['assets', 'condition_monitoring'] },
  'assets-digital-twin': { permissions: ['digital_twin.view'], modules: ['assets', 'digital_twin'] },
  'digital-twin-viewer': { permissions: ['digital_twin.view'], modules: ['assets', 'digital_twin'] },
  'system-diagrams': { permissions: ['digital_twin.view'], modules: ['assets', 'digital_twin'] },
  'assets-health': { permissions: ['asset_health.view'], modules: ['assets'] },
  assets: { permissions: ['assets.view'], modules: ['assets'] },
  'asset-detail': { permissions: ['assets.view'], modules: ['assets'] },

  // AI / platform
  'ai-hub': { permissions: ['assets.view'], modules: ['assets'] },
  'ai-config': { permissions: ['system_settings.view'], modules: ['modules'], adminOnly: true },
  'ai-history': { permissions: ['assets.view'], modules: ['assets'] },

  // Corrective / repairs maintenance
  'maintenance-work-orders': { permissions: ['work_orders.view', 'work_orders.view_own'], modules: ['work_orders'] },
  'wo-detail': { permissions: ['work_orders.view', 'work_orders.view_own'], modules: ['work_orders'] },
  'maintenance-requests': { permissions: ['maintenance_requests.view', 'maintenance_requests.view_own'], modules: ['maintenance_requests'] },
  'mr-detail': { permissions: ['maintenance_requests.view', 'maintenance_requests.view_own'], modules: ['maintenance_requests'] },
  'create-mr': { permissions: ['maintenance_requests.create'], modules: ['maintenance_requests'] },
  'maintenance-dashboard': { permissions: ['work_orders.view', 'work_orders.view_own'], modules: ['work_orders'] },
  'maintenance-analytics': { permissions: ['work_orders.view', 'work_orders.view_own'], modules: ['work_orders'] },
  'maintenance-calibration': { permissions: ['calibration.view'], modules: ['calibration'] },
  'maintenance-risk-assessment': { permissions: ['work_orders.view', 'work_orders.view_own'], modules: ['risk_assessment'] },
  'maintenance-tools': { permissions: ['tools.view'], modules: ['tools'] },
  'planner-workbench': { permissions: ['work_orders.view', 'work_orders.view_own'], modules: ['work_orders'] },
  'enterprise-reports': { permissions: ['reports.view'], modules: ['reports'] },

  // Preventive maintenance — intentionally separate from repairs maintenance
  'pm-schedules': { permissions: ['pm_schedules.view'], modules: ['pm_schedules'] },
  'pm-templates': { permissions: ['pm_templates.view'], modules: ['pm_schedules'] },
  'pm-triggers': { permissions: ['pm_triggers.view'], modules: ['pm_schedules'] },
  'pm-calendar': { permissions: ['pm_schedules.view'], modules: ['pm_schedules'] },

  // Repairs execution resources
  'repairs-material-requests': { permissions: ['repair_material_requests.view', 'repair_material_requests.view_all', 'repair_material_requests.view_own'], modules: ['repairs'] },
  'repairs-tool-requests': { permissions: ['repair_tool_requests.view', 'repair_tool_requests.view_all', 'repair_tool_requests.view_own'], modules: ['repairs'] },
  'repairs-tool-transfers': { permissions: ['repair_tool_transfers.view', 'repair_tool_transfers.view_all', 'repair_tool_transfers.view_own'], modules: ['repairs'] },
  'repairs-downtime': { permissions: ['work_orders.view', 'work_orders.view_own'], modules: ['repairs'] },
  'repairs-completion': { permissions: ['work_orders.view', 'work_orders.view_own'], modules: ['repairs'] },
  'repairs-analytics': { permissions: ['work_orders.view', 'work_orders.view_own'], modules: ['repairs'] },
  'repairs-spare-part-returns': { permissions: ['spare_part_returns.view', 'spare_part_returns.view_all', 'spare_part_returns.view_own'], modules: ['repairs'] },
  'repairs-damaged-tools': { permissions: ['damaged_tool_reports.view', 'damaged_tool_reports.view_all'], modules: ['repairs'] },
  'repairs-reports': { permissions: ['reports.view', 'work_orders.view'], modules: ['repairs', 'reports'] },
  'wo-reports': { permissions: ['reports.view', 'work_orders.view', 'work_orders.view_own'], modules: ['work_orders', 'reports'] },
  'technician-timesheet': { permissions: ['time_logs.view', 'time_logs.create', 'work_orders.view', 'work_orders.view_own'], modules: ['repairs', 'work_orders'] },

  // IoT / connectivity
  'iot-devices': { permissions: ['iot_devices.view'], modules: ['iot_sensors'] },
  'iot-monitoring': { permissions: ['iot_monitoring.view'], modules: ['iot_sensors'] },
  'iot-rules': { permissions: ['iot_rules.view'], modules: ['iot_sensors'] },
  connectivity: { permissions: ['iot.view'], modules: ['iot_sensors'] },

  // Analytics
  'analytics-kpi': { permissions: ['analytics.view'], modules: ['analytics', 'kpi_dashboard'] },
  'analytics-oee': { permissions: ['oee.view'], modules: ['analytics', 'oee'] },
  'analytics-downtime': { permissions: ['downtime.view'], modules: ['analytics', 'downtime'] },
  'analytics-energy': { permissions: ['energy.view'], modules: ['analytics', 'energy'] },
  analytics: { permissions: ['analytics.view'], modules: ['analytics'] },

  // Operations
  'operations-meter-readings': { permissions: ['meters.view'], modules: ['meter_readings'] },
  'operations-training': { permissions: ['training.view'], modules: ['training'] },
  'operations-surveys': { permissions: ['production_surveys.view'], modules: ['production'] },
  'operations-time-logs': { permissions: ['time_logs.view'], modules: ['work_orders'] },
  'operations-shift-handover': { permissions: ['shift_handovers.view'], modules: ['shift_management'] },
  'operations-checklists': { permissions: ['work_orders.view'], modules: ['work_orders'] },

  // Production
  'production-work-centers': { permissions: ['work_centers.view'], modules: ['production'] },
  'production-resource-planning': { permissions: ['production.view'], modules: ['production'] },
  'production-scheduling': { permissions: ['production.view'], modules: ['production'] },
  'production-capacity': { permissions: ['production.view'], modules: ['production'] },
  'production-efficiency': { permissions: ['production.view'], modules: ['production'] },
  'production-bottlenecks': { permissions: ['production.view'], modules: ['production'] },
  'production-orders': { permissions: ['production.view'], modules: ['production'] },
  'production-batches': { permissions: ['production_batches.view'], modules: ['production'] },

  // Quality
  'quality-inspections': { permissions: ['quality_inspections.view'], modules: ['quality'] },
  'quality-ncr': { permissions: ['quality_ncr.view'], modules: ['quality'] },
  'quality-audits': { permissions: ['quality_audits.view'], modules: ['quality'] },
  'quality-control-plans': { permissions: ['quality_control_plans.view'], modules: ['quality'] },
  'quality-spc': { permissions: ['spc.view'], modules: ['quality'] },
  'quality-capa': { permissions: ['quality_ncr.view'], modules: ['quality', 'capa'] },

  // Safety
  'safety-incidents': { permissions: ['safety_incidents.view'], modules: ['safety'] },
  'safety-inspections': { permissions: ['safety_inspections.view'], modules: ['safety'] },
  'safety-training': { permissions: ['training.view'], modules: ['safety', 'training'] },
  'safety-equipment': { permissions: ['safety_equipment.view'], modules: ['safety'] },
  'safety-permits': { permissions: ['safety_permits.view'], modules: ['safety'] },

  // Inventory
  'inventory-items': { permissions: ['inventory.view'], modules: ['inventory'] },
  'inventory-categories': { permissions: ['parts_categories.view'], modules: ['inventory'] },
  'inventory-locations': { permissions: ['inventory_locations.view'], modules: ['inventory'] },
  'inventory-transactions': { permissions: ['stock_transactions.view'], modules: ['inventory'] },
  'inventory-adjustments': { permissions: ['inventory_adjustments.view'], modules: ['inventory'] },
  'inventory-requests': { permissions: ['material_requisitions.view'], modules: ['inventory'] },
  'inventory-transfers': { permissions: ['inventory_transfers.view'], modules: ['inventory'] },
  'inventory-suppliers': { permissions: ['vendors.view'], modules: ['inventory', 'vendors'] },
  'inventory-purchase-orders': { permissions: ['purchase_orders.view'], modules: ['inventory'] },
  'inventory-receiving': { permissions: ['purchase_orders.view'], modules: ['inventory'] },
  inventory: { permissions: ['inventory.view'], modules: ['inventory'] },

  // Reports
  'reports-asset': { permissions: ['reports.view'], modules: ['reports', 'assets'] },
  'machine-availability': { permissions: ['reports.view'], modules: ['reports', 'assets'] },
  'equipment-history': { permissions: ['reports.view'], modules: ['reports', 'assets'] },
  'failure-analysis': { permissions: ['reports.view'], modules: ['reports', 'failure_analysis'] },
  'reports-maintenance': { permissions: ['reports.view'], modules: ['reports', 'work_orders'] },
  'reports-inventory': { permissions: ['reports.view'], modules: ['reports', 'inventory'] },
  'reports-production': { permissions: ['reports.view'], modules: ['reports', 'production'] },
  'reports-quality': { permissions: ['reports.view'], modules: ['reports', 'quality'] },
  'reports-safety': { permissions: ['reports.view'], modules: ['reports', 'safety'] },
  'reports-financial': { permissions: ['reports.view'], modules: ['reports'] },
  'reports-custom': { permissions: ['reports.view'], modules: ['reports'] },

  // Settings / platform administration
  'settings-general': { permissions: ['system_settings.view'], modules: ['modules'], adminOnly: true },
  'settings-users': { permissions: ['users.manage'], modules: ['modules'], adminOnly: true },
  'settings-roles': { permissions: ['roles.manage'], modules: ['modules'], adminOnly: true },
  'settings-modules': { permissions: ['system_settings.view'], modules: ['modules'], adminOnly: true },
  'settings-company': { permissions: ['system_settings.view'], modules: ['modules'], adminOnly: true },
  'settings-plants': { permissions: ['plants.manage'], modules: ['modules'], adminOnly: true },
  'settings-departments': { permissions: ['departments.manage'], modules: ['modules'], adminOnly: true },
  'settings-notifications': { permissions: ['system_settings.view'], modules: ['modules'], adminOnly: true },
  'settings-integrations': { permissions: ['system_settings.view'], modules: ['modules'], adminOnly: true },
  'settings-backup': { permissions: ['system_settings.view'], modules: ['modules'], adminOnly: true },
  'settings-audit': { permissions: ['audit_logs.view'], modules: ['modules'], adminOnly: true },
  'settings-security': { permissions: ['system_settings.view'], modules: ['modules'], adminOnly: true },
  'settings-health': { permissions: ['system_settings.view'], modules: ['modules'], adminOnly: true },
  'settings-queues': { permissions: ['system_settings.view'], modules: ['modules'], adminOnly: true },
  'settings-preferences': { permissions: ['dashboard.view'], modules: ['core'] },

  // Engineering / observability
  'reliability-engineering': { permissions: ['digital_twin.view'], modules: ['digital_twin'] },
  'observability-dashboard': { permissions: ['system_settings.view'], modules: ['modules'], adminOnly: true },
  'historian-dashboard': { permissions: ['system_settings.view'], modules: ['modules'], adminOnly: true },
};

export function canAccessPage(
  page: PageName,
  options: {
    permissions: string[];
    isAdmin: boolean;
    enabledModules: Set<string> | null;
  },
): boolean {
  const rule = PAGE_ACCESS_RULES[page];
  if (!rule) return false;

  if (!rule.modules.every(code => isModuleAvailable(options.enabledModules, code))) {
    return false;
  }

  if (rule.adminOnly && !options.isAdmin) {
    return false;
  }

  if (options.isAdmin) {
    return true;
  }

  return rule.permissions.some(permission => options.permissions.includes(permission));
}

export function getPageRequiredModules(page: PageName): string[] {
  return PAGE_ACCESS_RULES[page]?.modules ?? [];
}
