/**
 * ══════════════════════════════════════════════════════════════════════════
 * SEED-ALL.TS — Combined Idempotent Seed Script for iAssetsPro EAM System
 * ══════════════════════════════════════════════════════════════════════════
 *
 * This script is BULLETPROOF:
 *   - Does NOT truncate any tables
 *   - Uses upsert/create patterns — safe to re-run any number of times
 *   - Each step wrapped in try/catch with detailed logging
 *   - Continues even if individual steps fail
 *
 * Usage:
 *   DATABASE_URL="mysql://user:pass@host:3306/dbname" npx tsx prisma/seed-all.ts
 *   DB_HOST=host DB_USER=user DB_PASSWORD=pass DB_NAME=db npx tsx prisma/seed-all.ts
 */

import { PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';

// ══════════════════════════════════════════════════════════════════════════
// DATABASE CONNECTION — PostgreSQL (canonical iAssetsPro datastore)
// ══════════════════════════════════════════════════════════════════════════

console.log('🔧 Connecting to PostgreSQL...');

if (!process.env.DATABASE_URL) {
  const host = process.env.DB_HOST || 'localhost';
  const port = process.env.DB_PORT || '5432';
  const user = process.env.DB_USER || 'postgres';
  const password = process.env.DB_PASSWORD || '';
  const database = process.env.DB_NAME || 'iassetspro';
  process.env.DATABASE_URL = `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${database}?schema=public`;
}

if (!/^postgres(?:ql)?:\/\//i.test(process.env.DATABASE_URL)) {
  throw new Error('seed-all requires a PostgreSQL DATABASE_URL');
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createAdapter } = require('../src/lib/create-postgres-adapter');
const db = new PrismaClient({
  adapter: createAdapter(process.env.DATABASE_URL),
  log: ['warn', 'error'],
});

// ══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ══════════════════════════════════════════════════════════════════════════

function formatModuleName(mod: string): string {
  return mod.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function formatActionName(action: string): string {
  return action.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function makeSlug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
}

function logStep(emoji: string, msg: string) {
  console.log(`  ${emoji} ${msg}`);
}

function logErr(msg: string, err: unknown) {
  const e = err as Error;
  console.error(`  ❌ ${msg}`);
  console.error(`     ${e.message?.slice(0, 200)}`);
  if (process.env.DEBUG) console.error(e.stack);
}

// ══════════════════════════════════════════════════════════════════════════
// 1. PERMISSION DEFINITIONS
// ══════════════════════════════════════════════════════════════════════════

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
  'assets.hierarchy': ['view', 'manage'],
  'assets.functional_locations': ['view', 'manage', 'assign'],
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
};

// ══════════════════════════════════════════════════════════════════════════
// 2. ROLE DEFINITIONS (16 roles)
// ══════════════════════════════════════════════════════════════════════════

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
  { name: 'Tools Shop Attendant', slug: 'tools_shop_attendant', description: 'Manage tool checkout, returns, and transfers', level: 47, isSystem: false },
  { name: 'Quality Manager', slug: 'quality_manager', description: 'Quality inspections, NCR, audits, and calibration', level: 85, isSystem: false },
  { name: 'Safety Officer', slug: 'safety_officer', description: 'Full safety management including incidents and inspections', level: 75, isSystem: false },
  { name: 'HR Manager', slug: 'hr_manager', description: 'Full HRMS including employees, shifts, training, skills', level: 85, isSystem: false },
  { name: 'IoT Engineer', slug: 'iot_engineer', description: 'Full IoT device management and predictive analytics', level: 70, isSystem: false },
  { name: 'Viewer', slug: 'viewer', description: 'Read-only access across most modules', level: 10, isSystem: true },
];

// ══════════════════════════════════════════════════════════════════════════
// 3. ROLE PERMISSION BUNDLES
// ══════════════════════════════════════════════════════════════════════════

const rolePermissionBundles: Record<string, string[]> = {
  plant_manager: [
    'dashboard.view', 'dashboard.stats', 'chat.view', 'users.view', 'roles.view', 'permissions.view',
    'departments.view', 'departments.create', 'departments.update', 'plants.view', 'plants.update',
    'notifications.view', 'audit_logs.view', 'system_settings.view', 'modules.view', 'documents.view',
    'company.view', 'company.update',
    'assets.view', 'assets.view_all', 'assets.health', 'assets.criticality', 'assets.hierarchy',
    'assets.hierarchy.view', 'assets.functional_locations.view', 'assets.functional_locations.manage', 'assets.functional_locations.assign',
    'equipment.view', 'assemblies.view', 'bom.view', 'facilities.view', 'meters.view', 'tools.view',
    'maintenance_requests.view', 'maintenance_requests.view_all', 'maintenance_requests.dashboard',
    'work_orders.view', 'work_orders.view_all', 'work_orders.dashboard',
    'work_order_templates.view', 'recurring_work_orders.view', 'approvals.view', 'verifications.view',
    'sla.view', 'rca.view', 'time_logs.view',
    'pm_schedules.view', 'pm_analytics.view', 'pm_work_orders.view', 'pm_templates.view', 'pm_checklists.view',
    'calibration.view', 'asset_health.view', 'condition_monitoring.view',
    'inventory.view', 'inventory.view_all', 'parts.view', 'parts_categories.view',
    'material_requisitions.view', 'vendors.view', 'stock_transactions.view', 'purchase_orders.view',
    'inventory_locations.view', 'inventory_adjustments.view', 'inventory_adjustments.update', 'inventory_transfers.view', 'inventory_transfers.update',
    'employees.view', 'shifts.view', 'shift_handovers.view',
    'training.view', 'skills.view', 'skill_categories.view', 'technician_groups.view', 'assignments.view',
    'production.view', 'production_surveys.view', 'oee.view', 'downtime.view', 'quality_checks.view',
    'energy.view', 'work_centers.view', 'production_targets.view', 'production_batches.view',
    'safety_incidents.view', 'safety_inspections.view', 'safety_equipment.view', 'safety_permits.view', 'risk_assessments.view',
    'iot_devices.view', 'iot_monitoring.view', 'iot_rules.view', 'predictive.view',
    'digital_twin.view', 'model_viewer.view', 'hotspots.view',
    'reports.view', 'reports.export',
    'quality_inspections.view', 'quality_ncr.view', 'quality_audits.view', 'quality_control_plans.view', 'spc.view',
    'iot.view', 'analytics.view', 'operations.view', 'quality.view', 'safety.view',
  ],
  maintenance_manager: [
    'dashboard.view', 'dashboard.stats', 'chat.view', 'documents.view', 'documents.upload', 'documents.download',
    'notifications.view', 'notifications.manage',
    'assets.view', 'assets.view_all', 'assets.create', 'assets.update', 'assets.delete',
    'assets.export', 'assets.manage', 'assets.hierarchy', 'assets.health', 'assets.criticality',
    'assets.hierarchy.view', 'assets.functional_locations.view', 'assets.functional_locations.assign',
    'equipment.view', 'equipment.create', 'equipment.update', 'assemblies.view', 'assemblies.create', 'assemblies.update', 'assemblies.manage',
    'bom.view', 'bom.create', 'bom.update', 'bom.manage', 'facilities.view',
    'meters.view', 'meters.create', 'meters.update', 'tools.view', 'tools.create', 'tools.update', 'tools.manage',
    'maintenance_requests.view', 'maintenance_requests.view_all', 'maintenance_requests.create', 'maintenance_requests.update',
    'maintenance_requests.approve', 'maintenance_requests.reject', 'maintenance_requests.triage',
    'maintenance_requests.assign_planner', 'maintenance_requests.convert_to_wo', 'maintenance_requests.my_queue', 'maintenance_requests.archive',
    'work_orders.view', 'work_orders.view_all', 'work_orders.create', 'work_orders.update',
    'work_orders.delete', 'work_orders.assign_supervisor', 'work_orders.assign_technician',
    'work_orders.complete', 'work_orders.verify', 'work_orders.reopen', 'work_orders.close',
    'work_orders.adjust_cost', 'work_orders.failure_analysis', 'work_orders.dashboard', 'work_orders.bulk_update', 'work_orders.cancel',
    'work_order_templates.view', 'work_order_templates.create', 'work_order_templates.update',
    'recurring_work_orders.view', 'recurring_work_orders.create', 'recurring_work_orders.update',
    'approvals.view', 'approvals.approve', 'approvals.reject', 'verifications.view', 'verifications.check',
    'sla.view', 'sla.manage', 'failure_codes.view', 'failure_codes.manage',
    'rca.view', 'rca.create', 'rca.update', 'assistance_requests.view', 'assistance_requests.create', 'assistance_requests.respond',
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
    'reports.view', 'reports.export', 'reports.generate', 'analytics.view', 'operations.view',
  ],
  maintenance_planner: [
    'dashboard.view', 'dashboard.stats', 'chat.view', 'documents.view', 'documents.upload', 'documents.download',
    'notifications.view',
    'assets.view', 'assets.view_all', 'assets.create', 'assets.update', 'assets.hierarchy', 'assets.health', 'assets.criticality',
    'assets.hierarchy.view', 'assets.functional_locations.view', 'assets.functional_locations.assign',
    'equipment.view', 'equipment.create', 'equipment.update', 'assemblies.view', 'assemblies.create', 'assemblies.update',
    'bom.view', 'bom.create', 'bom.update', 'facilities.view', 'meters.view', 'meters.read', 'tools.view',
    'maintenance_requests.view', 'maintenance_requests.view_all', 'maintenance_requests.create', 'maintenance_requests.update',
    'maintenance_requests.triage', 'maintenance_requests.convert_to_wo', 'maintenance_requests.my_queue',
    'work_orders.view', 'work_orders.view_all', 'work_orders.create', 'work_orders.update',
    'work_orders.assign_supervisor', 'work_orders.assign_technician', 'work_orders.close',
    'work_orders.failure_analysis', 'work_orders.dashboard', 'work_orders.bulk_update', 'work_orders.cancel',
    'work_order_templates.view', 'work_order_templates.create', 'work_order_templates.update',
    'recurring_work_orders.view', 'recurring_work_orders.create', 'recurring_work_orders.update',
    'approvals.view', 'approvals.approve', 'approvals.reject', 'verifications.view',
    'sla.view', 'sla.manage', 'failure_codes.view', 'failure_codes.manage',
    'rca.view', 'rca.create', 'rca.update', 'time_logs.view',
    'pm_schedules.view', 'pm_schedules.create', 'pm_schedules.update', 'pm_schedules.delete',
    'pm_schedules.activate', 'pm_schedules.run',
    'pm_templates.view', 'pm_templates.create', 'pm_templates.update', 'pm_templates.delete',
    'pm_triggers.view', 'pm_triggers.create', 'pm_triggers.update',
    'pm_checklists.view', 'pm_checklists.create', 'pm_checklists.update', 'pm_checklists.delete',
    'pm_notifications.view', 'pm_analytics.view', 'pm_work_orders.view',
    'calibration.view', 'calibration.create', 'calibration.update',
    'asset_health.view', 'condition_monitoring.view', 'inventory.view', 'parts.view',
    'reports.view', 'reports.export', 'reports.generate', 'analytics.view', 'operations.view',
  ],
  maintenance_supervisor: [
    'dashboard.view', 'chat.view', 'documents.view', 'documents.upload', 'documents.download', 'notifications.view',
    'assets.view', 'assets.view_all', 'assets.update', 'assets.health', 'assets.criticality', 'equipment.view',
    'assets.hierarchy.view', 'assets.functional_locations.view',
    'meters.view', 'meters.read', 'tools.view',
    'maintenance_requests.view', 'maintenance_requests.view_all', 'maintenance_requests.update',
    'maintenance_requests.approve', 'maintenance_requests.reject', 'maintenance_requests.assign_planner',
    'work_orders.view', 'work_orders.view_all', 'work_orders.update', 'work_orders.assign_technician',
    'work_orders.complete', 'work_orders.verify', 'work_orders.reopen', 'work_orders.dashboard', 'work_order_templates.view',
    'approvals.view', 'approvals.approve', 'approvals.reject', 'verifications.view', 'verifications.check',
    'sla.view', 'failure_codes.view', 'rca.view', 'rca.create', 'rca.update',
    'assistance_requests.view', 'assistance_requests.create', 'assistance_requests.respond',
    'time_logs.view', 'time_logs.create', 'time_logs.update',
    'pm_schedules.view', 'pm_schedules.activate', 'pm_checklists.view', 'pm_notifications.view',
    'calibration.view', 'asset_health.view', 'condition_monitoring.view',
    'inventory.view', 'reports.view', 'reports.export', 'operations.view',
  ],
  maintenance_technician: [
    'dashboard.view', 'chat.view', 'documents.view', 'documents.download', 'notifications.view',
    'assets.view', 'assets.view_own', 'equipment.view', 'meters.view', 'meters.read',
    'tools.view', 'tools.checkout', 'tools.return',
    'maintenance_requests.view', 'maintenance_requests.view_own', 'maintenance_requests.create', 'maintenance_requests.update',
    'work_orders.view', 'work_orders.view_own', 'work_orders.update', 'work_orders.start', 'work_orders.complete',
    'assistance_requests.view', 'assistance_requests.create',
    'time_logs.view', 'time_logs.create', 'time_logs.update',
    'pm_schedules.view', 'pm_schedules.run', 'pm_checklists.view', 'pm_notifications.view',
    'inventory.view', 'parts.view', 'reports.view',
  ],
  production_manager: [
    'dashboard.view', 'dashboard.stats', 'chat.view', 'documents.view', 'documents.upload', 'documents.download',
    'notifications.view', 'notifications.manage',
    'assets.view', 'assets.view_all', 'assets.health', 'assets.criticality', 'equipment.view', 'facilities.view',
    'work_centers.view', 'work_centers.create', 'work_centers.update',
    'production.view', 'production.create', 'production.update', 'production.manage',
    'production_surveys.view', 'production_surveys.create', 'production_surveys.update', 'production_surveys.manage',
    'oee.view', 'oee.manage', 'downtime.view', 'downtime.create', 'downtime.manage',
    'quality_checks.view', 'quality_checks.create', 'quality_checks.update', 'energy.view', 'energy.manage',
    'production_targets.view', 'production_targets.create', 'production_targets.update',
    'production_batches.view', 'production_batches.create', 'production_batches.update', 'production_batches.delete',
    'maintenance_requests.view', 'maintenance_requests.view_all', 'maintenance_requests.create',
    'work_orders.view', 'work_orders.view_all', 'inventory.view', 'inventory.view_all',
    'employees.view', 'shifts.view', 'assignments.view',
    'reports.view', 'reports.export', 'reports.generate', 'reports.create', 'analytics.view', 'operations.view',
  ],
  production_operator: [
    'dashboard.view', 'chat.view', 'documents.view', 'documents.download', 'notifications.view',
    'assets.view', 'assets.view_own', 'equipment.view', 'production.view',
    'production_surveys.view', 'production_surveys.create', 'production_surveys.update',
    'downtime.view', 'downtime.create', 'quality_checks.view', 'quality_checks.create', 'quality_checks.update',
    'maintenance_requests.view', 'maintenance_requests.view_own', 'maintenance_requests.create', 'maintenance_requests.update',
    'work_orders.view', 'work_orders.view_own', 'time_logs.view', 'time_logs.create', 'inventory.view',
  ],
  inventory_manager: [
    'dashboard.view', 'dashboard.stats', 'chat.view', 'documents.view', 'documents.upload', 'documents.download',
    'notifications.view', 'notifications.manage',
    'inventory.view', 'inventory.view_all', 'inventory.create', 'inventory.update', 'inventory.delete',
    'inventory.stock_in', 'inventory.stock_out', 'inventory.reserve', 'inventory.consume', 'inventory.export', 'inventory.manage', 'inventory.forecast',
    'parts.view', 'parts.create', 'parts.update', 'parts.delete',
    'parts_categories.view', 'parts_categories.create', 'parts_categories.update',
    'material_requisitions.view', 'material_requisitions.create', 'material_requisitions.update', 'material_requisitions.approve', 'material_requisitions.issue', 'material_requisitions.reject',
    'vendors.view', 'vendors.create', 'vendors.update', 'vendors.delete', 'vendors.manage',
    'stock_transactions.view', 'purchase_orders.view', 'purchase_orders.create', 'purchase_orders.update',
    'purchase_orders.approve', 'purchase_orders.receive', 'purchase_orders.manage',
    'inventory_locations.view', 'inventory_locations.create', 'inventory_locations.update', 'inventory_locations.delete',
    'inventory_adjustments.view', 'inventory_adjustments.create', 'inventory_adjustments.update', 'inventory_adjustments.approve',
    'inventory_transfers.view', 'inventory_transfers.create', 'inventory_transfers.update', 'inventory_transfers.approve',
    'assets.view', 'work_orders.view', 'work_orders.view_all', 'maintenance_requests.view',
    'reports.view', 'reports.export', 'reports.generate', 'analytics.view',
  ],
  tools_shop_attendant: [
    'dashboard.view', 'chat.view', 'documents.view', 'documents.download', 'notifications.view',
    'tools.view', 'tools.create', 'tools.update', 'tools.checkout', 'tools.return', 'tools.transfer', 'tools.manage',
    'assets.view', 'work_orders.view', 'work_orders.view_all', 'maintenance_requests.view', 'inventory.view',
    'reports.view', 'reports.export',
  ],
  store_keeper: [
    'dashboard.view', 'chat.view', 'documents.view', 'documents.download', 'notifications.view',
    'inventory.view', 'inventory.stock_in', 'inventory.stock_out', 'inventory.reserve', 'inventory.export',
    'parts.view', 'parts.update', 'parts_categories.view',
    'material_requisitions.view', 'material_requisitions.issue', 'vendors.view', 'stock_transactions.view',
    'purchase_orders.view', 'purchase_orders.receive', 'inventory_locations.view',
    'inventory_adjustments.view', 'inventory_adjustments.create', 'inventory_adjustments.update', 'inventory_transfers.view', 'inventory_transfers.update', 'reports.view',
  ],
  quality_manager: [
    'dashboard.view', 'dashboard.stats', 'chat.view', 'documents.view', 'documents.upload', 'documents.download',
    'notifications.view', 'notifications.manage',
    'quality_inspections.view', 'quality_inspections.create', 'quality_inspections.update', 'quality_inspections.delete',
    'quality_ncr.view', 'quality_ncr.create', 'quality_ncr.update', 'quality_ncr.delete',
    'quality_audits.view', 'quality_audits.create', 'quality_audits.update', 'quality_audits.delete',
    'quality_control_plans.view', 'quality_control_plans.create', 'quality_control_plans.update',
    'spc.view', 'spc.manage',
    'calibration.view', 'calibration.create', 'calibration.update', 'calibration.delete', 'calibration.manage',
    'assets.view', 'assets.view_all', 'equipment.view', 'meters.view', 'meters.read',
    'work_orders.view', 'work_orders.view_all', 'maintenance_requests.view',
    'reports.view', 'reports.export', 'reports.generate', 'reports.create', 'quality.view',
  ],
  safety_officer: [
    'dashboard.view', 'chat.view', 'documents.view', 'documents.upload', 'documents.download', 'notifications.view', 'notifications.manage',
    'safety_incidents.view', 'safety_incidents.create', 'safety_incidents.update', 'safety_incidents.delete', 'safety_incidents.manage',
    'safety_inspections.view', 'safety_inspections.create', 'safety_inspections.update', 'safety_inspections.delete', 'safety_inspections.manage',
    'safety_equipment.view', 'safety_equipment.create', 'safety_equipment.update', 'safety_equipment.delete',
    'safety_permits.view', 'safety_permits.create', 'safety_permits.update', 'safety_permits.delete', 'safety_permits.approve', 'safety_permits.close',
    'risk_assessments.view', 'risk_assessments.create', 'risk_assessments.update', 'risk_assessments.manage',
    'assets.view', 'employees.view', 'work_orders.view',
    'reports.view', 'reports.export', 'reports.generate', 'safety.view',
  ],
  hr_manager: [
    'dashboard.view', 'dashboard.stats', 'chat.view', 'operations.view', 'system_settings.view',
    'documents.view', 'documents.upload', 'documents.download', 'notifications.view', 'notifications.manage',
    'users.view', 'users.create', 'users.update', 'employees.view', 'employees.create', 'employees.update',
    'shifts.view', 'shifts.create', 'shifts.update', 'shifts.assign',
    'shift_handovers.view', 'shift_handovers.create',
    'training.view', 'training.create', 'training.update', 'training.manage',
    'skills.view', 'skills.create', 'skills.update', 'skill_categories.view', 'skill_categories.manage',
    'technician_groups.view', 'technician_groups.create', 'technician_groups.update',
    'assignments.view', 'assignments.create', 'assignments.update',
    'departments.view', 'plants.view', 'reports.view', 'reports.export', 'reports.generate',
  ],
  iot_engineer: [
    'dashboard.view', 'chat.view', 'documents.view', 'documents.upload', 'documents.download', 'notifications.view',
    'assets.view', 'assets.view_all', 'equipment.view',
    'iot_devices.view', 'iot_devices.create', 'iot_devices.update', 'iot_devices.delete',
    'iot_monitoring.view', 'iot_rules.view', 'iot_rules.create', 'iot_rules.update', 'iot_rules.delete',
    'predictive.view', 'predictive.analyze',
    'asset_health.view', 'condition_monitoring.view', 'condition_monitoring.manage',
    'meters.view', 'meters.create', 'meters.update',
    'reports.view', 'reports.export', 'reports.generate', 'iot.view', 'analytics.view',
  ],
  viewer: [
    'dashboard.view', 'chat.view', 'documents.view', 'notifications.view',
    'users.view', 'roles.view', 'permissions.view', 'departments.view', 'plants.view',
    'assets.view', 'equipment.view', 'assemblies.view', 'bom.view', 'facilities.view', 'meters.view', 'tools.view',
    'assets.hierarchy.view', 'assets.functional_locations.view',
    'maintenance_requests.view', 'work_orders.view', 'work_order_templates.view', 'recurring_work_orders.view',
    'approvals.view', 'verifications.view', 'sla.view', 'failure_codes.view', 'rca.view', 'assistance_requests.view',
    'time_logs.view', 'pm_schedules.view', 'pm_templates.view', 'pm_checklists.view',
    'calibration.view', 'asset_health.view', 'condition_monitoring.view',
    'inventory.view', 'parts.view', 'parts_categories.view', 'material_requisitions.view', 'vendors.view',
    'stock_transactions.view', 'purchase_orders.view', 'inventory_locations.view',
    'inventory_adjustments.view', 'inventory_transfers.view',
    'employees.view', 'shifts.view', 'shift_handovers.view', 'training.view', 'skills.view',
    'skill_categories.view', 'technician_groups.view', 'assignments.view',
    'production.view', 'production_surveys.view', 'oee.view', 'downtime.view', 'quality_checks.view',
    'energy.view', 'work_centers.view', 'production_targets.view', 'production_batches.view',
    'safety_incidents.view', 'safety_inspections.view', 'safety_equipment.view', 'safety_permits.view', 'risk_assessments.view',
    'iot_devices.view', 'iot_monitoring.view', 'iot_rules.view', 'predictive.view',
    'digital_twin.view', 'model_viewer.view', 'hotspots.view', 'reports.view',
    'quality_inspections.view', 'quality_ncr.view', 'quality_audits.view', 'quality_control_plans.view', 'spc.view',
    'company.view', 'iot.view', 'analytics.view', 'operations.view', 'quality.view', 'safety.view',
  ],
};

