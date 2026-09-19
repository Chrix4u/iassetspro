import type { PageName } from '@/types';

export interface PageAccessRule {
  permissions?: string[];
  modules?: string[];
  adminOnly?: boolean;
}

/**
 * Single client-side visibility policy for navigation, direct page routing,
 * mobile navigation and command-palette entries.
 *
 * Permission lists use ANY semantics. Module lists use ALL semantics.
 * Backend authorization remains authoritative; this policy prevents users from
 * seeing UI affordances that the backend would reject.
 */
export const PAGE_ACCESS: Record<string, PageAccessRule> = {
  // Core
  dashboard: { permissions: ['dashboard.view'], modules: ['core'] },
  chat: { permissions: ['chat.view'], modules: ['core'] },
  notifications: { permissions: ['notifications.view'], modules: ['core'] },

  // Assets
  'asset-categories': { permissions: ['assets.view'], modules: ['assets'] },
  'assets-machines': { permissions: ['assets.view', 'assets.view_all', 'assets.view_own'], modules: ['assets'] },
  'assets-hierarchy': { permissions: ['assets.view'], modules: ['assets'] },
  'assets-bom': { permissions: ['bom.view'], modules: ['assets', 'bom'] },
  'assets-condition-monitoring': { permissions: ['condition_monitoring.view'], modules: ['assets', 'condition_monitoring'] },
  'assets-digital-twin': { permissions: ['digital_twin.view'], modules: ['digital_twin'] },
  'digital-twin-viewer': { permissions: ['digital_twin.view'], modules: ['digital_twin'] },
  'system-diagrams': { permissions: ['digital_twin.view'], modules: ['digital_twin'] },
  'assets-health': { permissions: ['asset_health.view', 'assets.health', 'assets.view'], modules: ['assets'] },

  // AI / asset intelligence
  'ai-hub': { permissions: ['assets.view'], modules: ['assets'] },
  'ai-config': { permissions: ['system_settings.view'], modules: ['assets'], adminOnly: true },
  'ai-history': { permissions: ['assets.view'], modules: ['assets'] },

  // Corrective / repairs maintenance
  'maintenance-work-orders': { permissions: ['work_orders.view', 'work_orders.view_all', 'work_orders.view_own'], modules: ['work_orders'] },
  'wo-detail': { permissions: ['work_orders.view', 'work_orders.view_all', 'work_orders.view_own'], modules: ['work_orders'] },
  'maintenance-requests': { permissions: ['maintenance_requests.view', 'maintenance_requests.view_all', 'maintenance_requests.view_own'], modules: ['maintenance_requests'] },
  'mr-detail': { permissions: ['maintenance_requests.view', 'maintenance_requests.view_all', 'maintenance_requests.view_own'], modules: ['maintenance_requests'] },
  'create-mr': { permissions: ['maintenance_requests.create'], modules: ['maintenance_requests'] },
  'maintenance-dashboard': { permissions: ['work_orders.view', 'work_orders.view_all', 'work_orders.view_own'], modules: ['work_orders'] },
  'maintenance-analytics': { permissions: ['work_orders.view', 'work_orders.view_all', 'work_orders.view_own'], modules: ['work_orders'] },
  'maintenance-risk-assessment': { permissions: ['risk_assessments.view'], modules: ['risk_assessment'] },
  'maintenance-tools': { permissions: ['tools.view'], modules: ['tools'] },

  // Preventive Maintenance — deliberately separate from Repairs
  'pm-schedules': { permissions: ['pm_schedules.view'], modules: ['pm_schedules'] },
  'pm-templates': { permissions: ['pm_templates.view'], modules: ['pm_schedules'] },
  'pm-triggers': { permissions: ['pm_triggers.view'], modules: ['pm_schedules'] },
  'pm-calendar': { permissions: ['pm_schedules.view'], modules: ['pm_schedules'] },
  'maintenance-calibration': { permissions: ['calibration.view'], modules: ['calibration'] },

  // Planning
  'planner-workbench': { permissions: ['work_orders.view', 'work_orders.view_all'], modules: ['work_orders'] },
  'enterprise-reports': { permissions: ['reports.view'], modules: ['reports'] },

  // Repairs resources
  'repairs-material-requests': { permissions: ['repair_material_requests.view', 'repair_material_requests.view_all', 'repair_material_requests.view_own'], modules: ['repairs'] },
  'repairs-tool-requests': { permissions: ['repair_tool_requests.view', 'repair_tool_requests.view_all', 'repair_tool_requests.view_own'], modules: ['repairs'] },
  'repairs-tool-transfers': { permissions: ['repair_tool_transfers.view', 'repair_tool_transfers.view_all', 'repair_tool_transfers.view_own'], modules: ['repairs'] },
  'repairs-downtime': { permissions: ['work_orders.view', 'work_orders.view_own'], modules: ['repairs', 'downtime'] },
  'repairs-completion': { permissions: ['work_orders.view', 'work_orders.view_own'], modules: ['repairs'] },
  'technician-timesheet': { permissions: ['time_logs.view', 'time_logs.create'], modules: ['repairs'] },
  'repairs-spare-part-returns': { permissions: ['spare_part_returns.view', 'spare_part_returns.view_all', 'spare_part_returns.view_own'], modules: ['repairs'] },
  'repairs-damaged-tools': { permissions: ['damaged_tool_reports.view', 'damaged_tool_reports.view_all', 'damaged_tool_reports.create'], modules: ['repairs'] },
  'repairs-analytics': { permissions: ['work_orders.view', 'work_orders.view_own'], modules: ['repairs'] },
  'repairs-reports': { permissions: ['reports.view'], modules: ['repairs', 'reports'] },
  'repairs-detail-report': { permissions: ['reports.view', 'work_orders.view', 'work_orders.view_own'], modules: ['repairs', 'reports'] },
  'wo-reports': { permissions: ['reports.view'], modules: ['reports', 'work_orders'] },

  // IoT / reliability
  'iot-devices': { permissions: ['iot_devices.view'], modules: ['iot_sensors'] },
  'iot-monitoring': { permissions: ['iot_monitoring.view'], modules: ['iot_sensors'] },
  'iot-rules': { permissions: ['iot_rules.view'], modules: ['iot_sensors'] },
  connectivity: { permissions: ['iot.view'], modules: ['iot_sensors'] },
  'reliability-engineering': { permissions: ['digital_twin.view'], modules: ['digital_twin'] },

  // Analytics
  'analytics-kpi': { permissions: ['analytics.view'], modules: ['kpi_dashboard'] },
  'analytics-oee': { permissions: ['oee.view'], modules: ['oee'] },
  'analytics-downtime': { permissions: ['downtime.view'], modules: ['downtime'] },
  'analytics-energy': { permissions: ['energy.view'], modules: ['energy'] },

  // Operations
  'operations-meter-readings': { permissions: ['meters.view'], modules: ['meter_readings'] },
  'operations-training': { permissions: ['training.view'], modules: ['training'] },
  'operations-surveys': { permissions: ['production_surveys.view'], modules: ['production'] },
  'operations-time-logs': { permissions: ['time_logs.view'], modules: ['work_orders'] },
  'operations-shift-handover': { permissions: ['shift_handovers.view'], modules: ['shift_management'] },
  'operations-checklists': { permissions: ['work_orders.view', 'work_orders.view_own'], modules: ['work_orders'] },

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
  'safety-training': { permissions: ['training.view'], modules: ['safety'] },
  'safety-equipment': { permissions: ['safety_equipment.view'], modules: ['safety'] },
  'safety-permits': { permissions: ['safety_permits.view'], modules: ['safety'] },

  // Inventory. inventory.view alone intentionally does NOT grant the full item browser:
  // repair technicians keep request-catalog lookup without gaining inventory navigation.
  'inventory-items': { permissions: ['inventory.view_all', 'inventory.manage', 'inventory.stock_in', 'inventory.stock_out', 'inventory.update'], modules: ['inventory'] },
  'inventory-categories': { permissions: ['parts_categories.view'], modules: ['inventory'] },
  'inventory-locations': { permissions: ['inventory_locations.view'], modules: ['inventory'] },
  'inventory-transactions': { permissions: ['stock_transactions.view'], modules: ['inventory'] },
  'inventory-adjustments': { permissions: ['inventory_adjustments.view'], modules: ['inventory'] },
  'inventory-requests': { permissions: ['material_requisitions.view'], modules: ['inventory'] },
  'inventory-transfers': { permissions: ['inventory_transfers.view'], modules: ['inventory'] },
  'inventory-suppliers': { permissions: ['vendors.view'], modules: ['inventory'] },
  'inventory-purchase-orders': { permissions: ['purchase_orders.view'], modules: ['inventory'] },
  'inventory-receiving': { permissions: ['purchase_orders.view', 'purchase_orders.receive'], modules: ['inventory'] },

  // Reports
  'reports-asset': { permissions: ['reports.view'], modules: ['reports', 'assets'] },
  'equipment-history': { permissions: ['reports.view'], modules: ['reports', 'assets'] },
  'machine-availability': { permissions: ['reports.view'], modules: ['reports', 'assets'] },
  'failure-analysis': { permissions: ['reports.view'], modules: ['reports', 'failure_analysis'] },
  'reports-maintenance': { permissions: ['reports.view'], modules: ['reports', 'work_orders'] },
  'reports-inventory': { permissions: ['reports.view'], modules: ['reports', 'inventory'] },
  'reports-production': { permissions: ['reports.view'], modules: ['reports', 'production'] },
  'reports-quality': { permissions: ['reports.view'], modules: ['reports', 'quality'] },
  'reports-safety': { permissions: ['reports.view'], modules: ['reports', 'safety'] },
  'reports-financial': { permissions: ['reports.view'], modules: ['reports'] },
  'reports-custom': { permissions: ['reports.view'], modules: ['reports'] },

  // Settings
  'settings-general': { permissions: ['system_settings.view'], modules: ['core'], adminOnly: true },
  'settings-users': { permissions: ['users.manage'], modules: ['core'], adminOnly: true },
  'settings-roles': { permissions: ['roles.manage'], modules: ['core'], adminOnly: true },
  'settings-modules': { permissions: ['modules.view', 'modules.manage'], modules: ['core'], adminOnly: true },
  'settings-company': { permissions: ['company.view', 'system_settings.view'], modules: ['core'], adminOnly: true },
  'settings-plants': { permissions: ['plants.manage'], modules: ['core'], adminOnly: true },
  'settings-departments': { permissions: ['departments.manage'], modules: ['core'], adminOnly: true },
  'settings-notifications': { permissions: ['system_settings.view'], modules: ['core'], adminOnly: true },
  'settings-integrations': { permissions: ['system_settings.view'], modules: ['core'], adminOnly: true },
  'settings-backup': { permissions: ['system_settings.view'], modules: ['core'], adminOnly: true },
  'settings-audit': { permissions: ['audit_logs.view'], modules: ['core'], adminOnly: true },
  'settings-security': { permissions: ['system_settings.view'], modules: ['core'], adminOnly: true },
  'settings-health': { permissions: ['system_settings.view'], modules: ['core'], adminOnly: true },
  'settings-queues': { permissions: ['system_settings.view'], modules: ['core'], adminOnly: true },
  'settings-preferences': { modules: ['core'] },
  'observability-dashboard': { permissions: ['system_settings.view'], modules: ['core'], adminOnly: true },
  'historian-dashboard': { permissions: ['system_settings.view'], modules: ['core'], adminOnly: true },

  // Legacy aliases
  assets: { permissions: ['assets.view'], modules: ['assets'] },
  'asset-detail': { permissions: ['assets.view'], modules: ['assets'] },
  inventory: { permissions: ['inventory.view_all', 'inventory.manage', 'inventory.stock_in', 'inventory.stock_out', 'inventory.update'], modules: ['inventory'] },
  analytics: { permissions: ['analytics.view'], modules: ['analytics'] },
};

export interface PageAccessContext {
  hasPermission: (slug: string) => boolean;
  isAdmin: () => boolean;
  enabledModules: Set<string> | null;
}

export function isModuleAvailable(moduleCode: string, enabledModules: Set<string> | null): boolean {
  const code = moduleCode.toLowerCase();
  if (code === 'core') return true;
  // Fail closed while module state is unknown.
  return enabledModules !== null && enabledModules.has(code);
}

export function canAccessPage(page: PageName | string, context: PageAccessContext): boolean {
  const rule = PAGE_ACCESS[page];
  if (!rule) return false;

  if (rule.adminOnly && !context.isAdmin()) return false;

  if (!context.isAdmin() && rule.permissions && rule.permissions.length > 0) {
    if (!rule.permissions.some((permission) => context.hasPermission(permission))) return false;
  }

  if (rule.modules && rule.modules.length > 0) {
    if (!rule.modules.every((moduleCode) => isModuleAvailable(moduleCode, context.enabledModules))) return false;
  }

  return true;
}
