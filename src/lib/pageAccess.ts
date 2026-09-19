import type { PageName } from '@/types';

export interface PageAccessRule {
  permissions?: string[];
  moduleCode?: string;
  adminOnly?: boolean;
}

export type PermissionChecker = (slug: string) => boolean;

/**
 * Single source of truth for navigation/page access.
 *
 * - permissions are OR'ed: any listed permission grants the page.
 * - moduleCode is always enforced, including for administrators.
 * - non-core modules fail closed while module state is loading.
 */
export const PAGE_ACCESS: Partial<Record<PageName, PageAccessRule>> = {
  // Core
  dashboard: { permissions: ['dashboard.view'], moduleCode: 'core' },
  chat: { permissions: ['chat.view'], moduleCode: 'core' },
  notifications: { permissions: ['notifications.view'], moduleCode: 'notifications' },

  // Assets
  'asset-categories': { permissions: ['assets.view'], moduleCode: 'assets' },
  'assets-machines': { permissions: ['assets.view'], moduleCode: 'assets' },
  'assets-hierarchy': { permissions: ['assets.view'], moduleCode: 'assets' },
  'assets-bom': { permissions: ['bom.view'], moduleCode: 'bom' },
  'assets-condition-monitoring': { permissions: ['condition_monitoring.view'], moduleCode: 'condition_monitoring' },
  'assets-digital-twin': { permissions: ['digital_twin.view'], moduleCode: 'digital_twin' },
  'digital-twin-viewer': { permissions: ['digital_twin.view'], moduleCode: 'digital_twin' },
  'system-diagrams': { permissions: ['digital_twin.view'], moduleCode: 'digital_twin' },
  'assets-health': { permissions: ['asset_health.view', 'assets.health'], moduleCode: 'assets' },
  assets: { permissions: ['assets.view'], moduleCode: 'assets' },
  'asset-detail': { permissions: ['assets.view'], moduleCode: 'assets' },

  // AI / asset intelligence
  'ai-hub': { permissions: ['assets.create'], moduleCode: 'assets' },
  'ai-config': { permissions: ['system_settings.view'], moduleCode: 'core', adminOnly: true },
  'ai-history': { permissions: ['assets.create'], moduleCode: 'assets' },

  // Repairs maintenance core workflow
  'maintenance-work-orders': { permissions: ['work_orders.view', 'work_orders.view_own'], moduleCode: 'work_orders' },
  'wo-detail': { permissions: ['work_orders.view', 'work_orders.view_own'], moduleCode: 'work_orders' },
  'maintenance-requests': { permissions: ['maintenance_requests.view', 'maintenance_requests.view_own'], moduleCode: 'maintenance_requests' },
  'mr-detail': { permissions: ['maintenance_requests.view', 'maintenance_requests.view_own'], moduleCode: 'maintenance_requests' },
  'create-mr': { permissions: ['maintenance_requests.create'], moduleCode: 'maintenance_requests' },
  'maintenance-dashboard': { permissions: ['work_orders.view', 'work_orders.view_own'], moduleCode: 'work_orders' },
  'maintenance-analytics': { permissions: ['work_orders.view', 'work_orders.view_own'], moduleCode: 'work_orders' },
  'maintenance-risk-assessment': { permissions: ['risk_assessment.view'], moduleCode: 'risk_assessment' },
  'maintenance-tools': { permissions: ['tools.view'], moduleCode: 'tools' },

  // Preventive maintenance — deliberately separate from Repairs
  'pm-schedules': { permissions: ['pm_schedules.view'], moduleCode: 'pm_schedules' },
  'pm-templates': { permissions: ['pm_templates.view'], moduleCode: 'pm_schedules' },
  'pm-triggers': { permissions: ['pm_triggers.view'], moduleCode: 'pm_schedules' },
  'pm-calendar': { permissions: ['pm_schedules.view'], moduleCode: 'pm_schedules' },
  'maintenance-calibration': { permissions: ['calibration.view'], moduleCode: 'calibration' },

  // Planner
  'planner-workbench': { permissions: ['work_orders.view', 'work_orders.view_own'], moduleCode: 'work_orders' },
  'enterprise-reports': { permissions: ['reports.view'], moduleCode: 'reports' },

  // Repairs execution/custody
  'repairs-material-requests': { permissions: ['repair_material_requests.view', 'repair_material_requests.view_all', 'repair_material_requests.view_own'], moduleCode: 'repairs' },
  'repairs-tool-requests': { permissions: ['repair_tool_requests.view', 'repair_tool_requests.view_all', 'repair_tool_requests.view_own'], moduleCode: 'repairs' },
  'repairs-tool-transfers': { permissions: ['repair_tool_transfers.view', 'repair_tool_transfers.view_all', 'repair_tool_transfers.view_own'], moduleCode: 'repairs' },
  'repairs-downtime': { permissions: ['work_orders.view', 'work_orders.view_own'], moduleCode: 'repairs' },
  'repairs-completion': { permissions: ['work_orders.view', 'work_orders.view_own'], moduleCode: 'repairs' },
  'repairs-spare-part-returns': { permissions: ['spare_part_returns.view', 'spare_part_returns.view_all', 'spare_part_returns.view_own'], moduleCode: 'repairs' },
  'repairs-damaged-tools': { permissions: ['damaged_tool_reports.view', 'damaged_tool_reports.view_all', 'damaged_tool_reports.create'], moduleCode: 'repairs' },
  'repairs-analytics': { permissions: ['work_orders.view', 'work_orders.view_own'], moduleCode: 'repairs' },
  'repairs-reports': { permissions: ['reports.view'], moduleCode: 'repairs' },
  'repairs-detail-report': { permissions: ['reports.view', 'work_orders.view'], moduleCode: 'repairs' },
  'wo-reports': { permissions: ['reports.view', 'work_orders.view', 'work_orders.view_own'], moduleCode: 'reports' },
  'technician-timesheet': { permissions: ['time_logs.view', 'time_logs.create'], moduleCode: 'repairs' },

  // IoT / reliability
  'iot-devices': { permissions: ['iot_devices.view'], moduleCode: 'iot_sensors' },
  'iot-monitoring': { permissions: ['iot_monitoring.view'], moduleCode: 'iot_sensors' },
  'iot-rules': { permissions: ['iot_rules.view'], moduleCode: 'iot_sensors' },
  connectivity: { permissions: ['iot.view'], moduleCode: 'iot_sensors' },
  'reliability-engineering': { permissions: ['digital_twin.view'], moduleCode: 'digital_twin' },

  // Analytics
  'analytics-kpi': { permissions: ['analytics.view'], moduleCode: 'analytics' },
  'analytics-oee': { permissions: ['oee.view'], moduleCode: 'oee' },
  'analytics-downtime': { permissions: ['downtime.view'], moduleCode: 'downtime' },
  'analytics-energy': { permissions: ['energy.view'], moduleCode: 'energy' },
  analytics: { permissions: ['analytics.view'], moduleCode: 'analytics' },

  // Operations
  'operations-meter-readings': { permissions: ['meters.view'], moduleCode: 'meter_readings' },
  'operations-training': { permissions: ['training.view'], moduleCode: 'training' },
  'operations-surveys': { permissions: ['production_surveys.view'], moduleCode: 'production' },
  'operations-time-logs': { permissions: ['time_logs.view'], moduleCode: 'work_orders' },
  'operations-shift-handover': { permissions: ['shift_handovers.view'], moduleCode: 'shift_management' },
  'operations-checklists': { permissions: ['work_orders.view', 'work_orders.view_own'], moduleCode: 'work_orders' },

  // Production
  'production-work-centers': { permissions: ['work_centers.view'], moduleCode: 'production' },
  'production-resource-planning': { permissions: ['production.view'], moduleCode: 'production' },
  'production-scheduling': { permissions: ['production.view'], moduleCode: 'production' },
  'production-capacity': { permissions: ['production.view'], moduleCode: 'production' },
  'production-efficiency': { permissions: ['production.view'], moduleCode: 'production' },
  'production-bottlenecks': { permissions: ['production.view'], moduleCode: 'production' },
  'production-orders': { permissions: ['production.view'], moduleCode: 'production' },
  'production-batches': { permissions: ['production_batches.view'], moduleCode: 'production' },

  // Quality
  'quality-inspections': { permissions: ['quality_inspections.view'], moduleCode: 'quality' },
  'quality-ncr': { permissions: ['quality_ncr.view'], moduleCode: 'quality' },
  'quality-audits': { permissions: ['quality_audits.view'], moduleCode: 'quality' },
  'quality-control-plans': { permissions: ['quality_control_plans.view'], moduleCode: 'quality' },
  'quality-spc': { permissions: ['spc.view'], moduleCode: 'quality' },
  'quality-capa': { permissions: ['quality_ncr.view'], moduleCode: 'capa' },

  // Safety
  'safety-incidents': { permissions: ['safety_incidents.view'], moduleCode: 'safety' },
  'safety-inspections': { permissions: ['safety_inspections.view'], moduleCode: 'safety' },
  'safety-training': { permissions: ['training.view'], moduleCode: 'safety' },
  'safety-equipment': { permissions: ['safety_equipment.view'], moduleCode: 'safety' },
  'safety-permits': { permissions: ['safety_permits.view'], moduleCode: 'safety' },

  // Inventory.
  // IMPORTANT: inventory.view is intentionally NOT enough to browse the Inventory
  // module. Technicians keep inventory.view for request-time stock lookup only.
  'inventory-items': {
    permissions: ['inventory.view_all', 'inventory.manage', 'inventory.update', 'inventory.stock_in', 'inventory.stock_out', 'inventory.reserve', 'inventory.consume', 'inventory.forecast'],
    moduleCode: 'inventory',
  },
  'inventory-categories': { permissions: ['parts_categories.view', 'categories.view'], moduleCode: 'inventory' },
  'inventory-locations': { permissions: ['inventory_locations.view'], moduleCode: 'inventory' },
  'inventory-transactions': { permissions: ['stock_transactions.view'], moduleCode: 'inventory' },
  'inventory-adjustments': { permissions: ['inventory_adjustments.view'], moduleCode: 'inventory' },
  'inventory-requests': { permissions: ['material_requisitions.view'], moduleCode: 'inventory' },
  'inventory-transfers': { permissions: ['inventory_transfers.view'], moduleCode: 'inventory' },
  'inventory-suppliers': { permissions: ['vendors.view'], moduleCode: 'vendors' },
  'inventory-purchase-orders': { permissions: ['purchase_orders.view'], moduleCode: 'inventory' },
  'inventory-receiving': { permissions: ['purchase_orders.receive', 'purchase_orders.view'], moduleCode: 'inventory' },
  inventory: {
    permissions: ['inventory.view_all', 'inventory.manage', 'inventory.update', 'inventory.stock_in', 'inventory.stock_out', 'inventory.reserve', 'inventory.consume', 'inventory.forecast'],
    moduleCode: 'inventory',
  },

  // Reports
  'reports-asset': { permissions: ['reports.view'], moduleCode: 'reports' },
  'equipment-history': { permissions: ['reports.view'], moduleCode: 'reports' },
  'machine-availability': { permissions: ['reports.view'], moduleCode: 'reports' },
  'failure-analysis': { permissions: ['reports.view'], moduleCode: 'failure_analysis' },
  'reports-maintenance': { permissions: ['reports.view'], moduleCode: 'reports' },
  'reports-inventory': { permissions: ['reports.view'], moduleCode: 'reports' },
  'reports-production': { permissions: ['reports.view'], moduleCode: 'reports' },
  'reports-quality': { permissions: ['reports.view'], moduleCode: 'reports' },
  'reports-safety': { permissions: ['reports.view'], moduleCode: 'reports' },
  'reports-financial': { permissions: ['reports.view'], moduleCode: 'reports' },
  'reports-custom': { permissions: ['reports.view'], moduleCode: 'reports' },

  // Settings / platform administration
  'settings-general': { permissions: ['system_settings.view'], moduleCode: 'modules', adminOnly: true },
  'settings-users': { permissions: ['users.manage', 'users.view'], moduleCode: 'modules', adminOnly: true },
  'settings-roles': { permissions: ['roles.manage', 'roles.view'], moduleCode: 'modules', adminOnly: true },
  'settings-modules': { permissions: ['system_settings.view', 'modules.view'], moduleCode: 'modules', adminOnly: true },
  'settings-company': { permissions: ['system_settings.view', 'company.view'], moduleCode: 'modules', adminOnly: true },
  'settings-plants': { permissions: ['plants.manage', 'plants.view'], moduleCode: 'modules', adminOnly: true },
  'settings-departments': { permissions: ['departments.manage', 'departments.view'], moduleCode: 'modules', adminOnly: true },
  'settings-notifications': { permissions: ['system_settings.view'], moduleCode: 'modules', adminOnly: true },
  'settings-integrations': { permissions: ['system_settings.view'], moduleCode: 'modules', adminOnly: true },
  'settings-backup': { permissions: ['system_settings.view'], moduleCode: 'modules', adminOnly: true },
  'settings-audit': { permissions: ['audit_logs.view'], moduleCode: 'modules', adminOnly: true },
  'settings-security': { permissions: ['system_settings.view'], moduleCode: 'modules', adminOnly: true },
  'settings-health': { permissions: ['system_settings.view'], moduleCode: 'modules', adminOnly: true },
  'settings-queues': { permissions: ['system_settings.view'], moduleCode: 'modules', adminOnly: true },
  'settings-preferences': { permissions: ['dashboard.view'], moduleCode: 'core' },
  'observability-dashboard': { permissions: ['system_settings.view'], moduleCode: 'modules', adminOnly: true },
  'historian-dashboard': { permissions: ['system_settings.view'], moduleCode: 'modules', adminOnly: true },
};

