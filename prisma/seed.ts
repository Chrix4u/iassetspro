import { PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';
import { seedCanonicalTransitions } from '../src/lib/state-machine';

// ══════════════════════════════════════════════════════════════════════════
// DATABASE CONNECTION — Robust, adapter-free for seed scripts
// ══════════════════════════════════════════════════════════════════════════
//
// Why no adapter? The PrismaMariaDb adapter requires exact package versions
// and can fail silently on some VPS setups. For seed scripts, the built-in
// Prisma MySQL driver works perfectly with MariaDB and is more reliable.
//
// Usage:
//   DATABASE_URL="mysql://user:pass@host:3306/dbname" npx tsx prisma/seed.ts
//   -- OR with individual env vars:
//   DB_HOST=localhost DB_USER=root DB_PASSWORD=xxx DB_NAME=eam npx tsx prisma/seed.ts

console.log('🔧 Connecting to database...');

// Ensure DATABASE_URL is set (either directly or from individual vars)
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

// Parse DATABASE_URL and create adapter-based client for MySQL/MariaDB
let _dbClient: PrismaClient;
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
  _dbClient = new PrismaClient({ adapter: _adapter, log: ['warn', 'error'] });
} catch (e) {
  console.warn('Failed to create adapter client, falling back:', (e as Error).message);
  _dbClient = new PrismaClient({ log: ['warn', 'error'] });
}
const db = _dbClient;

// ============================================================================
// 1. PERMISSION DEFINITIONS — 11 modules with structured actions
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
  damaged_tool_reports: ['view', 'view_all', 'view_own', 'create', 'update'],

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
// 2. ROLE DEFINITIONS — 15 roles
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
// 3. ROLE PERMISSION BUNDLES
// ============================================================================

// Helper: expand a module into all its action slugs
function mod(moduleName: string, actions: string[]): string[] {
  return actions.map((a) => `${moduleName}.${a}`);
}

// Helper: get all "view" permissions for a list of modules
function allViews(modules: string[]): string[] {
  return modules.map((m) => `${m}.view`);
}

