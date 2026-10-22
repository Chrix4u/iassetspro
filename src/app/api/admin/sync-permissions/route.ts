import { db } from '@/lib/db';
import { getSession, isAdmin, sessionCache } from '@/lib/auth';
import { NextResponse } from 'next/server';

// ══════════════════════════════════════════════════════════════════════════
// PERMISSION DEFINITIONS — Must match prisma/seed.ts & seed-permissions-only.ts
// ══════════════════════════════════════════════════════════════════════════

const MODULE_PERMISSIONS: Record<string, string[]> = {
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
  time_logs: ['view', 'view_team', 'create', 'update', 'delete'],
  repair_material_requests: ['view', 'view_all', 'view_own', 'create', 'update'],
  repair_tool_requests: ['view', 'view_all', 'view_own', 'create', 'update'],
  repair_tool_transfers: ['view', 'view_all', 'view_own', 'create', 'update'],
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
  material_requisitions: ['view', 'create', 'approve', 'issue', 'reject'],
  vendors: ['view', 'create', 'update', 'delete', 'manage'],
  stock_transactions: ['view'],
  purchase_orders: ['view', 'create', 'update', 'approve', 'receive', 'manage'],
  inventory_locations: ['view', 'create', 'update', 'delete'],
  inventory_adjustments: ['view', 'create', 'approve'],
  inventory_transfers: ['view', 'create', 'approve'],
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
  production_batches: ['view', 'create', 'update'],
  iot: ['view'],
  analytics: ['view'],
  operations: ['view'],
  quality: ['view'],
  safety: ['view'],
  safety_incidents: ['view', 'create', 'update', 'manage'],
  safety_inspections: ['view', 'create', 'update', 'manage'],
  safety_equipment: ['view', 'create', 'update', 'delete'],
  safety_permits: ['view', 'create', 'approve', 'close'],
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

// Helper: format module name for display
function fmtMod(mod: string): string {
  return mod.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}
function fmtAction(action: string): string {
  return action.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

// ══════════════════════════════════════════════════════════════════════════
// Role → Permission Matrix (must match prisma/seed.ts)
// ══════════════════════════════════════════════════════════════════════════

const ROLE_PERMISSIONS: Record<string, string[]> = {
  // ── 1. ADMIN: all permissions (handled programmatically — skip) ──
  admin: [],

  // ── 2. PLANT MANAGER: broad view + limited create/update ──
  plant_manager: [
    'dashboard.view', 'dashboard.stats', 'chat.view',
    'documents.view', 'documents.upload', 'documents.download',
    'notifications.view', 'notifications.manage',
    'assets.view', 'assets.view_all', 'assets.health', 'assets.criticality',
    'equipment.view',
    'facilities.view',
    'departments.view', 'departments.create', 'departments.update',
    'plants.view', 'plants.create', 'plants.update',
    'company.view', 'company.update',
    'work_orders.view', 'work_orders.view_all',
    'work_orders.assign_supervisor', 'work_orders.assign_technician',
    'work_orders.complete', 'work_orders.verify', 'work_orders.reopen',
    'work_orders.close', 'work_orders.cancel',
    'work_orders.dashboard',
    'maintenance_requests.view', 'maintenance_requests.view_all',
    'maintenance_requests.approve', 'maintenance_requests.reject',
    'maintenance_requests.triage',
    'pm_schedules.view', 'pm_schedules.activate', 'pm_schedules.run',
    'pm_templates.view', 'pm_triggers.view',
    'calibration.view',
    'inventory.view', 'inventory.view_all',
    'parts.view',
    'vendors.view',
    'purchase_orders.view',
    'production.view',
    'production_surveys.view',
    'oee.view',
    'downtime.view',
    'quality_checks.view',
    'energy.view',
    'safety_incidents.view', 'safety_inspections.view', 'safety_equipment.view', 'safety_permits.view',
    'iot_devices.view',
    'digital_twin.view',
    'reports.view', 'reports.export', 'reports.generate', 'reports.create',
    'analytics.view', 'operations.view', 'quality.view', 'safety.view',
    'users.view', 'employees.view', 'shifts.view', 'training.view',
    'tools.view',
    'audit_logs.view',
    'pm_tasks.view',
  ],

  // ── 3. MAINTENANCE MANAGER: full WO, MR, PM, assets ──
  maintenance_manager: [
    'dashboard.view', 'dashboard.stats', 'chat.view',
    'documents.view', 'documents.upload', 'documents.download',
    'notifications.view', 'notifications.manage',
    'assets.view', 'assets.view_all', 'assets.create', 'assets.update', 'assets.delete',
    'assets.export', 'assets.manage',
    'equipment.view', 'equipment.create', 'equipment.update', 'equipment.delete',
    'facilities.view', 'facilities.create', 'facilities.update',
    'meters.view', 'meters.create', 'meters.update', 'meters.read',
    'work_orders.view', 'work_orders.view_all',
    'work_orders.create', 'work_orders.update', 'work_orders.delete',
    'work_orders.assign_supervisor', 'work_orders.assign_technician',
    'work_orders.start', 'work_orders.complete', 'work_orders.verify',
    'work_orders.reopen', 'work_orders.close', 'work_orders.cancel',
    'work_orders.adjust_cost', 'work_orders.dashboard', 'work_orders.bulk_update',
    'work_orders.failure_analysis',
    'maintenance_requests.view', 'maintenance_requests.view_all',
    'maintenance_requests.create', 'maintenance_requests.update', 'maintenance_requests.delete',
    'maintenance_requests.approve', 'maintenance_requests.reject',
    'maintenance_requests.triage', 'maintenance_requests.assign_planner',
    'maintenance_requests.convert_to_wo',
    'pm_schedules.view', 'pm_schedules.create', 'pm_schedules.update', 'pm_schedules.delete',
    'pm_schedules.activate', 'pm_schedules.run',
    'pm_templates.view', 'pm_templates.create', 'pm_templates.update', 'pm_templates.delete',
    'pm_triggers.view', 'pm_triggers.create', 'pm_triggers.update',
    'pm_checklists.view',
    'pm_notifications.view',
    'calibration.view', 'calibration.create', 'calibration.update', 'calibration.delete',
    'calibration.manage',
    'tools.view', 'tools.checkout', 'tools.return',
    'inventory.view', 'inventory.view_all',
    'parts.view',
    'time_logs.view', 'time_logs.create', 'time_logs.update',
    'sla.view', 'sla.manage',
    'rca.view', 'rca.create', 'rca.update',
    'failure_analysis.view', 'failure_analysis.create',
    'assistance_requests.view', 'assistance_requests.create',
    'repair_material_requests.view', 'repair_material_requests.view_all',
    'repair_tool_requests.view', 'repair_tool_requests.view_all',
    'repair_tool_transfers.view', 'repair_tool_transfers.view_all',
    'reports.view', 'reports.export', 'reports.generate', 'reports.create',
    'analytics.view', 'operations.view',
    'employees.view',
    'pm_tasks.view', 'pm_tasks.create', 'pm_tasks.update', 'pm_tasks.delete', 'pm_tasks.import',
  ],

  // ── 4. PRODUCTION MANAGER: full MPMP ──
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
    'production_batches.view', 'production_batches.create', 'production_batches.update',
    'maintenance_requests.view', 'maintenance_requests.view_all',
    'maintenance_requests.create',
    'work_orders.view', 'work_orders.view_all',
    'inventory.view', 'inventory.view_all',
    'employees.view', 'shifts.view', 'assignments.view',
    'reports.view', 'reports.export', 'reports.generate', 'reports.create',
    'analytics.view', 'operations.view',
  ],

  // ── 5. INVENTORY MANAGER: full IMS ──
  inventory_manager: [
    'dashboard.view', 'dashboard.stats', 'chat.view',
    'documents.view', 'documents.upload', 'documents.download',
    'notifications.view', 'notifications.manage',
    'inventory.view', 'inventory.view_all', 'inventory.create', 'inventory.update',
    'inventory.delete', 'inventory.stock_in', 'inventory.stock_out', 'inventory.reserve',
    'inventory.consume', 'inventory.export', 'inventory.manage', 'inventory.forecast',
    'parts.view', 'parts.create', 'parts.update', 'parts.delete',
    'categories.view', 'categories.create', 'categories.update',
    'material_requisitions.view', 'material_requisitions.create', 'material_requisitions.update',
    'vendors.view', 'vendors.create', 'vendors.update', 'vendors.delete', 'vendors.manage',
    'purchase_orders.view', 'purchase_orders.create', 'purchase_orders.update',
    'purchase_orders.approve', 'purchase_orders.receive', 'purchase_orders.manage',
    'stock_transactions.view', 'stock_transactions.create',
    'inventory_locations.view', 'inventory_locations.create', 'inventory_locations.update',
    'inventory_adjustments.view', 'inventory_adjustments.create',
    'inventory_transfers.view', 'inventory_transfers.create', 'inventory_transfers.update',
    'assets.view', 'assets.view_all',
    'work_orders.view', 'work_orders.view_all',
    'maintenance_requests.view', 'maintenance_requests.view_all',
    'reports.view', 'reports.export', 'reports.generate',
    'tools.view',
    'employees.view',
  ],

  // ── 6. MAINTENANCE PLANNER: RWOP + MRMP manage ──
  maintenance_planner: [
    'dashboard.view', 'dashboard.stats', 'chat.view',
    'documents.view', 'documents.upload', 'documents.download',
    'notifications.view', 'notifications.manage',
    'assets.view', 'assets.view_all', 'assets.create', 'assets.update',
    'assets.export',
    'equipment.view',
    'facilities.view', 'facilities.create', 'facilities.update',
    'meters.view', 'meters.create', 'meters.update', 'meters.read',
    'work_orders.view', 'work_orders.view_all',
    'work_orders.create', 'work_orders.update', 'work_orders.delete',
    'work_orders.assign_supervisor', 'work_orders.assign_technician',
    'work_orders.dashboard', 'work_orders.bulk_update',
    'work_orders.close', 'work_orders.cancel',
    'maintenance_requests.view', 'maintenance_requests.view_all',
    'maintenance_requests.update',
    'maintenance_requests.triage', 'maintenance_requests.assign_planner',
    'maintenance_requests.convert_to_wo',
    'maintenance_requests.my_queue', 'maintenance_requests.archive',
    'pm_schedules.view', 'pm_schedules.create', 'pm_schedules.update', 'pm_schedules.delete',
    'pm_schedules.activate', 'pm_schedules.run',
    'pm_templates.view', 'pm_templates.create', 'pm_templates.update', 'pm_templates.delete',
    'pm_triggers.view', 'pm_triggers.create', 'pm_triggers.update',
    'pm_checklists.view',
    'pm_notifications.view',
    'calibration.view', 'calibration.create', 'calibration.update', 'calibration.delete',
    'tools.view', 'tools.checkout', 'tools.return',
    'inventory.view', 'inventory.view_all',
    'parts.view',
    'time_logs.view', 'time_logs.create',
    'sla.view', 'sla.manage',
    'rca.view', 'rca.create', 'rca.update',
    'failure_analysis.view', 'failure_analysis.create',
    'assistance_requests.view', 'assistance_requests.create',
    'repair_material_requests.view', 'repair_material_requests.view_all',
    'repair_tool_requests.view', 'repair_tool_requests.view_all',
    'repair_tool_transfers.view', 'repair_tool_transfers.view_all',
    'reports.view', 'reports.export', 'reports.generate', 'reports.create',
    'analytics.view', 'operations.view',
    'employees.view',
    'pm_tasks.view', 'pm_tasks.create', 'pm_tasks.update', 'pm_tasks.delete', 'pm_tasks.import',
  ],

  // ── 7. MAINTENANCE SUPERVISOR: WO manage + execute, approve/reject ──
  maintenance_supervisor: [
    'dashboard.view', 'dashboard.stats', 'chat.view',
    'documents.view', 'documents.upload', 'documents.download',
    'notifications.view', 'notifications.manage',
    'assets.view', 'assets.view_all', 'assets.health', 'assets.criticality',
    'equipment.view',
    'work_orders.view', 'work_orders.view_all',
    'work_orders.create', 'work_orders.update',
    'work_orders.assign_technician',
    'work_orders.complete', 'work_orders.verify', 'work_orders.reopen',
    'work_orders.dashboard',
    'maintenance_requests.view', 'maintenance_requests.view_all',
    'maintenance_requests.approve', 'maintenance_requests.reject',
    'maintenance_requests.update',
    'pm_schedules.view', 'pm_schedules.run',
    'pm_checklists.view',
    'calibration.view',
    'tools.view', 'tools.checkout', 'tools.return',
    'inventory.view',
    'parts.view',
    'time_logs.view', 'time_logs.create', 'time_logs.update',
    'assistance_requests.view', 'assistance_requests.create',
    'repair_material_requests.view', 'repair_material_requests.view_all',
    'repair_tool_requests.view', 'repair_tool_requests.view_all',
    'repair_tool_transfers.view', 'repair_tool_transfers.view_all',
    'reports.view', 'reports.export', 'reports.generate',
    'analytics.view', 'operations.view',
    'employees.view', 'shifts.view',
    'downtime.view',
    'quality_checks.view',
  ],

  // ── 8. SAFETY OFFICER: full safety management ──
  safety_officer: [
    'dashboard.view', 'chat.view',
    'documents.view', 'documents.upload', 'documents.download',
    'notifications.view',
    'safety_incidents.view', 'safety_incidents.create', 'safety_incidents.update', 'safety_incidents.manage',
    'safety_inspections.view', 'safety_inspections.create', 'safety_inspections.update', 'safety_inspections.manage',
    'safety_equipment.view', 'safety_equipment.create', 'safety_equipment.update',
    'safety_permits.view', 'safety_permits.create', 'safety_permits.approve', 'safety_permits.close',
    'risk_assessment.view', 'risk_assessment.create', 'risk_assessment.update',
    'assets.view', 'assets.view_all',
    'equipment.view',
    'employees.view',
    'work_orders.view', 'work_orders.view_all',
    'maintenance_requests.view', 'maintenance_requests.view_all',
    'reports.view', 'reports.export',
  ],

  // ── 9. QUALITY MANAGER: full quality + calibration ──
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
    'meters.view',
    'work_orders.view', 'work_orders.view_all',
    'maintenance_requests.view', 'maintenance_requests.view_all',
    'reports.view', 'reports.export', 'reports.generate',
    'analytics.view', 'quality.view',
  ],

  // ── 10. HR MANAGER: full HRMS ──
  hr_manager: [
    'dashboard.view', 'dashboard.stats', 'chat.view',
    'documents.view', 'documents.upload', 'documents.download',
    'notifications.view', 'notifications.manage',
    'employees.view', 'employees.create', 'employees.update', 'employees.delete', 'employees.manage',
    'shifts.view', 'shifts.create', 'shifts.update', 'shifts.manage',
    'shift_handovers.view', 'shift_handovers.create', 'shift_handovers.update',
    'training.view', 'training.create', 'training.update', 'training.manage',
    'skills.view', 'skills.create', 'skills.update', 'skills.manage',
    'skill_categories.view', 'skill_categories.create', 'skill_categories.update',
    'technician_groups.view', 'technician_groups.create', 'technician_groups.update',
    'assignments.view',
    'departments.view',
    'plants.view',
    'operations.view',
    'system_settings.view',
    'time_logs.view', 'time_logs.manage',
  ],

  // ── 11. IOT ENGINEER: full IoT + predictive ──
  iot_engineer: [
    'dashboard.view', 'chat.view',
    'documents.view', 'documents.download',
    'notifications.view',
    'iot_devices.view', 'iot_devices.create', 'iot_devices.update', 'iot_devices.delete',
    'iot_rules.view', 'iot_rules.create', 'iot_rules.update', 'iot_rules.delete',
    'iot.view',
    'predictive.view', 'predictive.analyze',
    'condition_monitoring.view', 'condition_monitoring.manage',
    'meters.view', 'meters.create', 'meters.update',
    'assets.view', 'assets.view_all',
    'equipment.view',
    'reports.view', 'reports.export',
    'analytics.view',
  ],

  // ── 12. TOOLS SHOP ATTENDANT: tool checkout/returns/transfers ──
  tools_shop_attendant: [
    'dashboard.view', 'chat.view',
    'documents.view', 'documents.download',
    'notifications.view',
    'tools.view', 'tools.create', 'tools.update', 'tools.delete',
    'tools.manage', 'tools.checkout', 'tools.return', 'tools.transfer',
    'assets.view',
    'equipment.view',
    'work_orders.view', 'work_orders.view_all',
    'maintenance_requests.view', 'maintenance_requests.view_all',
    'inventory.view',
    'parts.view',
    'repair_material_requests.view', 'repair_material_requests.view_all',
    'repair_tool_requests.view', 'repair_tool_requests.view_all',
    'repair_tool_transfers.view', 'repair_tool_transfers.view_all',
    'reports.view', 'reports.export',
    'employees.view',
  ],

  // ── 13. STORE KEEPER: day-to-day store operations ──
  store_keeper: [
    'dashboard.view', 'chat.view',
    'documents.view', 'documents.download',
    'notifications.view',
    'inventory.view', 'inventory.stock_in', 'inventory.stock_out',
    'inventory.reserve', 'inventory.export',
    'parts.view', 'parts.update',
    'material_requisitions.view', 'material_requisitions.update',
    'stock_transactions.view', 'stock_transactions.create',
    'purchase_orders.view', 'purchase_orders.receive',
    'inventory_locations.view', 'inventory_locations.update',
    'inventory_adjustments.view', 'inventory_adjustments.create',
    'inventory_transfers.view', 'inventory_transfers.update',
    'assets.view',
    'work_orders.view', 'work_orders.view_all',
    'maintenance_requests.view', 'maintenance_requests.view_all',
    'tools.view', 'tools.checkout', 'tools.return',
    'repair_material_requests.view', 'repair_material_requests.view_all',
    'repair_tool_requests.view', 'repair_tool_requests.view_all',
    'repair_tool_transfers.view', 'repair_tool_transfers.view_all',
    'employees.view',
    'reports.view', 'reports.export',
  ],

  // ── 14. MAINTENANCE TECHNICIAN: own WOs, execute, PM execute ──
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
    'repair_tool_requests.view_own', 'repair_tool_requests.create',
    'repair_material_requests.view_own', 'repair_material_requests.create',
    'repair_tool_transfers.view_own',
    'inventory.view',
    'parts.view',
  ],

  // ── 15. PRODUCTION OPERATOR: own data entry, surveys, own requests only ──
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
    'repair_material_requests.view_own',
    'repair_tool_requests.view_own',
    'repair_tool_transfers.view_own',
  ],

  // ── 16. VIEWER: read-only across all modules ──
  viewer: [
    'dashboard.view', 'chat.view',
    'documents.view', 'documents.download',
    'notifications.view',
    'assets.view', 'assets.view_all',
    'equipment.view',
    'assemblies.view',
    'bom.view',
    'facilities.view',
    'meters.view',
    'tools.view',
    'maintenance_requests.view', 'maintenance_requests.view_all',
    'work_orders.view', 'work_orders.view_all',
    'pm_schedules.view', 'pm_templates.view', 'pm_checklists.view',
    'calibration.view',
    'inventory.view', 'inventory.view_all',
    'parts.view',
    'vendors.view',
    'purchase_orders.view',
    'employees.view',
    'shifts.view',
    'training.view',
    'skills.view',
    'production.view',
    'oee.view',
    'downtime.view',
    'quality_checks.view',
    'quality_inspections.view',
    'quality_ncr.view',
    'quality_audits.view',
    'spc.view',
    'energy.view',
    'work_centers.view',
    'production_targets.view',
    'production_batches.view',
    'safety_incidents.view',
    'safety_inspections.view',
    'safety_equipment.view',
    'safety_permits.view',
    'iot_devices.view',
    'iot_rules.view',
    'iot.view',
    'digital_twin.view',
    'reports.view', 'reports.export',
    'analytics.view', 'operations.view', 'quality.view', 'safety.view',
    'system_settings.view',
    'company.view',
    'departments.view',
    'plants.view',
  ],
};