// ══════════════════════════════════════════════════════════════════════════
// 4. ROTARY SCREEN PRINTING MACHINE DATA
// ══════════════════════════════════════════════════════════════════════════

const MACHINE_SPECS = {
  name: 'Rotary Screen Printing Machine',
  tag: 'RSPM-001',
  serial: 'RSPM-2021-001',
  manufacturer: 'Stork Prints (now SPGPrints)',
  model: 'RD-I Plus 1850',
  year: 2021,
  description: 'Rotary screen printing machine for textile fabric printing. 8-color configuration with infrared drying, automatic registration, and paste circulation system. Primary production machine at Ghana Tema Factory.',
  criticality: 'critical',
  location: 'Printing Hall A',
  building: 'Main Production Building',
  area: 'Zone 1 - Printing Line 1',
  purchaseCost: 850000,
  purchaseDate: '2021-03-15',
  warrantyExpiry: '2024-03-15',
  expectedLifeYears: 20,
  specification: JSON.stringify({
    printWidth: '1850mm', colors: 8, maxSpeed: '80 m/min', minSpeed: '10 m/min',
    screenDiameter: '254mm (10 inch)', screenLength: '2650mm max', fabricWeight: '50-350 g/m²',
    pasteVolume: '8-12 color stations × 2.5L', dryingSystem: 'Infrared (IR)',
    dryingLength: '3 × 3m drying chambers', dryingTemp: '100-180°C',
    registrationType: 'Camera-based automatic', driveSystem: 'AC servo main drive + AC inverter per station',
    controlSystem: 'Siemens S7-1500 PLC', hmi: 'Siemens Touch Panel 15"',
    pneumatics: 'Festo, 6 bar supply', power: '380V 3-phase, 50Hz, ~120kW installed',
    compressedAir: '6 bar, 0.5 m³/min', waterCooling: 'Required for IR lamps and gearboxes',
    dimensions: 'L 28m × W 4.5m × H 3.2m', weight: '~18,000 kg', floorLoad: '>20 kN/m²',
  }),
};

