import { PrismaClient } from '@prisma/client';

// ══════════════════════════════════════════════════════════════════════════
// PERMISSION-ONLY SEED — Non-destructive, safe for production
// ══════════════════════════════════════════════════════════════════════════
//
// This script ONLY touches: permissions, roles, and role_permissions tables.
// It does NOT truncate any tables. Safe to run on production databases.
//
// What it does:
//   1. Upserts all permission slugs (creates new ones, updates names if changed)
//   2. Upserts all roles (creates new ones, updates metadata if changed)
//   3. Clears and re-syncs role-permission mappings from the bundles
//
// Usage:
//   bun run prisma/seed-permissions-only.ts
//   -- OR with explicit env vars:
//   DB_HOST=localhost DB_USER=root DB_PASSWORD=xxx DB_NAME=eam bun run prisma/seed-permissions-only.ts

console.log('🔧 Connecting to database...');

// Ensure DATABASE_URL is set
if (!process.env.DATABASE_URL || !process.env.DATABASE_URL.includes('mysql://')) {
  const host = process.env.DB_HOST || 'localhost';
  const port = process.env.DB_PORT || '3306';
  const user = process.env.DB_USER || 'root';
  const password = process.env.DB_PASSWORD || '';
  const database = process.env.DB_NAME || 'ifleetpro_eam_system';
  process.env.DATABASE_URL = `mysql://${user}:${password}@${host}:${port}/${database}`;
  console.log(`  📡 Built DATABASE_URL from individual env vars -> ${host}/${database}`);
} else {
  console.log(`  📡 Using DATABASE_URL -> ${process.env.DATABASE_URL.replace(/:[^:@]+@/, ':***@')}`);
}

// Create Prisma client
let db: PrismaClient;
try {
  const _url = new URL(process.env.DATABASE_URL!);
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createAdapter } = require('../src/lib/create-mariadb-adapter');
  const _adapter = createAdapter({
    host: _url.hostname,
    port: parseInt(_url.port || '3306', 10),
    user: decodeURIComponent(_url.username),
    password: decodeURIComponent(_url.password),
    database: _url.pathname.slice(1),
  });
  db = new PrismaClient({ adapter: _adapter, log: ['warn', 'error'] });
} catch {
  db = new PrismaClient({ log: ['warn', 'error'] });
}

// ============================================================================
// PERMISSION DEFINITIONS — Must match prisma/seed.ts
// ============================================================================