const rolePermissionBundles: Record<string, string[]> = {
  // ── 1. ADMIN: all permissions (handled programmatically) ──

  // ── 2. PLANT MANAGER: broad view + limited create/update ──
  plant_manager: [
    'dashboard.view', 'dashboard.stats', 'chat.view',
    'users.view',
    'roles.view',
    'permissions.view',
    'departments.view', 'departments.create', 'departments.update',
    'plants.view', 'plants.update',
    'notifications.view',
    'audit_logs.view',
    'system_settings.view',
    'modules.view',
    'documents.view',
    'company.view', 'company.update',
    'assets.view', 'assets.view_all', 'assets.health', 'assets.criticality', 'assets.hierarchy',
    'equipment.view',
    'assemblies.view',
    'bom.view',
    'facilities.view',
    'meters.view',
    'tools.view',
    'maintenance_requests.view', 'maintenance_requests.view_all', 'maintenance_requests.dashboard',
    'work_orders.view', 'work_orders.view_all', 'work_orders.dashboard',
    'work_order_templates.view',
    'recurring_work_orders.view',
    'approvals.view',
    'verifications.view',
    'sla.view',
    'rca.view',
    'time_logs.view',
    'pm_schedules.view', 'pm_analytics.view', 'pm_work_orders.view',
    'pm_templates.view', 'pm_checklists.view',
    'calibration.view',
    'asset_health.view', 'condition_monitoring.view',
    'inventory.view', 'inventory.view_all',
    'parts.view', 'parts_categories.view',
    'material_requisitions.view',
    'vendors.view',
    'stock_transactions.view',
    'purchase_orders.view',
    'inventory_locations.view',
    'inventory_adjustments.view', 'inventory_adjustments.update',
    'inventory_transfers.view', 'inventory_transfers.update',
    'employees.view',
    'shifts.view',
    'shift_handovers.view',
    'training.view', 'skills.view', 'skill_categories.view',
    'technician_groups.view', 'assignments.view',
    'production.view', 'production_surveys.view',
    'oee.view', 'downtime.view',
    'quality_checks.view', 'energy.view',
    'work_centers.view', 'production_targets.view', 'production_batches.view',
    'safety_incidents.view', 'safety_inspections.view',
    'safety_equipment.view', 'safety_permits.view', 'risk_assessments.view',
    'iot_devices.view', 'iot_monitoring.view', 'iot_rules.view',
    'predictive.view',
    'digital_twin.view', 'model_viewer.view', 'hotspots.view',
    'reports.view', 'reports.export',
    'quality_inspections.view', 'quality_ncr.view',
    'quality_audits.view', 'quality_control_plans.view', 'spc.view',
    'iot.view', 'analytics.view', 'operations.view', 'quality.view', 'safety.view',
  ],

  // ── 3. MAINTENANCE MANAGER: full RWOP + MRMP + assets ──
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
    'inventory.view', 'inventory.view_all',
    'parts.view',
    'repair_material_requests.view', 'repair_material_requests.view_all', 'repair_material_requests.update',
    'repair_tool_requests.view', 'repair_tool_requests.view_all', 'repair_tool_requests.update',
    'repair_tool_transfers.view', 'repair_tool_transfers.view_all', 'repair_tool_transfers.update',
    'spare_part_returns.view', 'spare_part_returns.view_all', 'spare_part_returns.update',
    'damaged_tool_reports.view', 'damaged_tool_reports.view_all', 'damaged_tool_reports.update',
    'reports.view', 'reports.export', 'reports.generate',
    'analytics.view', 'operations.view',
  ],

  // ── 4. MAINTENANCE PLANNER: RWOP manage + MRMP manage ──
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
    'meters.view', 'meters.read',
    'tools.view',
    'maintenance_requests.view', 'maintenance_requests.view_all', 'maintenance_requests.create',
    'maintenance_requests.update',
    'maintenance_requests.triage',
    'maintenance_requests.convert_to_wo', 'maintenance_requests.my_queue',
    'work_orders.view', 'work_orders.view_all', 'work_orders.create', 'work_orders.update',
    'work_orders.assign_supervisor', 'work_orders.assign_technician',
    'work_orders.close', 'work_orders.failure_analysis', 'work_orders.dashboard',
    'work_orders.bulk_update', 'work_orders.cancel',
    'work_order_templates.view', 'work_order_templates.create', 'work_order_templates.update',
    'recurring_work_orders.view', 'recurring_work_orders.create', 'recurring_work_orders.update',
    'approvals.view',
    'verifications.view',
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
    'inventory.view',
    'parts.view',
    'repair_material_requests.view', 'repair_material_requests.view_all', 'repair_material_requests.update',
    'repair_tool_requests.view', 'repair_tool_requests.view_all', 'repair_tool_requests.update',
    'repair_tool_transfers.view', 'repair_tool_transfers.view_all', 'repair_tool_transfers.update',
    'spare_part_returns.view', 'spare_part_returns.view_all', 'spare_part_returns.update',
    'damaged_tool_reports.view', 'damaged_tool_reports.view_all', 'damaged_tool_reports.update',
    'reports.view', 'reports.export', 'reports.generate',
    'analytics.view', 'operations.view',
  ],

  // ── 5. MAINTENANCE SUPERVISOR: RWOP manage + execute ──
  maintenance_supervisor: [
    'dashboard.view', 'chat.view',
    'documents.view', 'documents.upload', 'documents.download',
    'notifications.view',
    'assets.view', 'assets.view_all', 'assets.update',
    'assets.health', 'assets.criticality',
    'equipment.view',
    'meters.view', 'meters.read',
    'tools.view',
    'maintenance_requests.view', 'maintenance_requests.view_all',
    'maintenance_requests.update', 'maintenance_requests.approve', 'maintenance_requests.reject',
    'maintenance_requests.assign_planner',
    'work_orders.view', 'work_orders.view_all', 'work_orders.update',
    'work_orders.assign_technician', 'work_orders.complete', 'work_orders.verify',
    'work_orders.reopen', 'work_orders.dashboard',
    'work_order_templates.view',
    'approvals.view', 'approvals.approve', 'approvals.reject',
    'verifications.view', 'verifications.check',
    'sla.view',
    'failure_codes.view',
    'rca.view', 'rca.create', 'rca.update',
    'assistance_requests.view', 'assistance_requests.create', 'assistance_requests.respond',
    'time_logs.view', 'time_logs.create', 'time_logs.update',
    'pm_schedules.view', 'pm_schedules.activate',
    'pm_checklists.view',
    'pm_notifications.view',
    'calibration.view',
    'asset_health.view', 'condition_monitoring.view',
    'inventory.view',
    'repair_material_requests.view', 'repair_material_requests.view_all', 'repair_material_requests.update',
    'repair_tool_requests.view', 'repair_tool_requests.view_all', 'repair_tool_requests.update',
    'repair_tool_transfers.view', 'repair_tool_transfers.view_all', 'repair_tool_transfers.update',
    'spare_part_returns.view', 'spare_part_returns.view_all', 'spare_part_returns.update',
    'damaged_tool_reports.view', 'damaged_tool_reports.view_all', 'damaged_tool_reports.update',
    'reports.view', 'reports.export',
    'operations.view',
  ],

  // ── 6. MAINTENANCE TECHNICIAN: own WOs, execute, PM execute ──
  maintenance_technician: [
    'dashboard.view', 'chat.view',
    'documents.view', 'documents.download',
    'notifications.view',
    'assets.view', 'assets.view_own',
    'equipment.view',
    'meters.view', 'meters.read',
    'tools.view', 'tools.checkout', 'tools.return',
    'maintenance_requests.view_own',
    'maintenance_requests.create', 'maintenance_requests.update',
    'work_orders.view_own', 'work_orders.update',
    'work_orders.start', 'work_orders.complete',
    'assistance_requests.view', 'assistance_requests.create',
    'time_logs.view', 'time_logs.create', 'time_logs.update',
    'pm_schedules.view', 'pm_schedules.run',
    'pm_checklists.view',
    'pm_notifications.view',
    'parts.view',
    'repair_tool_requests.view_own', 'repair_tool_requests.create',
    'repair_material_requests.view_own', 'repair_material_requests.create',
    'repair_tool_transfers.view_own', 'repair_tool_transfers.create',
    'spare_part_returns.view_own', 'spare_part_returns.create',
    'damaged_tool_reports.create',
  ],

  // ── 7. PRODUCTION MANAGER: full MPMP ──
  production_manager: [
    'dashboard.view', 'dashboard.stats', 'chat.view',
    'documents.view', 'documents.upload', 'documents.download',
    'notifications.view', 'notifications.manage',
    'assets.view', 'assets.view_all', 'assets.health', 'assets.criticality',
    'equipment.view',
    'facilities.view',
    'work_centers.view', 'work_centers.create', 'work_centers.update',
    'production.view', 'production.create', 'production.update', 'production.manage',
    'production_surveys.view', 'production_surveys.create', 'production_surveys.update', 'production_surveys.manage',
    'oee.view', 'oee.manage',
    'downtime.view', 'downtime.create', 'downtime.manage',
    'quality_checks.view', 'quality_checks.create', 'quality_checks.update',
    'energy.view', 'energy.manage',
    'production_targets.view', 'production_targets.create', 'production_targets.update',
    'production_batches.view', 'production_batches.create', 'production_batches.update', 'production_batches.delete',
    'maintenance_requests.view', 'maintenance_requests.view_all',
    'maintenance_requests.create',
    'work_orders.view', 'work_orders.view_all',
    'inventory.view', 'inventory.view_all',
    'employees.view', 'shifts.view', 'assignments.view',
    'reports.view', 'reports.export', 'reports.generate', 'reports.create',
    'analytics.view', 'operations.view',
  ],

  // ── 8. PRODUCTION OPERATOR: own data entry, surveys, own requests only ──
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
    'maintenance_requests.view_own',
    'maintenance_requests.create',
    'work_orders.view_own',
    'time_logs.view', 'time_logs.create',
  ],

  // ── 9. INVENTORY MANAGER: full IMS ──
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
    'assets.view',
    'work_orders.view', 'work_orders.view_all',
    'maintenance_requests.view',
    'reports.view', 'reports.export', 'reports.generate',
    'analytics.view',
  ],

  // ── 10. TOOLS SHOP ATTENDANT: tool checkout, returns, transfers ──
  tools_shop_attendant: [
    'dashboard.view', 'chat.view',
    'documents.view', 'documents.download',
    'notifications.view',
    'tools.view', 'tools.create', 'tools.update', 'tools.checkout', 'tools.return', 'tools.transfer', 'tools.manage',
    'assets.view',
    'work_orders.view',
    'maintenance_requests.view',
    'inventory.view',
    'repair_tool_transfers.view_all', 'repair_tool_transfers.create', 'repair_tool_transfers.update',
    'repair_tool_requests.view_all', 'repair_tool_requests.update',
    'repair_material_requests.view_all', 'repair_material_requests.update',
    'spare_part_returns.view_all', 'spare_part_returns.create', 'spare_part_returns.update',
    'damaged_tool_reports.view_all', 'damaged_tool_reports.create', 'damaged_tool_reports.update',
    'reports.view', 'reports.export',
  ],

  // ── 11. STORE KEEPER: IMS limited ──
  store_keeper: [
    'dashboard.view', 'chat.view',
    'documents.view', 'documents.download',
    'notifications.view',
    'inventory.view', 'inventory.stock_in', 'inventory.stock_out',
    'inventory.reserve', 'inventory.export',
    'parts.view', 'parts.update',
    'parts_categories.view',
    'material_requisitions.view', 'material_requisitions.issue',
    'vendors.view',
    'stock_transactions.view',
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

  // ── 11. QUALITY MANAGER: quality + calibration ──
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
    'equipment.view',
    'meters.view', 'meters.read',
    'work_orders.view', 'work_orders.view_all',
    'maintenance_requests.view',
    'reports.view', 'reports.export', 'reports.generate', 'reports.create',
    'quality.view',
  ],

  // ── 12. SAFETY OFFICER: full TRAC ──
  safety_officer: [
    'dashboard.view', 'chat.view',
    'documents.view', 'documents.upload', 'documents.download',
    'notifications.view', 'notifications.manage',
    'safety_incidents.view', 'safety_incidents.create', 'safety_incidents.update', 'safety_incidents.delete', 'safety_incidents.manage',
    'safety_inspections.view', 'safety_inspections.create', 'safety_inspections.update', 'safety_inspections.delete', 'safety_inspections.manage',
    'safety_equipment.view', 'safety_equipment.create', 'safety_equipment.update', 'safety_equipment.delete',
    'safety_permits.view', 'safety_permits.create', 'safety_permits.update', 'safety_permits.delete', 'safety_permits.approve', 'safety_permits.close',
    'risk_assessments.view', 'risk_assessments.create', 'risk_assessments.update', 'risk_assessments.manage',
    'assets.view',
    'employees.view',
    'work_orders.view',
    'reports.view', 'reports.export', 'reports.generate',
    'safety.view',
  ],

  // ── 13. HR MANAGER: full HRMS ──
  hr_manager: [
    'dashboard.view', 'dashboard.stats', 'chat.view',
    'operations.view',
    'system_settings.view',
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
    'departments.view',
    'plants.view',
    'reports.view', 'reports.export', 'reports.generate',
  ],

  // ── 14. IOT ENGINEER: full IOT ──
  iot_engineer: [
    'dashboard.view', 'chat.view',
    'documents.view', 'documents.upload', 'documents.download',
    'notifications.view',
    'assets.view', 'assets.view_all',
    'equipment.view',
    'iot_devices.view', 'iot_devices.create', 'iot_devices.update', 'iot_devices.delete',
    'iot_monitoring.view',
    'iot_rules.view', 'iot_rules.create', 'iot_rules.update', 'iot_rules.delete',
    'predictive.view', 'predictive.analyze',
    'asset_health.view', 'condition_monitoring.view', 'condition_monitoring.manage',
    'meters.view', 'meters.create', 'meters.update',
    'reports.view', 'reports.export', 'reports.generate',
    'iot.view', 'analytics.view',
  ],

  // ── 15. VIEWER: read-only across most modules ──
  viewer: [
    'dashboard.view', 'chat.view',
    'documents.view',
    'notifications.view',
    'users.view',
    'roles.view',
    'permissions.view',
    'departments.view',
    'plants.view',
    'assets.view',
    'equipment.view',
    'assemblies.view',
    'bom.view',
    'facilities.view',
    'meters.view',
    'tools.view',
    'maintenance_requests.view',
    'work_orders.view',
    'work_order_templates.view',
    'recurring_work_orders.view',
    'approvals.view',
    'verifications.view',
    'sla.view',
    'failure_codes.view',
    'rca.view',
    'assistance_requests.view',
    'time_logs.view',
    'pm_schedules.view',
    'pm_templates.view',
    'pm_checklists.view',
    'calibration.view',
    'asset_health.view',
    'condition_monitoring.view',
    'inventory.view',
    'parts.view',
    'parts_categories.view',
    'material_requisitions.view',
    'vendors.view',
    'stock_transactions.view',
    'purchase_orders.view',
    'inventory_locations.view',
    'inventory_adjustments.view',
    'inventory_transfers.view',
    'employees.view',
    'shifts.view',
    'shift_handovers.view',
    'training.view',
    'skills.view',
    'skill_categories.view',
    'technician_groups.view',
    'assignments.view',
    'production.view',
    'production_surveys.view',
    'oee.view',
    'downtime.view',
    'quality_checks.view',
    'energy.view',
    'work_centers.view',
    'production_targets.view',
    'production_batches.view',
    'safety_incidents.view',
    'safety_inspections.view',
    'safety_equipment.view',
    'safety_permits.view',
    'risk_assessments.view',
    'iot_devices.view',
    'iot_monitoring.view',
    'iot_rules.view',
    'predictive.view',
    'digital_twin.view',
    'model_viewer.view',
    'hotspots.view',
    'reports.view',
    'quality_inspections.view',
    'quality_ncr.view',
    'quality_audits.view',
    'quality_control_plans.view',
    'spc.view',
    'company.view',
    'iot.view', 'analytics.view', 'operations.view', 'quality.view', 'safety.view',
  ],
};

// ============================================================================
// MAIN SEED FUNCTION
// ============================================================================