const SUBSYSTEMS = [
  {
    name: 'Unwind & Fabric Feed Section', tag: 'RSPM-001-UF',
    description: 'Fabric unwinding unit with automatic tension control, edge guiding system, and fabric spreader. Feeds fabric into the printing blanket.',
    criticality: 'high',
    children: [
      { name: 'Unwind Stand Frame', tag: 'RSPM-001-UF-FR', description: 'Heavy-duty steel frame supporting the unwinding roll. Includes mechanical braking system and roll lifting jack.', criticality: 'medium' },
      { name: 'Fabric Tension Control Unit', tag: 'RSPM-001-UF-TC', description: 'Pneumatic dancer roller system with load cells for maintaining consistent fabric tension (20-80 N). Includes ultrasonic sensor.', criticality: 'high' },
      { name: 'Edge Guide System (EPC)', tag: 'RSPM-001-UF-EG', description: 'Electro-hydraulic edge position controller with ultrasonic sensors. Maintains fabric alignment within ±1mm tolerance.', criticality: 'high' },
      { name: 'Fabric Spreader Roller', tag: 'RSPM-001-UF-SR', description: 'Bowed rubber spreader roller preventing fabric edge curl and wrinkles before entering the blanket.', criticality: 'low' },
      { name: 'Infeed Roller Assembly', tag: 'RSPM-001-UF-IR', description: 'Rubber-coated nip roller pair that transfers fabric from unwinder to the continuous printing blanket. Driven by AC motor.', criticality: 'medium' },
    ],
  },
  {
    name: 'Printing Section', tag: 'RSPM-001-PS',
    description: 'Main printing section with 8 rotary screen stations, each containing a screen drive, squeegee system, and paste circulation.',
    criticality: 'critical',
    children: [
      { name: 'Printing Blanket (Endless Belt)', tag: 'RSPM-001-PS-BL', description: 'Endless rubber blanket (3mm thick) that carries the fabric through all print stations. Runs on precision tracking rollers.', criticality: 'critical' },
      { name: 'Rotary Screen Drive Unit (×8)', tag: 'RSPM-001-PS-SD', description: 'AC servo motor and gear reducer for each rotary screen. Provides independent speed control and phase adjustment per color station.', criticality: 'critical' },
      { name: 'Magnetic Squeegee System (×8)', tag: 'RSPM-001-PS-SQ', description: 'Magnetic rod squeegee system inside each rotary screen. Electromagnetic force adjustable per station. Rod diameter 10-25mm.', criticality: 'high' },
      { name: 'Paste Circulation System (×8)', tag: 'RSPM-001-PS-PC', description: 'Peristaltic pump and piping for continuous paste circulation in each screen. Includes level sensor, filter (80 mesh), and return valve.', criticality: 'high' },
      { name: 'Screen Lifting & Engagement Mechanism', tag: 'RSPM-001-PS-LM', description: 'Pneumatic cylinder system for raising/lowering each print station. Allows quick screen change and lifting during threading.', criticality: 'medium' },
      { name: 'Registration Camera System', tag: 'RSPM-001-PS-RC', description: 'High-resolution CCD camera system scanning reference marks on fabric. Real-time correction via servo drives. Accuracy ±0.1mm.', criticality: 'critical' },
    ],
  },
  {
    name: 'Infrared Drying Section', tag: 'RSPM-001-DS',
    description: 'Three-chamber infrared drying system with exhaust fans. Removes moisture and fixes the print paste onto the fabric.',
    criticality: 'high',
    children: [
      { name: 'IR Drying Chamber 1', tag: 'RSPM-001-DS-DC1', description: 'First IR drying chamber with 18 infrared emitters (medium-wave, 2.4kW each). Zone temperature control 100-150°C.', criticality: 'high' },
      { name: 'IR Drying Chamber 2', tag: 'RSPM-001-DS-DC2', description: 'Second IR drying chamber with 18 emitters. Intermediate drying zone at 130-170°C.', criticality: 'high' },
      { name: 'IR Drying Chamber 3', tag: 'RSPM-001-DS-DC3', description: 'Final IR drying chamber with 18 emitters. Final fixation zone at 150-180°C. Includes moisture sensor at exit.', criticality: 'high' },
      { name: 'Exhaust Fan System', tag: 'RSPM-001-DS-EF', description: '3 exhaust fans (2.2kW each) with variable speed drives for removing steam and volatile compounds. Includes heat recovery.', criticality: 'medium' },
      { name: 'Fabric Transport Web', tag: 'RSPM-001-DS-TW', description: 'Stainless steel wire mesh conveyor belt carrying fabric through drying chambers. Driven by separate AC motor with speed sync.', criticality: 'medium' },
    ],
  },
  {
    name: 'Wind-Up & Output Section', tag: 'RSPM-001-WU',
    description: 'Fabric winding unit with automatic tension and alignment control. Batch length counting and doffing mechanism.',
    criticality: 'high',
    children: [
      { name: 'Wind-Up Roll Stand', tag: 'RSPM-001-WU-WS', description: 'Motorized winding unit with 3-roll cantilever design. Automatic roll build control for uniform winding.', criticality: 'medium' },
      { name: 'Output Tension Control', tag: 'RSPM-001-WU-TC', description: 'Load cell-based tension controller maintaining constant fabric tension during winding. Range 20-100 N.', criticality: 'high' },
      { name: 'Batch Length Counter', tag: 'RSPM-001-WU-BL', description: 'Encoder-based length counter with preset batch lengths. Automatic machine stop at target length.', criticality: 'low' },
      { name: 'Cooling Cylinder', tag: 'RSPM-001-WU-CC', description: 'Water-cooled chrome roller that cools fabric before winding. Diameter 500mm, water flow 15 L/min.', criticality: 'medium' },
    ],
  },
  {
    name: 'Main Drive & Power System', tag: 'RSPM-001-DP',
    description: 'Central drive system with main motor, line shaft, and power distribution. Supplies motive power to all sections.',
    criticality: 'critical',
    children: [
      { name: 'Main Drive Motor', tag: 'RSPM-001-DP-MM', description: 'AC servo motor 37kW, 380V, 1470 RPM with absolute encoder. Drives blanket and all synced sections via line shaft.', criticality: 'critical' },
      { name: 'Main Gear Reducer', tag: 'RSPM-001-DP-GR', description: 'Helical-bevel gear reducer, ratio 25:1. Oil-lubricated with forced cooling. Input: servo motor, Output: blanket drive roller.', criticality: 'critical' },
      { name: 'Main Electrical Panel (MCC)', tag: 'RSPM-001-DP-EP', description: 'Motor Control Center housing all VFDs, breakers, and power distribution. Siemens Sinamics drives per section.', criticality: 'critical' },
      { name: 'PLC Control Cabinet', tag: 'RSPM-001-DP-PL', description: 'Siemens S7-1500 PLC with ET200SP remote I/O. Includes safety PLC (F-CPU) for emergency stops.', criticality: 'critical' },
      { name: 'UPS / Power Backup', tag: 'RSPM-001-DP-UP', description: '10kVA online UPS maintaining control power during mains failure. 15-min runtime for orderly shutdown.', criticality: 'high' },
    ],
  },
  {
    name: 'Pneumatic & Auxiliary Systems', tag: 'RSPM-001-PA',
    description: 'Compressed air system, water cooling, lubrication, and safety systems supporting machine operation.',
    criticality: 'medium',
    children: [
      { name: 'Air Filtration & Regulation Unit (FRL)', tag: 'RSPM-001-PA-AR', description: 'Main air treatment unit with 5µm filter, pressure regulator (6 bar), and lubricator. Auto-drain filter.', criticality: 'medium' },
      { name: 'Central Lubrication System', tag: 'RSPM-001-PA-CL', description: 'Automatic grease lubrication system for all bearings and sliding parts. Progressive distributor with 30 lube points.', criticality: 'medium' },
      { name: 'Water Cooling Skid', tag: 'RSPM-001-PA-WC', description: 'Closed-loop water cooling system with pump, heat exchanger, and expansion tank. Cools IR lamps, gearboxes, and PLC cabinet.', criticality: 'high' },
      { name: 'Safety Interlock System', tag: 'RSPM-001-PA-SI', description: 'Machine safety system with 12 emergency stops, safety interlocks on all guards, and safety light curtains at infeed/outfeed.', criticality: 'critical' },
      { name: 'Paste Preparation & Supply Unit', tag: 'RSPM-001-PA-PP', description: 'Stirring and filtration unit for print paste preparation. Includes 2 × 200L stainless steel tanks with agitators.', criticality: 'medium' },
    ],
  },
];

// PM Templates (6)
const PM_TEMPLATES = [
  {
    title: 'Daily Operator Inspection - Rotary Screen Printer', type: 'inspection', category: 'mechanical',
    estimatedDuration: 0.5, priority: 'medium',
    tasks: [
      { description: 'Inspect blanket surface for cuts, marks, or foreign objects', taskType: 'inspect', estimatedMinutes: 5 },
      { description: 'Check all 8 squeegee rods for wear and straightness', taskType: 'inspect', estimatedMinutes: 8 },
      { description: 'Verify paste circulation - check all 8 stations for blockages', taskType: 'check', estimatedMinutes: 5 },
      { description: 'Inspect edge guide sensor alignment and function', taskType: 'inspect', estimatedMinutes: 3 },
      { description: 'Check fabric tension readout matches setpoint (40N ± 5N)', taskType: 'measure', estimatedMinutes: 2 },
      { description: 'Verify registration camera lens is clean and focused', taskType: 'inspect', estimatedMinutes: 3 },
      { description: 'Check all 8 print stations for paste leakage', taskType: 'check', estimatedMinutes: 5 },
      { description: 'Inspect drying chambers for fabric debris buildup', taskType: 'inspect', estimatedMinutes: 5 },
      { description: 'Record main drive motor running hours and current draw', taskType: 'record', estimatedMinutes: 2 },
      { description: 'Check emergency stop buttons function on all stations', taskType: 'check', estimatedMinutes: 3 },
    ],
  },
  {
    title: 'Weekly Maintenance - Rotary Screen Printer', type: 'preventive', category: 'mechanical',
    estimatedDuration: 2, priority: 'high', requiredSkills: ['mechanical', 'textile_machinery'],
    tasks: [
      { description: 'Grease all main bearings per lubrication chart (30 points)', taskType: 'lubricate', estimatedMinutes: 20, requiredParts: [{ partName: 'Lithium Grease EP2', quantity: 1, unit: 'kg' }] },
      { description: 'Inspect and clean all paste circulation pump filters (×8)', taskType: 'inspect', estimatedMinutes: 15 },
      { description: 'Check blanket tracking rollers - clean and inspect bearing play', taskType: 'inspect', estimatedMinutes: 15 },
      { description: 'Inspect main gear reducer oil level and condition', taskType: 'check', estimatedMinutes: 5 },
      { description: 'Clean IR emitter reflectors in all 3 drying chambers', taskType: 'inspect', estimatedMinutes: 20 },
      { description: 'Check and clean air FRL unit - drain condensate, check oil level', taskType: 'inspect', estimatedMinutes: 5 },
      { description: 'Verify VFD cooling fans running and clean air filters', taskType: 'inspect', estimatedMinutes: 10 },
      { description: 'Test all safety interlock switches and E-stops', taskType: 'check', estimatedMinutes: 10 },
      { description: 'Inspect screen engagement pneumatic cylinders for air leaks', taskType: 'inspect', estimatedMinutes: 10 },
      { description: 'Check water cooling system - flow rate, temperature, coolant level', taskType: 'measure', estimatedMinutes: 5 },
    ],
  },
  {
    title: 'Monthly Maintenance - Rotary Screen Printer', type: 'preventive', category: 'mechanical',
    estimatedDuration: 4, priority: 'high', requiredSkills: ['mechanical', 'electrical'],
    tasks: [
      { description: 'Replace paste circulation pump tubing (peristaltic) - all 8 stations', taskType: 'replace', estimatedMinutes: 30, requiredParts: [{ partName: 'Peristaltic Pump Tube (Viton)', quantity: 8, unit: 'each' }] },
      { description: 'Inspect blanket for edge wear and measure thickness at 5 points', taskType: 'measure', estimatedMinutes: 15 },
      { description: 'Check and adjust all print station belt tensions', taskType: 'check', estimatedMinutes: 20 },
      { description: 'Inspect main drive motor coupling alignment', taskType: 'inspect', estimatedMinutes: 15 },
      { description: 'Test and record insulation resistance of main drive motor', taskType: 'measure', estimatedMinutes: 10 },
      { description: 'Clean PLC cabinet and check for fault codes in all VFDs', taskType: 'inspect', estimatedMinutes: 15 },
      { description: 'Inspect cooling cylinder bearing and water seal', taskType: 'inspect', estimatedMinutes: 10 },
      { description: 'Calibrate fabric tension load cells (both infeed and outfeed)', taskType: 'measure', estimatedMinutes: 15 },
      { description: 'Inspect unwind and wind-up roll mandrels for wear', taskType: 'inspect', estimatedMinutes: 10 },
      { description: 'Check exhaust fan belt condition and tension', taskType: 'inspect', estimatedMinutes: 5 },
      { description: 'Inspect and clean registration camera optics and lighting', taskType: 'inspect', estimatedMinutes: 10 },
      { description: 'Test UPS battery backup - runtime under load', taskType: 'check', estimatedMinutes: 15 },
    ],
  },
  {
    title: 'Quarterly Maintenance - Rotary Screen Printer', type: 'preventive', category: 'mechanical',
    estimatedDuration: 8, priority: 'high', requiredSkills: ['mechanical', 'electrical', 'textile_machinery'],
    tasks: [
      { description: 'Change main gear reducer oil - full drain and refill (20L)', taskType: 'replace', estimatedMinutes: 30, requiredParts: [{ partName: 'Gear Oil ISO 220', quantity: 20, unit: 'litre' }] },
      { description: 'Inspect and replace worn squeegee magnetic rods if needed', taskType: 'replace', estimatedMinutes: 30 },
      { description: 'Full thermographic inspection of all electrical connections', taskType: 'inspect', estimatedMinutes: 45 },
      { description: 'Vibration analysis on main drive motor, gear reducer, and all station drives', taskType: 'measure', estimatedMinutes: 60 },
      { description: 'Replace air filters on all FRL units and VFD cabinets', taskType: 'replace', estimatedMinutes: 15 },
      { description: 'Check and adjust blanket tracking system - roller alignment', taskType: 'check', estimatedMinutes: 30 },
      { description: 'Inspect and clean all IR emitter reflectors (54 total) + test elements', taskType: 'inspect', estimatedMinutes: 45 },
      { description: 'Full PLC backup and check program version', taskType: 'check', estimatedMinutes: 20 },
      { description: 'Inspect pneumatic cylinders on all screen lift mechanisms (×8)', taskType: 'inspect', estimatedMinutes: 20 },
      { description: 'Test all overload relays and motor protection settings', taskType: 'check', estimatedMinutes: 20 },
    ],
  },
  {
    title: 'Annual Overhaul - Rotary Screen Printer', type: 'preventive', category: 'mechanical',
    estimatedDuration: 40, priority: 'critical', requiredSkills: ['mechanical', 'electrical', 'textile_machinery', 'instrumentation'],
    tasks: [
      { description: 'Full machine alignment check - all print stations, blanket, and dryer', taskType: 'measure', estimatedMinutes: 120 },
      { description: 'Replace main blanket - remove old, install and track new blanket', taskType: 'replace', estimatedMinutes: 240, requiredParts: [{ partName: 'Endless Printing Blanket 1850mm', quantity: 1, unit: 'each' }] },
      { description: 'Replace all paste circulation pump assemblies (×8)', taskType: 'replace', estimatedMinutes: 120 },
      { description: 'Full electrical system test - insulation, grounding, surge protection', taskType: 'measure', estimatedMinutes: 120 },
      { description: 'Replace all pneumatic seals and air lines', taskType: 'replace', estimatedMinutes: 180 },
      { description: 'Replace water cooling pump mechanical seals', taskType: 'replace', estimatedMinutes: 60 },
      { description: 'Full calibration of registration system - cameras, servos, sensors', taskType: 'measure', estimatedMinutes: 240 },
      { description: 'Replace all VFD cooling fans and control cabinet fans', taskType: 'replace', estimatedMinutes: 60 },
      { description: 'Overhaul all station gear reducers - oil change, bearing check', taskType: 'replace', estimatedMinutes: 480 },
      { description: 'Repaint machine guards and safety markings', taskType: 'check', estimatedMinutes: 120 },
    ],
  },
  {
    title: 'Predictive Condition Monitoring - Rotary Screen Printer', type: 'predictive', category: 'mechanical',
    estimatedDuration: 3, priority: 'high', requiredSkills: ['condition_monitoring', 'vibration_analysis'],
    tasks: [
      { description: 'Vibration analysis - main drive motor DE and NDE bearings', taskType: 'measure', estimatedMinutes: 15 },
      { description: 'Vibration analysis - main gear reducer input and output shafts', taskType: 'measure', estimatedMinutes: 15 },
      { description: 'Vibration analysis - all 8 station screen drives', taskType: 'measure', estimatedMinutes: 30 },
      { description: 'Thermographic scan - main electrical panel and all VFDs', taskType: 'measure', estimatedMinutes: 20 },
      { description: 'Thermographic scan - all IR drying chambers (hotspot detection)', taskType: 'measure', estimatedMinutes: 15 },
      { description: 'Oil analysis sampling - main gear reducer', taskType: 'measure', estimatedMinutes: 10 },
      { description: 'Oil analysis sampling - all 8 station gear reducers', taskType: 'measure', estimatedMinutes: 20 },
      { description: 'Current signature analysis - main drive motor', taskType: 'measure', estimatedMinutes: 15 },
      { description: 'Ultrasonic inspection - pneumatic valve leaks', taskType: 'inspect', estimatedMinutes: 15 },
      { description: 'Record and trend all measurements against baselines', taskType: 'record', estimatedMinutes: 15 },
    ],
  },
];