const modulePermissions: Record<string, string[]> = {
  // ── CORE (~47) ──
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

  // ── ASSET (~47) ──
  assets: ['view', 'view_all', 'view_own', 'create', 'update', 'delete', 'export', 'import', 'bulk_update', 'manage', 'hierarchy', 'relationships', 'health', 'criticality'],
  equipment: ['view', 'create', 'update', 'delete'],
  assemblies: ['view', 'create', 'update', 'delete', 'manage'],
  bom: ['view', 'create', 'update', 'delete', 'import', 'export', 'manage'],
  facilities: ['view', 'create', 'update', 'delete'],
  meters: ['view', 'create', 'update', 'delete', 'read'],
  tools: ['view', 'create', 'update', 'delete', 'manage', 'checkout', 'return', 'transfer'],

  // ── RWOP / WORK ORDERS (~58) ──
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
  time_logs: ['view', 'view_team', 'create', 'update', 'delete'],

  // ── Repair Module (~18) ──
  repair_material_requests: ['view', 'view_all', 'view_own', 'create', 'update'],
  repair_tool_requests: ['view', 'view_all', 'view_own', 'create', 'update'],
  repair_tool_transfers: ['view', 'view_all', 'view_own', 'create', 'update'],
  spare_part_returns: ['view', 'view_all', 'view_own', 'create', 'update'],
  damaged_tool_reports: ['view', 'view_all', 'create', 'update'],

  // ── MRMP / PM (~28) ──
  pm_schedules: ['view', 'create', 'update', 'delete', 'activate', 'run'],
  pm_templates: ['view', 'create', 'update', 'delete'],
  pm_triggers: ['view', 'create', 'update'],
  pm_checklists: ['view', 'create', 'update', 'delete'],
  pm_notifications: ['view'],
  pm_analytics: ['view'],
  pm_work_orders: ['view'],
  calibration: ['view', 'create', 'update', 'delete', 'manage'],
  asset_health: ['view'],
  condition_monitoring: ['view', 'manage'],

  // ── IMS / INVENTORY (~46) ──
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

  // ── HRMS (~24) ──
  employees: ['view', 'create', 'update'],
  shifts: ['view', 'create', 'update', 'assign'],
  shift_handovers: ['view', 'create'],
  training: ['view', 'create', 'update', 'manage'],
  skills: ['view', 'create', 'update'],
  skill_categories: ['view', 'manage'],
  technician_groups: ['view', 'create', 'update'],
  assignments: ['view', 'create', 'update'],

  // ── MPMP / PRODUCTION (~27) ──
  production: ['view', 'create', 'update', 'manage'],
  production_surveys: ['view', 'create', 'update', 'manage'],
  oee: ['view', 'manage'],
  downtime: ['view', 'create', 'manage'],
  quality_checks: ['view', 'create', 'update'],
  energy: ['view', 'manage'],
  work_centers: ['view', 'create', 'update'],
  production_targets: ['view', 'create', 'update'],
  production_batches: ['view', 'create', 'update', 'delete'],

  // ── UMBRELLA / DOMAIN-LEVEL (for sidebar menu visibility) ──
  iot: ['view'],
  analytics: ['view'],
  operations: ['view'],
  quality: ['view'],
  safety: ['view'],

  // ── TRAC / SAFETY (~20) ──
  safety_incidents: ['view', 'create', 'update', 'delete', 'manage'],
  safety_inspections: ['view', 'create', 'update', 'delete', 'manage'],
  safety_equipment: ['view', 'create', 'update', 'delete'],
  safety_permits: ['view', 'create', 'update', 'delete', 'approve', 'close'],
  risk_assessments: ['view', 'create', 'update', 'manage'],

  // ── IOT (~11) ──
  iot_devices: ['view', 'create', 'update', 'delete'],
  iot_monitoring: ['view'],
  iot_rules: ['view', 'create', 'update', 'delete'],
  predictive: ['view', 'analyze'],

  // ── DIGITAL_TWIN (~5) ──
  digital_twin: ['view', 'manage'],
  model_viewer: ['view'],
  hotspots: ['view', 'manage'],

  // ── REPORTS (~7) ──
  reports: ['view', 'create', 'generate', 'export', 'manage', 'schedule', 'customize'],

  // ── QUALITY (~17) ──
  quality_inspections: ['view', 'create', 'update', 'delete'],
  quality_ncr: ['view', 'create', 'update', 'delete'],
  quality_audits: ['view', 'create', 'update', 'delete'],
  quality_control_plans: ['view', 'create', 'update'],
  spc: ['view', 'manage'],
};

// ============================================================================
// ROLE DEFINITIONS — Must match prisma/seed.ts
// ============================================================================

