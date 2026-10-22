/**
 * Targeted seed script — only creates missing data, NEVER deletes existing data.
 * Safe to run multiple times on any database state.
 * 
 * Creates:
 *   1. Permissions (if missing)
 *   2. Roles (if missing)  
 *   3. Role-Permission assignments (if missing)
 *   4. System Modules + Company Modules (if missing)
 *   5. Departments (if missing)
 *   6. Additional Plants (if missing)
 *   7. Demo Users (if missing) + role assignments + plant access
 *
 * Usage: npx tsx prisma/seed-missing.ts
 */

import { db } from '../src/lib/db';
import { hash } from 'bcryptjs';

// ============================================================================
// 1. MODULE PERMISSIONS
// ============================================================================

const modulePermissions: Record<string, string[]> = {
  dashboard: ['view', 'stats'],
  chat: ['view'],
  users: ['view', 'create', 'update', 'delete', 'manage', 'assign_role', 'assign_plant', 'reset_password'],
  roles: ['view', 'create', 'update', 'delete', 'manage'],
  permissions: ['view'],
  departments: ['view', 'create', 'update', 'delete', 'manage'],
  plants: ['view', 'create', 'update', 'delete', 'manage'],
  notifications: ['view', 'manage', 'send'],
  audit_logs: ['view'],
  system_settings: ['view', 'update'],
  modules: ['view', 'manage', 'activate'],
  api_keys: ['view', 'create', 'update', 'delete'],
  search: ['global'],
  documents: ['view', 'upload', 'download', 'delete', 'manage'],
  company: ['view', 'update'],
  assets: ['view', 'view_all', 'view_own', 'create', 'update', 'delete', 'export', 'import', 'bulk_update', 'manage', 'hierarchy', 'relationships', 'health', 'criticality'],
  equipment: ['view', 'create', 'update', 'delete'],
  assemblies: ['view', 'create', 'update', 'delete', 'manage'],
  bom: ['view', 'create', 'update', 'delete', 'import', 'export', 'manage'],
  facilities: ['view', 'create', 'update', 'delete'],
  meters: ['view', 'create', 'update', 'delete', 'read'],
  tools: ['view', 'create', 'update', 'delete', 'manage', 'checkout', 'return', 'transfer'],
  maintenance_requests: ['view', 'view_all', 'view_own', 'create', 'update', 'delete', 'approve', 'reject', 'triage', 'assign_planner', 'convert_to_wo', 'my_queue', 'archive'],
  work_orders: ['view', 'view_all', 'view_own', 'create', 'update', 'delete', 'assign_supervisor', 'assign_technician', 'start', 'complete', 'verify', 'reopen', 'close', 'adjust_cost', 'failure_analysis', 'dashboard', 'bulk_update', 'cancel'],
  work_order_templates: ['view', 'create', 'update', 'delete'],
  recurring_work_orders: ['view', 'create', 'update', 'delete'],
  approvals: ['view', 'approve', 'reject'],
  verifications: ['view', 'check'],
  sla: ['view', 'manage'],
  failure_codes: ['view', 'manage'],
  rca: ['view', 'create', 'update'],
  assistance_requests: ['view', 'create', 'respond'],
  time_logs: ['view', 'create', 'update', 'delete'],
  pm_schedules: ['view', 'create', 'update', 'delete', 'activate', 'run'],
  pm_tasks: ['view', 'create', 'update', 'delete', 'import'],
  pm_templates: ['view', 'create', 'update', 'delete'],
  pm_triggers: ['view', 'create', 'update'],
  pm_checklists: ['view', 'create', 'update', 'delete'],
  pm_notifications: ['view'],
  pm_analytics: ['view'],
  pm_work_orders: ['view'],
  calibration: ['view', 'create', 'update', 'delete', 'manage'],
  asset_health: ['view'],
  condition_monitoring: ['view', 'manage'],
  inventory: ['view', 'view_all', 'create', 'update', 'delete', 'stock_in', 'stock_out', 'reserve', 'consume', 'export', 'manage', 'forecast'],
  parts: ['view', 'create', 'update', 'delete'],
  parts_categories: ['view', 'create', 'update'],
  material_requisitions: ['view', 'create', 'update', 'approve', 'issue', 'reject'],
  vendors: ['view', 'create', 'update', 'delete', 'manage'],
  stock_transactions: ['view'],
  purchase_orders: ['view', 'create', 'update', 'approve', 'receive', 'manage'],
  inventory_locations: ['view', 'create', 'update', 'delete'],
  inventory_adjustments: ['view', 'create', 'update', 'approve'],
  inventory_transfers: ['view', 'create', 'update', 'approve'],
  employees: ['view', 'create', 'update'],
  shifts: ['view', 'create', 'update', 'assign'],
  shift_handovers: ['view', 'create'],
  training: ['view', 'create', 'update', 'manage'],
  skills: ['view', 'create', 'update'],
  skill_categories: ['view', 'manage'],
  technician_groups: ['view', 'create', 'update'],
  assignments: ['view', 'create', 'update'],
  production: ['view', 'create', 'update', 'manage'],
  production_surveys: ['view', 'create', 'update', 'manage'],
  oee: ['view', 'manage'],
  downtime: ['view', 'create', 'manage'],
  quality_checks: ['view', 'create', 'update'],
  energy: ['view', 'manage'],
  work_centers: ['view', 'create', 'update'],
  production_targets: ['view', 'create', 'update'],
  production_batches: ['view', 'create', 'update', 'delete'],
  iot: ['view'],
  analytics: ['view'],
  operations: ['view'],
  quality: ['view'],
  safety: ['view'],
  safety_incidents: ['view', 'create', 'update', 'delete', 'manage'],
  safety_inspections: ['view', 'create', 'update', 'delete', 'manage'],
  safety_equipment: ['view', 'create', 'update', 'delete'],
  safety_permits: ['view', 'create', 'update', 'delete', 'approve', 'close'],
  risk_assessments: ['view', 'create', 'update', 'manage'],
  iot_devices: ['view', 'create', 'update', 'delete'],
  iot_monitoring: ['view'],
  iot_rules: ['view', 'create', 'update', 'delete'],
  predictive: ['view', 'analyze'],
  digital_twin: ['view', 'manage'],
  model_viewer: ['view'],
  hotspots: ['view', 'manage'],
  reports: ['view', 'create', 'generate', 'export', 'manage', 'schedule', 'customize'],
  quality_inspections: ['view', 'create', 'update', 'delete'],
  quality_ncr: ['view', 'create', 'update', 'delete'],
  quality_audits: ['view', 'create', 'update', 'delete'],
  quality_control_plans: ['view', 'create', 'update'],
  spc: ['view', 'manage'],
  repair_material_requests: ['view', 'view_all', 'view_own', 'create', 'update'],
  repair_tool_requests: ['view', 'view_all', 'view_own', 'create', 'update'],
  repair_tool_transfers: ['view', 'view_all', 'view_own', 'create', 'update'],
};

