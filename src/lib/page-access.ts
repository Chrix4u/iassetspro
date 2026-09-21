// Central client-side page access contract.
// This is visibility/navigation hardening only; API routes remain authoritative.

export const PAGE_PERMISSIONS: Record<string, string[]> = {
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
  'maintenance-tools': ['tools.manage', 'tools.create', 'tools.update', 'tools.delete'],
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
  'inventory-items': ['inventory.view_all', 'inventory.manage', 'inventory.create', 'inventory.update', 'inventory.stock_in', 'inventory.stock_out', 'inventory.reserve', 'inventory.export'],
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
  'inventory': ['inventory.view_all', 'inventory.manage', 'inventory.create', 'inventory.update', 'inventory.stock_in', 'inventory.stock_out', 'inventory.reserve', 'inventory.export'],
  'analytics': ['analytics.view'],
};


export const PAGE_MODULES: Record<string, string | string[]> = {
  'dashboard': 'core',
  'chat': 'core',
  'notifications': 'notifications',
  'asset-categories': 'assets',
  'assets-machines': 'assets',
  'assets-hierarchy': 'assets',
  'assets-bom': ['assets', 'bom'],
  'assets-condition-monitoring': ['assets', 'condition_monitoring'],
  'assets-digital-twin': ['assets', 'digital_twin'],
  'digital-twin-viewer': ['assets', 'digital_twin'],
  'system-diagrams': ['assets', 'digital_twin'],
  'assets-health': 'assets',
  'ai-hub': 'assets',
  'ai-config': 'assets',
  'ai-history': 'assets',
  'maintenance-work-orders': 'work_orders',
  'wo-detail': 'work_orders',
  'maintenance-requests': 'maintenance_requests',
  'mr-detail': 'maintenance_requests',
  'create-mr': 'maintenance_requests',
  'maintenance-dashboard': 'work_orders',
  'maintenance-analytics': ['work_orders', 'analytics'],
  'maintenance-calibration': 'calibration',
  'maintenance-risk-assessment': 'risk_assessment',
  'maintenance-tools': 'tools',
  'pm-schedules': ['pm_schedules', 'assets'],
  'pm-templates': ['pm_schedules', 'assets'],
  'pm-triggers': ['pm_schedules', 'assets'],
  'pm-calendar': ['pm_schedules', 'assets'],
  'planner-workbench': 'work_orders',
  'enterprise-reports': ['reports', 'work_orders', 'assets', 'inventory', 'repairs', 'downtime'],
  'repairs-material-requests': ['repairs', 'inventory'],
  'repairs-tool-requests': ['repairs', 'tools'],
  'repairs-tool-transfers': ['repairs', 'tools'],
  'repairs-downtime': 'repairs',
  'repairs-completion': 'repairs',
  'technician-timesheet': 'repairs',
  'repairs-spare-part-returns': ['repairs', 'inventory'],
  'repairs-damaged-tools': ['repairs', 'tools'],
  'repairs-analytics': ['repairs', 'analytics'],
  'repairs-reports': ['repairs', 'reports'],
  'repairs-detail-report': ['repairs', 'reports'],
  'wo-reports': ['work_orders', 'reports'],
  'inventory-items': 'inventory',
  'inventory-categories': 'inventory',
  'inventory-locations': 'inventory',
  'inventory-transactions': 'inventory',
  'inventory-adjustments': 'inventory',
  'inventory-requests': 'inventory',
  'inventory-transfers': 'inventory',
  'inventory-suppliers': 'inventory',
  'inventory-purchase-orders': 'inventory',
  'inventory-receiving': 'inventory',
  'production-work-centers': 'production',
  'production-resource-planning': 'production',
  'production-scheduling': 'production',
  'production-capacity': 'production',
  'production-efficiency': 'production',
  'production-bottlenecks': 'production',
  'production-orders': 'production',
  'production-batches': 'production',
  'quality-inspections': 'quality',
  'quality-ncr': 'quality',
  'quality-audits': 'quality',
  'quality-control-plans': 'quality',
  'quality-spc': 'quality',
  'quality-capa': 'quality',
  'safety-incidents': 'safety',
  'safety-inspections': 'safety',
  'safety-training': 'safety',
  'safety-equipment': 'safety',
  'safety-permits': 'safety',
  'iot-devices': 'iot_sensors',
  'iot-monitoring': 'iot_sensors',
  'iot-rules': 'iot_sensors',
  'connectivity': 'iot_sensors',
  'reliability-engineering': 'digital_twin',
  'analytics-kpi': 'analytics',
  'analytics-oee': 'oee',
  'analytics-downtime': 'downtime',
  'analytics-energy': 'energy',
  'operations-meter-readings': 'meter_readings',
  'operations-training': 'training',
  'operations-surveys': 'production',
  'operations-time-logs': 'work_orders',
  'operations-checklists': 'work_orders',
  'operations-shift-handover': 'shift_management',
  'reports-asset': ['reports', 'assets'],
  'equipment-history': ['reports', 'assets'],
  'machine-availability': ['reports', 'assets'],
  'failure-analysis': ['reports', 'failure_analysis', 'assets'],
  'reports-maintenance': ['reports', 'work_orders', 'maintenance_requests'],
  'reports-inventory': ['reports', 'inventory'],
  'reports-production': ['reports', 'production'],
  'reports-quality': ['reports', 'quality'],
  'reports-safety': ['reports', 'safety'],
  'reports-financial': ['reports', 'work_orders'],
  'reports-custom': 'reports',
  'settings-general': 'core',
  'settings-users': 'core',
  'settings-roles': 'core',
  'settings-company': 'core',
  'settings-plants': 'core',
  'settings-departments': 'core',
  'settings-notifications': ['core', 'notifications'],
  'settings-integrations': 'core',
  'settings-backup': 'core',
  'settings-audit': 'core',
  'settings-security': 'core',
  'settings-health': 'core',
  'settings-queues': 'core',
  'settings-preferences': 'core',
  'observability-dashboard': 'core',
  'historian-dashboard': 'core',
  'assets': 'assets',
  'asset-detail': 'assets',
  'inventory': 'inventory',
  'analytics': 'analytics',
  // Module Management is control-plane/core administration. It must remain
  // reachable so an admin can inspect/activate otherwise disabled modules.
  'settings-modules': 'core',
};