export function getPageAccessRule(page: PageName | string): PageAccessRule {
  // Unknown/unmapped pages fail closed instead of inheriting dashboard access.
  return PAGE_ACCESS[page as PageName] ?? { permissions: ['__unmapped_page__'], moduleCode: 'core' };
}

export function hasPagePermission(
  page: PageName | string,
  hasPermission: PermissionChecker,
  isAdmin: boolean,
): boolean {
  const rule = getPageAccessRule(page);
  if (rule.adminOnly && !isAdmin) return false;
  if (isAdmin) return true;
  if (!rule.permissions || rule.permissions.length === 0) return true;
  return rule.permissions.some((permission) => hasPermission(permission));
}

export function isPageModuleAvailable(
  page: PageName | string,
  enabledModules: Set<string> | null,
): boolean {
  const rule = getPageAccessRule(page);
  const moduleCode = (rule.moduleCode || 'core').toLowerCase();
  if (moduleCode === 'core') return true;
  // Fail closed while module state is loading or unavailable.
  if (enabledModules === null) return false;
  return enabledModules.has(moduleCode);
}

export function canAccessPage(
  page: PageName | string,
  hasPermission: PermissionChecker,
  isAdmin: boolean,
  enabledModules: Set<string> | null,
): boolean {
  return hasPagePermission(page, hasPermission, isAdmin)
    && isPageModuleAvailable(page, enabledModules);
}