// ============================================================================
// 2. ROLE DEFINITIONS
// ============================================================================

const roleDefinitions = [
  { name: 'Plant Manager', slug: 'plant_manager', description: 'View all modules, limited create/update across the plant', level: 95, isSystem: true },
  { name: 'Maintenance Manager', slug: 'maintenance_manager', description: 'Full work orders, maintenance requests, PM schedules, and assets', level: 90, isSystem: false },
  { name: 'Maintenance Planner', slug: 'maintenance_planner', description: 'Plan and schedule maintenance work orders and PM', level: 80, isSystem: true },
  { name: 'Maintenance Supervisor', slug: 'maintenance_supervisor', description: 'Supervise and manage work order execution', level: 70, isSystem: false },
  { name: 'Maintenance Technician', slug: 'maintenance_technician', description: 'Execute assigned maintenance work orders', level: 50, isSystem: false },
  { name: 'Production Manager', slug: 'production_manager', description: 'Full production management and OEE oversight', level: 90, isSystem: false },
  { name: 'Production Operator', slug: 'production_operator', description: 'Production data entry and survey completion', level: 30, isSystem: false },
  { name: 'Inventory Manager', slug: 'inventory_manager', description: 'Full inventory, parts, and procurement management', level: 85, isSystem: false },
  { name: 'Store Keeper', slug: 'store_keeper', description: 'Day-to-day store operations and stock management', level: 45, isSystem: false },
  { name: 'Tools Shop Attendant', slug: 'tools_shop_attendant', description: 'Manage tool checkout, returns, and transfers for maintenance operations', level: 47, isSystem: false },
  { name: 'Quality Manager', slug: 'quality_manager', description: 'Quality inspections, NCR, audits, and calibration', level: 85, isSystem: false },
  { name: 'Safety Officer', slug: 'safety_officer', description: 'Full safety management including incidents and inspections', level: 75, isSystem: false },
  { name: 'HR Manager', slug: 'hr_manager', description: 'Full HRMS including employees, shifts, training, skills', level: 85, isSystem: false },
  { name: 'IoT Engineer', slug: 'iot_engineer', description: 'Full IoT device management and predictive analytics', level: 70, isSystem: false },
  { name: 'Viewer', slug: 'viewer', description: 'Read-only access across most modules', level: 10, isSystem: true },
];

// ============================================================================
// 3. ROLE PERMISSION BUNDLES
// ============================================================================

function mod(moduleName: string, actions: string[]): string[] {
  return actions.map((a) => `${moduleName}.${a}`);
}

function allViews(modules: string[]): string[] {
  return modules.map((m) => `${m}.view`);
}