async function seed() {
  console.log('\n🌱 ═══════════════════════════════════════════════════');
  console.log('   iAssetsPro EAM System — Database Seed');
  console.log('════════════════════════════════════════════════════\n');

  // ── Test database connection first ──
  try {
    await db.$queryRawUnsafe('SELECT 1 as ok');
    console.log('✅ Database connection successful\n');
  } catch (connErr) {
    console.error('❌ FATAL: Cannot connect to database!');
    console.error('   Error:', (connErr as Error).message);
    console.error('\n   Please check:');
    console.error('   1. DATABASE_URL is set correctly');
    console.error('   2. Database server is running');
    console.error('   3. User has proper permissions');
    console.error('   4. Database exists');
    process.exit(1);
  }

  // ── Clear existing data for clean re-seed ──
  // ⚠️  WARNING: This is a DESTRUCTIVE operation. Use seed-permissions-only.ts for production updates.
  console.log('🗑️  Clearing existing data...');
  console.log('  ⚠️  DESTRUCTIVE — this will delete ALL data. For non-destructive updates, use seed-permissions-only.ts');
  try {
    // Method 1: TRUNCATE with FK checks disabled (fastest)
    // NOTE: The MariaDB adapter may use connection pooling, so SET FOREIGN_KEY_CHECKS
    // might not persist across queries. We use a single multi-statement approach.
    const tables = await db.$queryRawUnsafe(
      `SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME != '_prisma_migrations'`
    );
    const tableNames = (tables as Array<{ TABLE_NAME: string }>).map(t => t.TABLE_NAME);
    if (tableNames.length > 0) {
      // Use a Prisma interactive transaction so all DELETE queries share one connection.
      // This allows SET FOREIGN_KEY_CHECKS=0 to persist across all subsequent deletes.
      console.log(`  🗑️  Clearing ${tableNames.length} tables via raw SQL in transaction...`);
      await db.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SET FOREIGN_KEY_CHECKS = 0`);
        for (const t of tableNames) {
          try {
            await tx.$executeRawUnsafe(`DELETE FROM \`${t}\``);
          } catch {
            /* skip — some tables may not exist yet or have circular refs */
          }
        }
        await tx.$executeRawUnsafe(`SET FOREIGN_KEY_CHECKS = 1`);
      });
      console.log(`  ✅ Cleared ${tableNames.length} tables`);
    } else {
      console.log('  ℹ️  No tables found (fresh database)');
    }
  } catch (e) {
    console.error('  ❌ All clear methods failed:', (e as Error).message);
  }
  console.log('');

  // ══════════════════════════════════════════════════════════════════════════
  // STEP 1: CREATE PERMISSIONS
  // ══════════════════════════════════════════════════════════════════════════
  console.log('📋 Creating permissions...');

  const permissionMap: Record<string, string> = {}; // slug → id
  let permCount = 0;

  for (const [moduleName, actions] of Object.entries(modulePermissions)) {
    for (const action of actions) {
      const slug = `${moduleName}.${action}`;
      const permission = await db.permission.upsert({
        where: { slug },
        update: {}, // no-op on re-seed since we cleared
        create: {
          slug,
          name: `${formatModuleName(moduleName)} - ${formatActionName(action)}`,
          module: moduleName,
          action,
          description: `${formatActionName(action)} access for ${formatModuleName(moduleName)} module`,
        },
      });
      permissionMap[slug] = permission.id;
      permCount++;
    }
  }

  console.log(`✅ Created ${permCount} permissions across 11 modules (${Object.keys(modulePermissions).length} sub-modules)\n`);

  // ══════════════════════════════════════════════════════════════════════════
  // STEP 2: CREATE ROLES
  // ══════════════════════════════════════════════════════════════════════════
  console.log('🔑 Creating roles...');

  const createdRoles: Record<string, string> = {}; // slug → id

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

  console.log(`✅ Created ${roleDefinitions.length} roles\n`);

  // ══════════════════════════════════════════════════════════════════════════
  // STEP 3: ASSIGN PERMISSIONS TO ROLES
  // ══════════════════════════════════════════════════════════════════════════
  console.log('🔗 Assigning permissions to roles...');

  // Admin gets ALL permissions
  const allPermIds = Object.values(permissionMap);
  await db.rolePermission.deleteMany({}); // Clear stale permissions before re-assigning
  await db.rolePermission.createMany({
    data: allPermIds.map((pid) => ({
      roleId: createdRoles['admin'],
      permissionId: pid,
    })),
  });
  console.log(`  ✅ admin: ${allPermIds.length} permissions (ALL)`);

  // Other roles get their bundles
  for (const [roleSlug, permSlugs] of Object.entries(rolePermissionBundles)) {
    const roleId = createdRoles[roleSlug];
    if (!roleId) continue;

    const validPermIds: string[] = [];
    for (const slug of permSlugs) {
      const pid = permissionMap[slug];
      if (pid) validPermIds.push(pid);
    }

    await db.rolePermission.createMany({
      data: validPermIds.map((pid) => ({
        roleId,
        permissionId: pid,
      })),
    });
    console.log(`  ✅ ${roleSlug}: ${validPermIds.length} permissions`);
  }

  console.log('');

  // ══════════════════════════════════════════════════════════════════════════
  // STEP 4: CREATE DEFAULT PLANTS & DEPARTMENTS (Ghana Enterprise)
  // ══════════════════════════════════════════════════════════════════════════
  console.log('🏭 Creating default plants & departments...');

  // ── 3 Ghanaian Plants ──
  const temaFactory = await db.plant.create({
    data: {
      name: 'Tema Factory',
      code: 'TEM-001',
      location: 'Tema Heavy Industrial Area',
      country: 'Ghana',
      city: 'Tema',
      isActive: true,
    },
  });
  console.log('  ✅ Created Tema Factory (TEM-001) — Tema, Greater Accra');

  const kumasiPlant = await db.plant.create({
    data: {
      name: 'Kumasi Plant',
      code: 'KUM-001',
      location: 'Kaase Industrial Area',
      country: 'Ghana',
      city: 'Kumasi',
      isActive: true,
    },
  });
  console.log('  ✅ Created Kumasi Plant (KUM-001) — Kumasi, Ashanti');

  const takoradiFacility = await db.plant.create({
    data: {
      name: 'Takoradi Facility',
      code: 'TAK-001',
      location: 'Sekondi-Takoradi Industrial Zone',
      country: 'Ghana',
      city: 'Takoradi',
      isActive: true,
    },
  });
  console.log('  ✅ Created Takoradi Facility (TAK-001) — Takoradi, Western');

  // Primary plant for demo data (Tema Factory)
  const plant = temaFactory;

  // ── 7 Ghana-Typical Departments ──
  const deptMaint = await db.department.create({
    data: { name: 'Maintenance', code: 'MAINT', plantId: temaFactory.id },
  });
  const deptProd = await db.department.create({
    data: { name: 'Production', code: 'PROD', plantId: temaFactory.id },
  });
  const deptQC = await db.department.create({
    data: { name: 'Quality Control', code: 'QC', plantId: temaFactory.id },
  });
  const deptEng = await db.department.create({
    data: { name: 'Engineering', code: 'ENG', plantId: temaFactory.id },
  });
  const deptHSE = await db.department.create({
    data: { name: 'Health Safety & Environment', code: 'HSE', plantId: temaFactory.id },
  });
  const deptWH = await db.department.create({
    data: { name: 'Warehouse & Logistics', code: 'WH', plantId: temaFactory.id },
  });
  const deptUtil = await db.department.create({
    data: { name: 'Utilities', code: 'UTIL', plantId: temaFactory.id },
  });

  // Additional departments for Kumasi Plant
  const deptMaintK = await db.department.create({
    data: { name: 'Maintenance', code: 'MAINT-K', plantId: kumasiPlant.id },
  });
  const deptProdK = await db.department.create({
    data: { name: 'Production', code: 'PROD-K', plantId: kumasiPlant.id },
  });

  // Additional departments for Takoradi Facility
  const deptMaintT = await db.department.create({
    data: { name: 'Maintenance', code: 'MAINT-T', plantId: takoradiFacility.id },
  });
  const deptProdT = await db.department.create({
    data: { name: 'Production', code: 'PROD-T', plantId: takoradiFacility.id },
  });

  // Primary department for demo data
  const dept = deptMaint;

  console.log('  ✅ Created 7 departments on Tema Factory');
  console.log('  ✅ Created 2 departments on Kumasi Plant');
  console.log('  ✅ Created 2 departments on Takoradi Facility\n');

  // ══════════════════════════════════════════════════════════════════════════
  // STEP 5: CREATE USERS
  // ══════════════════════════════════════════════════════════════════════════
  console.log('👤 Creating users...');

  // Admin user (password: admin123) — assigned to Tema Factory, Maintenance
  const adminPassword = await hash('admin123', 10);
  const admin = await db.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      email: 'admin@iassetspro.com',
      passwordHash: adminPassword,
      fullName: 'System Administrator',
      staffId: 'ADM-001',
      department: 'Maintenance',
      status: 'active',
      userRoles: { create: { roleId: createdRoles['admin'] } },
      plantAccess: {
        createMany: {
          data: [
            { plantId: temaFactory.id, accessLevel: 'admin', isPrimary: true },
            { plantId: kumasiPlant.id, accessLevel: 'admin', isPrimary: false },
            { plantId: takoradiFacility.id, accessLevel: 'admin', isPrimary: false },
          ],
        },
      },
    },
  });
  console.log('  ✅ Admin: admin / admin123 (Tema Factory)');

  // Original demo users (password: password123) — spread across Ghana plants
  const originalDemoUsers: Array<{
    username: string; email: string; fullName: string; staffId: string;
    roleSlug: string; department: string; supervisorDept?: boolean; plantId: string;
    primaryTrade?: string;
  }> = [
    { username: 'planner1', email: 'planner@iassetspro.com', fullName: 'Kwame Planner', staffId: 'PLN-001', roleSlug: 'maintenance_planner', department: 'Maintenance', plantId: temaFactory.id, primaryTrade: 'Mechanical Engineer' },
    { username: 'supervisor1', email: 'supervisor@iassetspro.com', fullName: 'Ama Supervisor', staffId: 'SUP-001', roleSlug: 'maintenance_supervisor', department: 'Production', supervisorDept: true, plantId: temaFactory.id, primaryTrade: 'Production Supervisor' },
    { username: 'tech1', email: 'tech@iassetspro.com', fullName: 'Kofi Technician', staffId: 'TEC-001', roleSlug: 'maintenance_technician', department: 'Maintenance', plantId: temaFactory.id, primaryTrade: 'Mechanical Fitter' },
    { username: 'operator1', email: 'operator@iassetspro.com', fullName: 'Akua Operator', staffId: 'OPR-001', roleSlug: 'production_operator', department: 'Production', plantId: temaFactory.id, primaryTrade: 'Machine Operator' },
  ];

  // New demo users (password: password123) — distributed across 3 Ghana plants
  const newDemoUsers: Array<{
    username: string; email: string; fullName: string; staffId: string;
    roleSlug: string; department: string; plantId: string;
    primaryTrade?: string;
  }> = [
    { username: 'manager1', email: 'manager1@iassetspro.com', fullName: 'Nana Plant Manager', staffId: 'PMG-001', roleSlug: 'plant_manager', department: 'Maintenance', plantId: temaFactory.id, primaryTrade: 'Operations Manager' },
    { username: 'maint_mgr1', email: 'maint_mgr1@iassetspro.com', fullName: 'Efua Maint Manager', staffId: 'MMG-001', roleSlug: 'maintenance_manager', department: 'Maintenance', plantId: temaFactory.id, primaryTrade: 'Mechanical Engineer' },
    { username: 'tech2', email: 'tech2@iassetspro.com', fullName: 'Yaw Technician', staffId: 'TEC-002', roleSlug: 'maintenance_technician', department: 'Maintenance', plantId: kumasiPlant.id, primaryTrade: 'Electrician' },
    { username: 'prod_mgr1', email: 'prod_mgr1@iassetspro.com', fullName: 'Adwoa Prod Manager', staffId: 'PRM-001', roleSlug: 'production_manager', department: 'Production', plantId: temaFactory.id, primaryTrade: 'Production Manager' },
    { username: 'op2', email: 'op2@iassetspro.com', fullName: 'Kwabena Operator', staffId: 'OPR-002', roleSlug: 'production_operator', department: 'Production', plantId: kumasiPlant.id, primaryTrade: 'Machine Operator' },
    { username: 'inv_mgr1', email: 'inv_mgr1@iassetspro.com', fullName: 'Abena Inv Manager', staffId: 'IVM-001', roleSlug: 'inventory_manager', department: 'Warehouse & Logistics', plantId: temaFactory.id, primaryTrade: 'Supply Chain' },
    { username: 'store1', email: 'store1@iassetspro.com', fullName: 'Kwaku Store Keeper', staffId: 'STK-001', roleSlug: 'store_keeper', department: 'Warehouse & Logistics', plantId: temaFactory.id, primaryTrade: 'Storekeeping' },
    { username: 'qual_mgr1', email: 'qual_mgr1@iassetspro.com', fullName: 'Ama Quality Mgr', staffId: 'QAM-001', roleSlug: 'quality_manager', department: 'Quality Control', plantId: temaFactory.id, primaryTrade: 'Quality Engineer' },
    { username: 'safety1', email: 'safety1@iassetspro.com', fullName: 'Kojo Safety Officer', staffId: 'SAF-001', roleSlug: 'safety_officer', department: 'Health Safety & Environment', plantId: temaFactory.id, primaryTrade: 'HSE Officer' },
    { username: 'hr1', email: 'hr1@iassetspro.com', fullName: 'Afia HR Manager', staffId: 'HRM-001', roleSlug: 'hr_manager', department: 'Engineering', plantId: temaFactory.id, primaryTrade: 'Human Resources' },
    { username: 'iot1', email: 'iot1@iassetspro.com', fullName: 'Emmanuel IoT Engineer', staffId: 'IOT-001', roleSlug: 'iot_engineer', department: 'Engineering', plantId: takoradiFacility.id, primaryTrade: 'Instrumentation Technician' },
    { username: 'viewer1', email: 'viewer1@iassetspro.com', fullName: 'Grace Viewer', staffId: 'VWR-001', roleSlug: 'viewer', department: 'Utilities', plantId: temaFactory.id, primaryTrade: 'Utility Technician' },
    { username: 'toolshop1', email: 'toolshop1@iassetspro.com', fullName: 'Kofi Tools Shop', staffId: 'TLS-001', roleSlug: 'tools_shop_attendant', department: 'Maintenance', plantId: temaFactory.id, primaryTrade: 'Workshop Technician' },
    { username: 'store2', email: 'store2@iassetspro.com', fullName: 'Ama Store Attendant', staffId: 'STK-002', roleSlug: 'store_keeper', department: 'Warehouse & Logistics', plantId: kumasiPlant.id, primaryTrade: 'Storekeeping' },
    // Additional technicians across departments for worker assignment testing
    { username: 'tech_eng1', email: 'tech_eng1@iassetspro.com', fullName: 'Kwame Engineering Tech', staffId: 'TEC-003', roleSlug: 'maintenance_technician', department: 'Engineering', plantId: temaFactory.id, primaryTrade: 'Instrumentation Fitter' },
    { username: 'tech_prod1', email: 'tech_prod1@iassetspro.com', fullName: 'Esi Production Tech', staffId: 'TEC-004', roleSlug: 'maintenance_technician', department: 'Production', plantId: temaFactory.id, primaryTrade: 'Mechanical Fitter' },
    { username: 'tech_util1', email: 'tech_util1@iassetspro.com', fullName: 'Kojo Utilities Tech', staffId: 'TEC-005', roleSlug: 'maintenance_technician', department: 'Utilities', plantId: temaFactory.id, primaryTrade: 'Electrical Technician' },
  ];

  const demoPassword = await hash('password123', 10);

  for (const u of [...originalDemoUsers, ...newDemoUsers]) {
    await db.user.upsert({
      where: { username: u.username },
      update: {},
      create: {
        username: u.username,
        email: u.email,
        passwordHash: demoPassword,
        fullName: u.fullName,
        staffId: u.staffId,
        department: u.department,
        primaryTrade: u.primaryTrade || null,
        status: 'active',
        userRoles: { create: { roleId: createdRoles[u.roleSlug] } },
        plantAccess: { create: { plantId: u.plantId, accessLevel: 'write', isPrimary: false } },
      },
    });
  }

  // Set supervisor for their department (supervisor1 is in Production dept)
  const supervisorUser = await db.user.findUnique({ where: { username: 'supervisor1' } });
  if (supervisorUser) {
    await db.department.update({
      where: { id: deptProd.id },
      data: { supervisorId: supervisorUser.id },
    });
  }

  const totalUsers = 1 + originalDemoUsers.length + newDemoUsers.length;
  console.log(`  ✅ Created ${totalUsers} demo users (${newDemoUsers.length} new)\n`);

  // ══════════════════════════════════════════════════════════════════════════
  // STEP 6: CREATE SYSTEM MODULES (35 comprehensive EAM modules)
  // ══════════════════════════════════════════════════════════════════════════
  console.log('📦 Creating system modules...');

  const systemModules = [
    { code: 'core', name: 'Core Platform', description: 'Core EAM platform with authentication, navigation, and base functionality', isCore: true, version: '2.0.0', licensed: true },
    { code: 'assets', name: 'Asset Management', description: 'Complete asset registry, hierarchy, tracking, and lifecycle management', isCore: false, version: '2.0.0', licensed: true },
    { code: 'maintenance_requests', name: 'Maintenance Requests', description: 'Submit, review, approve, and convert maintenance requests with full workflow', isCore: false, version: '2.0.0', licensed: true },
    { code: 'work_orders', name: 'Work Orders', description: 'Plan, assign, execute, and track maintenance work orders with SLA management', isCore: false, version: '2.0.0', licensed: true },
    { code: 'repairs', name: 'Repairs Maintenance', description: 'Corrective repairs/RWOP execution, resource custody, completion, closure, analytics, and reporting workflows', isCore: false, version: '2.0.0', licensed: true },
    { code: 'inventory', name: 'Inventory & Spare Parts', description: 'Manage spare parts inventory, stock levels, locations, and replenishment', isCore: false, version: '2.0.0', licensed: true },
    { code: 'pm_schedules', name: 'PM Schedules', description: 'Preventive maintenance scheduling with auto work order generation', isCore: false, version: '2.0.0', licensed: true },
    { code: 'analytics', name: 'Analytics & KPI', description: 'Advanced analytics, dashboards, and KPI monitoring', isCore: false, version: '1.5.0', licensed: true },
    { code: 'production', name: 'Production Management', description: 'Work centers, resource planning, scheduling, and capacity management', isCore: false, version: '1.5.0', licensed: true },
    { code: 'quality', name: 'Quality Management', description: 'Inspections, NCR, audits, SPC, CAPA, and quality control plans', isCore: false, version: '1.5.0', licensed: true },
    { code: 'safety', name: 'Safety Management', description: 'Incidents, safety inspections, training, equipment, and permits', isCore: false, version: '1.5.0', licensed: true },
    { code: 'iot_sensors', name: 'IoT Sensors', description: 'IoT device management, real-time monitoring, and threshold-based alerts', isCore: false, version: '1.3.0', licensed: true },
    { code: 'calibration', name: 'Calibration', description: 'Instrument calibration schedules, tracking, and compliance records', isCore: false, version: '1.2.0', licensed: true },
    { code: 'downtime', name: 'Downtime Tracking', description: 'Machine downtime logging, root cause analysis, and MTBF/MTTR analytics', isCore: false, version: '1.2.0', licensed: true },
    { code: 'meter_readings', name: 'Meter Readings', description: 'Equipment meter readings, meter-based PM triggers, and trending', isCore: false, version: '1.1.0', licensed: true },
    { code: 'training', name: 'Training Management', description: 'Training programs, certifications, skills tracking, and competency management', isCore: false, version: '1.1.0', licensed: false },
    { code: 'risk_assessment', name: 'Risk Assessment', description: 'Risk identification, assessment matrices, mitigation planning, and monitoring', isCore: false, version: '1.2.0', licensed: false },
    { code: 'condition_monitoring', name: 'Condition Monitoring', description: 'Vibration, temperature, and other condition monitoring with trending', isCore: false, version: '1.3.0', licensed: false },
    { code: 'digital_twin', name: 'Digital Twin', description: '3D asset visualization, digital twin modeling, and real-time state mirroring', isCore: false, version: '1.0.0', licensed: false },
    { code: 'bom', name: 'Bill of Materials', description: 'Equipment BOM management, spare part lists, and component relationships', isCore: false, version: '1.1.0', licensed: true },
    { code: 'failure_analysis', name: 'Failure Analysis', description: 'Failure modes, effects analysis, and failure pattern recognition', isCore: false, version: '1.0.0', licensed: false },
    { code: 'rca_analysis', name: 'Root Cause Analysis', description: '5-Why analysis, fishbone diagrams, and RCA documentation workflows', isCore: false, version: '1.0.0', licensed: false },
    { code: 'capa', name: 'CAPA Management', description: 'Corrective and preventive actions tracking and verification', isCore: false, version: '1.0.0', licensed: false },
    { code: 'reports', name: 'Reports & Dashboards', description: 'Custom report builder, scheduled reports, and multi-format export', isCore: false, version: '2.0.0', licensed: true },
    { code: 'vendors', name: 'Vendor Management', description: 'Supplier management, vendor evaluation, and procurement workflows', isCore: false, version: '1.1.0', licensed: true },
    { code: 'tools', name: 'Tool Management', description: 'Tool inventory, calibration tracking, assignment, and availability', isCore: false, version: '1.0.0', licensed: true },
    { code: 'notifications', name: 'Notifications', description: 'In-app notifications, email alerts, and notification preferences', isCore: false, version: '1.5.0', licensed: true },
    { code: 'documents', name: 'Document Management', description: 'Document storage, versioning, approvals, and file organization', isCore: false, version: '1.2.0', licensed: true },
    { code: 'modules', name: 'Module Management', description: 'System module licensing, activation, and feature management', isCore: true, version: '2.0.0', licensed: true },
    { code: 'kpi_dashboard', name: 'KPI Dashboard', description: 'Customizable KPI dashboards with real-time data widgets', isCore: false, version: '1.3.0', licensed: true },
    { code: 'predictive', name: 'Predictive Maintenance', description: 'ML-based predictive analytics for maintenance planning', isCore: false, version: '1.0.0', licensed: false },
    { code: 'oee', name: 'OEE Tracking', description: 'Overall Equipment Effectiveness tracking, analysis, and improvement', isCore: false, version: '1.2.0', licensed: false },
    { code: 'energy', name: 'Energy Management', description: 'Energy consumption monitoring, optimization, and cost tracking', isCore: false, version: '1.1.0', licensed: false },
    { code: 'shift_management', name: 'Shift Management', description: 'Shift scheduling, handover logs, and workforce planning', isCore: false, version: '1.1.0', licensed: false },
    { code: 'erp_integration', name: 'ERP Integration', description: 'Integration with external ERP systems via API connectors', isCore: false, version: '1.0.0', licensed: false },
    { code: 'forecasting', name: 'Demand Forecasting', description: 'AI-powered demand forecasting for spare parts and resources', isCore: false, version: '1.0.0', licensed: false },
  ];

  for (const mod of systemModules) {
    const validFrom = mod.licensed ? new Date('2024-01-01') : null;
    const validUntil = mod.licensed ? new Date('2026-12-31') : null;

    const sysMod = await db.systemModule.create({
      data: {
        code: mod.code,
        name: mod.name,
        description: mod.description,
        isCore: mod.isCore,
        version: mod.version,
        isSystemLicensed: mod.licensed,
        validFrom,
        validUntil,
      },
    });

    if (mod.isCore || mod.licensed) {
      await db.companyModule.create({
        data: {
          systemModuleId: sysMod.id,
          companyId: '__default__', // sentinel value — avoids MariaDB NULL unique-index ambiguity
          isActive: mod.isCore || mod.licensed,
          isEnabled: mod.isCore || mod.licensed,
          licensedAt: mod.isCore ? new Date('2024-01-01') : mod.licensed ? new Date('2024-01-15') : null,
          licensedBy: admin.id,
          activatedAt: mod.isCore ? new Date('2024-01-01') : mod.licensed ? new Date('2024-01-20') : null,
          activatedBy: admin.id,
        },
      });
    }
  }

  console.log(`✅ Created ${systemModules.length} system modules\n`);

  // ══════════════════════════════════════════════════════════════════════════
  // STEP 7: CREATE STATUS TRANSITIONS
  // ══════════════════════════════════════════════════════════════════════════
  console.log('🔄 Creating status transitions...');

  // Keep bootstrap seeding on the exact same canonical transition source used
  // by runtime auto-seeding and Repairs UAT. A stale partial seed must never
  // populate the table in a way that suppresses later canonical auto-seeding.
  const seededTransitionCount = await seedCanonicalTransitions(db);
  console.log(`  ✅ Canonical status transitions synchronized: ${seededTransitionCount}\n`);

  // ══════════════════════════════════════════════════════════════════════════
  // STEP 8: SAMPLE MAINTENANCE REQUESTS
  // ══════════════════════════════════════════════════════════════════════════
  console.log('📝 Creating sample maintenance requests...');

  const requester = await db.user.findUnique({ where: { username: 'operator1' } });
  const sv = await db.user.findUnique({ where: { username: 'supervisor1' } });

  if (requester) {
    const sampleMRs = [
      { title: 'Leaking hydraulic pump on Press Line 3', priority: 'high', category: 'mechanical', machineDownStatus: true, estimatedHours: 4 },
      { title: 'Electrical panel inspection - Building B', priority: 'medium', category: 'electrical', machineDownStatus: false, estimatedHours: 2 },
      { title: 'Conveyor belt alignment check', priority: 'low', category: 'mechanical', machineDownStatus: false, estimatedHours: 1 },
      { title: 'Emergency stop button not responding', priority: 'urgent', category: 'electrical', machineDownStatus: true, estimatedHours: 1 },
      { title: 'Air compressor routine maintenance', priority: 'medium', category: 'mechanical', machineDownStatus: false, estimatedHours: 3 },
    ];

    for (const mr of sampleMRs) {
      const count = await db.maintenanceRequest.count();
      const now = new Date();
      const prefix = `MR-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;

      await db.maintenanceRequest.create({
        data: {
          requestNumber: `${prefix}-${String(count + 1).padStart(4, '0')}`,
          title: mr.title,
          priority: mr.priority,
          category: mr.category,
          machineDownStatus: mr.machineDownStatus,
          estimatedHours: mr.estimatedHours,
          requestedBy: requester.id,
          supervisorId: sv?.id ?? null,
          departmentId: dept.id,
          plantId: plant.id,
          status: mr.priority === 'urgent' ? 'in_progress' : mr.priority === 'high' ? 'pending' : 'pending',
        },
      });
    }

    console.log(`  ✅ Created ${sampleMRs.length} maintenance requests\n`);

    // ════════════════════════════════════════════════════════════════════════
    // STEP 9: SAMPLE ASSETS
    // ════════════════════════════════════════════════════════════════════════
    console.log('🔧 Creating sample assets...');

    const assetCategories = await Promise.all([
      db.assetCategory.create({ data: { name: 'Rotating Equipment', code: 'RE', isActive: true } }),
      db.assetCategory.create({ data: { name: 'Electrical', code: 'EL', isActive: true } }),
      db.assetCategory.create({ data: { name: 'Mechanical', code: 'ME', isActive: true } }),
      db.assetCategory.create({ data: { name: 'Instrumentation', code: 'IN', isActive: true } }),
      db.assetCategory.create({ data: { name: 'HVAC', code: 'HV', isActive: true } }),
    ]);

    const assetsData = [
      { name: 'Compressor C-101', assetTag: 'AST-001', category: 0, condition: 'good', status: 'operational', criticality: 'high', location: 'Building A', manufacturer: 'Atlas Copco', model: 'GA55+', serialNumber: 'SN-COMP-001', yearManufactured: 2021, purchaseCost: 45000, expectedLifeYears: 15 },
      { name: 'Hydraulic Pump P-205', assetTag: 'AST-002', category: 2, condition: 'fair', status: 'under_maintenance', criticality: 'critical', location: 'Building A', manufacturer: 'Parker', model: 'PVP-50', serialNumber: 'SN-PUMP-002', yearManufactured: 2019, purchaseCost: 12000, expectedLifeYears: 10 },
      { name: 'Electric Motor M-302', assetTag: 'AST-003', category: 1, condition: 'good', status: 'operational', criticality: 'medium', location: 'Building B', manufacturer: 'Siemens', model: 'SIMO-75', serialNumber: 'SN-MOT-003', yearManufactured: 2022, purchaseCost: 8500, expectedLifeYears: 12 },
      { name: 'Conveyor CV-401', assetTag: 'AST-004', category: 2, condition: 'good', status: 'operational', criticality: 'high', location: 'Building C', manufacturer: 'Dorner', model: '2200 Series', serialNumber: 'SN-CONV-004', yearManufactured: 2020, purchaseCost: 28000, expectedLifeYears: 15 },
      { name: 'Control Panel CP-108', assetTag: 'AST-005', category: 3, condition: 'new', status: 'operational', criticality: 'medium', location: 'Building B', manufacturer: 'ABB', model: 'ACS880', serialNumber: 'SN-CTRL-005', yearManufactured: 2023, purchaseCost: 15000, expectedLifeYears: 10 },
      { name: 'Chiller Unit CH-201', assetTag: 'AST-006', category: 4, condition: 'fair', status: 'standby', criticality: 'medium', location: 'Building A', manufacturer: 'Carrier', model: '30XA-252', serialNumber: 'SN-CHIL-006', yearManufactured: 2018, purchaseCost: 65000, expectedLifeYears: 20 },
      { name: 'Air Compressor AC-301', assetTag: 'AST-007', category: 0, condition: 'good', status: 'operational', criticality: 'high', location: 'Utility Room', manufacturer: 'Ingersoll Rand', model: 'R110i', serialNumber: 'SN-AIRC-007', yearManufactured: 2021, purchaseCost: 32000, expectedLifeYears: 15 },
      { name: 'Press Line PL-3', assetTag: 'AST-008', category: 2, condition: 'poor', status: 'under_maintenance', criticality: 'critical', location: 'Building A', manufacturer: 'Komatsu', model: 'H2F-500', serialNumber: 'SN-PRESS-008', yearManufactured: 2017, purchaseCost: 180000, expectedLifeYears: 20 },
      { name: 'Generator Gen-401', assetTag: 'AST-009', category: 1, condition: 'good', status: 'operational', criticality: 'critical', location: 'Power House', manufacturer: 'Caterpillar', model: 'C18', serialNumber: 'SN-GEN-009', yearManufactured: 2020, purchaseCost: 95000, expectedLifeYears: 25 },
      { name: 'Transformer TR-501', assetTag: 'AST-010', category: 1, condition: 'new', status: 'operational', criticality: 'high', location: 'Substation', manufacturer: 'ABB', model: 'RESIBLOC', serialNumber: 'SN-TRANS-010', yearManufactured: 2023, purchaseCost: 120000, expectedLifeYears: 30 },
    ];

    const createdAssets: any[] = [];
    for (const a of assetsData) {
      const asset = await db.asset.create({
        data: {
          name: a.name,
          assetTag: a.assetTag,
          category: { connect: { id: assetCategories[a.category].id } },
          condition: a.condition,
          status: a.status,
          criticality: a.criticality,
          location: a.location,
          plant: { connect: { id: plant.id } },
          department: { connect: { id: dept.id } },
          manufacturer: a.manufacturer,
          model: a.model,
          serialNumber: a.serialNumber,
          yearManufactured: a.yearManufactured,
          purchaseCost: a.purchaseCost,
          expectedLifeYears: a.expectedLifeYears,
          installedDate: new Date(a.yearManufactured, 5, 1),
          createdBy: { connect: { id: admin.id } },
          currentValue: a.purchaseCost * (1 - (new Date().getFullYear() - a.yearManufactured) / a.expectedLifeYears * 0.7),
          specification: '{}',
        },
      });
      createdAssets.push(asset);
    }

    console.log(`  ✅ Created ${assetsData.length} assets in 5 categories\n`);

    // ════════════════════════════════════════════════════════════════════════
    // STEP 10: SAMPLE INVENTORY ITEMS
    // ════════════════════════════════════════════════════════════════════════
    console.log('📦 Creating sample inventory items...');

    const inventoryItems = [
      { itemCode: 'SP-001', name: 'Bearing SKF 6205', category: 'spare_part', unitOfMeasure: 'each', currentStock: 25, minStockLevel: 10, unitCost: 45, supplier: 'SKF Distributors' },
      { itemCode: 'SP-002', name: 'Hydraulic Seal Kit', category: 'spare_part', unitOfMeasure: 'set', currentStock: 8, minStockLevel: 5, unitCost: 120, supplier: 'Parker Hannifin' },
      { itemCode: 'SP-003', name: 'Drive Belt A68', category: 'spare_part', unitOfMeasure: 'each', currentStock: 15, minStockLevel: 8, unitCost: 35, supplier: 'Gates Corporation' },
      { itemCode: 'SP-004', name: 'Contactor LC1D25', category: 'spare_part', unitOfMeasure: 'each', currentStock: 3, minStockLevel: 5, unitCost: 85, supplier: 'Schneider Electric' },
      { itemCode: 'CN-001', name: 'Hydraulic Oil ISO 46', category: 'consumable', unitOfMeasure: 'liter', currentStock: 200, minStockLevel: 50, unitCost: 8.5, supplier: 'Shell Lubricants' },
      { itemCode: 'CN-002', name: 'Grease EP2', category: 'consumable', unitOfMeasure: 'kg', currentStock: 45, minStockLevel: 20, unitCost: 12, supplier: 'Mobil' },
      { itemCode: 'CN-003', name: 'Welding Rods E7018', category: 'consumable', unitOfMeasure: 'kg', currentStock: 30, minStockLevel: 15, unitCost: 18, supplier: 'Lincoln Electric' },
      { itemCode: 'TL-001', name: 'Multimeter Fluke 87V', category: 'tool', unitOfMeasure: 'each', currentStock: 4, minStockLevel: 2, unitCost: 450, supplier: 'Fluke Corp' },
      { itemCode: 'TL-002', name: 'Torque Wrench Set', category: 'tool', unitOfMeasure: 'set', currentStock: 2, minStockLevel: 1, unitCost: 280, supplier: 'Snap-on Tools' },
      { itemCode: 'SP-005', name: 'Air Filter Element', category: 'spare_part', unitOfMeasure: 'each', currentStock: 12, minStockLevel: 6, unitCost: 65, supplier: 'Donaldson' },
      { itemCode: 'SP-006', name: 'V-Belt Set B68', category: 'spare_part', unitOfMeasure: 'set', currentStock: 6, minStockLevel: 4, unitCost: 55, supplier: 'Gates Corporation' },
      { itemCode: 'SP-007', name: 'Thermocouple Type K', category: 'spare_part', unitOfMeasure: 'each', currentStock: 2, minStockLevel: 10, unitCost: 25, supplier: 'Omega Engineering' },
    ];

    for (const item of inventoryItems) {
      await db.inventoryItem.create({
        data: {
          ...item,
          plantId: plant.id,
          createdById: admin.id,
          location: 'Tema Main Store',
          binLocation: `A-${Math.ceil(Math.random() * 5)}-${Math.ceil(Math.random() * 10)}`,
          specification: '{}',
          imageUrls: '[]',
        },
      });
    }

    console.log(`  ✅ Created ${inventoryItems.length} inventory items\n`);

    // ════════════════════════════════════════════════════════════════════════
    // STEP 11: SAMPLE WORK ORDERS
    // ════════════════════════════════════════════════════════════════════════
    console.log('🔨 Creating sample work orders...');

    const techUser = await db.user.findUnique({ where: { username: 'tech1' } });
    const plannerUser = await db.user.findUnique({ where: { username: 'planner1' } });

    const woStatuses = ['completed', 'completed', 'completed', 'in_progress', 'assigned', 'approved', 'draft', 'closed', 'closed'];
    const woTypes = ['corrective', 'preventive', 'corrective', 'emergency', 'preventive', 'corrective', 'predictive', 'inspection', 'corrective'];
    const woPriorities = ['high', 'medium', 'medium', 'critical', 'low', 'high', 'medium', 'low', 'high'];

    for (let i = 0; i < 9; i++) {
      const asset = createdAssets[i];
      const count = await db.workOrder.count();
      const now = new Date();
      const prefix = `WO-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
      const daysAgo = 30 - i * 3;
      const createdAt = new Date(now.getTime() - daysAgo * 86400000);

      const status = woStatuses[i];
      const isComplete = status === 'completed' || status === 'closed';

      const wo = await db.workOrder.create({
        data: {
          woNumber: `${prefix}-${String(count + 1).padStart(4, '0')}`,
          title: `${['Replace bearings', 'PM inspection', 'Fix oil leak', 'Emergency repair', 'Lubrication service', 'Alignment check', 'Vibration analysis', 'Safety inspection', 'Overhaul repair'][i]} - ${asset.name}`,
          type: woTypes[i],
          priority: woPriorities[i],
          status,
          description: `Maintenance work order for ${asset.name}. ${['Bearing replacement due to excessive vibration readings.', 'Scheduled preventive maintenance inspection.', 'Oil leak detected on main shaft seal.', 'Emergency breakdown repair required.', 'Scheduled lubrication and grease service.', 'Laser alignment check and correction.', 'Predictive maintenance based on vibration trends.', 'Routine safety inspection and testing.', 'Major overhaul and reconditioning.'][i]}`,
          assetId: asset.id,
          assetName: asset.name,
          departmentId: dept.id,
          plantId: plant.id,
          assignedTo: techUser?.id ?? null,
          plannerId: plannerUser?.id ?? null,
          assignedSupervisorId: sv?.id ?? null,
          estimatedHours: [4, 2, 6, 3, 1.5, 3, 2, 4, 16][i],
          actualHours: isComplete ? [3.5, 2, 5.5, 2.5, 1.5, 0, 0, 4, 14][i] : null,
          plannedStart: new Date(createdAt.getTime() + 86400000),
          plannedEnd: new Date(createdAt.getTime() + 86400000 * 3),
          actualStart: isComplete ? new Date(createdAt.getTime() + 86400000 * 1.5) : null,
          actualEnd: isComplete ? new Date(createdAt.getTime() + 86400000 * 2.5) : null,
          totalCost: isComplete ? [850, 120, 2200, 1800, 45, 0, 0, 350, 4500][i] : 0,
          laborCost: isComplete ? [350, 120, 400, 500, 45, 0, 0, 200, 2800][i] : 0,
          partsCost: isComplete ? [500, 0, 1800, 1300, 0, 0, 0, 150, 1700][i] : 0,
          createdAt,
        },
      });

      // Create status history for completed WOs
      if (isComplete) {
        await db.workOrderStatusHistory.createMany({
          data: [
            { workOrderId: wo.id, toStatus: 'draft', performedById: admin.id, createdAt },
            { workOrderId: wo.id, fromStatus: 'draft', toStatus: 'approved', performedById: plannerUser?.id || admin.id, createdAt: new Date(createdAt.getTime() + 3600000) },
            { workOrderId: wo.id, fromStatus: 'approved', toStatus: 'assigned', performedById: plannerUser?.id || admin.id, createdAt: new Date(createdAt.getTime() + 86400000) },
            { workOrderId: wo.id, fromStatus: 'assigned', toStatus: 'in_progress', performedById: techUser?.id || admin.id, createdAt: new Date(createdAt.getTime() + 86400000 * 1.5) },
            { workOrderId: wo.id, fromStatus: 'in_progress', toStatus: 'completed', performedById: techUser?.id || admin.id, createdAt: new Date(createdAt.getTime() + 86400000 * 2.5) },
          ],
        });
      }
    }

    console.log(`  ✅ Created 9 work orders with status history\n`);

    // ════════════════════════════════════════════════════════════════════════
    // STEP 12: PM SCHEDULES
    // ════════════════════════════════════════════════════════════════════════
    console.log('📅 Creating PM schedules...');

    for (let i = 0; i < 5; i++) {
      const asset = createdAssets[i];
      await db.pmSchedule.create({
        data: {
          title: `PM Schedule - ${asset.name}`,
          description: `Regular maintenance schedule for ${asset.name}`,
          assetId: asset.id,
          frequencyType: ['monthly', 'weekly', 'quarterly', 'monthly', 'biweekly'][i],
          frequencyValue: [1, 1, 1, 1, 2][i],
          lastCompletedDate: new Date(new Date().getTime() - 15 * 86400000),
          nextDueDate: new Date(new Date().getTime() + [15, 5, 45, 10, 10][i] * 86400000),
          estimatedDuration: [4, 1, 8, 2, 1.5][i],
          priority: ['high', 'medium', 'medium', 'low', 'medium'][i],
          assignedToId: techUser?.id,
          departmentId: dept.id,
          isActive: true,
          autoGenerateWO: true,
          leadDays: 3,
          createdById: admin.id,
        },
      });
    }

    console.log('  ✅ Created 5 PM schedules\n');

    // ════════════════════════════════════════════════════════════════════════
    // STEP 12b: PM TEMPLATES
    // ════════════════════════════════════════════════════════════════════════
    console.log('📋 Creating PM templates...');

    await db.pmTemplate.createMany({
      data: [
        {
          title: 'Monthly Motor Inspection',
          description: 'Comprehensive monthly inspection for electric motors including visual checks, vibration measurement, temperature monitoring, and bearing inspection.',
          type: 'inspection',
          category: 'electrical',
          estimatedDuration: 60,
          priority: 'high',
          isActive: true,
          createdById: admin.id,
        },
        {
          title: 'Quarterly HVAC Service',
          description: 'Full quarterly service for HVAC systems including filter replacement, refrigerant check, ductwork inspection, thermostat testing, and fan motor lubrication.',
          type: 'preventive',
          category: 'hvac',
          estimatedDuration: 120,
          priority: 'medium',
          isActive: true,
          createdById: admin.id,
        },
        {
          title: 'Annual Overhaul',
          description: 'Complete annual overhaul including full disassembly, inspection of all parts, replacement of wear items, reassembly, test run, and documentation.',
          type: 'preventive',
          category: 'mechanical',
          estimatedDuration: 480,
          priority: 'high',
          isActive: true,
          createdById: admin.id,
        },
      ],
    });
    console.log(`  ✅ Created 3 PM templates`);

    // Create template tasks for each template
    const allTemplates = await db.pmTemplate.findMany({
      orderBy: { createdAt: 'asc' },
    });

    const templateTaskData: Array<{
      templateId: string;
      taskNumber: number;
      description: string;
      taskType: string;
      estimatedMinutes: number | null;
      sortOrder: number;
      isActive: boolean;
    }> = [];

    // Template 1: Monthly Motor Inspection (4 tasks)
    const motorTemplate = allTemplates.find((t) => t.title === 'Monthly Motor Inspection');
    if (motorTemplate) {
      templateTaskData.push(
        { templateId: motorTemplate.id, taskNumber: 1, description: 'Visual inspection of motor housing, cables, and connections for damage or wear', taskType: 'check', estimatedMinutes: 10, sortOrder: 1, isActive: true },
        { templateId: motorTemplate.id, taskNumber: 2, description: 'Measure vibration levels at drive-end and non-drive-end bearings', taskType: 'measure', estimatedMinutes: 15, sortOrder: 2, isActive: true },
        { templateId: motorTemplate.id, taskNumber: 3, description: 'Check operating temperature using IR thermometer at multiple points', taskType: 'inspect', estimatedMinutes: 15, sortOrder: 3, isActive: true },
        { templateId: motorTemplate.id, taskNumber: 4, description: 'Inspect bearings for noise, play, and lubrication condition', taskType: 'inspect', estimatedMinutes: 20, sortOrder: 4, isActive: true },
      );
    }

    // Template 2: Quarterly HVAC Service (5 tasks)
    const hvacTemplate = allTemplates.find((t) => t.title === 'Quarterly HVAC Service');
    if (hvacTemplate) {
      templateTaskData.push(
        { templateId: hvacTemplate.id, taskNumber: 1, description: 'Replace air filters and clean filter housing', taskType: 'replace', estimatedMinutes: 20, sortOrder: 1, isActive: true },
        { templateId: hvacTemplate.id, taskNumber: 2, description: 'Check refrigerant levels and inspect for leaks', taskType: 'check', estimatedMinutes: 25, sortOrder: 2, isActive: true },
        { templateId: hvacTemplate.id, taskNumber: 3, description: 'Inspect ductwork for damage, leaks, and proper insulation', taskType: 'inspect', estimatedMinutes: 25, sortOrder: 3, isActive: true },
        { templateId: hvacTemplate.id, taskNumber: 4, description: 'Test thermostat calibration and control sequences', taskType: 'measure', estimatedMinutes: 20, sortOrder: 4, isActive: true },
        { templateId: hvacTemplate.id, taskNumber: 5, description: 'Lubricate fan motor bearings and check belt tension', taskType: 'lubricate', estimatedMinutes: 30, sortOrder: 5, isActive: true },
      );
    }

    // Template 3: Annual Overhaul (6 tasks)
    const overhaulTemplate = allTemplates.find((t) => t.title === 'Annual Overhaul');
    if (overhaulTemplate) {
      templateTaskData.push(
        { templateId: overhaulTemplate.id, taskNumber: 1, description: 'Fully disassemble equipment and tag all components', taskType: 'replace', estimatedMinutes: 120, sortOrder: 1, isActive: true },
        { templateId: overhaulTemplate.id, taskNumber: 2, description: 'Inspect all internal parts for wear, cracks, and corrosion', taskType: 'inspect', estimatedMinutes: 60, sortOrder: 2, isActive: true },
        { templateId: overhaulTemplate.id, taskNumber: 3, description: 'Replace all wear items: seals, gaskets, bearings, belts', taskType: 'replace', estimatedMinutes: 90, sortOrder: 3, isActive: true },
        { templateId: overhaulTemplate.id, taskNumber: 4, description: 'Reassemble equipment following manufacturer specifications', taskType: 'replace', estimatedMinutes: 120, sortOrder: 4, isActive: true },
        { templateId: overhaulTemplate.id, taskNumber: 5, description: 'Perform test run and verify all operational parameters', taskType: 'measure', estimatedMinutes: 60, sortOrder: 5, isActive: true },
        { templateId: overhaulTemplate.id, taskNumber: 6, description: 'Document all findings, replaced parts, and test results', taskType: 'record', estimatedMinutes: 30, sortOrder: 6, isActive: true },
      );
    }

    if (templateTaskData.length > 0) {
      await db.pmTemplateTask.createMany({ data: templateTaskData });
      console.log(`  ✅ Created ${templateTaskData.length} template tasks across 3 templates`);
    }

    console.log('');

    // ════════════════════════════════════════════════════════════════════════
    // STEP 12c: PM TRIGGERS
    // ════════════════════════════════════════════════════════════════════════
    console.log('⚙️  Creating PM triggers...');

    // Get existing PM schedules to attach triggers to
    const existingPmSchedules = await db.pmSchedule.findMany({
      orderBy: { createdAt: 'asc' },
    });

    const triggerData: Array<{
      scheduleId: string;
      triggerType: string;
      triggerValue: number;
      triggerConfig: string;
      isActive: boolean;
    }> = [];

    if (existingPmSchedules.length >= 3) {
      // Trigger 1: meter trigger for first schedule (if schedule has meter_based/custom_hours)
      triggerData.push({
        scheduleId: existingPmSchedules[0].id,
        triggerType: 'meter',
        triggerValue: 5000,
        triggerConfig: JSON.stringify({ meterName: 'run_hours', threshold: 5000 }),
        isActive: true,
      });

      // Trigger 2: time trigger for second schedule (cron-based)
      triggerData.push({
        scheduleId: existingPmSchedules[1].id,
        triggerType: 'time',
        triggerValue: 7,
        triggerConfig: JSON.stringify({ cron: '0 6 * * 1' }), // Every Monday at 6 AM
        isActive: true,
      });

      // Trigger 3: production_count trigger for third schedule
      triggerData.push({
        scheduleId: existingPmSchedules[2].id,
        triggerType: 'production_count',
        triggerValue: 10000,
        triggerConfig: JSON.stringify({ threshold: 10000 }),
        isActive: true,
      });
    }

    if (triggerData.length > 0) {
      await db.pmTrigger.createMany({ data: triggerData });
      console.log(`  ✅ Created ${triggerData.length} PM triggers\n`);
    } else {
      console.log('  ⚠️  Not enough PM schedules to create triggers\n');
    }

    // ════════════════════════════════════════════════════════════════════════
    // STEP 13: SAMPLE NOTIFICATIONS
    // ════════════════════════════════════════════════════════════════════════
    console.log('🔔 Creating sample notifications...');

    const notifTypes = [
      { type: 'wo_assigned', title: 'Work Order Assigned', message: 'You have been assigned WO for Compressor C-101 bearing replacement.', entityType: 'work_order', userId: techUser?.id || admin.id },
      { type: 'mr_assigned', title: 'New Maintenance Request', message: 'A new maintenance request has been submitted for Press Line 3.', entityType: 'maintenance_request', userId: sv?.id || admin.id },
      { type: 'wo_completed', title: 'Work Order Completed', message: 'WO for Conveyor CV-401 alignment check has been completed.', entityType: 'work_order', userId: plannerUser?.id || admin.id },
      { type: 'system', title: 'System Update', message: 'iAssetsPro has been updated to version 2.0 with new analytics features.', userId: admin.id },
      { type: 'info', title: 'PM Schedule Due', message: 'PM schedule for Hydraulic Pump P-205 is due in 3 days.', entityType: 'pm_schedule', userId: plannerUser?.id || admin.id },
    ];

    for (const n of notifTypes) {
      await db.notification.create({
        data: {
          ...n,
          isRead: n.type === 'system',
        },
      });
    }

    console.log(`  ✅ Created ${notifTypes.length} notifications\n`);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // STEP 14: COMPANY PROFILE
  // ══════════════════════════════════════════════════════════════════════════
  console.log('🏢 Creating company profile...');

  await db.companyProfile.upsert({
    where: { id: 'default' },
    update: {},
    create: {
      id: 'default',
      companyName: 'iAssetsPro Demo Company',
      tradingName: 'iAssetsPro',
      address: 'Tema Heavy Industrial Area, Free Zone',
      city: 'Accra',
      region: 'Greater Accra',
      country: 'Ghana',
      postalCode: 'TA23',
      phone: '+233 (0) 302 123 456',
      email: 'info@iassetspro.com',
      website: 'www.iassetspro.com',
      industry: 'manufacturing',
      employeeCount: '100-500',
      currency: 'GHS',
      timezone: 'Africa/Accra',
      dateFormat: 'DD/MM/YYYY',
    },
  });

  console.log('  ✅ Company profile created (Ghana — Accra, Greater Accra)\n');

  // ══════════════════════════════════════════════════════════════════════════
  // FINAL VERIFICATION — Confirm data was actually written
  // ══════════════════════════════════════════════════════════════════════════
  console.log('🔍 Verifying seeded data...');
  let finalPermCount = 0;
  let finalRoleCount = 0;
  let finalRolePermCount = 0;
  let finalUserCount = 0;
  let finalPlantCount = 0;
  let finalDeptCount = 0;
  let finalAssetCount = 0;
  let finalInvCount = 0;
  let finalModuleCount = 0;
  let finalWOCunt = 0;
  try {
    finalPermCount = await db.permission.count();
    finalRoleCount = await db.role.count();
    finalRolePermCount = await db.rolePermission.count();
    finalUserCount = await db.user.count();
    finalPlantCount = await db.plant.count();
    finalDeptCount = await db.department.count();
    finalAssetCount = await db.asset.count();
    finalInvCount = await db.inventoryItem.count();
    finalModuleCount = await db.systemModule.count();
    finalWOCunt = await db.workOrder.count();

    if (finalPermCount === 0) {
      console.error('  ❌ CRITICAL: No permissions found! Database may be empty.');
    } else {
      console.log(`  ✅ Permissions:     ${finalPermCount}`);
      console.log(`  ✅ Roles:           ${finalRoleCount}`);
      console.log(`  ✅ Role-Perms:      ${finalRolePermCount}`);
      console.log(`  ✅ Users:           ${finalUserCount}`);
      console.log(`  ✅ Plants:          ${finalPlantCount}`);
      console.log(`  ✅ Departments:     ${finalDeptCount}`);
      console.log(`  ✅ Assets:          ${finalAssetCount}`);
      console.log(`  ✅ Inventory:       ${finalInvCount}`);
      console.log(`  ✅ Modules:         ${finalModuleCount}`);
      console.log(`  ✅ Work Orders:     ${finalWOCunt}`);
    }
  } catch (verifyErr) {
    console.error('  ❌ Verification query failed:', (verifyErr as Error).message);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // FINAL SUMMARY
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n═════════════════════════════════════════════════════════════');
  console.log(`  🎉 iAssetsPro seeding complete! (Ghana Enterprise Edition)`);
  console.log('═════════════════════════════════════════════════════════════');
  console.log(`  📋 Permissions:     ${finalPermCount}`);
  console.log(`  🔑 Roles:           ${finalRoleCount}`);
  console.log(`  🔗 Role-Perms:      ${finalRolePermCount}`);
  console.log(`  👥 Users:           ${finalUserCount}`);
  console.log(`  🏭 Plants:          3 (Tema, Kumasi, Takoradi)`);
  console.log(`  🏢 Departments:     11 (7 on Tema, 2 on Kumasi, 2 on Takoradi)`);
  console.log('═════════════════════════════════════════════════════════════');
  console.log('\nDefault users:\n');
  console.log('  Admin:               admin / admin123');
  console.log('  Plant Manager:       manager1 / password123');
  console.log('  Maint Manager:       maint_mgr1 / password123');
  console.log('  Planner:             planner1 / password123');
  console.log('  Supervisor:          supervisor1 / password123');
  console.log('  Technician:          tech1 / password123');
  console.log('  Technician:          tech2 / password123');
  console.log('  Prod Manager:        prod_mgr1 / password123');
  console.log('  Operator:            operator1 / password123');
  console.log('  Operator:            op2 / password123');
  console.log('  Inv Manager:         inv_mgr1 / password123');
  console.log('  Store Keeper:        store1 / password123');
  console.log('  Quality Manager:     qual_mgr1 / password123');
  console.log('  Safety Officer:      safety1 / password123');
  console.log('  HR Manager:          hr1 / password123');
  console.log('  IoT Engineer:        iot1 / password123');
  console.log('  Viewer:              viewer1 / password123');
  console.log('');
}

// ============================================================================
// HELPERS
// ============================================================================

function formatModuleName(module: string): string {
  return module
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function formatActionName(action: string): string {
  return action
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// ============================================================================
// RUN
// ============================================================================

seed()
  .then(() => {
    console.log('\n✅ Seed completed successfully!');
    process.exit(0);
  })
  .catch((e) => {
    console.error('\n❌ ═══════════════════════════════════════════════════════════');
    console.error('   SEED FAILED — Full error details:');
    console.error('════════════════════════════════════════════════════════════');
    console.error('  Message:', (e as Error).message);
    if ((e as any).code) console.error('  Prisma Code:', (e as any).code);
    if ((e as any).meta) console.error('  Meta:', JSON.stringify((e as any).meta, null, 2));
    console.error('  Stack:', (e as Error).stack?.split('\n').slice(0, 8).join('\n'));
    console.error('════════════════════════════════════════════════════════════\n');
    console.error('TROUBLESHOOTING:');
    console.error('  1. Make sure you ran: npx prisma generate');
    console.error('  2. Make sure DATABASE_URL is set correctly');
    console.error('  3. Make sure the database server is accessible');
    console.error('  4. Make sure the database exists');
    process.exit(1);
  })
  .finally(() => {
    db.$disconnect();
  });