// Inventory items (22 spare parts)
const INVENTORY_ITEMS = [
  { code: 'SP-RSPM-001', name: 'Endless Printing Blanket 1850mm', category: 'spare_part', unit: 'each', minStock: 1, maxStock: 2, unitCost: 8500, supplier: 'Stork/SPGPrints', location: 'Main Store', specification: JSON.stringify({ material: 'Nitrile rubber compound', thickness: '3mm', width: '1850mm', length: 'endless (machine-specific)', maxTemp: '180°C' }) },
  { code: 'SP-RSPM-002', name: 'Rotary Screen (Nickel) 254mm diameter', category: 'spare_part', unit: 'each', minStock: 4, maxStock: 12, unitCost: 350, supplier: 'SPGPrints', location: 'Screen Store', specification: JSON.stringify({ material: 'Electroformed nickel', mesh: '60-125 mesh', diameter: '254mm', maxRepeat: '2650mm' }) },
  { code: 'SP-RSPM-003', name: 'Magnetic Squeegee Rod 15mm', category: 'spare_part', unit: 'each', minStock: 10, maxStock: 24, unitCost: 85, supplier: 'SPGPrints', location: 'Squeegee Rack', specification: JSON.stringify({ material: 'Hardened steel with magnetic core', diameter: '15mm', length: '1900mm', coating: 'Chrome-plated' }) },
  { code: 'SP-RSPM-004', name: 'Magnetic Squeegee Rod 20mm', category: 'spare_part', unit: 'each', minStock: 8, maxStock: 16, unitCost: 95, supplier: 'SPGPrints', location: 'Squeegee Rack', specification: JSON.stringify({ material: 'Hardened steel with magnetic core', diameter: '20mm', length: '1900mm', coating: 'Chrome-plated' }) },
  { code: 'SP-RSPM-005', name: 'Peristaltic Pump Tube (Viton)', category: 'spare_part', unit: 'each', minStock: 16, maxStock: 40, unitCost: 28, supplier: 'Watson-Marlow', location: 'Pump Parts Shelf', specification: JSON.stringify({ material: 'Viton fluoroelastomer', bore: '9.6mm', wall: '3.2mm', maxPressure: '2 bar', maxTemp: '200°C' }) },
  { code: 'SP-RSPM-006', name: 'Paste Circulation Pump Assembly', category: 'spare_part', unit: 'each', minStock: 2, maxStock: 4, unitCost: 1200, supplier: 'Watson-Marlow', location: 'Pump Parts Shelf', specification: JSON.stringify({ type: 'Peristaltic', flowRate: '0.5-10 L/min', motor: '0.37kW', connection: 'DN25' }) },
  { code: 'SP-RSPM-007', name: 'IR Emitter Lamp 2.4kW Medium Wave', category: 'spare_part', unit: 'each', minStock: 6, maxStock: 18, unitCost: 185, supplier: 'Heraeus', location: 'Electrical Store', specification: JSON.stringify({ power: '2.4kW', type: 'Medium wave infrared', voltage: '380V', length: '1200mm' }) },
  { code: 'SP-RSPM-008', name: 'VFD Module 37kW (Main Drive)', category: 'spare_part', unit: 'each', minStock: 1, maxStock: 1, unitCost: 3200, supplier: 'Siemens', location: 'Electrical Store', specification: JSON.stringify({ model: 'Siemens Sinamics G120 37kW', input: '380V 3Ph 50Hz', output: '37kW / 75A' }) },
  { code: 'SP-RSPM-009', name: 'Servo Motor 1.5kW (Screen Drive)', category: 'spare_part', unit: 'each', minStock: 2, maxStock: 4, unitCost: 1800, supplier: 'Siemens', location: 'Electrical Store', specification: JSON.stringify({ power: '1.5kW', voltage: '380V', speed: '3000 RPM', encoder: 'absolute multi-turn' }) },
  { code: 'SP-RSPM-010', name: 'PLC I/O Module ET200SP', category: 'spare_part', unit: 'each', minStock: 2, maxStock: 4, unitCost: 450, supplier: 'Siemens', location: 'Electrical Store', specification: JSON.stringify({ type: 'Digital Input 16-ch', protocol: 'PROFINET', model: '6ES7131-6BF01-0BA0' }) },
  { code: 'SP-RSPM-011', name: 'Emergency Stop Button Complete', category: 'spare_part', unit: 'each', minStock: 4, maxStock: 8, unitCost: 45, supplier: 'Siemens', location: 'Electrical Store', specification: JSON.stringify({ type: 'Twist-release mushroom head', IP: 'IP67', contact: '1NC + 1NO', color: 'Red' }) },
  { code: 'SP-RSPM-012', name: 'Gear Oil ISO 220', category: 'consumable', unit: 'litre', minStock: 20, maxStock: 50, unitCost: 8.5, supplier: 'Shell', location: 'Lube Store', specification: JSON.stringify({ brand: 'Shell Omala S2 G 220', viscosity: 'ISO VG 220', type: 'EP gear oil', packSize: '20L drum' }) },
  { code: 'SP-RSPM-013', name: 'Gear Oil ISO 68', category: 'consumable', unit: 'litre', minStock: 20, maxStock: 50, unitCost: 7.2, supplier: 'Shell', location: 'Lube Store', specification: JSON.stringify({ brand: 'Shell Omala S2 G 68', viscosity: 'ISO VG 68', type: 'EP gear oil', packSize: '20L drum' }) },
  { code: 'SP-RSPM-014', name: 'Lithium Grease EP2', category: 'consumable', unit: 'kg', minStock: 5, maxStock: 15, unitCost: 12, supplier: 'Shell', location: 'Lube Store', specification: JSON.stringify({ brand: 'Shell Retinax EP2', type: 'Lithium 12-hydroxystearate', NLGI: '2', dropPoint: '190°C' }) },
  { code: 'SP-RSPM-015', name: 'Pneumatic Seal Kit (Cylinder)', category: 'spare_part', unit: 'each', minStock: 4, maxStock: 12, unitCost: 35, supplier: 'Festo', location: 'Pneumatic Parts', specification: JSON.stringify({ bore: '50mm', stroke: '100mm', material: 'NBR/Polyurethane' }) },
  { code: 'SP-RSPM-016', name: 'Mechanical Seal Kit DN40', category: 'spare_part', unit: 'each', minStock: 2, maxStock: 4, unitCost: 120, supplier: 'John Crane', location: 'Pump Parts Shelf', specification: JSON.stringify({ size: 'DN40', material: 'Silicon carbide / carbon', type: 'Cartridge seal' }) },
  { code: 'SP-RSPM-017', name: 'Cooling Fan 230V (VFD/Panel)', category: 'spare_part', unit: 'each', minStock: 6, maxStock: 12, unitCost: 28, supplier: 'ebm-papst', location: 'Electrical Store', specification: JSON.stringify({ voltage: '230V', power: '25W', speed: '2800 RPM', size: '120×120mm', IP: 'IP54' }) },
  { code: 'SP-RSPM-018', name: 'Air Filter Element 5µm', category: 'spare_part', unit: 'each', minStock: 4, maxStock: 8, unitCost: 18, supplier: 'Festo', location: 'Pneumatic Parts', specification: JSON.stringify({ rating: '5µm', type: 'Spin-on compressed air filter', autoDrain: true }) },
  { code: 'SP-RSPM-019', name: 'Load Cell 200kg (Tension)', category: 'spare_part', unit: 'each', minStock: 2, maxStock: 4, unitCost: 280, supplier: 'HBM', location: 'Instrumentation Store', specification: JSON.stringify({ capacity: '200kg', type: 'Single point', excitation: '10V', output: '2mV/V', IP: 'IP67' }) },
  { code: 'SP-RSPM-020', name: 'Cooling Cylinder Bearing', category: 'spare_part', unit: 'each', minStock: 2, maxStock: 4, unitCost: 95, supplier: 'SKF', location: 'Bearing Store', specification: JSON.stringify({ type: 'Spherical roller bearing', model: '22316 EK', bore: '80mm', OD: '170mm', width: '58mm' }) },
  { code: 'SP-RSPM-021', name: 'Belt for Exhaust Fan (A68)', category: 'spare_part', unit: 'each', minStock: 3, maxStock: 6, unitCost: 12, supplier: 'Gates', location: 'Belt Store', specification: JSON.stringify({ type: 'Wrapped V-belt', section: 'A', length: '1727mm (68 inch)' }) },
  { code: 'SP-RSPM-022', name: 'Water Pump Mechanical Seal DN32', category: 'spare_part', unit: 'each', minStock: 2, maxStock: 4, unitCost: 85, supplier: 'John Crane', location: 'Pump Parts Shelf', specification: JSON.stringify({ size: 'DN32', material: 'Silicon carbide / carbon', type: 'Component seal' }) },
];

// ══════════════════════════════════════════════════════════════════════════
// MAIN SEED FUNCTION
// ══════════════════════════════════════════════════════════════════════════