const rolePermissionBundles: Record<string, string[]> = {
  plant_manager: [
    'dashboard.view', 'dashboard.stats', 'chat.view',
    'users.view', 'roles.view', 'permissions.view',
    'departments.view', 'departments.create', 'departments.update',
    'plants.view', 'plants.update',
    'notifications.view', 'audit_logs.view', 'system_settings.view', 'modules.view',
    'documents.view', 'company.view', 'company.update',
    'assets.view', 'assets.view_all', 'assets.health', 'assets.criticality', 'assets.hierarchy',
    'equipment.view', 'assemblies.view', 'bom.view', 'facilities.view', 'meters.view', 'tools.view',
    'maintenance_requests.view', 'maintenance_requests.view_all', 'maintenance_requests.dashboard',
    'work_orders.view', 'work_orders.view_all', 'work_orders.dashboard',
    'pm_schedules.view', 'pm_analytics.view', 'pm_templates.view',
    'inventory.view', 'inventory.view_all', 'parts.view', 'vendors.view',
    'purchase_orders.view', 'inventory_locations.view', 'stock_transactions.view',
    'employees.view', 'shifts.view', 'training.view',
    'production.view', 'oee.view', 'downtime.view', 'work_centers.view', 'production_batches.view',
    'safety_incidents.view', 'safety_inspections.view', 'safety_equipment.view',
    'iot_devices.view', 'iot_monitoring.view', 'iot_rules.view',
    'reports.view', 'reports.export',
    'quality_inspections.view', 'quality_ncr.view', 'quality_audits.view',
    'iot.view', 'analytics.view', 'operations.view', 'quality.view', 'safety.view',
    'pm_tasks.view',
  ],

  maintenance_manager: [
    'dashboard.view', 'dashboard.stats', 'chat.view',
    'documents.view', 'documents.upload', 'documents.download',
    'notifications.view', 'notifications.manage',
    'assets.view', 'assets.view_all', 'assets.create', 'assets.update', 'assets.delete', 'assets.export', 'assets.manage', 'assets.hierarchy', 'assets.health',
    'equipment.view', 'equipment.create', 'equipment.update',
    'assemblies.view', 'assemblies.create', 'assemblies.update',
    'bom.view', 'bom.create', 'bom.update',
    'meters.view', 'meters.create', 'meters.update', 'tools.view', 'tools.create', 'tools.update',
    'maintenance_requests.view', 'maintenance_requests.view_all', 'maintenance_requests.create', 'maintenance_requests.update', 'maintenance_requests.approve', 'maintenance_requests.reject', 'maintenance_requests.triage', 'maintenance_requests.assign_planner', 'maintenance_requests.convert_to_wo',
    'work_orders.view', 'work_orders.view_all', 'work_orders.create', 'work_orders.update', 'work_orders.delete', 'work_orders.assign_supervisor', 'work_orders.assign_technician', 'work_orders.complete', 'work_orders.verify', 'work_orders.close', 'work_orders.cancel', 'work_orders.dashboard',
    'approvals.view', 'approvals.approve', 'approvals.reject',
    'time_logs.view', 'time_logs.create', 'time_logs.update',
    'pm_schedules.view', 'pm_schedules.create', 'pm_schedules.update', 'pm_schedules.delete', 'pm_schedules.activate', 'pm_schedules.run',
    'pm_templates.view', 'pm_templates.create', 'pm_templates.update', 'pm_templates.delete',
    'inventory.view', 'inventory.view_all', 'parts.view',
    'reports.view', 'reports.export', 'reports.generate',
    'analytics.view', 'operations.view',
    'pm_tasks.view', 'pm_tasks.create', 'pm_tasks.update', 'pm_tasks.delete', 'pm_tasks.import',
  ],

  maintenance_planner: [
    'dashboard.view', 'dashboard.stats', 'chat.view',
    'documents.view', 'documents.upload', 'documents.download',
    'notifications.view',
    'assets.view', 'assets.view_all', 'assets.create', 'assets.update', 'assets.hierarchy', 'assets.health',
    'equipment.view', 'equipment.create', 'equipment.update',
    'bom.view', 'bom.create', 'bom.update',
    'maintenance_requests.view', 'maintenance_requests.view_all', 'maintenance_requests.create', 'maintenance_requests.update', 'maintenance_requests.triage', 'maintenance_requests.convert_to_wo',
    'work_orders.view', 'work_orders.view_all', 'work_orders.create', 'work_orders.update', 'work_orders.assign_supervisor', 'work_orders.assign_technician', 'work_orders.close', 'work_orders.dashboard',
    'pm_schedules.view', 'pm_schedules.create', 'pm_schedules.update', 'pm_schedules.delete', 'pm_schedules.activate',
    'pm_templates.view', 'pm_templates.create', 'pm_templates.update',
    'tools.view',
    'inventory.view', 'inventory.view_all',
    'reports.view', 'reports.export',
    'analytics.view', 'operations.view',
    'pm_tasks.view', 'pm_tasks.create', 'pm_tasks.update', 'pm_tasks.delete', 'pm_tasks.import',
  ],

  maintenance_supervisor: [
    'dashboard.view', 'dashboard.stats', 'chat.view',
    'documents.view', 'documents.upload',
    'notifications.view',
    'assets.view', 'assets.view_all',
    'equipment.view',
    'maintenance_requests.view', 'maintenance_requests.view_all', 'maintenance_requests.create',
    'work_orders.view', 'work_orders.view_all', 'work_orders.start', 'work_orders.complete', 'work_orders.hold', 'work_orders.dashboard',
    'approvals.view', 'approvals.approve', 'approvals.reject',
    'time_logs.view', 'time_logs.create',
    'tools.view', 'tools.checkout', 'tools.return',
    'inventory.view',
    'safety_incidents.view', 'safety_inspections.view',
    'reports.view',
    'analytics.view', 'operations.view', 'safety.view',
  ],

  maintenance_technician: [
    'dashboard.view', 'chat.view',
    'documents.view', 'documents.upload', 'documents.download',
    'notifications.view',
    'assets.view', 'assets.view_own',
    'equipment.view',
    'maintenance_requests.view', 'maintenance_requests.view_own', 'maintenance_requests.create',
    'work_orders.view', 'work_orders.view_own', 'work_orders.start', 'work_orders.complete',
    'time_logs.view', 'time_logs.create',
    'tools.view', 'tools.checkout', 'tools.return',
    'inventory.view',
    'safety.view',
  ],

  production_manager: [
    'dashboard.view', 'dashboard.stats', 'chat.view',
    'documents.view', 'notifications.view',
    'assets.view', 'assets.view_all',
    'work_orders.view', 'work_orders.view_all',
    'maintenance_requests.view', 'maintenance_requests.view_all',
    'production.view', 'production.create', 'production.update', 'production.manage',
    'oee.view', 'oee.manage', 'downtime.view', 'downtime.manage',
    'work_centers.view', 'work_centers.create', 'work_centers.update',
    'production_batches.view', 'production_batches.create', 'production_batches.update',
    'quality_checks.view', 'energy.view',
    'reports.view', 'reports.export',
    'analytics.view', 'operations.view', 'quality.view',
  ],

  production_operator: [
    'dashboard.view', 'chat.view',
    'notifications.view',
    'assets.view',
    'maintenance_requests.create',
    'work_orders.view', 'work_orders.view_own',
    'production.view', 'production.create',
    'production_surveys.view', 'production_surveys.create', 'production_surveys.update',
    'downtime.view', 'downtime.create',
    'quality_checks.view', 'quality_checks.create', 'quality_checks.update',
  ],

  inventory_manager: [
    'dashboard.view', 'dashboard.stats', 'chat.view',
    'documents.view', 'notifications.view',
    'assets.view',
    'inventory.view', 'inventory.view_all', 'inventory.create', 'inventory.update', 'inventory.delete', 'inventory.manage', 'inventory.export',
    'parts.view', 'parts.create', 'parts.update', 'parts.delete',
    'parts_categories.view', 'parts_categories.create', 'parts_categories.update',
    'material_requisitions.view', 'material_requisitions.create', 'material_requisitions.approve',
    'vendors.view', 'vendors.create', 'vendors.update',
    'stock_transactions.view',
    'purchase_orders.view', 'purchase_orders.create', 'purchase_orders.update', 'purchase_orders.approve', 'purchase_orders.manage',
    'inventory_locations.view', 'inventory_locations.create', 'inventory_locations.update',
    'inventory_adjustments.view', 'inventory_adjustments.create',
    'inventory_transfers.view', 'inventory_transfers.create', 'inventory_transfers.approve',
    'reports.view', 'reports.export',
  ],

  store_keeper: [
    'dashboard.view', 'chat.view',
    'notifications.view',
    'inventory.view', 'inventory.stock_in', 'inventory.stock_out', 'inventory.reserve', 'inventory.consume',
    'parts.view',
    'material_requisitions.view',
    'purchase_orders.view', 'purchase_orders.receive',
    'inventory_locations.view',
    'tools.view', 'tools.checkout', 'tools.return', 'tools.transfer',
  ],

  tools_shop_attendant: [
    'dashboard.view', 'chat.view',
    'notifications.view',
    'tools.view', 'tools.manage', 'tools.checkout', 'tools.return', 'tools.transfer',
    'inventory.view',
  ],

  quality_manager: [
    'dashboard.view', 'dashboard.stats', 'chat.view',
    'documents.view', 'notifications.view',
    'quality_inspections.view', 'quality_inspections.create', 'quality_inspections.update', 'quality_inspections.delete',
    'quality_ncr.view', 'quality_ncr.create', 'quality_ncr.update', 'quality_ncr.delete',
    'quality_audits.view', 'quality_audits.create', 'quality_audits.update', 'quality_audits.delete',
    'quality_control_plans.view', 'quality_control_plans.create', 'quality_control_plans.update',
    'spc.view', 'spc.manage',
    'calibration.view', 'calibration.create', 'calibration.update',
    'reports.view', 'reports.export',
    'quality.view', 'analytics.view',
  ],

  safety_officer: [
    'dashboard.view', 'dashboard.stats', 'chat.view',
    'documents.view', 'notifications.view',
    'safety_incidents.view', 'safety_incidents.create', 'safety_incidents.update', 'safety_incidents.manage',
    'safety_inspections.view', 'safety_inspections.create', 'safety_inspections.update', 'safety_inspections.manage',
    'safety_equipment.view', 'safety_equipment.create', 'safety_equipment.update', 'safety_equipment.delete',
    'safety_permits.view', 'safety_permits.create', 'safety_permits.approve', 'safety_permits.close',
    'risk_assessments.view', 'risk_assessments.create', 'risk_assessments.update', 'risk_assessments.manage',
    'reports.view', 'reports.export',
    'safety.view', 'analytics.view',
  ],

  hr_manager: [
    'dashboard.view', 'dashboard.stats', 'chat.view',
    'documents.view', 'notifications.view',
    'users.view',
    'employees.view', 'employees.create', 'employees.update',
    'shifts.view', 'shifts.create', 'shifts.update', 'shifts.assign',
    'shift_handovers.view', 'shift_handovers.create',
    'training.view', 'training.create', 'training.update', 'training.manage',
    'skills.view', 'skills.create', 'skills.update',
    'skill_categories.view',
    'technician_groups.view', 'technician_groups.create', 'technician_groups.update',
    'assignments.view',
    'reports.view',
    'operations.view',
  ],

  iot_engineer: [
    'dashboard.view', 'dashboard.stats', 'chat.view',
    'documents.view', 'notifications.view',
    'iot_devices.view', 'iot_devices.create', 'iot_devices.update', 'iot_devices.delete',
    'iot_monitoring.view', 'iot_rules.view', 'iot_rules.create', 'iot_rules.update', 'iot_rules.delete',
    'predictive.view', 'predictive.analyze',
    'asset_health.view', 'condition_monitoring.view', 'condition_monitoring.manage',
    'meters.view', 'meters.create', 'meters.update', 'meters.read',
    'reports.view', 'reports.export',
    'iot.view', 'analytics.view',
  ],

  viewer: [
    'dashboard.view', 'chat.view',
    'assets.view', 'equipment.view', 'assemblies.view', 'bom.view', 'facilities.view',
    'maintenance_requests.view', 'work_orders.view',
    'pm_schedules.view', 'pm_templates.view',
    'inventory.view', 'parts.view', 'inventory_locations.view',
    'production.view', 'work_centers.view', 'production_batches.view',
    'quality_inspections.view', 'quality_ncr.view', 'quality_audits.view',
    'safety_incidents.view', 'safety_inspections.view',
    'iot_devices.view', 'iot_monitoring.view',
    'reports.view',
    ...allViews(['iot', 'analytics', 'operations', 'quality', 'safety']),
  ],
};