// Only the true platform foundation bypasses the licensed/enabled registry.
// Operational modules (assets, RWOP/requests, inventory, PM, production, etc.)
// must be present in enabledModules before any page/component is routable.
export const CORE_MODULE_CODES = new Set(['core']);

export function pageHasPermission(
  page: string,
  hasPermission: (slug: string) => boolean,
  isAdmin: boolean,
): boolean {
  if (isAdmin) return true;
  const required = PAGE_PERMISSIONS[page];
  return !required || required.some(hasPermission);
}

function pageModuleCodes(page: string): string[] {
  const configured = PAGE_MODULES[page];
  if (!configured) return [];
  return Array.isArray(configured) ? configured : [configured];
}

export function pageModuleStateResolved(page: string, enabledModules: Set<string> | null): boolean {
  const codes = pageModuleCodes(page);
  if (codes.length === 0 || codes.every((code) => CORE_MODULE_CODES.has(code))) return true;
  return enabledModules !== null;
}

export function pageModuleIsEnabled(page: string, enabledModules: Set<string> | null): boolean {
  const codes = pageModuleCodes(page);
  if (codes.length === 0) return true;
  if (enabledModules === null && codes.some((code) => !CORE_MODULE_CODES.has(code))) return false;

  return codes.every((code) =>
    CORE_MODULE_CODES.has(code) || enabledModules?.has(code) === true
  );
}