const roleDefinitions = [
  { name: 'Administrator', slug: 'admin', description: 'Full system access with all permissions', level: 100, isSystem: true },
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
// ROLE PERMISSION BUNDLES — Must match prisma/seed.ts
// ============================================================================

const rolePermissionBundles: Record<string, string[]> = {
  // ── 1. ADMIN: all permissions (handled programmatically) ──

  // ── 2. PLANT MANAGER ──
  plant_manager: [
    'dashboard.view', 'dashboard.stats', 'chat.view',
    'users.view', 'roles.view', 'permissions.view',
    'departments.view', 'departments.create', 'departments.update',
    'plants.view', 'plants.update',
    'notifications.view',
    'audit_logs.view', 'system_settings.view', 'modules.view',
    'documents.view', 'company.view', 'company.update',
    'assets.view', 'assets.view_all', 'assets.health', 'assets.criticality', 'assets.hierarchy',
    'equipment.view', 'assemblies.view', 'bom.view', 'facilities.view',
    'meters.view', 'tools.view',
    'maintenance_requests.view', 'maintenance_requests.view_all', 'maintenance_requests.dashboard',
    'work_orders.view', 'work_orders.view_all', 'work_orders.dashboard',
    'work_order_templates.view', 'recurring_work_orders.view',
    'approvals.view', 'verifications.view', 'sla.view', 'rca.view', 'time_logs.view',
    'pm_schedules.view', 'pm_analytics.view', 'pm_work_orders.view',
    'pm_templates.view', 'pm_checklists.view', 'calibration.view',
    'asset_health.view', 'condition_monitoring.view',
    'inventory.view', 'inventory.view_all',
    'parts.view', 'parts_categories.view', 'material_requisitions.view',
    'vendors.view', 'stock_transactions.view', 'purchase_orders.view',
    'inventory_locations.view', 'inventory_adjustments.view', 'inventory_adjustments.update', 'inventory_transfers.view', 'inventory_transfers.update',
    'employees.view', 'shifts.view', 'shift_handovers.view',
    'training.view', 'skills.view', 'skill_categories.view',
    'technician_groups.view', 'assignments.view',
    'production.view', 'production_surveys.view',
    'oee.view', 'downtime.view', 'quality_checks.view', 'energy.view',
    'work_centers.view', 'production_targets.view', 'production_batches.view',
    'safety_incidents.view', 'safety_inspections.view',
    'safety_equipment.view', 'safety_permits.view', 'risk_assessments.view',
    'iot_devices.view', 'iot_monitoring.view', 'iot_rules.view', 'predictive.view',
    'digital_twin.view', 'model_viewer.view', 'hotspots.view',
    'reports.view', 'reports.export',
    'quality_inspections.view', 'quality_ncr.view',
    'quality_audits.view', 'quality_control_plans.view', 'spc.view',
    'iot.view', 'analytics.view', 'operations.view', 'quality.view', 'safety.view',
  ],

  // ── 3. MAINTENANCE MANAGER ──
  maintenance_manager: [
    'dashboard.view', 'dashboard.stats', 'chat.view',
    'documents.view', 'documents.upload', 'documents.download',
    'notifications.view', 'notifications.manage',
    'assets.view', 'assets.view_all', 'assets.create', 'assets.update', 'assets.delete',
    'assets.export', 'assets.manage', 'assets.hierarchy', 'assets.health', 'assets.criticality',
    'equipment.view', 'equipment.create', 'equipment.update',
    'assemblies.view', 'assemblies.create', 'assemblies.update', 'assemblies.manage',
    'bom.view', 'bom.create', 'bom.update', 'bom.manage',
    'facilities.view',
    'meters.view', 'meters.create', 'meters.update',
    'tools.view', 'tools.create', 'tools.update', 'tools.manage',
    'maintenance_requests.view', 'maintenance_requests.view_all', 'maintenance_requests.create',
    'maintenance_requests.update', 'maintenance_requests.approve', 'maintenance_requests.reject',
    'maintenance_requests.triage', 'maintenance_requests.assign_planner',
    'maintenance_requests.convert_to_wo', 'maintenance_requests.my_queue',
    'maintenance_requests.archive',
    'work_orders.view', 'work_orders.view_all', 'work_orders.create', 'work_orders.update',
    'work_orders.delete', 'work_orders.assign_supervisor', 'work_orders.assign_technician',
    'work_orders.complete', 'work_orders.verify', 'work_orders.reopen', 'work_orders.close',
    'work_orders.adjust_cost', 'work_orders.failure_analysis', 'work_orders.dashboard',
    'work_orders.bulk_update', 'work_orders.cancel',
    'work_order_templates.view', 'work_order_templates.create', 'work_order_templates.update',
    'recurring_work_orders.view', 'recurring_work_orders.create', 'recurring_work_orders.update',
    'approvals.view', 'approvals.approve', 'approvals.reject',
    'verifications.view', 'verifications.check',
    'sla.view', 'sla.manage',
    'failure_codes.view', 'failure_codes.manage',
    'rca.view', 'rca.create', 'rca.update',
    'assistance_requests.view', 'assistance_requests.create', 'assistance_requests.respond',
    'time_logs.view', 'time_logs.create', 'time_logs.update',
    'pm_schedules.view', 'pm_schedules.create', 'pm_schedules.update', 'pm_schedules.delete',
    'pm_schedules.activate', 'pm_schedules.run',
    'pm_templates.view', 'pm_templates.create', 'pm_templates.update', 'pm_templates.delete',
    'pm_triggers.view', 'pm_triggers.create', 'pm_triggers.update',
    'pm_checklists.view', 'pm_checklists.create', 'pm_checklists.update', 'pm_checklists.delete',
    'pm_notifications.view', 'pm_analytics.view', 'pm_work_orders.view',
    'calibration.view', 'calibration.create', 'calibration.update', 'calibration.manage',
    'asset_health.view', 'condition_monitoring.view', 'condition_monitoring.manage',
    'inventory.view', 'inventory.view_all', 'parts.view',
    'repair_material_requests.view', 'repair_material_requests.view_all', 'repair_material_requests.update',
    'repair_tool_requests.view', 'repair_tool_requests.view_all', 'repair_tool_requests.update',
    'repair_tool_transfers.view', 'repair_tool_transfers.view_all', 'repair_tool_transfers.update',
    'spare_part_returns.view', 'spare_part_returns.view_all', 'spare_part_returns.update',
    'damaged_tool_reports.view', 'damaged_tool_reports.view_all', 'damaged_tool_reports.update',
    'reports.view', 'reports.export', 'reports.generate',
    'analytics.view', 'operations.view',
  ],

  // ── 4. MAINTENANCE PLANNER ──
  maintenance_planner: [
    'dashboard.view', 'dashboard.stats', 'chat.view',
    'documents.view', 'documents.upload', 'documents.download',
    'notifications.view',
    'assets.view', 'assets.view_all', 'assets.create', 'assets.update',
    'assets.hierarchy', 'assets.health', 'assets.criticality',
    'equipment.view', 'equipment.create', 'equipment.update',
    'assemblies.view', 'assemblies.create', 'assemblies.update',
    'bom.view', 'bom.create', 'bom.update',
    'facilities.view',
    'meters.view', 'meters.read', 'tools.view',
    'maintenance_requests.view', 'maintenance_requests.view_all', 'maintenance_requests.create',
    'maintenance_requests.update', 'maintenance_requests.triage',
    'maintenance_requests.convert_to_wo', 'maintenance_requests.my_queue',
    'work_orders.view', 'work_orders.view_all', 'work_orders.create', 'work_orders.update',
    'work_orders.assign_supervisor', 'work_orders.assign_technician',
    'work_orders.close', 'work_orders.failure_analysis', 'work_orders.dashboard',
    'work_orders.bulk_update', 'work_orders.cancel',
    'work_order_templates.view', 'work_order_templates.create', 'work_order_templates.update',
    'recurring_work_orders.view', 'recurring_work_orders.create', 'recurring_work_orders.update',
    'approvals.view', 'verifications.view',
    'sla.view', 'sla.manage',
    'failure_codes.view', 'failure_codes.manage',
    'rca.view', 'rca.create', 'rca.update',
    'time_logs.view',
    'pm_schedules.view', 'pm_schedules.create', 'pm_schedules.update', 'pm_schedules.delete',
    'pm_schedules.activate', 'pm_schedules.run',
    'pm_templates.view', 'pm_templates.create', 'pm_templates.update', 'pm_templates.delete',
    'pm_triggers.view', 'pm_triggers.create', 'pm_triggers.update',
    'pm_checklists.view', 'pm_checklists.create', 'pm_checklists.update', 'pm_checklists.delete',
    'pm_notifications.view', 'pm_analytics.view', 'pm_work_orders.view',
    'calibration.view', 'calibration.create', 'calibration.update',
    'asset_health.view', 'condition_monitoring.view',
    'inventory.view', 'parts.view',
    'repair_material_requests.view', 'repair_material_requests.view_all', 'repair_material_requests.update',
    'repair_tool_requests.view', 'repair_tool_requests.view_all', 'repair_tool_requests.update',
    'repair_tool_transfers.view', 'repair_tool_transfers.view_all', 'repair_tool_transfers.update',
    'spare_part_returns.view', 'spare_part_returns.view_all', 'spare_part_returns.update',
    'damaged_tool_reports.view', 'damaged_tool_reports.view_all', 'damaged_tool_reports.update',
    'reports.view', 'reports.export', 'reports.generate',
    'analytics.view', 'operations.view',
  ],

  // ── 5. MAINTENANCE SUPERVISOR ──
  maintenance_supervisor: [
    'dashboard.view', 'chat.view',
    'documents.view', 'documents.upload', 'documents.download',
    'notifications.view',
    'assets.view', 'assets.view_all', 'assets.update',
    'assets.health', 'assets.criticality',
    'equipment.view', 'meters.view', 'meters.read', 'tools.view',
    'maintenance_requests.view', 'maintenance_requests.view_all',
    'maintenance_requests.update', 'maintenance_requests.approve', 'maintenance_requests.reject',
    'maintenance_requests.assign_planner',
    'work_orders.view', 'work_orders.view_all', 'work_orders.update',
    'work_orders.assign_technician', 'work_orders.complete', 'work_orders.verify',
    'work_orders.reopen', 'work_orders.dashboard',
    'work_order_templates.view',
    'approvals.view', 'approvals.approve', 'approvals.reject',
    'verifications.view', 'verifications.check',
    'sla.view', 'failure_codes.view',
    'rca.view', 'rca.create', 'rca.update',
    'assistance_requests.view', 'assistance_requests.create', 'assistance_requests.respond',
    'time_logs.view', 'time_logs.create', 'time_logs.update',
    'pm_schedules.view', 'pm_schedules.activate',
    'pm_checklists.view', 'pm_notifications.view',
    'calibration.view', 'asset_health.view', 'condition_monitoring.view',
    'inventory.view', 'parts.view',
    'repair_material_requests.view', 'repair_material_requests.view_all', 'repair_material_requests.update',
    'repair_tool_requests.view', 'repair_tool_requests.view_all', 'repair_tool_requests.update',
    'repair_tool_transfers.view', 'repair_tool_transfers.view_all', 'repair_tool_transfers.update',
    'spare_part_returns.view', 'spare_part_returns.view_all', 'spare_part_returns.update',
    'damaged_tool_reports.view', 'damaged_tool_reports.view_all', 'damaged_tool_reports.update',
    'reports.view', 'reports.export', 'operations.view',
  ],

  // ── 6. MAINTENANCE TECHNICIAN ──
  maintenance_technician: [
    'dashboard.view', 'chat.view',
    'documents.view', 'documents.download',
    'notifications.view',
    'assets.view', 'assets.view_own',
    'equipment.view', 'meters.view', 'meters.read',
    'tools.checkout', 'tools.return',
    'maintenance_requests.view_own',
    'maintenance_requests.create', 'maintenance_requests.update',
    'work_orders.view_own', 'work_orders.update',
    'work_orders.start', 'work_orders.complete',
    'assistance_requests.view', 'assistance_requests.create',
    'time_logs.view', 'time_logs.create', 'time_logs.update',
    'pm_schedules.view', 'pm_schedules.run',
    'pm_checklists.view', 'pm_notifications.view',
    'repair_tool_requests.view_own', 'repair_tool_requests.create',
    'repair_material_requests.view_own', 'repair_material_requests.create',
    'repair_tool_transfers.view_own', 'repair_tool_transfers.create',
    'spare_part_returns.view_own', 'spare_part_returns.create',
    'damaged_tool_reports.create',
    
  ],

  // ── 7. PRODUCTION MANAGER ──
  production_manager: [
    'dashboard.view', 'dashboard.stats', 'chat.view',
    'documents.view', 'documents.upload', 'documents.download',
    'notifications.view', 'notifications.manage',
    'assets.view', 'assets.view_all', 'assets.health', 'assets.criticality',
    'equipment.view', 'facilities.view',
    'work_centers.view', 'work_centers.create', 'work_centers.update',
    'production.view', 'production.create', 'production.update', 'production.manage',
    'production_surveys.view', 'production_surveys.create', 'production_surveys.update', 'production_surveys.manage',
    'oee.view', 'oee.manage',
    'downtime.view', 'downtime.create', 'downtime.manage',
    'quality_checks.view', 'quality_checks.create', 'quality_checks.update',
    'energy.view', 'energy.manage',
    'production_targets.view', 'production_targets.create', 'production_targets.update',
    'production_batches.view', 'production_batches.create', 'production_batches.update', 'production_batches.delete',
    'maintenance_requests.view', 'maintenance_requests.view_all', 'maintenance_requests.create',
    'work_orders.view', 'work_orders.view_all',
    'inventory.view', 'inventory.view_all',
    'employees.view', 'shifts.view', 'assignments.view',
    'reports.view', 'reports.export', 'reports.generate', 'reports.create',
    'analytics.view', 'operations.view',
  ],

  // ── 8. PRODUCTION OPERATOR ──
  production_operator: [
    'dashboard.view', 'chat.view',
    'documents.view', 'documents.download',
    'notifications.view',
    'assets.view', 'assets.view_own',
    'equipment.view',
    'production.view',
    'production_surveys.view', 'production_surveys.create', 'production_surveys.update',
    'downtime.view', 'downtime.create',
    'quality_checks.view',
    'maintenance_requests.view_own', 'maintenance_requests.create',
    'work_orders.view_own',
    'time_logs.view', 'time_logs.create',
  ],

  // ── 9. INVENTORY MANAGER ──
  inventory_manager: [
    'dashboard.view', 'dashboard.stats', 'chat.view',
    'documents.view', 'documents.upload', 'documents.download',
    'notifications.view', 'notifications.manage',
    'inventory.view', 'inventory.view_all', 'inventory.create', 'inventory.update',
    'inventory.delete', 'inventory.stock_in', 'inventory.stock_out', 'inventory.reserve',
    'inventory.consume', 'inventory.export', 'inventory.manage', 'inventory.forecast',
    'parts.view', 'parts.create', 'parts.update', 'parts.delete',
    'parts_categories.view', 'parts_categories.create', 'parts_categories.update',
    'material_requisitions.view', 'material_requisitions.create', 'material_requisitions.update', 'material_requisitions.approve',
    'material_requisitions.issue', 'material_requisitions.reject',
    'vendors.view', 'vendors.create', 'vendors.update', 'vendors.delete', 'vendors.manage',
    'stock_transactions.view',
    'purchase_orders.view', 'purchase_orders.create', 'purchase_orders.update',
    'purchase_orders.approve', 'purchase_orders.receive', 'purchase_orders.manage',
    'inventory_locations.view', 'inventory_locations.create', 'inventory_locations.update',
    'inventory_locations.delete',
    'inventory_adjustments.view', 'inventory_adjustments.create', 'inventory_adjustments.update', 'inventory_adjustments.approve',
    'inventory_transfers.view', 'inventory_transfers.create', 'inventory_transfers.update', 'inventory_transfers.approve',
    'assets.view', 'work_orders.view', 'work_orders.view_all',
    'maintenance_requests.view',
    'reports.view', 'reports.export', 'reports.generate',
    'analytics.view',
  ],

  // ── 10. TOOLS SHOP ATTENDANT ──
  tools_shop_attendant: [
    'dashboard.view', 'chat.view',
    'documents.view', 'documents.download',
    'notifications.view',
    'tools.view', 'tools.create', 'tools.update', 'tools.checkout', 'tools.return', 'tools.transfer', 'tools.manage',
    'repair_tool_transfers.view_all', 'repair_tool_transfers.create', 'repair_tool_transfers.update',
    'spare_part_returns.view_all', 'spare_part_returns.create', 'spare_part_returns.update',
    'damaged_tool_reports.view_all', 'damaged_tool_reports.create', 'damaged_tool_reports.update',
    'repair_tool_requests.view_all', 'repair_tool_requests.update',
    'repair_material_requests.view_all', 'repair_material_requests.update',
    'assets.view', 'work_orders.view', 'maintenance_requests.view',
    'inventory.view', 'parts.view',
    'reports.view', 'reports.export',
  ],

  // ── 11. STORE KEEPER ──
  store_keeper: [
    'dashboard.view', 'chat.view',
    'documents.view', 'documents.download',
    'notifications.view',
    'inventory.view', 'inventory.stock_in', 'inventory.stock_out',
    'inventory.reserve', 'inventory.export',
    'parts.view', 'parts.update', 'parts_categories.view',
    'material_requisitions.view', 'material_requisitions.issue',
    'vendors.view', 'stock_transactions.view',
    'purchase_orders.view', 'purchase_orders.receive',
    'inventory_locations.view',
    'inventory_adjustments.view', 'inventory_adjustments.create', 'inventory_adjustments.update',
    'inventory_transfers.view', 'inventory_transfers.update',
    'repair_tool_transfers.view_all', 'repair_tool_transfers.update',
    'repair_tool_requests.view_all', 'repair_tool_requests.update',
    'repair_material_requests.view_all', 'repair_material_requests.update',
    'spare_part_returns.view_all', 'spare_part_returns.update',
    'damaged_tool_reports.view_all', 'damaged_tool_reports.update',
    'reports.view',
  ],

  // ── 12. QUALITY MANAGER ──
  quality_manager: [
    'dashboard.view', 'dashboard.stats', 'chat.view',
    'documents.view', 'documents.upload', 'documents.download',
    'notifications.view', 'notifications.manage',
    'quality_inspections.view', 'quality_inspections.create', 'quality_inspections.update', 'quality_inspections.delete',
    'quality_ncr.view', 'quality_ncr.create', 'quality_ncr.update', 'quality_ncr.delete',
    'quality_audits.view', 'quality_audits.create', 'quality_audits.update', 'quality_audits.delete',
    'quality_control_plans.view', 'quality_control_plans.create', 'quality_control_plans.update',
    'spc.view', 'spc.manage',
    'calibration.view', 'calibration.create', 'calibration.update', 'calibration.delete', 'calibration.manage',
    'assets.view', 'assets.view_all',
    'equipment.view', 'meters.view',
    'work_orders.view', 'work_orders.view_all',
    'maintenance_requests.view',
    'reports.view', 'reports.export', 'reports.generate', 'reports.create',
    'quality.view',
  ],

  // ── 13. SAFETY OFFICER ──
  safety_officer: [
    'dashboard.view', 'chat.view',
    'documents.view', 'documents.upload', 'documents.download',
    'notifications.view', 'notifications.manage',
    'safety_incidents.view', 'safety_incidents.create', 'safety_incidents.update', 'safety_incidents.delete', 'safety_incidents.manage',
    'safety_inspections.view', 'safety_inspections.create', 'safety_inspections.update', 'safety_inspections.delete', 'safety_inspections.manage',
    'safety_equipment.view', 'safety_equipment.create', 'safety_equipment.update', 'safety_equipment.delete',
    'safety_permits.view', 'safety_permits.create', 'safety_permits.update', 'safety_permits.delete', 'safety_permits.approve', 'safety_permits.close',
    'risk_assessments.view', 'risk_assessments.create', 'risk_assessments.update', 'risk_assessments.manage',
    'assets.view', 'employees.view',
    'work_orders.view',
    'reports.view', 'reports.export', 'reports.generate',
    'safety.view',
  ],

  // ── 14. HR MANAGER ──
  hr_manager: [
    'dashboard.view', 'dashboard.stats', 'chat.view',
    'operations.view', 'system_settings.view',
    'documents.view', 'documents.upload', 'documents.download',
    'notifications.view', 'notifications.manage',
    'users.view', 'users.create', 'users.update',
    'employees.view', 'employees.create', 'employees.update',
    'shifts.view', 'shifts.create', 'shifts.update', 'shifts.assign',
    'shift_handovers.view', 'shift_handovers.create',
    'training.view', 'training.create', 'training.update', 'training.manage',
    'skills.view', 'skills.create', 'skills.update',
    'skill_categories.view', 'skill_categories.manage',
    'technician_groups.view', 'technician_groups.create', 'technician_groups.update',
    'assignments.view', 'assignments.create', 'assignments.update',
    'departments.view', 'plants.view',
    'reports.view', 'reports.export', 'reports.generate',
  ],

  // ── 15. IOT ENGINEER ──
  iot_engineer: [
    'dashboard.view', 'chat.view',
    'documents.view', 'documents.upload', 'documents.download',
    'notifications.view',
    'assets.view', 'assets.view_all', 'equipment.view',
    'iot_devices.view', 'iot_devices.create', 'iot_devices.update', 'iot_devices.delete',
    'iot_monitoring.view',
    'iot_rules.view', 'iot_rules.create', 'iot_rules.update', 'iot_rules.delete',
    'predictive.view', 'predictive.analyze',
    'asset_health.view', 'condition_monitoring.view', 'condition_monitoring.manage',
    'meters.view', 'meters.create', 'meters.update',
    'reports.view', 'reports.export', 'reports.generate',
    'iot.view', 'analytics.view',
  ],

  // ── 16. VIEWER ──
  viewer: [
    'dashboard.view', 'chat.view',
    'documents.view', 'notifications.view',
    'users.view', 'roles.view', 'permissions.view',
    'departments.view', 'plants.view',
    'assets.view', 'equipment.view', 'assemblies.view', 'bom.view',
    'facilities.view', 'meters.view', 'tools.view',
    'maintenance_requests.view',
    'work_orders.view', 'work_order_templates.view', 'recurring_work_orders.view',
    'approvals.view', 'verifications.view',
    'sla.view', 'failure_codes.view', 'rca.view',
    'assistance_requests.view', 'time_logs.view',
    'pm_schedules.view', 'pm_templates.view', 'pm_checklists.view',
    'calibration.view', 'asset_health.view', 'condition_monitoring.view',
    'inventory.view', 'parts.view', 'parts_categories.view',
    'material_requisitions.view', 'vendors.view', 'stock_transactions.view',
    'purchase_orders.view', 'inventory_locations.view',
    'inventory_adjustments.view', 'inventory_transfers.view',
    'employees.view', 'shifts.view', 'shift_handovers.view',
    'training.view', 'skills.view', 'skill_categories.view',
    'technician_groups.view', 'assignments.view',
    'production.view', 'production_surveys.view',
    'oee.view', 'downtime.view', 'quality_checks.view',
    'energy.view', 'work_centers.view', 'production_targets.view', 'production_batches.view',
    'safety_incidents.view', 'safety_inspections.view',
    'safety_equipment.view', 'safety_permits.view', 'risk_assessments.view',
    'iot_devices.view', 'iot_monitoring.view', 'iot_rules.view',
    'predictive.view', 'digital_twin.view', 'model_viewer.view', 'hotspots.view',
    'reports.view',
    'quality_inspections.view', 'quality_ncr.view',
    'quality_audits.view', 'quality_control_plans.view', 'spc.view',
    'company.view',
    'iot.view', 'analytics.view', 'operations.view', 'quality.view', 'safety.view',
  ],
};

// ============================================================================
// HELPERS
// ============================================================================

function formatModuleName(mod: string): string {
  return mod
    .split('_')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function formatActionName(action: string): string {
  return action
    .split('_')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// ============================================================================
// MAIN
// ============================================================================

async function seedPermissionsOnly() {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  iAssetsPro EAM — Permission-Only Seed (NON-DESTRUCTIVE)');
  console.log('═══════════════════════════════════════════════════════════════\n');
  console.log('⚠️  This script ONLY modifies: permissions, roles, role_permissions');
  console.log('   All other data (users, assets, work orders, etc.) is UNTOUCHED.\n');

  // ── Test connection ──
  try {
    await db.$queryRawUnsafe('SELECT 1 as ok');
    console.log('✅ Database connection successful\n');
  } catch (connErr) {
    console.error('❌ FATAL: Cannot connect to database!');
    console.error('   Error:', (connErr as Error).message);
    process.exit(1);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // STEP 1: UPSERT PERMISSIONS (non-destructive — only creates new, updates existing names)
  // ══════════════════════════════════════════════════════════════════════════
  console.log('📋 Upserting permissions...');
  const permissionMap: Record<string, string> = {};
  let createdCount = 0;
  let updatedCount = 0;

  for (const [moduleName, actions] of Object.entries(modulePermissions)) {
    for (const action of actions) {
      const slug = `${moduleName}.${action}`;
      const name = `${formatModuleName(moduleName)} - ${formatActionName(action)}`;
      const description = `${formatActionName(action)} access for ${formatModuleName(moduleName)} module`;

      const permission = await db.permission.upsert({
        where: { slug },
        update: { name, module: moduleName, action, description },
        create: { slug, name, module: moduleName, action, description },
      });

      permissionMap[slug] = permission.id;
      createdCount++;
    }
  }
  console.log(`  ✅ Processed ${createdCount} permission slugs across ${Object.keys(modulePermissions).length} modules\n`);

  // ══════════════════════════════════════════════════════════════════════════
  // STEP 2: UPSERT ROLES
  // ══════════════════════════════════════════════════════════════════════════
  console.log('🔑 Upserting roles...');
  const createdRoles: Record<string, string> = {};

  for (const roleDef of roleDefinitions) {
    const role = await db.role.upsert({
      where: { slug: roleDef.slug },
      update: {
        name: roleDef.name,
        description: roleDef.description,
        level: roleDef.level,
        isSystem: roleDef.isSystem,
      },
      create: {
        name: roleDef.name,
        slug: roleDef.slug,
        description: roleDef.description,
        level: roleDef.level,
        isSystem: roleDef.isSystem,
      },
    });
    createdRoles[roleDef.slug] = role.id;
  }
  console.log(`  ✅ Processed ${roleDefinitions.length} roles\n`);

  // ══════════════════════════════════════════════════════════════════════════
  // STEP 3: CLEAR AND RE-SYNC ROLE-PERMISSION MAPPINGS
  // ══════════════════════════════════════════════════════════════════════════
  console.log('🔗 Syncing role-permission mappings...');

  // Clear ALL existing mappings
  const deleted = await db.rolePermission.deleteMany();
  console.log(`  🗑️  Cleared ${deleted.count} existing mappings`);

  // Admin gets ALL permissions
  const allPermIds = Object.values(permissionMap);
  await db.rolePermission.createMany({
    data: allPermIds.map((pid) => ({ roleId: createdRoles['admin'], permissionId: pid })),
    skipDuplicates: true,
  });
  console.log(`  ✅ admin: ${allPermIds.length} permissions (ALL)`);

  // Other roles get their bundles
  let totalMappings = 0;
  for (const [roleSlug, permSlugs] of Object.entries(rolePermissionBundles)) {
    const roleId = createdRoles[roleSlug];
    if (!roleId) {
      console.log(`  ⚠️  Role "${roleSlug}" not found in roleDefinitions — skipping`);
      continue;
    }

    const validPermIds: string[] = [];
    for (const slug of permSlugs) {
      const pid = permissionMap[slug];
      if (pid) validPermIds.push(pid);
    }

    if (validPermIds.length > 0) {
      await db.rolePermission.createMany({
        data: validPermIds.map((pid) => ({ roleId, permissionId: pid })),
        skipDuplicates: true,
      });
    }
    console.log(`  ✅ ${roleSlug}: ${validPermIds.length} permissions`);
    totalMappings += validPermIds.length;
  }

  console.log(`\n  📊 Total non-admin role-permission mappings: ${totalMappings}`);
  console.log(`  📊 Total including admin: ${totalMappings + allPermIds.length}\n`);

  // ══════════════════════════════════════════════════════════════════════════
  // VERIFICATION
  // ══════════════════════════════════════════════════════════════════════════
  console.log('🔍 Verification...');
  const totalPerms = await db.permission.count();
  const totalRoles = await db.role.count();
  const totalMappingsDb = await db.rolePermission.count();

  console.log(`  Permissions in DB: ${totalPerms}`);
  console.log(`  Roles in DB: ${totalRoles}`);
  console.log(`  Role-permission mappings in DB: ${totalMappingsDb}`);

  if (totalPerms === createdCount && totalRoles === roleDefinitions.length) {
    console.log('\n✅ ═════════════════════════════════════════════════════════════');
    console.log('   PERMISSION SEED COMPLETE — All users should re-login');
    console.log('══════════════════════════════════════════════════════════════ ✅\n');
  } else {
    console.log('\n⚠️  Permission seed completed with warnings — check counts above\n');
  }

  await db.$disconnect();
}

seedPermissionsOnly().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