// ============================================================================
// 4. SYSTEM MODULES
// ============================================================================

const systemModules = [
  { code: 'core', name: 'Core Platform', description: 'Core EAM platform', isCore: true, version: '2.0.0' },
  { code: 'assets', name: 'Asset Management', description: 'Asset registry and lifecycle', isCore: true, version: '2.0.0' },
  { code: 'maintenance_requests', name: 'Maintenance Requests', description: 'Submit and manage requests', isCore: true, version: '2.0.0' },
  { code: 'work_orders', name: 'Work Orders', description: 'Plan and track work orders', isCore: true, version: '2.0.0' },
  { code: 'repairs', name: 'Repairs & Maintenance', description: 'Corrective/emergency repairs, material requests, tool requests, downtime tracking, and completion workflows', isCore: true, version: '2.0.0' },
  { code: 'inventory', name: 'Inventory & Spare Parts', description: 'Spare parts inventory', isCore: true, version: '2.0.0' },
  { code: 'pm_schedules', name: 'PM Schedules', description: 'Preventive maintenance scheduling', isCore: false, version: '2.0.0' },
  { code: 'analytics', name: 'Analytics & KPI', description: 'Analytics and KPI monitoring', isCore: false, version: '1.5.0' },
  { code: 'production', name: 'Production Management', description: 'Production planning and control', isCore: false, version: '1.5.0' },
  { code: 'quality', name: 'Quality Management', description: 'Quality inspections and NCR', isCore: false, version: '1.5.0' },
  { code: 'safety', name: 'Safety Management', description: 'Safety incidents and inspections', isCore: false, version: '1.5.0' },
  { code: 'iot_sensors', name: 'IoT Sensors', description: 'IoT device management', isCore: false, version: '1.3.0' },
  { code: 'calibration', name: 'Calibration', description: 'Instrument calibration', isCore: false, version: '1.2.0' },
  { code: 'downtime', name: 'Downtime Tracking', description: 'Machine downtime logging', isCore: false, version: '1.2.0' },
  { code: 'meter_readings', name: 'Meter Readings', description: 'Equipment meter readings', isCore: false, version: '1.1.0' },
  { code: 'training', name: 'Training Management', description: 'Training programs and skills', isCore: false, version: '1.1.0' },
  { code: 'risk_assessment', name: 'Risk Assessment', description: 'Risk identification and mitigation', isCore: false, version: '1.2.0' },
  { code: 'condition_monitoring', name: 'Condition Monitoring', description: 'Vibration and condition monitoring', isCore: false, version: '1.3.0' },
  { code: 'digital_twin', name: 'Digital Twin', description: '3D asset visualization', isCore: false, version: '1.0.0' },
  { code: 'bom', name: 'Bill of Materials', description: 'Equipment BOM management', isCore: false, version: '1.1.0' },
  { code: 'capa', name: 'CAPA Management', description: 'Corrective and preventive actions', isCore: false, version: '1.0.0' },
  { code: 'reports', name: 'Reports & Dashboards', description: 'Custom report builder', isCore: false, version: '2.0.0' },
  { code: 'vendors', name: 'Vendor Management', description: 'Supplier management', isCore: false, version: '1.1.0' },
  { code: 'tools', name: 'Tool Management', description: 'Tool inventory and tracking', isCore: false, version: '1.0.0' },
  { code: 'notifications', name: 'Notifications', description: 'In-app notifications', isCore: false, version: '1.5.0' },
  { code: 'documents', name: 'Document Management', description: 'Document storage and versioning', isCore: false, version: '1.2.0' },
  { code: 'modules', name: 'Module Management', description: 'Module licensing', isCore: true, version: '2.0.0' },
  { code: 'kpi_dashboard', name: 'KPI Dashboard', description: 'Customizable KPI dashboards', isCore: false, version: '1.3.0' },
  { code: 'predictive', name: 'Predictive Maintenance', description: 'ML-based predictive analytics', isCore: false, version: '1.0.0' },
  { code: 'oee', name: 'OEE Tracking', description: 'Overall Equipment Effectiveness', isCore: false, version: '1.2.0' },
  { code: 'energy', name: 'Energy Management', description: 'Energy consumption monitoring', isCore: false, version: '1.1.0' },
  { code: 'shift_management', name: 'Shift Management', description: 'Shift scheduling and handover', isCore: false, version: '1.1.0' },
  { code: 'erp_integration', name: 'ERP Integration', description: 'External ERP integration', isCore: false, version: '1.0.0' },
  { code: 'forecasting', name: 'Demand Forecasting', description: 'AI-powered demand forecasting', isCore: false, version: '1.0.0' },
  { code: 'failure_analysis', name: 'Failure Analysis', description: 'Failure modes and effects analysis', isCore: false, version: '1.0.0' },
  { code: 'rca_analysis', name: 'Root Cause Analysis', description: '5-Why and fishbone analysis', isCore: false, version: '1.0.0' },
];