// ══════════════════════════════════════════════════════════════════════════
// POST /api/admin/sync-permissions
// ══════════════════════════════════════════════════════════════════════════

export async function POST(request: Request) {
  // 1. Auth check — admin only
  const session = getSession(request);
  if (!session) {
    return NextResponse.json(
      { success: false, error: 'Authentication required. Provide a Bearer token.' },
      { status: 401 }
    );
  }
  if (!isAdmin(session)) {
    return NextResponse.json(
      { success: false, error: 'Forbidden. Admin role required.' },
      { status: 403 }
    );
  }

  try {
    const logs: string[] = [];
    const roleResults: Array<{ slug: string; name: string; permissionCount: number; skipped: boolean }> = [];

    // ── Step 0: Auto-seed any missing permissions ──
    logs.push('Checking for missing permission slugs...');
    let newPermCount = 0;

    // Get existing permissions from DB
    const existingPerms = await db.permission.findMany({ select: { slug: true } });
    const existingSlugs = new Set(existingPerms.map(p => p.slug));

    // Find and create any missing permissions
    for (const [moduleName, actions] of Object.entries(MODULE_PERMISSIONS)) {
      for (const action of actions) {
        const slug = `${moduleName}.${action}`;
        if (!existingSlugs.has(slug)) {
          try {
            await db.permission.create({
              data: {
                slug,
                name: `${fmtMod(moduleName)} - ${fmtAction(action)}`,
                module: moduleName,
                action,
                description: `${fmtAction(action)} access for ${fmtMod(moduleName)} module`,
              },
            });
            logs.push(`  + Created missing permission: ${slug}`);
            newPermCount++;
          } catch {
            // Might be a race condition — ignore
          }
        }
      }
    }

    if (newPermCount > 0) {
      logs.push(`Created ${newPermCount} new permission(s) that were missing`);
    } else {
      logs.push('All permission slugs already exist in database');
    }

    // Step 1: Get all roles from DB
    const roles = await db.role.findMany({
      select: { id: true, slug: true, name: true },
      orderBy: { level: 'desc' },
    });
    logs.push(`Found ${roles.length} roles in database`);

    // Step 2: Get all permissions from DB (refresh after potential creates)
    const permissions = await db.permission.findMany({
      select: { id: true, slug: true },
    });
    logs.push(`Found ${permissions.length} permissions in database`);

    // Build lookup maps
    const roleMap = new Map(roles.map(r => [r.slug, r.id]));
    const permMap = new Map(permissions.map(p => [p.slug, p.id]));

    // Step 3: Clear all existing role-permission mappings
    await db.rolePermission.deleteMany({});
    logs.push('Cleared all existing role-permission mappings');

    // Step 4: Insert new mappings from ROLE_PERMISSIONS
    let totalMappings = 0;
    const notFoundPerms: string[] = [];
    const notFoundRoles: string[] = [];

    for (const [roleSlug, permSlugs] of Object.entries(ROLE_PERMISSIONS)) {
      const roleId = roleMap.get(roleSlug);
      if (!roleId) {
        notFoundRoles.push(roleSlug);
        roleResults.push({ slug: roleSlug, name: roleSlug, permissionCount: 0, skipped: true });
        continue;
      }

      // Skip admin — gets ALL permissions programmatically
      if (roleSlug === 'admin') {
        roleResults.push({ slug: roleSlug, name: 'Administrator', permissionCount: 0, skipped: true });
        logs.push('admin: skipped (gets ALL permissions programmatically)');
        continue;
      }

      let count = 0;
      const mappings: { roleId: string; permissionId: string }[] = [];

      for (const permSlug of permSlugs) {
        const permId = permMap.get(permSlug);
        if (!permId) {
          if (!notFoundPerms.includes(permSlug)) notFoundPerms.push(permSlug);
          continue;
        }
        mappings.push({ roleId, permissionId: permId });
        count++;
      }

      // Bulk insert using Prisma createMany (avoids raw SQL column name issues)
      if (mappings.length > 0) {
        await db.rolePermission.createMany({
          data: mappings.map(m => ({
            roleId: m.roleId,
            permissionId: m.permissionId,
          })),
          skipDuplicates: true,
        });
      }

      const roleName = roles.find(r => r.slug === roleSlug)?.name || roleSlug;
      roleResults.push({ slug: roleSlug, name: roleName, permissionCount: count, skipped: false });
      logs.push(`${roleSlug}: ${count} permissions mapped`);
      totalMappings += count;
    }

    // Admin gets ALL permissions
    const adminId = roleMap.get('admin');
    if (adminId) {
      const allPermIds = Array.from(permMap.values());
      await db.rolePermission.createMany({
        data: allPermIds.map(pid => ({ roleId: adminId, permissionId: pid })),
        skipDuplicates: true,
      });
      logs.push(`admin: ${allPermIds.length} permissions (ALL)`);
      totalMappings += allPermIds.length;
    }

    logs.push(`Total role-permission mappings: ${totalMappings}`);

    if (notFoundRoles.length > 0) {
      logs.push(`WARNING: Roles in matrix not found in DB: ${notFoundRoles.join(', ')}`);
    }
    if (notFoundPerms.length > 0) {
      logs.push(`WARNING: ${notFoundPerms.length} permissions in matrix not found in DB: ${notFoundPerms.join(', ')}`);
    }

    // Step 5: Clear session table AND in-memory cache to force re-auth
    try {
      await db.session.deleteMany({});
      logs.push('Cleared all sessions — users must re-login');
    } catch {
      logs.push('Could not clear sessions table');
    }

    // Clear in-memory session cache
    sessionCache.clear();
    logs.push('Cleared in-memory session cache');

    // Step 6: Verification — use Prisma instead of raw SQL
    const allRolesWithPerms = await db.role.findMany({
      include: { rolePermissions: { select: { id: true } } },
      orderBy: { level: 'desc' },
    });

    const verification = allRolesWithPerms.map(r => ({
      slug: r.slug,
      permissionCount: r.rolePermissions.length,
    }));

    return NextResponse.json({
      success: true,
      message: 'Role-permission mappings synced successfully. All users must re-login.',
      newPermissionsCreated: newPermCount,
      totalMappings,
      roleResults,
      verification,
      warnings: {
        notFoundRoles: notFoundRoles.length > 0 ? notFoundRoles : undefined,
        notFoundPermissions: notFoundPerms.length > 0 ? notFoundPerms : undefined,
      },
      logs,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { success: false, error: `Sync failed: ${message}` },
      { status: 500 }
    );
  }
}

// GET handler — return info about the endpoint (useful for debugging)
export async function GET() {
  return NextResponse.json({
    endpoint: '/api/admin/sync-permissions',
    method: 'POST',
    description: 'Syncs role-permission mappings and auto-creates missing permissions.',
    usage: 'POST /api/admin/sync-permissions with Authorization: Bearer <admin-token>',
    note: 'Admin role required. Clears all sessions after sync.',
    features: [
      'Auto-creates any missing permission slugs before syncing',
      'Clears and re-syncs all role-permission mappings',
      'Admin role gets ALL permissions',
      'Clears all sessions to force re-login',
    ],
  });
}
