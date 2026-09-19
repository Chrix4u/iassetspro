import type { PageName } from '@/types';

/**
 * Canonical client-side page access policy.
 *
 * API authorization remains authoritative. This policy prevents users from
 * seeing or loading UI surfaces they cannot use, and keeps Sidebar and direct
 * hash navigation consistent.
 */
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

  'planner-workbench': ['work_orders.view', 'work_orders.view_own'],
  'enterprise-reports': ['reports.view'],

  'repairs-material-requests': ['repair_material_requests.view', 'repair_material_requests.view_all', 'repair_material_requests.view_own'],
  'repairs-tool-requests': ['repair_tool_requests.view', 'repair_tool_requests.view_all', 'repair_tool_requests.view_own'],
  'repairs-tool-transfers': ['repair_tool_transfers.view', 'repair_tool_transfers.view_all', 'repair_tool_transfers.view_own'],
  'repairs-downtime': ['work_orders.view', 'work_orders.view_own', 'downtime.view', 'downtime.create'],
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

/**
 * Module/license gates for pages. Every listed non-core page requires all
 * module codes in the array to be operational.
 */
export const PAGE_MODULES: Partial<Record<PageName, string[]>> = {
  dashboard: ['core'],
  chat: ['core'],
  notifications: ['core'],

  'asset-categories': ['assets'],
  'assets-machines': ['assets'],
  'assets-hierarchy': ['assets'],
  'assets-bom': ['assets', 'bom'],
  'assets-condition-monitoring': ['assets', 'condition_monitoring'],
  'assets-digital-twin': ['assets', 'digital_twin'],
  'digital-twin-viewer': ['assets', 'digital_twin'],
  'system-diagrams': ['assets', 'digital_twin'],
  'assets-health': ['assets'],
  'ai-hub': ['assets'],
  'ai-history': ['assets'],
  'ai-config': ['assets'],

  'maintenance-work-orders': ['work_orders'],
  'wo-detail': ['work_orders'],
  'maintenance-dashboard': ['work_orders', 'repairs'],
  'maintenance-analytics': ['work_orders', 'repairs'],
  'maintenance-risk-assessment': ['work_orders', 'risk_assessment'],
  'maintenance-tools': ['tools'],
  'maintenance-requests': ['maintenance_requests'],
  'mr-detail': ['maintenance_requests'],
  'create-mr': ['maintenance_requests'],

  'pm-schedules': ['pm_schedules'],
  'pm-templates': ['pm_schedules'],
  'pm-triggers': ['pm_schedules'],
  'pm-calendar': ['pm_schedules'],
  'maintenance-calibration': ['calibration'],

  'planner-workbench': ['work_orders'],
  'enterprise-reports': ['reports'],

  'repairs-material-requests': ['repairs'],
  'repairs-tool-requests': ['repairs'],
  'repairs-tool-transfers': ['repairs'],
  'repairs-downtime': ['repairs', 'downtime'],
  'repairs-completion': ['repairs', 'work_orders'],
  'repairs-spare-part-returns': ['repairs'],
  'repairs-damaged-tools': ['repairs'],
  'repairs-analytics': ['repairs', 'analytics'],
  'repairs-reports': ['repairs', 'reports'],
  'repairs-detail-report': ['repairs', 'reports'],
  'technician-timesheet': ['repairs', 'work_orders'],
  'wo-reports': ['reports', 'work_orders'],

  'iot-devices': ['iot_sensors'],
  'iot-monitoring': ['iot_sensors'],
  'iot-rules': ['iot_sensors'],
  connectivity: ['iot_sensors'],

  'analytics-kpi': ['kpi_dashboard'],
  'analytics-oee': ['oee'],
  'analytics-downtime': ['downtime'],
  'analytics-energy': ['energy'],

  'operations-meter-readings': ['meter_readings'],
  'operations-training': ['training'],
  'operations-surveys': ['production'],
  'operations-time-logs': ['work_orders'],
  'operations-shift-handover': ['shift_management'],
  'operations-checklists': ['work_orders'],

  'production-work-centers': ['production'],
  'production-resource-planning': ['production'],
  'production-scheduling': ['production'],
  'production-capacity': ['production'],
  'production-efficiency': ['production'],
  'production-bottlenecks': ['production'],
  'production-orders': ['production'],
  'production-batches': ['production'],

  'quality-inspections': ['quality'],
  'quality-ncr': ['quality'],
  'quality-audits': ['quality'],
  'quality-control-plans': ['quality'],
  'quality-spc': ['quality'],
  'quality-capa': ['quality', 'capa'],

  'safety-incidents': ['safety'],
  'safety-inspections': ['safety'],
  'safety-training': ['safety', 'training'],
  'safety-equipment': ['safety'],
  'safety-permits': ['safety'],

  'reliability-engineering': ['digital_twin'],

  'inventory-items': ['inventory'],
  'inventory-categories': ['inventory'],
  'inventory-locations': ['inventory'],
  'inventory-transactions': ['inventory'],
  'inventory-adjustments': ['inventory'],
  'inventory-requests': ['inventory'],
  'inventory-transfers': ['inventory'],
  'inventory-suppliers': ['inventory'],
  'inventory-purchase-orders': ['inventory'],
  'inventory-receiving': ['inventory'],

  'reports-asset': ['reports', 'assets'],
  'equipment-history': ['reports', 'assets'],
  'machine-availability': ['reports', 'assets'],
  'failure-analysis': ['reports', 'failure_analysis'],
  'reports-maintenance': ['reports', 'work_orders'],
  'reports-inventory': ['reports', 'inventory'],
  'reports-production': ['reports', 'production'],
  'reports-quality': ['reports', 'quality'],
  'reports-safety': ['reports', 'safety'],
  'reports-financial': ['reports'],
  'reports-custom': ['reports'],

  'settings-general': ['core'],
  'settings-users': ['core'],
  'settings-roles': ['core'],
  'settings-modules': ['core'],
  'settings-company': ['core'],
  'settings-plants': ['core'],
  'settings-departments': ['core'],
  'settings-notifications': ['core'],
  'settings-integrations': ['core'],
  'settings-backup': ['core'],
  'settings-audit': ['core'],
  'settings-security': ['core'],
  'settings-health': ['core'],
  'settings-queues': ['core'],
  'settings-preferences': ['core'],
  'observability-dashboard': ['core'],
  'historian-dashboard': ['core'],

  assets: ['assets'],
  'asset-detail': ['assets'],
  inventory: ['inventory'],
  analytics: ['analytics'],
};

export function getPagePermissions(page: string): string[] {
  return PAGE_PERMISSIONS[page as PageName] || [];
}

export function getPageModules(page: string): string[] {
  return PAGE_MODULES[page as PageName] || ['core'];
}

export function arePageModulesEnabled(page: string, enabledModules: Set<string> | null): boolean {
  const required = getPageModules(page);
  return required.every((code) => code === 'core' || (enabledModules !== null && enabledModules.has(code)));
}