// ============================================================================
// 5. DEPARTMENTS
// ============================================================================

const departments = [
  { name: 'Maintenance', code: 'MAINT', description: 'Maintenance and repair department' },
  { name: 'Production', code: 'PROD', description: 'Production operations' },
  { name: 'Engineering', code: 'ENG', description: 'Engineering services' },
  { name: 'Quality Control', code: 'QC', description: 'Quality assurance and control' },
  { name: 'Warehouse & Logistics', code: 'WH', description: 'Warehouse and spare parts management' },
  { name: 'Health Safety & Environment', code: 'HSE', description: 'Health, safety, and environment' },
  { name: 'Utilities', code: 'UTIL', description: 'Utilities and services' },
];

// ============================================================================
// 6. PLANTS
// ============================================================================

const plants = [
  { name: 'Kumasi Plant', code: 'KUMASI', location: 'Kumasi, Ashanti Region', type: 'plant' },
  { name: 'Takoradi Facility', code: 'TAKORADI', location: 'Takoradi, Western Region', type: 'facility' },
];

// ============================================================================
// 7. DEMO USERS
// ============================================================================

const DEFAULT_PASSWORD = 'demo1234';

interface DemoUser {
  username: string;
  email: string;
  fullName: string;
  staffId: string;
  roleSlug: string;
  department: string;
  plantCode: string;
  primaryTrade: string;
}