async function seedAll() {
  console.log('\n🌱 ═══════════════════════════════════════════════════');
  console.log('   iAssetsPro EAM — Combined Idempotent Seed');
  console.log('════════════════════════════════════════════════════\n');

  // ── 0. Test database connection ──
  try {
    await db.$queryRawUnsafe('SELECT 1 as ok');
    console.log('✅ Database connection successful\n');
  } catch (connErr) {
    console.error('❌ FATAL: Cannot connect to database!');
    console.error('   Error:', (connErr as Error).message);
    console.error('\n   Please check:');
    console.error('   1. DATABASE_URL is set correctly');
    console.error('   2. Database server is running and accessible');
    console.error('   3. User has proper permissions');
    console.error('   4. Database exists');
    process.exit(1);
  }

  let errors = 0;

  // ════════════════════════════════════════════════════════════════════════
  // STAGE 1: BASE DATA
  // ════════════════════════════════════════════════════════════════════════
  console.log('═══ STAGE 1: Base Data ════\n');

  // ── 1. Create Permissions ──
  console.log(`📋 [1/7] Creating permissions...`);
  const permissionMap: Record<string, string> = {};
  try {
    let count = 0;
    for (const [moduleName, actions] of Object.entries(modulePermissions)) {
      for (const action of actions) {
        const slug = `${moduleName}.${action}`;
        const perm = await db.permission.upsert({
          where: { slug },
          update: {
            name: `${formatModuleName(moduleName)} - ${formatActionName(action)}`,
            module: moduleName,
            action,
          },
          create: {
            slug,
            name: `${formatModuleName(moduleName)} - ${formatActionName(action)}`,
            module: moduleName,
            action,
            description: `${formatActionName(action)} access for ${formatModuleName(moduleName)} module`,
          },
        });
        permissionMap[slug] = perm.id;
        count++;
      }
    }
    logStep('✅', `Created ${count} permissions`);
  } catch (e) {
    logErr('Failed to create permissions', e);
    errors++;
  }
  console.log('');

  // ── 2. Create Roles ──
  console.log(`🔑 [2/7] Creating roles...`);
  const createdRoles: Record<string, string> = {};
  try {
    for (const roleDef of roleDefinitions) {
      const role = await db.role.upsert({
        where: { slug: roleDef.slug },
        update: { name: roleDef.name, description: roleDef.description, level: roleDef.level, isSystem: roleDef.isSystem },
        create: { name: roleDef.name, slug: roleDef.slug, description: roleDef.description, level: roleDef.level, isSystem: roleDef.isSystem },
      });
      createdRoles[roleDef.slug] = role.id;
      logStep('✅', `${roleDef.name} (${roleDef.slug})`);
    }
  } catch (e) {
    logErr('Failed to create roles', e);
    errors++;
  }
  console.log('');

  // ── 3. Assign Permissions to Roles ──
  console.log(`🔗 [3/7] Assigning permissions to roles...`);
  try {
    // Admin gets ALL permissions
    const allPermIds = Object.values(permissionMap);
    // Delete existing admin role permissions then re-create (handles permission list changes)
    await db.rolePermission.deleteMany({ where: { roleId: createdRoles['admin'] } });
    await db.rolePermission.createMany({
      data: allPermIds.map(pid => ({ roleId: createdRoles['admin'], permissionId: pid })),
      skipDuplicates: true,
    });
    logStep('✅', `admin: ${allPermIds.length} permissions (ALL)`);

    // Other roles
    for (const [roleSlug, permSlugs] of Object.entries(rolePermissionBundles)) {
      const roleId = createdRoles[roleSlug];
      if (!roleId) continue;

      // Delete existing then re-create
      await db.rolePermission.deleteMany({ where: { roleId } });
      const validPermIds: string[] = [];
      for (const slug of permSlugs) {
        const pid = permissionMap[slug];
        if (pid) validPermIds.push(pid);
      }
      if (validPermIds.length > 0) {
        await db.rolePermission.createMany({
          data: validPermIds.map(pid => ({ roleId, permissionId: pid })),
          skipDuplicates: true,
        });
      }
      logStep('✅', `${roleSlug}: ${validPermIds.length} permissions`);
    }
  } catch (e) {
    logErr('Failed to assign permissions', e);
    errors++;
  }
  console.log('');

  // ── 4. Create Plants & Departments ──
  console.log(`🏭 [4/7] Creating plants & departments...`);
  const plantsMap: Record<string, any> = {};
  const deptsMap: Record<string, any> = {};
  try {
    const plantsData = [
      { name: 'Tema Factory', code: 'TEM-001', location: 'Tema Heavy Industrial Area', country: 'Ghana', city: 'Tema' },
      { name: 'Kumasi Plant', code: 'KUM-001', location: 'Kaase Industrial Area', country: 'Ghana', city: 'Kumasi' },
      { name: 'Takoradi Facility', code: 'TAK-001', location: 'Sekondi-Takoradi Industrial Zone', country: 'Ghana', city: 'Takoradi' },
    ];
    for (const p of plantsData) {
      const plant = await db.plant.upsert({
        where: { code: p.code },
        update: { name: p.name, location: p.location, country: p.country, city: p.city, isActive: true },
        create: { name: p.name, code: p.code, location: p.location, country: p.country, city: p.city, isActive: true },
      });
      plantsMap[p.code] = plant;
      logStep('✅', `${plant.name} (${plant.code})`);
    }

    // Tema Factory departments
    const temaDepts = [
      { name: 'Maintenance', code: 'MAINT' }, { name: 'Production', code: 'PROD' },
      { name: 'Quality Control', code: 'QC' }, { name: 'Engineering', code: 'ENG' },
      { name: 'Health Safety & Environment', code: 'HSE' }, { name: 'Warehouse & Logistics', code: 'WH' },
      { name: 'Utilities', code: 'UTIL' },
    ];
    for (const d of temaDepts) {
      const existing = await db.department.findFirst({ where: { code: d.code, plantId: plantsMap['TEM-001'].id } });
      if (!existing) {
        const dept = await db.department.create({ data: { name: d.name, code: d.code, plantId: plantsMap['TEM-001'].id } });
        deptsMap[d.code] = dept;
        logStep('  ✅', `Dept: ${d.name} (${d.code})`);
      } else {
        deptsMap[d.code] = existing;
        logStep('  ⏭️', `Dept: ${d.name} (${d.code}) — exists`);
      }
    }

    // Kumasi departments
    const kumDepts = [{ name: 'Maintenance', code: 'MAINT-K' }, { name: 'Production', code: 'PROD-K' }];
    for (const d of kumDepts) {
      const existing = await db.department.findFirst({ where: { code: d.code, plantId: plantsMap['KUM-001'].id } });
      if (!existing) {
        await db.department.create({ data: { name: d.name, code: d.code, plantId: plantsMap['KUM-001'].id } });
        logStep('  ✅', `Dept: ${d.name} (${d.code}) — Kumasi`);
      }
    }

    // Takoradi departments
    const takDepts = [{ name: 'Maintenance', code: 'MAINT-T' }, { name: 'Production', code: 'PROD-T' }];
    for (const d of takDepts) {
      const existing = await db.department.findFirst({ where: { code: d.code, plantId: plantsMap['TAK-001'].id } });
      if (!existing) {
        await db.department.create({ data: { name: d.name, code: d.code, plantId: plantsMap['TAK-001'].id } });
        logStep('  ✅', `Dept: ${d.name} (${d.code}) — Takoradi`);
      }
    }
  } catch (e) {
    logErr('Failed to create plants/departments', e);
    errors++;
  }
  console.log('');

  // ── 5. Create Users ──
  console.log(`👤 [5/7] Creating users...`);
  const adminUserId = createdRoles['admin'];
  const temaId = plantsMap['TEM-001'].id;
  const kumasiId = plantsMap['KUM-001'].id;
  const takoradiId = plantsMap['TAK-001'].id;
  let adminUser: any;

  try {
    // Admin user
    const adminPw = await hash('admin123', 10);
    adminUser = await db.user.upsert({
      where: { username: 'admin' },
      update: { email: 'admin@iassetspro.com', passwordHash: adminPw, fullName: 'System Administrator', staffId: 'EMP-001', department: 'Maintenance', status: 'active' },
      create: { username: 'admin', email: 'admin@iassetspro.com', passwordHash: adminPw, fullName: 'System Administrator', staffId: 'EMP-001', department: 'Maintenance', status: 'active' },
    });
    logStep('✅', `admin / admin@iassetspro.com / System Administrator`);

    // Assign admin role and plant access
    await db.userRole.upsert({ where: { userId_roleId: { userId: adminUser.id, roleId: adminUserId } }, update: {}, create: { userId: adminUser.id, roleId: adminUserId } });
    for (const pId of [temaId, kumasiId, takoradiId]) {
      await db.userPlant.upsert({ where: { userId_plantId: { userId: adminUser.id, plantId: pId } }, update: {}, create: { userId: adminUser.id, plantId: pId, accessLevel: 'admin', isPrimary: pId === temaId } });
    }

    // Plant Manager user (pm.temafactory)
    const pmPw = await hash('admin123', 10);
    const pmUser = await db.user.upsert({
      where: { username: 'pm.temafactory' },
      update: { email: 'pm.temafactory@iassetspro.com', passwordHash: pmPw, fullName: 'Kwame Asante', staffId: 'EMP-002', department: 'Maintenance', status: 'active', primaryTrade: 'Maintenance Management' },
      create: { username: 'pm.temafactory', email: 'pm.temafactory@iassetspro.com', passwordHash: pmPw, fullName: 'Kwame Asante', staffId: 'EMP-002', department: 'Maintenance', status: 'active', primaryTrade: 'Maintenance Management' },
    });
    logStep('✅', `pm.temafactory / pm.temafactory@iassetspro.com / Kwame Asante`);

    // Assign admin role and Tema Factory
    await db.userRole.upsert({ where: { userId_roleId: { userId: pmUser.id, roleId: adminUserId } }, update: {}, create: { userId: pmUser.id, roleId: adminUserId } });
    await db.userPlant.upsert({ where: { userId_plantId: { userId: pmUser.id, plantId: temaId } }, update: {}, create: { userId: pmUser.id, plantId: temaId, accessLevel: 'admin', isPrimary: true } });

    // Demo users
    const demoUsers = [
      { username: 'planner1', email: 'planner@iassetspro.com', fullName: 'Kwame Planner', staffId: 'PLN-001', roleSlug: 'maintenance_planner', department: 'Maintenance', plantId: temaId },
      { username: 'supervisor1', email: 'supervisor@iassetspro.com', fullName: 'Ama Supervisor', staffId: 'SUP-001', roleSlug: 'maintenance_supervisor', department: 'Production', plantId: temaId },
      { username: 'tech1', email: 'tech@iassetspro.com', fullName: 'Kofi Technician', staffId: 'TEC-001', roleSlug: 'maintenance_technician', department: 'Maintenance', plantId: temaId },
      { username: 'operator1', email: 'operator@iassetspro.com', fullName: 'Akua Operator', staffId: 'OPR-001', roleSlug: 'production_operator', department: 'Production', plantId: temaId },
      { username: 'manager1', email: 'manager1@iassetspro.com', fullName: 'Nana Plant Manager', staffId: 'PMG-001', roleSlug: 'plant_manager', department: 'Maintenance', plantId: temaId },
      { username: 'maint_mgr1', email: 'maint_mgr1@iassetspro.com', fullName: 'Efua Maint Manager', staffId: 'MMG-001', roleSlug: 'maintenance_manager', department: 'Maintenance', plantId: temaId },
      { username: 'tech2', email: 'tech2@iassetspro.com', fullName: 'Yaw Technician', staffId: 'TEC-002', roleSlug: 'maintenance_technician', department: 'Maintenance', plantId: kumasiId },
      { username: 'prod_mgr1', email: 'prod_mgr1@iassetspro.com', fullName: 'Adwoa Prod Manager', staffId: 'PRM-001', roleSlug: 'production_manager', department: 'Production', plantId: temaId },
      { username: 'op2', email: 'op2@iassetspro.com', fullName: 'Kwabena Operator', staffId: 'OPR-002', roleSlug: 'production_operator', department: 'Production', plantId: kumasiId },
      { username: 'inv_mgr1', email: 'inv_mgr1@iassetspro.com', fullName: 'Abena Inv Manager', staffId: 'IVM-001', roleSlug: 'inventory_manager', department: 'Warehouse & Logistics', plantId: temaId },
      { username: 'store1', email: 'store1@iassetspro.com', fullName: 'Kwaku Store Keeper', staffId: 'STK-001', roleSlug: 'store_keeper', department: 'Warehouse & Logistics', plantId: temaId },
      { username: 'qual_mgr1', email: 'qual_mgr1@iassetspro.com', fullName: 'Ama Quality Mgr', staffId: 'QAM-001', roleSlug: 'quality_manager', department: 'Quality Control', plantId: temaId },
      { username: 'safety1', email: 'safety1@iassetspro.com', fullName: 'Kojo Safety Officer', staffId: 'SAF-001', roleSlug: 'safety_officer', department: 'Health Safety & Environment', plantId: temaId },
      { username: 'hr1', email: 'hr1@iassetspro.com', fullName: 'Afia HR Manager', staffId: 'HRM-001', roleSlug: 'hr_manager', department: 'Engineering', plantId: temaId },
      { username: 'iot1', email: 'iot1@iassetspro.com', fullName: 'Emmanuel IoT Engineer', staffId: 'IOT-001', roleSlug: 'iot_engineer', department: 'Engineering', plantId: takoradiId },
      { username: 'viewer1', email: 'viewer1@iassetspro.com', fullName: 'Grace Viewer', staffId: 'VWR-001', roleSlug: 'viewer', department: 'Utilities', plantId: temaId },
      { username: 'toolshop1', email: 'toolshop1@iassetspro.com', fullName: 'Kofi Tools Shop', staffId: 'TLS-001', roleSlug: 'tools_shop_attendant', department: 'Maintenance', plantId: temaId },
      { username: 'store2', email: 'store2@iassetspro.com', fullName: 'Ama Store Attendant', staffId: 'STK-002', roleSlug: 'store_keeper', department: 'Warehouse & Logistics', plantId: kumasiId },
      { username: 'tech_eng1', email: 'tech_eng1@iassetspro.com', fullName: 'Kwame Engineering Tech', staffId: 'TEC-003', roleSlug: 'maintenance_technician', department: 'Engineering', plantId: temaId },
      { username: 'tech_prod1', email: 'tech_prod1@iassetspro.com', fullName: 'Esi Production Tech', staffId: 'TEC-004', roleSlug: 'maintenance_technician', department: 'Production', plantId: temaId },
      { username: 'tech_util1', email: 'tech_util1@iassetspro.com', fullName: 'Kojo Utilities Tech', staffId: 'TEC-005', roleSlug: 'maintenance_technician', department: 'Utilities', plantId: temaId },
    ];
    const demoPw = await hash('password123', 10);
    for (const u of demoUsers) {
      const user = await db.user.upsert({
        where: { username: u.username },
        update: { email: u.email, passwordHash: demoPw, fullName: u.fullName, staffId: u.staffId, department: u.department, status: 'active' },
        create: { username: u.username, email: u.email, passwordHash: demoPw, fullName: u.fullName, staffId: u.staffId, department: u.department, status: 'active' },
      });
      const roleId = createdRoles[u.roleSlug];
      if (roleId) {
        await db.userRole.upsert({ where: { userId_roleId: { userId: user.id, roleId } }, update: {}, create: { userId: user.id, roleId } });
      }
      await db.userPlant.upsert({ where: { userId_plantId: { userId: user.id, plantId: u.plantId } }, update: {}, create: { userId: user.id, plantId: u.plantId, accessLevel: 'write', isPrimary: false } });
    }
    logStep('✅', `${demoUsers.length} additional demo users created`);

    // Set supervisor for Production dept on Tema
    const supervisor = await db.user.findUnique({ where: { username: 'supervisor1' } });
    const prodDept = await db.department.findFirst({ where: { code: 'PROD', plantId: temaId } });
    if (supervisor && prodDept) {
      await db.department.update({ where: { id: prodDept.id }, data: { supervisorId: supervisor.id } });
      logStep('  ✅', `Supervisor set for Production dept`);
    }
  } catch (e) {
    logErr('Failed to create users', e);
    errors++;
  }
  console.log('');

  // ── 6 & 7: Company Profile & Status Transitions (lightweight) ──
  console.log(`⚙️  [6/7] Creating company profile...`);
  try {
    const existing = await db.companyProfile.findFirst();
    if (!existing) {
      await db.companyProfile.create({
        data: {
          companyName: 'iAssetsPro EAM',
          tradingName: 'iAssetsPro',
          industry: 'Manufacturing',
          country: 'Ghana', city: 'Tema',
          currency: 'GHS', timezone: 'Africa/Accra',
          dateFormat: 'DD/MM/YYYY',
        },
      });
      logStep('✅', 'Company profile created');
    } else {
      logStep('⏭️', 'Company profile already exists');
    }
  } catch (e) {
    logErr('Failed to create company profile', e);
    errors++;
  }

  console.log(`📊 [7/7] Creating status transitions...`);
  try {
    const existingCount = await db.statusTransition.count();
    if (existingCount === 0) {
      const transitions = [
        { entityType: 'maintenance_request', fromStatus: null, toStatus: 'pending', allowedRoleSlugs: '["supervisor","admin"]', sortOrder: 0 },
        { entityType: 'maintenance_request', fromStatus: 'pending', toStatus: 'supervisor_review', allowedRoleSlugs: '["supervisor","admin"]', sortOrder: 1 },
        { entityType: 'maintenance_request', fromStatus: 'supervisor_review', toStatus: 'approved', allowedRoleSlugs: '["supervisor","admin"]', sortOrder: 2 },
        { entityType: 'maintenance_request', fromStatus: 'supervisor_review', toStatus: 'rejected', allowedRoleSlugs: '["supervisor","admin"]', requiresReason: true, sortOrder: 3 },
        { entityType: 'maintenance_request', fromStatus: 'approved', toStatus: 'assigned_to_planner', allowedRoleSlugs: '["maintenance_planner","admin"]', sortOrder: 4 },
        { entityType: 'maintenance_request', fromStatus: 'assigned_to_planner', toStatus: 'work_order_created', allowedRoleSlugs: '["maintenance_planner","admin"]', sortOrder: 5 },
        { entityType: 'work_order', fromStatus: null, toStatus: 'draft', allowedRoleSlugs: '["admin"]', sortOrder: 0 },
        { entityType: 'work_order', fromStatus: 'draft', toStatus: 'requested', allowedRoleSlugs: '["maintenance_planner","admin"]', sortOrder: 1 },
        { entityType: 'work_order', fromStatus: 'requested', toStatus: 'approved', allowedRoleSlugs: '["maintenance_planner","maintenance_supervisor","admin"]', sortOrder: 2 },
        { entityType: 'work_order', fromStatus: 'approved', toStatus: 'assigned', allowedRoleSlugs: '["maintenance_planner","maintenance_supervisor","admin"]', sortOrder: 3 },
        { entityType: 'work_order', fromStatus: 'assigned', toStatus: 'in_progress', allowedRoleSlugs: '["maintenance_technician","admin"]', sortOrder: 4 },
        { entityType: 'work_order', fromStatus: 'in_progress', toStatus: 'completed', allowedRoleSlugs: '["maintenance_technician","maintenance_supervisor","admin"]', sortOrder: 5 },
        { entityType: 'work_order', fromStatus: 'completed', toStatus: 'verified', allowedRoleSlugs: '["maintenance_supervisor","maintenance_planner","admin"]', sortOrder: 6 },
        { entityType: 'work_order', fromStatus: 'verified', toStatus: 'closed', allowedRoleSlugs: '["maintenance_planner","admin"]', sortOrder: 7 },
      ];
      for (const t of transitions) {
        await db.statusTransition.create({
          data: {
            entityType: t.entityType,
            fromStatus: t.fromStatus,
            toStatus: t.toStatus,
            allowedRoleSlugs: t.allowedRoleSlugs,
            requiresApproval: 'requiresApproval' in t ? Boolean(t.requiresApproval) : false,
            requiresReason: t.requiresReason || false,
            sortOrder: t.sortOrder,
          },
        });
      }
      logStep('✅', `${transitions.length} status transitions created`);
    } else {
      logStep('⏭️', 'Status transitions already exist');
    }
  } catch (e) {
    logErr('Failed to create status transitions', e);
    errors++;
  }
  console.log('');

  // ════════════════════════════════════════════════════════════════════════
  // STAGE 2: ROTARY SCREEN PRINTING MACHINE
  // ════════════════════════════════════════════════════════════════════════
  console.log('═══ STAGE 2: Rotary Screen Printing Machine ════\n');

  if (!adminUser) {
    adminUser = await db.user.findFirst({ where: { username: 'admin' } });
  }

  // ── Step 1: Prerequisites ──
  console.log('🔍 [1/11] Finding prerequisites...');
  let plant = plantsMap['TEM-001'];
  let category: any;
  let dept: any;
  try {
    if (!adminUser) throw new Error('Admin user not found');
    logStep('✅', `Admin user: ${adminUser.fullName}`);

    if (!plant) plant = await db.plant.findFirst({ where: { code: 'TEM-001' } });
    if (!plant) throw new Error('Tema Factory plant not found');
    logStep('✅', `Plant: ${plant.name}`);

    // Asset category
    category = await db.assetCategory.findFirst({ where: { name: 'Printing Equipment' } });
    if (!category) {
      let parentCat = await db.assetCategory.findFirst({ where: { name: 'Production Equipment' } });
      if (!parentCat) {
        parentCat = await db.assetCategory.create({ data: { name: 'Production Equipment', code: 'PROD-EQ', description: 'Production and manufacturing equipment' } });
      }
      category = await db.assetCategory.create({
        data: { name: 'Printing Equipment', code: 'PRINT-EQ', description: 'Textile printing machines and related equipment', parentId: parentCat.id },
      });
    }
    logStep('✅', `Category: ${category.name}`);

    dept = await db.department.findFirst({ where: { code: 'MAINT', plantId: plant.id } });
    logStep('✅', `Department: ${dept?.name || 'Maintenance'}`);
  } catch (e) {
    logErr('Prerequisites check failed — skipping Stage 2', e);
    errors++;
    console.log('');
  }

  // ── Step 2: Main Asset ──
  let mainAsset: any;
  console.log('\n📦 [2/11] Creating main asset...');
  try {
    const existing = await db.asset.findUnique({ where: { assetTag: MACHINE_SPECS.tag } });
    if (existing) {
      mainAsset = existing;
      logStep('⏭️', `${MACHINE_SPECS.tag}: ${MACHINE_SPECS.name} — already exists`);
    } else {
      mainAsset = await db.asset.create({
        data: {
          name: MACHINE_SPECS.name, assetTag: MACHINE_SPECS.tag, serialNumber: MACHINE_SPECS.serial,
          description: MACHINE_SPECS.description, manufacturer: MACHINE_SPECS.manufacturer, model: MACHINE_SPECS.model,
          yearManufactured: MACHINE_SPECS.year, condition: 'good', status: 'operational',
          criticality: MACHINE_SPECS.criticality, location: MACHINE_SPECS.location, building: MACHINE_SPECS.building,
          area: MACHINE_SPECS.area, plantId: plant.id, departmentId: dept?.id, categoryId: category!.id,
          purchaseDate: new Date(MACHINE_SPECS.purchaseDate), purchaseCost: MACHINE_SPECS.purchaseCost,
          warrantyExpiry: new Date(MACHINE_SPECS.warrantyExpiry), expectedLifeYears: MACHINE_SPECS.expectedLifeYears,
          currentValue: MACHINE_SPECS.purchaseCost * 0.82, depreciationRate: 0.09,
          specification: MACHINE_SPECS.specification, createdById: adminUser!.id, assignedToId: adminUser!.id,
        },
      });
      logStep('✅', `${mainAsset.assetTag}: ${mainAsset.name}`);
    }
  } catch (e) {
    logErr('Failed to create main asset', e);
    errors++;
  }

  // ── Step 3: Asset Hierarchy ──
  console.log('\n📐 [3/11] Creating asset hierarchy...');
  const assetMap: Record<string, any> = {};
  let totalComponents = 0;
  try {
    for (const subsystem of SUBSYSTEMS) {
      let ssAsset = await db.asset.findUnique({ where: { assetTag: subsystem.tag } });
      if (!ssAsset) {
        ssAsset = await db.asset.create({
          data: {
            name: subsystem.name, assetTag: subsystem.tag, description: subsystem.description,
            condition: 'good', status: 'operational', criticality: subsystem.criticality,
            location: MACHINE_SPECS.location, plantId: plant.id, departmentId: dept?.id,
            parentId: mainAsset.id, categoryId: category!.id, specification: '{}', createdById: adminUser!.id,
          },
        });
      }
      assetMap[subsystem.tag] = ssAsset;
      logStep('✅', `${subsystem.tag}: ${subsystem.name}`);

      let childCount = 0;
      if (subsystem.children) {
        for (const child of subsystem.children) {
          let childAsset = await db.asset.findUnique({ where: { assetTag: child.tag } });
          if (!childAsset) {
            childAsset = await db.asset.create({
              data: {
                name: child.name, assetTag: child.tag, description: child.description,
                condition: 'good', status: 'operational', criticality: child.criticality,
                location: MACHINE_SPECS.location, plantId: plant.id, departmentId: dept?.id,
                parentId: ssAsset.id, categoryId: category!.id, specification: '{}', createdById: adminUser!.id,
              },
            });
          }
          assetMap[child.tag] = childAsset;
          childCount++;
        }
      }
      logStep('  └─', `${childCount} components`);
      totalComponents += childCount;
    }
    logStep('✅', `Total: ${SUBSYSTEMS.length} sub-systems, ${totalComponents} components`);
  } catch (e) {
    logErr('Failed to create asset hierarchy', e);
    errors++;
  }

  // ── Step 4: Bill of Materials ──
  console.log('\n📋 [4/11] Creating Bill of Materials...');
  let bomCount = 0;
  try {
    for (const subsystem of SUBSYSTEMS) {
      const ssAsset = assetMap[subsystem.tag];
      if (!ssAsset) continue;

      // Parent → Sub-system BOM
      const existingBom = await db.billOfMaterial.findFirst({ where: { parentId: mainAsset.id, childAssetId: ssAsset.id } });
      if (!existingBom) {
        await db.billOfMaterial.create({ data: { parentId: mainAsset.id, childAssetId: ssAsset.id, partNumber: subsystem.tag, quantity: 1, unit: 'set', specification: subsystem.description, status: 'active', revision: 'A' } });
        bomCount++;
      }

      // Sub-system → Component BOMs
      if (subsystem.children) {
        for (const child of subsystem.children) {
          const childAsset = assetMap[child.tag];
          if (!childAsset) continue;
          const existingBom2 = await db.billOfMaterial.findFirst({ where: { parentId: ssAsset.id, childAssetId: childAsset.id } });
          if (!existingBom2) {
            await db.billOfMaterial.create({ data: { parentId: ssAsset.id, childAssetId: childAsset.id, partNumber: child.tag, quantity: 1, unit: 'each', specification: child.description, status: 'active', revision: 'A' } });
            bomCount++;
          }
        }
      }
    }
    logStep('✅', `Created ${bomCount} BOM entries`);
  } catch (e) {
    logErr('Failed to create BOM entries', e);
    errors++;
  }

  // ── Step 5: Component Registry ──
  console.log('\n🔬 [5/11] Creating Component Registry...');
  const componentRegistryMap: Record<string, any> = {};
  let regCount = 0;
  try {
    for (const subsystem of SUBSYSTEMS) {
      for (const child of subsystem.children || []) {
        const asset = assetMap[child.tag];
        if (!asset) continue;
        const compCode = child.tag.replace(/[^A-Z0-9]/gi, '_').toUpperCase();
        const existingReg = await db.componentRegistry.findFirst({ where: { componentCode: compCode } });
        if (!existingReg) {
          const reg = await db.componentRegistry.create({
            data: {
              componentCode: compCode, name: child.name, description: child.description,
              componentType: 'component', criticality: child.criticality, lifecycleStatus: 'operational',
              installedDate: new Date(MACHINE_SPECS.purchaseDate),
              expectedLifeHours: child.criticality === 'critical' ? 40000 : child.criticality === 'high' ? 30000 : 50000,
              operatingHours: 5000 + Math.floor(Math.random() * 15000),
              healthScore: 80 + Math.floor(Math.random() * 20),
              assetId: mainAsset.id, sortOrder: regCount,
            },
          });
          componentRegistryMap[child.tag] = reg;
          regCount++;
        } else {
          componentRegistryMap[child.tag] = existingReg;
        }
      }
    }
    logStep('✅', `Created ${regCount} component registry entries`);
  } catch (e) {
    logErr('Failed to create component registry', e);
    errors++;
  }

  // ── Step 6: PM Templates & Tasks ──
  console.log('\n📅 [6/11] Creating PM Templates & Tasks...');
  const pmTemplateMap: Record<string, any> = {};
  let tmplCount = 0;
  try {
    for (const tmpl of PM_TEMPLATES) {
      const slug = makeSlug(tmpl.title);
      let pmTemplate = await db.pmTemplate.findFirst({ where: { title: tmpl.title } });
      if (!pmTemplate) {
        pmTemplate = await db.pmTemplate.create({
          data: {
            title: tmpl.title,
            description: `Preventive/predictive maintenance template for ${MACHINE_SPECS.name} — ${tmpl.category}`,
            type: tmpl.type, category: tmpl.category, estimatedDuration: tmpl.estimatedDuration,
            priority: tmpl.priority,
            requiredSkills: tmpl.requiredSkills ? JSON.stringify(tmpl.requiredSkills) : undefined,
            requiredTools: tmpl.category === 'mechanical' ? JSON.stringify(['Torque wrench', 'Vibration analyzer', 'Multimeter', 'Grease gun', 'Allen key set', 'Feeler gauge']) : undefined,
            createdById: adminUser!.id,
          },
        });
        // Create tasks
        for (let i = 0; i < tmpl.tasks.length; i++) {
          const task = tmpl.tasks[i];
          await db.pmTemplateTask.create({
            data: {
              templateId: pmTemplate.id, taskNumber: i + 1, description: task.description,
              taskType: task.taskType,
              requiredParts: 'requiredParts' in task && task.requiredParts ? JSON.stringify(task.requiredParts) : undefined,
              estimatedMinutes: task.estimatedMinutes, sortOrder: i + 1, isActive: true,
            },
          });
        }
      }
      pmTemplateMap[slug] = pmTemplate;
      tmplCount++;
      logStep('✅', `${tmpl.title.slice(0, 50)}... (${tmpl.tasks.length} tasks)`);
    }
    logStep('✅', `Created ${tmplCount} PM templates with tasks`);
  } catch (e) {
    logErr('Failed to create PM templates', e);
    errors++;
  }

  // ── Step 7: PM Schedules ──
  console.log('\n📆 [7/11] Creating PM Schedules...');
  let schedCount = 0;
  try {
    const freqMap: Record<string, { freqType: string; freqValue: number }> = {
      'inspection': { freqType: 'daily', freqValue: 1 },
    };
    for (const tmpl of PM_TEMPLATES) {
      if (tmpl.title.includes('Weekly')) freqMap[tmpl.title] = { freqType: 'weekly', freqValue: 1 };
      else if (tmpl.title.includes('Monthly')) freqMap[tmpl.title] = { freqType: 'monthly', freqValue: 1 };
      else if (tmpl.title.includes('Quarterly')) freqMap[tmpl.title] = { freqType: 'quarterly', freqValue: 1 };
      else if (tmpl.title.includes('Annual')) freqMap[tmpl.title] = { freqType: 'annual', freqValue: 1 };
      else if (tmpl.title.includes('Predictive')) freqMap[tmpl.title] = { freqType: 'monthly', freqValue: 3 };

      const freq = freqMap[tmpl.title] || { freqType: 'monthly', freqValue: 1 };
      const now = new Date();
      const nextDue = new Date(now);
      switch (freq.freqType) {
        case 'daily': nextDue.setDate(nextDue.getDate() + 1); break;
        case 'weekly': nextDue.setDate(nextDue.getDate() + 7); break;
        case 'monthly': nextDue.setDate(nextDue.getDate() + 30); break;
        case 'quarterly': nextDue.setDate(nextDue.getDate() + 90); break;
        case 'annual': nextDue.setDate(nextDue.getDate() + 365); break;
      }

      const slug = makeSlug(tmpl.title);
      const pmTemplate = pmTemplateMap[slug];
      const existingSched = await db.pmSchedule.findFirst({ where: { title: tmpl.title, assetId: mainAsset.id } });
      if (!existingSched && pmTemplate) {
        await db.pmSchedule.create({
          data: {
            title: tmpl.title, description: tmpl.title, assetId: mainAsset.id,
            frequencyType: freq.freqType, frequencyValue: freq.freqValue,
            lastCompletedDate: new Date(now.getTime() - 7 * 86400000), nextDueDate: nextDue,
            estimatedDuration: tmpl.estimatedDuration, priority: tmpl.priority,
            assignedToId: adminUser!.id, departmentId: dept?.id, isActive: true,
            autoGenerateWO: tmpl.type !== 'predictive', leadDays: tmpl.type === 'predictive' ? 7 : 3,
            templateId: pmTemplate.id, createdById: adminUser!.id,
          },
        });
        schedCount++;
        logStep('✅', `${freq.freqType}: ${tmpl.title.slice(0, 45)}...`);
      } else {
        logStep('⏭️', `${freq.freqType}: ${tmpl.title.slice(0, 45)}... — exists`);
      }
    }
    logStep('✅', `Created ${schedCount} PM schedules`);
  } catch (e) {
    logErr('Failed to create PM schedules', e);
    errors++;
  }

  // ── Step 8: Inventory Items ──
  console.log('\n🔧 [8/11] Creating inventory items...');
  let invCount = 0;
  try {
    for (const item of INVENTORY_ITEMS) {
      const existing = await db.inventoryItem.findUnique({ where: { itemCode: item.code } });
      if (!existing) {
        await db.inventoryItem.create({
          data: {
            itemCode: item.code, name: item.name,
            description: `Spare part for ${MACHINE_SPECS.name} (${MACHINE_SPECS.tag})`,
            category: item.category, unitOfMeasure: item.unit,
            currentStock: item.minStock + Math.floor(Math.random() * (item.maxStock - item.minStock)),
            minStockLevel: item.minStock, maxStockLevel: item.maxStock,
            unitCost: item.unitCost, supplier: item.supplier, location: item.location,
            plantId: plant.id, specification: item.specification, imageUrls: '[]', createdById: adminUser!.id, isActive: true,
          },
        });
        invCount++;
      } else {
        logStep('  ⏭️', `${item.name} — exists`);
      }
    }
    logStep('✅', `Created ${invCount} inventory items`);
  } catch (e) {
    logErr('Failed to create inventory items', e);
    errors++;
  }

  // ── Step 9: Digital Twin ──
  console.log('\n🌐 [9/11] Creating Digital Twin...');
  try {
    const existingTwin = await db.digitalTwin.findFirst({ where: { assetId: mainAsset.id } });
    if (!existingTwin) {
      await db.digitalTwin.create({
        data: {
          assetId: mainAsset.id,
          name: 'RSPM-001 Digital Twin',
          description: 'Real-time digital twin of Rotary Screen Printing Machine RSPM-001 at Ghana Tema Factory.',
          type: 'other',
          parameters: JSON.stringify({
            machineSpeed: { unit: 'm/min', min: 0, max: 80, normal: 40, alarmHigh: 75 },
            blanketTension: { unit: 'N', min: 0, max: 100, normal: 50, alarmHigh: 80 },
            fabricTensionInfeed: { unit: 'N', min: 0, max: 100, normal: 40, alarmHigh: 70 },
            fabricTensionOutfeed: { unit: 'N', min: 0, max: 100, normal: 40, alarmHigh: 70 },
            dryingTemp1: { unit: '°C', min: 0, max: 200, normal: 130, alarmHigh: 175 },
            dryingTemp2: { unit: '°C', min: 0, max: 200, normal: 150, alarmHigh: 180 },
            dryingTemp3: { unit: '°C', min: 0, max: 200, normal: 165, alarmHigh: 185 },
            mainMotorCurrent: { unit: 'A', min: 0, max: 80, normal: 45, alarmHigh: 70 },
            mainMotorTemp: { unit: '°C', min: 0, max: 120, normal: 55, alarmHigh: 85 },
            mainMotorVibration: { unit: 'mm/s', min: 0, max: 20, normal: 2.5, alarmHigh: 7.1 },
            gearReducerVibration: { unit: 'mm/s', min: 0, max: 20, normal: 3.0, alarmHigh: 7.1 },
            gearReducerOilTemp: { unit: '°C', min: 0, max: 100, normal: 55, alarmHigh: 80 },
            airSupplyPressure: { unit: 'bar', min: 0, max: 10, normal: 6, alarmLow: 4.5 },
            coolingWaterTemp: { unit: '°C', min: 0, max: 40, normal: 25, alarmHigh: 35 },
            coolingWaterFlow: { unit: 'L/min', min: 0, max: 50, normal: 30, alarmLow: 15 },
            pasteLevel: { unit: '%', min: 0, max: 100, normal: 70, alarmLow: 20, channels: 8 },
            registrationError: { unit: 'mm', min: 0, max: 2, normal: 0.05, alarmHigh: 0.3 },
          }),
          connections: JSON.stringify([
            { from: 'UF', to: 'PS', type: 'fabric_flow' }, { from: 'PS', to: 'DS', type: 'fabric_flow' },
            { from: 'DS', to: 'WU', type: 'fabric_flow' }, { from: 'DP', to: 'PS', type: 'power' },
            { from: 'DP', to: 'DS', type: 'power' }, { from: 'PA', to: 'PS', type: 'pneumatic' },
            { from: 'PA', to: 'DP', type: 'cooling' },
          ]),
          healthScore: 78, syncInterval: '5min', lastSynced: new Date(), isActive: true,
          createdById: adminUser!.id,
        },
      });
      logStep('✅', 'Digital Twin created');
    } else {
      logStep('⏭️', 'Digital Twin already exists');
    }
  } catch (e) {
    logErr('Failed to create Digital Twin', e);
    errors++;
  }

  // ── Step 10: System Diagram ──
  console.log('\n📊 [10/11] Creating System Diagram...');
  try {
    const diagName = 'Rotary Screen Printing Machine - Process Flow Diagram';
    const existingDiag = await db.systemDiagram.findFirst({ where: { name: diagName } });
    if (!existingDiag) {
      await db.systemDiagram.create({
        data: {
          plantId: plant.id, name: diagName,
          description: 'Complete process flow diagram of RSPM-001 showing fabric path, paste circulation, drying, and drive systems.',
          type: 'process',
          nodes: JSON.stringify([
            { id: 'unwind', type: 'assetNode', position: { x: 50, y: 300 }, data: { label: 'Unwind\nRoll', assetType: 'process', status: 'operational', criticality: 'high', health: 95, parameters: [], assetId: null } },
            { id: 'spreader', type: 'assetNode', position: { x: 150, y: 300 }, data: { label: 'Spreader\nRoller', assetType: 'equipment', status: 'operational', criticality: 'high', health: 90, parameters: [], assetId: null } },
            { id: 'eopc', type: 'instrumentNode', position: { x: 250, y: 300 }, data: { label: 'Edge Guide\n(EPC)', tag: 'EPC-001', measureType: 'Position', unit: 'mm', value: 0, status: 'normal' } },
            { id: 'blanket', type: 'assetNode', position: { x: 800, y: 300 }, data: { label: 'Printing\nBlanket', assetType: 'equipment', status: 'operational', criticality: 'critical', health: 88, parameters: [{ name: 'Speed', value: '45', unit: 'm/min' }, { name: 'Tension', value: '320', unit: 'N' }], assetId: null } },
            { id: 'cooling_node', type: 'assetNode', position: { x: 1450, y: 300 }, data: { label: 'Cooling\nCylinder', assetType: 'equipment', status: 'operational', criticality: 'high', health: 92, parameters: [{ name: 'Temp', value: '28', unit: '°C' }], assetId: null } },
            { id: 'windup', type: 'assetNode', position: { x: 1600, y: 300 }, data: { label: 'Wind-Up\nRoll', assetType: 'process', status: 'operational', criticality: 'high', health: 94, parameters: [], assetId: null } },
            { id: 's1', type: 'assetNode', position: { x: 520, y: 220 }, data: { label: 'Color 1', assetType: 'process', status: 'operational', criticality: 'medium', health: 96, parameters: [{ name: 'Paste Level', value: '78', unit: '%' }], assetId: null } },
            { id: 's2', type: 'assetNode', position: { x: 620, y: 220 }, data: { label: 'Color 2', assetType: 'process', status: 'operational', criticality: 'medium', health: 91, parameters: [{ name: 'Paste Level', value: '65', unit: '%' }], assetId: null } },
            { id: 's3', type: 'assetNode', position: { x: 720, y: 220 }, data: { label: 'Color 3', assetType: 'process', status: 'operational', criticality: 'medium', health: 88, parameters: [{ name: 'Paste Level', value: '82', unit: '%' }], assetId: null } },
            { id: 's4', type: 'assetNode', position: { x: 820, y: 220 }, data: { label: 'Color 4', assetType: 'process', status: 'operational', criticality: 'medium', health: 93, parameters: [{ name: 'Paste Level', value: '71', unit: '%' }], assetId: null } },
            { id: 's5', type: 'assetNode', position: { x: 920, y: 220 }, data: { label: 'Color 5', assetType: 'process', status: 'operational', criticality: 'medium', health: 97, parameters: [{ name: 'Paste Level', value: '58', unit: '%' }], assetId: null } },
            { id: 's6', type: 'assetNode', position: { x: 1020, y: 220 }, data: { label: 'Color 6', assetType: 'process', status: 'operational', criticality: 'medium', health: 85, parameters: [{ name: 'Paste Level', value: '90', unit: '%' }], assetId: null } },
            { id: 's7', type: 'assetNode', position: { x: 1120, y: 220 }, data: { label: 'Color 7', assetType: 'process', status: 'operational', criticality: 'medium', health: 89, parameters: [{ name: 'Paste Level', value: '73', unit: '%' }], assetId: null } },
            { id: 's8', type: 'assetNode', position: { x: 1220, y: 220 }, data: { label: 'Color 8', assetType: 'process', status: 'operational', criticality: 'medium', health: 92, parameters: [{ name: 'Paste Level', value: '66', unit: '%' }], assetId: null } },
            { id: 'dry1', type: 'heatExchangerNode', position: { x: 1650, y: 200 }, data: { label: 'IR Dryer 1', exchangerType: 'IR', status: 'operational', inletTemp: 85, outletTemp: 120, efficiency: 94 } },
            { id: 'dry2', type: 'heatExchangerNode', position: { x: 1800, y: 200 }, data: { label: 'IR Dryer 2', exchangerType: 'IR', status: 'operational', inletTemp: 70, outletTemp: 105, efficiency: 91 } },
            { id: 'dry3', type: 'heatExchangerNode', position: { x: 1950, y: 200 }, data: { label: 'IR Dryer 3', exchangerType: 'IR', status: 'operational', inletTemp: 55, outletTemp: 88, efficiency: 89 } },
            { id: 'mainmotor', type: 'motorNode', position: { x: 600, y: 480 }, data: { label: 'Main Drive\nMotor 37kW', rpm: 1480, powerRating: 37, status: 'running', vibration: 2.1, temperature: 62, current: 68 } },
            { id: 'gearbox', type: 'assetNode', position: { x: 750, y: 480 }, data: { label: 'Gear\nReducer', assetType: 'equipment', status: 'operational', criticality: 'high', health: 87, parameters: [{ name: 'Ratio', value: '15.4', unit: ':1' }, { name: 'Oil Temp', value: '58', unit: '°C' }], assetId: null } },
            { id: 'plc', type: 'controlNode', position: { x: 900, y: 480 }, data: { label: 'PLC\nS7-1500', name: 'PLC-S7-1500', controllerType: 'PLC', ioCount: { in: 128, out: 64 }, scanRate: 10, status: 'running', program: 'RSPM_Control_v2.8' } },
            { id: 'mcc', type: 'electricalNode', position: { x: 1050, y: 480 }, data: { label: 'MCC\nPanel', name: 'MCC-001', equipType: 'mcc', voltage: 415, current: 240, power: 165, status: 'energized' } },
            { id: 'pastetank', type: 'tankNode', position: { x: 400, y: 120 }, data: { label: 'Paste\nTanks', fillLevel: 72, capacity: 5000, temperature: 25, levelStatus: 'normal', medium: 'Paste' } },
            { id: 'air_node', type: 'assetNode', position: { x: 1200, y: 480 }, data: { label: 'Compressed\nAir 6 bar', assetType: 'utility', status: 'operational', criticality: 'medium', health: 96, parameters: [{ name: 'Pressure', value: '6.2', unit: 'bar' }], assetId: null } },
            { id: 'water_node', type: 'assetNode', position: { x: 1350, y: 480 }, data: { label: 'Water\nCooling', assetType: 'utility', status: 'operational', criticality: 'medium', health: 93, parameters: [{ name: 'Flow', value: '12.5', unit: 'm³/h' }, { name: 'Temp', value: '22', unit: '°C' }], assetId: null } },
          ]),
          edges: JSON.stringify([
            { id: 'e1', source: 'unwind', target: 'spreader', type: 'processFlowEdge', label: 'Fabric', data: { flowStatus: 'normal' } },
            { id: 'e2', source: 'spreader', target: 'eopc', type: 'processFlowEdge', data: { flowStatus: 'normal' } },
            { id: 'e3', source: 'eopc', target: 's1', type: 'processFlowEdge', data: { flowStatus: 'normal' } },
            { id: 'e4', source: 's1', target: 's2', type: 'processFlowEdge', data: { flowStatus: 'normal' } },
            { id: 'e5', source: 's2', target: 's3', type: 'processFlowEdge', data: { flowStatus: 'normal' } },
            { id: 'e6', source: 's3', target: 's4', type: 'processFlowEdge', data: { flowStatus: 'normal' } },
            { id: 'e7', source: 's4', target: 's5', type: 'processFlowEdge', data: { flowStatus: 'normal' } },
            { id: 'e8', source: 's5', target: 's6', type: 'processFlowEdge', data: { flowStatus: 'normal' } },
            { id: 'e9', source: 's6', target: 's7', type: 'processFlowEdge', data: { flowStatus: 'normal' } },
            { id: 'e10', source: 's7', target: 's8', type: 'processFlowEdge', data: { flowStatus: 'normal' } },
            { id: 'e11', source: 's8', target: 'cooling_node', type: 'processFlowEdge', label: 'Printed fabric', data: { flowStatus: 'normal' } },
            { id: 'e12', source: 'cooling_node', target: 'dry1', type: 'processFlowEdge', data: { flowStatus: 'normal' } },
            { id: 'e13', source: 'dry1', target: 'dry2', type: 'processFlowEdge', data: { flowStatus: 'normal' } },
            { id: 'e14', source: 'dry2', target: 'dry3', type: 'processFlowEdge', data: { flowStatus: 'normal' } },
            { id: 'e15', source: 'dry3', target: 'windup', type: 'processFlowEdge', label: 'Dried fabric', data: { flowStatus: 'normal' } },
            { id: 'e16', source: 'pastetank', target: 's1', type: 'processFlowEdge', label: 'Paste', data: { flowStatus: 'normal' } },
            { id: 'e17', source: 'pastetank', target: 's4', type: 'processFlowEdge', data: { flowStatus: 'normal' } },
            { id: 'e18', source: 'pastetank', target: 's8', type: 'processFlowEdge', data: { flowStatus: 'normal' } },
            { id: 'e19', source: 'mainmotor', target: 'gearbox', type: 'processFlowEdge', label: 'Drive', data: { flowStatus: 'normal' } },
            { id: 'e20', source: 'gearbox', target: 'blanket', type: 'signalEdge', label: 'Line shaft' },
            { id: 'e21', source: 'plc', target: 'mcc', type: 'signalEdge', label: 'Control' },
            { id: 'e22', source: 'plc', target: 'blanket', type: 'signalEdge', label: 'PROFINET' },
            { id: 'e23', source: 'mcc', target: 'mainmotor', type: 'pipeEdge', label: 'Power', data: { flowStatus: 'normal' } },
            { id: 'e24', source: 'air_node', target: 'blanket', type: 'pipeEdge', label: 'Air', data: { flowStatus: 'normal' } },
            { id: 'e25', source: 'water_node', target: 'gearbox', type: 'pipeEdge', label: 'Water', data: { flowStatus: 'normal' } },
          ]),
          viewport: JSON.stringify({ x: 0, y: 0, zoom: 0.7 }),
          version: 1, isTemplate: false, isActive: true, createdById: adminUser!.id,
        },
      });
      logStep('✅', 'System Diagram created');
    } else {
      logStep('⏭️', 'System Diagram already exists');
    }
  } catch (e) {
    logErr('Failed to create System Diagram', e);
    errors++;
  }

  // ── Step 11: Work Instructions ──
  console.log('\n📖 [11/11] Creating Work Instructions...');
  const workInstructions = [
    {
      title: 'Blanket Inspection & Replacement Procedure',
      description: 'Procedure for inspecting and replacing the endless printing blanket on the rotary screen printer. Covers routine inspection checks and full blanket replacement.',
      maintenanceType: 'preventive', difficulty: 'advanced', safetyLevel: 'high', requiresLockout: true, requiresPermit: true,
      componentTag: 'RSPM-001-PS-BL',
      steps: [
        { stepNumber: 1, instruction: 'Raise ALL print stations using the GROUP LIFT function on HMI', safetyNote: 'Lock out main drive before accessing blanket area' },
        { stepNumber: 2, instruction: 'Visually inspect blanket surface for cuts, gouges, foreign objects, and paste buildup' },
        { stepNumber: 3, instruction: 'Measure blanket thickness at 5 evenly spaced points across the width (use digital micrometer)', safetyNote: 'Keep hands clear of blanket nip points' },
        { stepNumber: 4, instruction: 'Check blanket tracking - verify tracking rollers are centered and tracking belt tension is correct' },
        { stepNumber: 5, instruction: 'If thickness is below 2.5mm or cuts >10mm found, proceed to replacement' },
        { stepNumber: 6, instruction: 'Release blanket tension on the tensioning roller' },
        { stepNumber: 7, instruction: 'Remove blanket tracking rollers at both ends' },
        { stepNumber: 8, instruction: 'Carefully slide the old blanket off the rollers — requires 2 technicians' },
        { stepNumber: 9, instruction: 'Clean all blanket tracking rollers and idler rollers with approved solvent' },
        { stepNumber: 10, instruction: 'Inspect all rollers for bearing wear, flat spots, or damage' },
        { stepNumber: 11, instruction: 'Install new blanket — ensure correct direction of travel (arrow marked on blanket)', safetyNote: 'Use blanket handling bars to prevent back injury' },
        { stepNumber: 12, instruction: 'Apply even tension on the tensioning roller (manufacturer spec: 2kN)' },
        { stepNumber: 13, instruction: 'Reinstall blanket tracking rollers and run AUTO-SET procedure from HMI' },
        { stepNumber: 14, instruction: 'Run blanket at minimum speed for 15 minutes to seat the blanket' },
        { stepNumber: 15, instruction: 'Lower all print stations and verify proper contact across full width' },
      ],
      requiredTools: [{ name: 'Blanket handling bars (×2)', required: true }, { name: 'Torque wrench 30-100Nm', required: true }, { name: 'Digital micrometer', required: true }, { name: 'Spirit level', required: true }, { name: 'Straight edge 2000mm', required: true }, { name: 'Allen key set (metric)', required: true }],
      requiredParts: [{ name: 'Endless Printing Blanket 1850mm', quantity: 1 }, { name: 'Blanket tracking roller bearings', quantity: 4 }],
    },
    {
      title: 'Screen Change & Registration Adjustment',
      description: 'Step-by-step procedure for changing a rotary screen and adjusting registration at any print station.',
      maintenanceType: 'preventive', difficulty: 'intermediate', safetyLevel: 'medium', requiresLockout: false, requiresPermit: false,
      componentTag: 'RSPM-001-PS-SD',
      steps: [
        { stepNumber: 1, instruction: 'Press the STATION LIFT button on the HMI for the station requiring screen change', safetyNote: 'Ensure machine speed is at ZERO before lifting station' },
        { stepNumber: 2, instruction: 'Wait for the pneumatic cylinder to fully raise the screen head (confirm green indicator)', safetyNote: 'Do not reach under the raised station head' },
        { stepNumber: 3, instruction: 'Loosen the screen clamping rings at both ends using the special spanner', safetyNote: 'Use cut-resistant gloves — screen edges are sharp' },
        { stepNumber: 4, instruction: 'Slide out the old screen carefully, place on the screen storage rack' },
        { stepNumber: 5, instruction: 'Clean the paste trough and magnetic rod with damp cloth' },
        { stepNumber: 6, instruction: 'Insert the new screen — ensure the arrow on the screen end ring points in the fabric travel direction' },
        { stepNumber: 7, instruction: 'Tighten clamping rings evenly (torque 15Nm ± 2Nm)' },
        { stepNumber: 8, instruction: 'Lower the station head using HMI STATION DOWN button' },
        { stepNumber: 9, instruction: 'Run REGISTRATION AUTO-SET sequence from HMI — wait for camera scan to complete' },
        { stepNumber: 10, instruction: 'Verify registration accuracy on the HMI registration page — should be <0.2mm' },
        { stepNumber: 11, instruction: 'If registration error >0.2mm, perform manual fine adjustment using HMI jog controls' },
        { stepNumber: 12, instruction: 'Start paste circulation pump and verify flow — check for leaks at all connections', safetyNote: 'Check for paste leaks at all connections' },
      ],
      requiredTools: [{ name: 'Screen clamping spanner', required: true }, { name: 'Allen key set (metric)', required: true }, { name: 'Cut-resistant gloves', required: true }, { name: 'Cleaning cloth', required: true }],
      requiredParts: [{ name: 'Rotary Screen (Nickel) 254mm', quantity: 1 }, { name: 'Peristaltic Pump Tube (Viton)', quantity: 1 }],
    },
    {
      title: 'Emergency Troubleshooting Guide',
      description: 'Comprehensive troubleshooting guide for common emergency situations on the rotary screen printer. Covers E-stop recovery, paste spills, fire, and power failure.',
      maintenanceType: 'corrective', difficulty: 'basic', safetyLevel: 'critical', requiresLockout: false, requiresPermit: true,
      componentTag: 'RSPM-001-PA-SI',
      steps: [
        { stepNumber: 1, instruction: 'EMERGENCY STOP: Identify which E-stop was activated from the HMI alarm page', safetyNote: 'Do NOT reset E-stop until the root cause is identified' },
        { stepNumber: 2, instruction: 'Inspect the machine area for the cause — check for personnel safety, mechanical jam, or electrical fault', safetyNote: 'Wear all required PPE: safety glasses, steel-toe boots, hearing protection' },
        { stepNumber: 3, instruction: 'Resolve or remove the cause of the emergency stop' },
        { stepNumber: 4, instruction: 'PASTE SPILL: If paste has spilled on the blanket, immediately stop paste pumps and clean with approved solvent', safetyNote: 'Use chemical-resistant gloves when handling print paste' },
        { stepNumber: 5, instruction: 'Clear all alarms from the HMI alarm page' },
        { stepNumber: 6, instruction: 'Pull out and twist to release the E-stop button(s)' },
        { stepNumber: 7, instruction: 'Press the RESET button on the main control panel', safetyNote: 'Machine will not restart until all safety interlocks are satisfied' },
        { stepNumber: 8, instruction: 'Verify all safety guards are closed and interlock indicators are green' },
        { stepNumber: 9, instruction: 'Set machine speed to MINIMUM (10 m/min) and press START' },
        { stepNumber: 10, instruction: 'Slowly ramp speed to production setting while monitoring all station parameters' },
        { stepNumber: 11, instruction: 'POWER FAILURE: If power was lost, verify UPS has battery before attempting restart', safetyNote: 'Wait for UPS to stabilize before restarting main drives' },
        { stepNumber: 12, instruction: 'Document the incident in the shift handover log and notify the maintenance supervisor' },
      ],
      requiredTools: [{ name: 'Multimeter (for electrical checks)', required: false }, { name: 'Approved solvent for paste cleanup', required: true }, { name: 'Chemical-resistant gloves', required: true }],
      requiredParts: [],
    },
  ];

  let wiCount = 0;
  try {
    for (const wi of workInstructions) {
      const existingWI = await db.workInstruction.findFirst({ where: { title: wi.title } });
      if (existingWI) {
        logStep('  ⏭️', `${wi.title.slice(0, 50)}... — exists`);
        wiCount++;
        continue;
      }
      const compReg = componentRegistryMap[wi.componentTag] || componentRegistryMap[Object.keys(componentRegistryMap)[0]];
      if (!compReg) { logStep('  ⚠️', `No component found for ${wi.title} — skipped`); continue; }

      await db.workInstruction.create({
        data: {
          title: wi.title, description: wi.description, componentId: compReg.id,
          assetId: mainAsset.id, maintenanceType: wi.maintenanceType,
          difficulty: wi.difficulty, safetyLevel: wi.safetyLevel,
          requiresLockout: wi.requiresLockout || false, requiresPermit: wi.requiresPermit || false,
          steps: JSON.stringify(wi.steps), requiredTools: JSON.stringify(wi.requiredTools),
          requiredParts: JSON.stringify(wi.requiredParts),
          isActive: true, createdById: adminUser!.id,
        },
      });
      logStep('✅', `${wi.title}`);
      wiCount++;
    }
    logStep('✅', `Work Instructions: ${wiCount}`);
  } catch (e) {
    logErr('Failed to create Work Instructions', e);
    errors++;
  }

  // ── Failure Records ──
  console.log('\n⚠️  Creating sample failure records...');
  const sampleFailures = [
    {
      componentTag: 'RSPM-001-PS-SQ', failureMode: 'wear', severity: 'medium',
      cause: 'Magnetic squeegee rod worn after 8000 operating hours. Print quality degradation noticed as uneven paste deposit.',
      symptoms: JSON.stringify(['Uneven print deposit', 'Streaky prints on Color 3', 'Paste leakage at squeegee contact point']),
      downtime: 120, cost: 340, rootCause: 'Normal wear - squeegee rod replacement interval exceeded',
      correctiveAction: 'Replaced magnetic squeegee rod with new 15mm rod. Updated replacement interval to 6000 hours.',
      detectedAt: new Date('2025-01-15'), resolvedAt: new Date('2025-01-15'),
    },
    {
      componentTag: 'RSPM-001-DS-DC1', failureMode: 'electrical', severity: 'high',
      cause: 'IR emitter element failure in Drying Chamber 1 position 7. Open circuit detected by thermocouple.',
      symptoms: JSON.stringify(['Uneven drying on fabric left side', 'Moisture sensor alarm at dryer exit', 'Dryer 1 temperature below setpoint']),
      downtime: 180, cost: 520, rootCause: 'Thermal cycling fatigue - emitter reached end of life (12000 hours)',
      correctiveAction: 'Replaced IR emitter element 2.4kW. Recommended quarterly IR inspection.',
      detectedAt: new Date('2025-02-08'), resolvedAt: new Date('2025-02-08'),
    },
    {
      componentTag: 'RSPM-001-UF-EG', failureMode: 'mechanical', severity: 'medium',
      cause: 'Edge guide ultrasonic sensor contaminated with paste residue. Fabric tracking off by 3mm.',
      symptoms: JSON.stringify(['Fabric running off-center', 'Selvedge pattern misalignment', 'Edge guide indicator flashing amber']),
      downtime: 60, cost: 85, rootCause: 'Lack of regular sensor cleaning in weekly maintenance',
      correctiveAction: 'Cleaned ultrasonic sensor with IPA solvent. Added sensor cleaning to daily operator checklist.',
      detectedAt: new Date('2025-03-02'), resolvedAt: new Date('2025-03-02'),
    },
    {
      componentTag: 'RSPM-001-DP-GR', failureMode: 'mechanical', severity: 'high',
      cause: 'Main gear reducer running hot (82°C). Oil analysis showed elevated iron particles (150 ppm vs normal <50 ppm).',
      symptoms: JSON.stringify(['Unusual noise from gear reducer', 'Gear reducer surface temperature 82°C', 'Elevated vibration readings 5.2mm/s']),
      downtime: 480, cost: 2800, rootCause: 'Input shaft bearing degradation due to alignment drift',
      correctiveAction: 'Replaced input shaft bearing (SKF 22316 EK), changed oil, realigned motor coupling.',
      detectedAt: new Date('2025-03-20'), resolvedAt: new Date('2025-03-22'),
    },
    {
      componentTag: 'RSPM-001-PS-PC', failureMode: 'wear', severity: 'medium',
      cause: 'Peristaltic pump tube burst on Color 5 station, causing paste spillage on blanket.',
      symptoms: JSON.stringify(['Paste leakage at Color 5', 'Low paste level alarm', 'Paste on blanket surface']),
      downtime: 90, cost: 150, rootCause: 'Pump tube exceeded recommended replacement interval of 3 months (was 4.5 months old)',
      correctiveAction: 'Replaced all 8 peristaltic pump tubes. Updated tube replacement to strict 3-month PM schedule.',
      detectedAt: new Date('2025-04-10'), resolvedAt: new Date('2025-04-10'),
    },
  ];

  let failCount = 0;
  try {
    for (const fail of sampleFailures) {
      const comp = componentRegistryMap[fail.componentTag];
      if (!comp) continue;
      await db.failureRecord.create({
        data: {
          componentId: comp.id, assetId: mainAsset.id, failureMode: fail.failureMode,
          failureCause: fail.cause, failureSeverity: fail.severity, symptoms: fail.symptoms,
          detectedAt: fail.detectedAt, resolvedAt: fail.resolvedAt, downtimeMinutes: fail.downtime,
          repairCost: fail.cost, rootCause: fail.rootCause, correctiveAction: fail.correctiveAction,
          reportedById: adminUser!.id,
        },
      });
      failCount++;
    }
    logStep('✅', `${failCount} sample failure records created`);
  } catch (e) {
    logErr('Failed to create failure records', e);
    errors++;
  }

  // ── Final Summary ──
  console.log('\n════════════════════════════════════════════════════');
  if (errors === 0) {
    console.log('  ✅ SEED COMPLETE — ALL OPERATIONS SUCCEEDED');
  } else {
    console.log(`  ⚠️  SEED COMPLETE — ${errors} sections had errors (see above)`);
  }
  console.log('════════════════════════════════════════════════════');
  console.log(`  📦 Main Asset:        ${MACHINE_SPECS.tag}`);
  console.log(`  📐 Sub-systems:       ${SUBSYSTEMS.length}`);
  console.log(`  🔩 Components:        ${totalComponents}`);
  console.log(`  🔬 BOM Entries:        ${bomCount}`);
  console.log(`  🔬 Component Registry: ${regCount}`);
  console.log(`  📅 PM Templates:      ${tmplCount}`);
  console.log(`  📅 PM Schedules:      ${schedCount}`);
  console.log(`  🔧 Inventory Items:   ${invCount}`);
  console.log(`  🌐 Digital Twin:      1`);
  console.log(`  📊 System Diagram:    1`);
  console.log(`  📖 Work Instructions: ${wiCount}`);
  console.log(`  ⚠️  Failure Records:   ${failCount}`);
  console.log(`  👤 Users:             2 key + 19 demo`);
  console.log('════════════════════════════════════════════════════\n');
}

// ══════════════════════════════════════════════════════════════
// RUN
// ══════════════════════════════════════════════════════════════

seedAll()
  .catch((e) => {
    console.error('\n❌ FATAL: Seed script failed!');
    console.error('   Error:', (e as Error).message);
    if (process.env.DEBUG) console.error((e as Error).stack);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
