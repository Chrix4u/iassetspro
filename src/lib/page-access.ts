import type { PageName } from '@/types';

export type PagePermissionChecker = (slug: string) => boolean;

export const PAGE_PERMISSIONS: Partial<Record<PageName, string[]>> = {
  dashboard: ['dashboard.view'],
  chat: ['chat.view'],
  notifications: ['notifications.view'],

  'asset-categories': ['assets.view'],
  'assets-machines': ['assets.view'],
  'assets-hierarchy': ['assets.view'],
  'assets-bom': ['bom.view'],
  'assets-condition-monitoring': ['condition_monitoring.view'],
  'assets-digital-twin': ['digital_twin.view'],
  'digital-twin-viewer': ['digital_twin.view'],
  'system-diagrams': ['digital_twin.view'],
  'assets-health': ['asset_health.view'],
  'ai-hub': ['assets.view'],
  'ai-config': ['system_settings.view'],
  'ai-history': ['assets.view'],

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

  'planner-workbench': ['work_orders.view', 'work_orders.view_own', 'pm_schedules.view'],
  'enterprise-reports': ['reports.view'],

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

  'iot-devices': ['iot_devices.view'],
  'iot-monitoring': ['iot_monitoring.view'],
  'iot-rules': ['iot_rules.view'],
  connectivity: ['iot.view'],

  'analytics-kpi': ['analytics.view'],
  'analytics-oee': ['oee.view'],
  'analytics-downtime': ['downtime.view'],
  'analytics-energy': ['energy.view'],

  'operations-meter-readings': ['meters.view'],
  'operations-training': ['training.view'],
  'operations-surveys': ['production_surveys.view'],
  'operations-time-logs': ['time_logs.view'],
  'operations-shift-handover': ['shift_handovers.view'],
  'operations-checklists': ['work_orders.view'],

  'production-work-centers': ['work_centers.view'],
  'production-resource-planning': ['production.view'],
  'production-scheduling': ['production.view'],
  'production-capacity': ['production.view'],
  'production-efficiency': ['production.view'],
  'production-bottlenecks': ['production.view'],
  'production-orders': ['production.view'],
  'production-batches': ['production_batches.view'],

  'quality-inspections': ['quality_inspections.view'],
  'quality-ncr': ['quality_ncr.view'],
  'quality-audits': ['quality_audits.view'],
  'quality-control-plans': ['quality_control_plans.view'],
  'quality-spc': ['spc.view'],
  'quality-capa': ['quality_ncr.view'],

  'safety-incidents': ['safety_incidents.view'],
  'safety-inspections': ['safety_inspections.view'],
  'safety-training': ['training.view'],
  'safety-equipment': ['safety_equipment.view'],
  'safety-permits': ['safety_permits.view'],
  'reliability-engineering': ['digital_twin.view'],

  'inventory-items': ['inventory.view'],
  'inventory-categories': ['parts_categories.view'],
  'inventory-locations': ['inventory_locations.view'],
  'inventory-transactions': ['stock_transactions.view'],
  'inventory-adjustments': ['inventory_adjustments.view'],
  'inventory-requests': ['material_requisitions.view'],
  'inventory-transfers': ['inventory_transfers.view'],
  'inventory-suppliers': ['vendors.view'],
  'inventory-purchase-orders': ['purchase_orders.view'],
  'inventory-receiving': ['purchase_orders.view'],

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

  'observability-dashboard': ['system_settings.view'],
  'historian-dashboard': ['system_settings.view'],

  assets: ['assets.view'],
  'asset-detail': ['assets.view'],
  inventory: ['inventory.view'],
  analytics: ['analytics.view'],
};

export interface PageModuleRequirement {
  all?: string[];
  any?: string[];
}