const demoUsers: DemoUser[] = [
  { username: 'planner1', email: 'planner@iassetspro.com', fullName: 'Kwame Planner', staffId: 'PLN-001', roleSlug: 'maintenance_planner', department: 'Maintenance', plantCode: 'TEMA', primaryTrade: 'Mechanical Engineer' },
  { username: 'supervisor1', email: 'supervisor@iassetspro.com', fullName: 'Ama Supervisor', staffId: 'SUP-001', roleSlug: 'maintenance_supervisor', department: 'Production', plantCode: 'TEMA', primaryTrade: 'Production Supervisor' },
  { username: 'tech1', email: 'tech@iassetspro.com', fullName: 'Kofi Technician', staffId: 'TEC-001', roleSlug: 'maintenance_technician', department: 'Maintenance', plantCode: 'TEMA', primaryTrade: 'Mechanical Fitter' },
  { username: 'operator1', email: 'operator@iassetspro.com', fullName: 'Akua Operator', staffId: 'OPR-001', roleSlug: 'production_operator', department: 'Production', plantCode: 'TEMA', primaryTrade: 'Machine Operator' },
  { username: 'manager1', email: 'manager1@iassetspro.com', fullName: 'Nana Plant Manager', staffId: 'PMG-001', roleSlug: 'plant_manager', department: 'Maintenance', plantCode: 'TEMA', primaryTrade: 'Operations Manager' },
  { username: 'maint_mgr1', email: 'maint_mgr1@iassetspro.com', fullName: 'Efua Maint Manager', staffId: 'MMG-001', roleSlug: 'maintenance_manager', department: 'Maintenance', plantCode: 'TEMA', primaryTrade: 'Mechanical Engineer' },
  { username: 'tech2', email: 'tech2@iassetspro.com', fullName: 'Yaw Technician', staffId: 'TEC-002', roleSlug: 'maintenance_technician', department: 'Maintenance', plantCode: 'KUMASI', primaryTrade: 'Electrician' },
  { username: 'prod_mgr1', email: 'prod_mgr1@iassetspro.com', fullName: 'Adwoa Prod Manager', staffId: 'PRM-001', roleSlug: 'production_manager', department: 'Production', plantCode: 'TEMA', primaryTrade: 'Production Manager' },
  { username: 'op2', email: 'op2@iassetspro.com', fullName: 'Kwabena Operator', staffId: 'OPR-002', roleSlug: 'production_operator', department: 'Production', plantCode: 'KUMASI', primaryTrade: 'Machine Operator' },
  { username: 'inv_mgr1', email: 'inv_mgr1@iassetspro.com', fullName: 'Abena Inv Manager', staffId: 'IVM-001', roleSlug: 'inventory_manager', department: 'Warehouse & Logistics', plantCode: 'TEMA', primaryTrade: 'Supply Chain' },
  { username: 'store1', email: 'store1@iassetspro.com', fullName: 'Kwaku Store Keeper', staffId: 'STK-001', roleSlug: 'store_keeper', department: 'Warehouse & Logistics', plantCode: 'TEMA', primaryTrade: 'Storekeeping' },
  { username: 'qual_mgr1', email: 'qual_mgr1@iassetspro.com', fullName: 'Ama Quality Mgr', staffId: 'QAM-001', roleSlug: 'quality_manager', department: 'Quality Control', plantCode: 'TEMA', primaryTrade: 'Quality Engineer' },
  { username: 'safety1', email: 'safety1@iassetspro.com', fullName: 'Kojo Safety Officer', staffId: 'SAF-001', roleSlug: 'safety_officer', department: 'Health Safety & Environment', plantCode: 'TEMA', primaryTrade: 'HSE Officer' },
  { username: 'hr1', email: 'hr1@iassetspro.com', fullName: 'Afia HR Manager', staffId: 'HRM-001', roleSlug: 'hr_manager', department: 'Engineering', plantCode: 'TEMA', primaryTrade: 'Human Resources' },
  { username: 'iot1', email: 'iot1@iassetspro.com', fullName: 'Emmanuel IoT Engineer', staffId: 'IOT-001', roleSlug: 'iot_engineer', department: 'Engineering', plantCode: 'TAKORADI', primaryTrade: 'Instrumentation Technician' },
  { username: 'viewer1', email: 'viewer1@iassetspro.com', fullName: 'Grace Viewer', staffId: 'VWR-001', roleSlug: 'viewer', department: 'Utilities', plantCode: 'TEMA', primaryTrade: 'Utility Technician' },
  { username: 'toolshop1', email: 'toolshop1@iassetspro.com', fullName: 'Kofi Tools Shop', staffId: 'TLS-001', roleSlug: 'tools_shop_attendant', department: 'Maintenance', plantCode: 'TEMA', primaryTrade: 'Workshop Technician' },
  { username: 'store2', email: 'store2@iassetspro.com', fullName: 'Ama Store Attendant', staffId: 'STK-002', roleSlug: 'store_keeper', department: 'Warehouse & Logistics', plantCode: 'KUMASI', primaryTrade: 'Storekeeping' },
  { username: 'tech_eng1', email: 'tech_eng1@iassetspro.com', fullName: 'Kwame Engineering Tech', staffId: 'TEC-003', roleSlug: 'maintenance_technician', department: 'Engineering', plantCode: 'TEMA', primaryTrade: 'Instrumentation Fitter' },
  { username: 'tech_prod1', email: 'tech_prod1@iassetspro.com', fullName: 'Esi Production Tech', staffId: 'TEC-004', roleSlug: 'maintenance_technician', department: 'Production', plantCode: 'TEMA', primaryTrade: 'Mechanical Fitter' },
  { username: 'tech_util1', email: 'tech_util1@iassetspro.com', fullName: 'Kojo Utilities Tech', staffId: 'TEC-005', roleSlug: 'maintenance_technician', department: 'Utilities', plantCode: 'TEMA', primaryTrade: 'Electrical Technician' },
];

// ============================================================================
// MAIN SEED FUNCTION
// ============================================================================

async function main() {
  console.log('=== Targeted Seed — Creating Missing Data ===\n');

  // ── 1. Permissions ──
  console.log('[1/7] Seeding permissions...');
  let permCount = 0;
  for (const [moduleName, actions] of Object.entries(modulePermissions)) {
    for (const action of actions) {
      const slug = `${moduleName}.${action}`;
      await db.permission.upsert({
        where: { slug },
        update: {},
        create: { slug, module: moduleName, action, name: `${moduleName} ${action}` },
      });
      permCount++;
    }
  }
  console.log(`  ✅ ${permCount} permissions ensured\n`);

  // ── 2. Roles ──
  console.log('[2/7] Seeding roles...');
  const createdRoles: Record<string, string> = {};
  
  // Also ensure admin role exists
  const adminRole = await db.role.upsert({
    where: { slug: 'admin' },
    update: {},
    create: { name: 'Administrator', slug: 'admin', description: 'Full system access', level: 100, isSystem: true },
  });
  createdRoles['admin'] = adminRole.id;

  for (const roleDef of roleDefinitions) {
    const role = await db.role.upsert({
      where: { slug: roleDef.slug },
      update: {},
      create: { name: roleDef.name, slug: roleDef.slug, description: roleDef.description, level: roleDef.level, isSystem: roleDef.isSystem },
    });
    createdRoles[roleDef.slug] = role.id;
  }
  console.log(`  ✅ ${Object.keys(createdRoles).length} roles ensured\n`);

  // ── 3. Role-Permission Assignments ──
  console.log('[3/7] Assigning role permissions...');
  let rpCount = 0;
  for (const [roleSlug, permSlugs] of Object.entries(rolePermissionBundles)) {
    const roleId = createdRoles[roleSlug];
    if (!roleId) continue;

    for (const permSlug of permSlugs) {
      const perm = await db.permission.findUnique({ where: { slug: permSlug } });
      if (!perm) continue;

      await db.rolePermission.upsert({
        where: { roleId_permissionId: { roleId, permissionId: perm.id } },
        update: {},
        create: { roleId, permissionId: perm.id },
      });
      rpCount++;
    }
  }
  console.log(`  ✅ ${rpCount} role-permission assignments ensured\n`);

  // ── 4. System Modules + Company Modules ──
  console.log('[4/7] Seeding system modules...');
  let modCount = 0;
  for (const mod of systemModules) {
    const sysMod = await db.systemModule.upsert({
      where: { code: mod.code },
      update: {},
      create: {
        code: mod.code,
        name: mod.name,
        description: mod.description,
        version: mod.version,
        isCore: mod.isCore,
        isSystemLicensed: mod.isCore,
      },
    });

    // Create CompanyModule to enable it
    await db.companyModule.upsert({
      where: {
        systemModuleId_companyId: {
          systemModuleId: sysMod.id,
          companyId: '__default__',
        },
      },
      update: {
        isActive: mod.isCore,
        isEnabled: mod.isCore,
        licensedAt: mod.isCore ? new Date('2024-01-01') : null,
        activatedAt: mod.isCore ? new Date('2024-01-01') : null,
      },
      create: {
        systemModuleId: sysMod.id,
        companyId: '__default__',
        isActive: mod.isCore,
        isEnabled: mod.isCore,
        licensedAt: mod.isCore ? new Date('2024-01-01') : null,
        activatedAt: mod.isCore ? new Date('2024-01-01') : null,
      },
    });
    modCount++;
  }
  console.log(`  ✅ ${modCount} system modules + company modules ensured\n`);

  // ── 5. Departments ──
  console.log('[5/7] Seeding departments...');
  let deptCount = 0;
  const createdDepts: Record<string, string> = {};
  for (const dept of departments) {
    // Department.code is not globally unique and plantId is required. Match the
    // existing record within an actual plant instead of using an invalid upsert key.
    const anyPlant = await db.plant.findFirst({ select: { id: true } });
    if (!anyPlant) {
      console.warn('  ⚠️ No plant exists yet; skipping department seed until a plant is available');
      break;
    }
    const existingDepartment = await db.department.findFirst({
      where: { code: dept.code, plantId: anyPlant.id },
    });
    const d = existingDepartment ?? await db.department.create({
      data: {
        name: dept.name,
        code: dept.code,
        plantId: anyPlant.id,
      },
    });
    createdDepts[dept.name] = d.id;
    deptCount++;
  }
  console.log(`  ✅ ${deptCount} departments ensured\n`);

  // ── 6. Plants ──
  console.log('[6/7] Seeding additional plants...');
  let plantCount = 0;
  const createdPlants: Record<string, string> = {};
  for (const plant of plants) {
    const p = await db.plant.upsert({
      where: { code: plant.code },
      update: {},
      create: {
        name: plant.name,
        code: plant.code,
        location: plant.location,
      },
    });
    createdPlants[plant.code] = p.id;
    plantCount++;
  }
  // Also get the existing plant (Tema Factory)
  const existingPlants = await db.plant.findMany({ select: { id: true, code: true } });
  for (const ep of existingPlants) {
    createdPlants[ep.code] = ep.id;
  }
  console.log(`  ✅ ${plantCount} additional plants + ${existingPlants.length} existing\n`);

  // ── 7. Demo Users ──
  console.log('[7/7] Seeding demo users...');
  const passwordHash = await hash(DEFAULT_PASSWORD, 12);
  let userCount = 0;

  for (const u of demoUsers) {
    // Check if user already exists
    const existing = await db.user.findUnique({ where: { username: u.username } });
    if (existing) {
      console.log(`  ⏭️  ${u.username} already exists, skipping`);
      userCount++;
      continue;
    }

    // Find role
    const roleId = createdRoles[u.roleSlug];
    if (!roleId) {
      console.log(`  ⚠️  Role ${u.roleSlug} not found, skipping ${u.username}`);
      continue;
    }

    // Find plant
    const plantId = createdPlants[u.plantCode];
    if (!plantId) {
      console.log(`  ⚠️  Plant ${u.plantCode} not found, skipping ${u.username}`);
      continue;
    }

    // Find department
    const dept = await db.department.findFirst({ where: { name: u.department } });
    const deptId = dept?.id;

    // Create user
    const user = await db.user.create({
      data: {
        username: u.username,
        email: u.email,
        fullName: u.fullName,
        staffId: u.staffId,
        passwordHash,
        status: 'active',
        department: deptId || null,
        primaryTrade: u.primaryTrade,
      },
    });

    // Assign role
    await db.userRole.create({
      data: { userId: user.id, roleId },
    });

    // Assign plant access
    await db.userPlant.create({
      data: {
        userId: user.id,
        plantId,
        accessLevel: 'full',
        isPrimary: true,
      },
    });

    console.log(`  ✅ ${u.username} (${u.fullName}) → ${u.roleSlug}`);
    userCount++;
  }
  console.log(`\n  ✅ ${userCount} demo users ensured (password: ${DEFAULT_PASSWORD})\n`);

  // ── Summary ──
  console.log('=== Seed Complete ===');
  console.log(`  Permissions: ${permCount}`);
  console.log(`  Roles: ${Object.keys(createdRoles).length}`);
  console.log(`  Role-Permissions: ${rpCount}`);
  console.log(`  System Modules: ${modCount}`);
  console.log(`  Departments: ${deptCount}`);
  console.log(`  Plants: ${Object.keys(createdPlants).length}`);
  console.log(`  Demo Users: ${userCount} (all passwords: ${DEFAULT_PASSWORD})`);
  console.log('\n  Admin password: admin123');
  console.log('  All other users password: demo1234');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e.message);
    process.exit(1);
  })
  .finally(() => process.exit(0));