export const PAGE_MODULE_REQUIREMENTS: Partial<Record<PageName, PageModuleRequirement>> = {
  'asset-categories': { all: ['assets'] },
  'assets-machines': { all: ['assets'] },
  'assets-hierarchy': { all: ['assets'] },
  'assets-bom': { all: ['assets', 'bom'] },
  'assets-condition-monitoring': { all: ['assets', 'condition_monitoring'] },
  'assets-digital-twin': { all: ['assets', 'digital_twin'] },
  'digital-twin-viewer': { all: ['assets', 'digital_twin'] },
  'system-diagrams': { all: ['assets', 'digital_twin'] },
  'assets-health': { all: ['assets'] },
  'ai-hub': { all: ['assets'] },
  'ai-config': { all: ['assets'] },
  'ai-history': { all: ['assets'] },

  'maintenance-work-orders': { all: ['repairs', 'work_orders'] },
  'maintenance-requests': { all: ['repairs', 'maintenance_requests'] },
  'create-mr': { all: ['repairs', 'maintenance_requests'] },
  'mr-detail': { all: ['repairs', 'maintenance_requests'] },
  'wo-detail': { all: ['repairs', 'work_orders'] },
  'maintenance-dashboard': { all: ['repairs', 'work_orders'] },
  'maintenance-analytics': { all: ['repairs', 'work_orders'] },
  'maintenance-risk-assessment': { all: ['repairs', 'risk_assessment'] },
  'maintenance-calibration': { all: ['calibration'] },
  'maintenance-tools': { all: ['tools'] },

  'pm-schedules': { all: ['pm_schedules'] },
  'pm-templates': { all: ['pm_schedules'] },
  'pm-triggers': { all: ['pm_schedules'] },
  'pm-calendar': { all: ['pm_schedules'] },
  'planner-workbench': { any: ['repairs', 'pm_schedules'] },

  'repairs-material-requests': { all: ['repairs'] },
  'repairs-tool-requests': { all: ['repairs'] },
  'repairs-tool-transfers': { all: ['repairs'] },
  'repairs-downtime': { all: ['repairs'] },
  'repairs-completion': { all: ['repairs'] },
  'repairs-spare-part-returns': { all: ['repairs'] },
  'repairs-damaged-tools': { all: ['repairs'] },
  'repairs-analytics': { all: ['repairs'] },
  'repairs-reports': { all: ['repairs', 'reports'] },
  'repairs-detail-report': { all: ['repairs', 'reports'] },
  'technician-timesheet': { all: ['repairs'] },

  'iot-devices': { all: ['iot_sensors'] },
  'iot-monitoring': { all: ['iot_sensors'] },
  'iot-rules': { all: ['iot_sensors'] },
  connectivity: { all: ['iot_sensors'] },

  'analytics-kpi': { all: ['analytics'] },
  'analytics-oee': { all: ['oee'] },
  'analytics-downtime': { all: ['downtime'] },
  'analytics-energy': { all: ['energy'] },

  'operations-meter-readings': { all: ['meter_readings'] },
  'operations-training': { all: ['training'] },
  'operations-shift-handover': { all: ['shift_management'] },

  'production-work-centers': { all: ['production'] },
  'production-resource-planning': { all: ['production'] },
  'production-scheduling': { all: ['production'] },
  'production-capacity': { all: ['production'] },
  'production-efficiency': { all: ['production'] },
  'production-bottlenecks': { all: ['production'] },
  'production-orders': { all: ['production'] },
  'production-batches': { all: ['production'] },

  'quality-inspections': { all: ['quality'] },
  'quality-ncr': { all: ['quality'] },
  'quality-audits': { all: ['quality'] },
  'quality-control-plans': { all: ['quality'] },
  'quality-spc': { all: ['quality'] },
  'quality-capa': { all: ['quality', 'capa'] },

  'safety-incidents': { all: ['safety'] },
  'safety-inspections': { all: ['safety'] },
  'safety-training': { all: ['safety'] },
  'safety-equipment': { all: ['safety'] },
  'safety-permits': { all: ['safety'] },

  'inventory-items': { all: ['inventory'] },
  'inventory-categories': { all: ['inventory'] },
  'inventory-locations': { all: ['inventory'] },
  'inventory-transactions': { all: ['inventory'] },
  'inventory-adjustments': { all: ['inventory'] },
  'inventory-requests': { all: ['inventory'] },
  'inventory-transfers': { all: ['inventory'] },
  'inventory-suppliers': { all: ['inventory'] },
  'inventory-purchase-orders': { all: ['inventory'] },
  'inventory-receiving': { all: ['inventory'] },

  'reports-asset': { all: ['reports', 'assets'] },
  'reports-maintenance': { all: ['reports', 'repairs'] },
  'wo-reports': { all: ['reports', 'repairs'] },
  'reports-inventory': { all: ['reports', 'inventory'] },
  'reports-production': { all: ['reports', 'production'] },
  'reports-quality': { all: ['reports', 'quality'] },
  'reports-safety': { all: ['reports', 'safety'] },
  'reports-financial': { all: ['reports'] },
  'reports-custom': { all: ['reports'] },

  assets: { all: ['assets'] },
  'asset-detail': { all: ['assets'] },
  inventory: { all: ['inventory'] },
  analytics: { all: ['analytics'] },
};

export function isAdminOnlyPage(page: string): boolean {
  return page.startsWith('settings-') && page !== 'settings-preferences';
}

export function hasPagePermission(
  page: PageName | string,
  hasPermission: PagePermissionChecker,
  isAdmin: boolean,
): boolean {
  if (isAdmin) return true;
  if (isAdminOnlyPage(page)) return false;
  const required = PAGE_PERMISSIONS[page as PageName];
  if (!required || required.length === 0) return true;
  return required.some((permission) => hasPermission(permission));
}

/**
 * Fail closed for licensed modules:
 * - null means module state is still loading, so non-core pages are unavailable.
 * - a page is available only when every required module is licensed+enabled.
 * - optional "any" requirements support cross-module workspaces such as Planner.
 */
export function isPageModuleAvailable(
  page: PageName | string,
  enabledModules: Set<string> | null,
): boolean {
  const requirement = PAGE_MODULE_REQUIREMENTS[page as PageName];
  if (!requirement) return true;
  if (enabledModules === null) return false;

  if (requirement.all?.some((code) => !enabledModules.has(code.toLowerCase()))) {
    return false;
  }
  if (requirement.any && requirement.any.length > 0) {
    return requirement.any.some((code) => enabledModules.has(code.toLowerCase()));
  }
  return true;
}
