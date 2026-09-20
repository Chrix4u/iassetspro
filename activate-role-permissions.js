// activate-role-permissions.js — Optimized with bulk inserts
const mariadb = require('mariadb');

const ROLE_PERMISSIONS = {
  plant_manager: [
    'dashboard.view','dashboard.stats','analytics.view','reports.view',
    'assets.view','assets.view_all','assets.create','assets.update','assets.export','assets.health','assets.hierarchy','assets.criticality','assets.bulk_update','assets.manage','assets.relationships','assets.import',
    'maintenance_requests.view','maintenance_requests.view_all','maintenance_requests.view_own','maintenance_requests.create','maintenance_requests.update','maintenance_requests.approve','maintenance_requests.reject','maintenance_requests.assign_planner','maintenance_requests.convert_to_wo','maintenance_requests.triage','maintenance_requests.archive','maintenance_requests.my_queue',
    'work_orders.view','work_orders.view_all','work_orders.view_own','work_orders.create','work_orders.update','work_orders.assign_supervisor','work_orders.assign_technician','work_orders.close','work_orders.cancel','work_orders.complete','work_orders.verify','work_orders.dashboard','work_orders.bulk_update','work_orders.adjust_cost','work_orders.reopen','work_orders.failure_analysis',
    'pm_schedules.view','pm_schedules.create','pm_schedules.update','pm_schedules.activate','pm_schedules.delete','pm_schedules.run','pm_templates.view','pm_templates.create','pm_templates.update','pm_triggers.view','pm_triggers.create','pm_triggers.update','pm_checklists.view','pm_checklists.create',
    'inventory.view','bom.view','bom.create','bom.update','bom.manage',
    'production.view','operations.view','quality.view','safety.view',
    'tools.view','tools.create','tools.update','tools.manage','tools.checkout','tools.return','tools.transfer',
    'users.view','users.create','users.update','users.assign_role','users.assign_plant','roles.view','roles.manage',
    'plants.view','plants.update','plants.manage','departments.view','departments.update','departments.manage',
    'notifications.view','notifications.manage','chat.view','search.global',
    'company.view','company.update','system_settings.view','system_settings.update','modules.view','modules.activate',
    'documents.view','documents.upload','documents.download','documents.manage',
    'approvals.view','approvals.approve','approvals.reject',
  ],
  inventory_manager: [
    'dashboard.view','dashboard.stats','analytics.view','reports.view',
    'assets.view','assets.view_all',
    'inventory.view',
    'bom.view','bom.create','bom.update','bom.manage','bom.export','bom.import',
    'tools.view','tools.create','tools.update','tools.manage','tools.checkout','tools.return','tools.transfer','tools.delete',
    'equipment.view','equipment.create','equipment.update',
    'documents.view','documents.upload','documents.download','documents.manage',
    'maintenance_requests.view','maintenance_requests.view_all','maintenance_requests.create','maintenance_requests.my_queue','work_orders.view','work_orders.view_all',
    'plants.view','departments.view',
    'notifications.view','chat.view','search.global','company.view','system_settings.view',
  ],
  maintenance_planner: [
    'dashboard.view','dashboard.stats','analytics.view','reports.view',
    'assets.view','assets.view_all','assets.update','assets.health','assets.hierarchy','assets.export',
    'maintenance_requests.view','maintenance_requests.view_all','maintenance_requests.view_own','maintenance_requests.update','maintenance_requests.assign_planner','maintenance_requests.convert_to_wo','maintenance_requests.triage','maintenance_requests.archive','maintenance_requests.my_queue','maintenance_requests.approve',
    'work_orders.view','work_orders.view_all','work_orders.view_own','work_orders.create','work_orders.update','work_orders.assign_supervisor','work_orders.assign_technician','work_orders.dashboard','work_orders.bulk_update','work_orders.cancel','work_orders.adjust_cost','work_orders.failure_analysis',
    'work_order_templates.view','work_order_templates.create','work_order_templates.update',
    'pm_schedules.view','pm_schedules.create','pm_schedules.update','pm_schedules.activate','pm_schedules.delete','pm_schedules.run','pm_templates.view','pm_templates.create','pm_templates.update','pm_templates.delete','pm_triggers.view','pm_triggers.create','pm_triggers.update','pm_checklists.view','pm_checklists.create',
    'inventory.view','bom.view',
    'failure_codes.view','failure_codes.manage',
    'rca.view','rca.create','rca.update',
    'documents.view','documents.upload','documents.download',
    'plants.view','departments.view','users.view',
    'time_logs.view','time_logs.create','time_logs.update',
    'notifications.view','chat.view','search.global',
  ],
  maintenance_supervisor: [
    'dashboard.view','dashboard.stats','analytics.view','reports.view',
    'assets.view','assets.view_all','assets.health',
    'maintenance_requests.view','maintenance_requests.view_all','maintenance_requests.view_own','maintenance_requests.create','maintenance_requests.update','maintenance_requests.approve','maintenance_requests.reject','maintenance_requests.my_queue',
    'work_orders.view','work_orders.view_all','work_orders.view_own','work_orders.create','work_orders.update','work_orders.assign_technician','work_orders.assign_supervisor','work_orders.complete','work_orders.verify','work_orders.dashboard','work_orders.reopen',
    'work_order_templates.view',
    'pm_schedules.view','pm_schedules.run','pm_templates.view','pm_checklists.view',
    'inventory.view',
    'production.view','operations.view','safety.view','quality.view',
    'tools.view','tools.checkout','tools.return','tools.transfer',
    'users.view','plants.view','departments.view',
    'notifications.view','chat.view','search.global',
    'documents.view','documents.upload','documents.download',
    'time_logs.view','time_logs.create','time_logs.update',
    'approvals.view','approvals.approve','approvals.reject',
  ],
  maintenance_technician: [
    'dashboard.view','dashboard.stats',
    'assets.view','assets.view_own',
    'maintenance_requests.view','maintenance_requests.view_own','maintenance_requests.create','maintenance_requests.update','maintenance_requests.my_queue',
    'work_orders.view','work_orders.view_own','work_orders.update','work_orders.start','work_orders.complete',
    'pm_schedules.view','pm_schedules.run','pm_checklists.view',
    'tools.checkout','tools.return','tools.transfer',
    'time_logs.view','time_logs.create','time_logs.update',
    'documents.view','documents.upload','documents.download',
    'notifications.view','chat.view','search.global','safety.view',
    'assistance_requests.create','assistance_requests.view','assistance_requests.respond',
  ],
  tools_shop_attendant: [
    'dashboard.view',
    'tools.view','tools.create','tools.update','tools.delete','tools.manage','tools.checkout','tools.return','tools.transfer',
    'assets.view',
    'work_orders.view','work_orders.view_all',
    'maintenance_requests.view','maintenance_requests.view_own','maintenance_requests.create','maintenance_requests.update','maintenance_requests.my_queue',
    'notifications.view','chat.view','search.global',
    'documents.view','documents.upload','documents.download',
  ],
  store_keeper: [
    'dashboard.view','dashboard.stats','analytics.view','reports.view',
    'inventory.view','bom.view',
    'documents.view','documents.upload','documents.download','documents.manage',
    'work_orders.view','work_orders.view_all',
    'maintenance_requests.view','maintenance_requests.view_all','maintenance_requests.create','maintenance_requests.my_queue',
    'notifications.view','chat.view','search.global',
    'plants.view','departments.view',
  ],
  production_operator: [
    'dashboard.view','dashboard.stats',
    'assets.view','assets.view_own',
    'work_orders.view','work_orders.view_own',
    'maintenance_requests.view','maintenance_requests.view_own','maintenance_requests.create','maintenance_requests.update','maintenance_requests.my_queue',
    'production.view','operations.view','quality.view','safety.view',
    'notifications.view','chat.view','search.global',
    'meters.view','meters.read','meters.create','meters.update',
    'documents.view','documents.download',
  ],
  viewer: [
    'dashboard.view','dashboard.stats','analytics.view','reports.view',
    'assets.view','assets.view_all','assets.health','assets.hierarchy',
    'maintenance_requests.view','maintenance_requests.view_all','maintenance_requests.view_own','maintenance_requests.create','maintenance_requests.my_queue',
    'work_orders.view','work_orders.view_all','work_orders.dashboard',
    'pm_schedules.view','pm_templates.view','pm_checklists.view','pm_triggers.view',
    'inventory.view','bom.view','tools.view',
    'production.view','operations.view','quality.view','safety.view',
    'plants.view','departments.view','users.view','roles.view',
    'notifications.view','chat.view','search.global',
    'documents.view','documents.download','company.view','system_settings.view','audit_logs.view',
  ],
};

async function main() {
  const conn = await mariadb.createConnection({
    host: 'vps.lightworldtech.com', port: 3306,
    user: 'ifleetpro_user', password: 'myjesus4mE2018',
    database: 'ifleetpro_eam_system',
  });

  console.log('=== Activating Role Permissions ===\n');

  // Load all roles and perms into memory
  const roles = await conn.query('SELECT id, slug, name FROM roles');
  const roleMap = Object.fromEntries(roles.map(r => [r.slug, r.id]));

  const perms = await conn.query('SELECT id, slug FROM permissions');
  const permMap = Object.fromEntries(perms.map(p => [p.slug, p.id]));

  // Load existing role-permissions into a Set for fast lookup
  const existing = await conn.query('SELECT roleId, permissionId FROM role_permissions');
  const existingSet = new Set(existing.map(e => `${e.roleId}:${e.permissionId}`));

  console.log(`Roles: ${roles.length}, Permissions: ${perms.length}, Existing mappings: ${existing.length}\n`);

  // Build bulk insert data
  const bulkData = [];
  const stats = {};

  for (const [roleSlug, permSlugs] of Object.entries(ROLE_PERMISSIONS)) {
    const roleId = roleMap[roleSlug];
    if (!roleId) { console.log(`⚠️  Role "${roleSlug}" not found`); continue; }
    if (roleSlug === 'admin') { console.log(`⏭️  admin skipped (already has all)`); continue; }

    stats[roleSlug] = { new: 0, existing: 0, notFound: 0 };

    for (const permSlug of permSlugs) {
      const permId = permMap[permSlug];
      if (!permId) { stats[roleSlug].notFound++; continue; }

      if (existingSet.has(`${roleId}:${permId}`)) {
        stats[roleSlug].existing++;
        continue;
      }

      bulkData.push([roleId, permId]);
      stats[roleSlug].new++;
    }
  }

  // Bulk insert (batch of 100)
  if (bulkData.length > 0) {
    for (let i = 0; i < bulkData.length; i += 100) {
      const batch = bulkData.slice(i, i + 100);
      const placeholders = batch.map(() => '(UUID(), ?, ?, NOW())').join(',');
      const values = batch.flat();
      await conn.query(`INSERT INTO role_permissions (id, roleId, permissionId, createdAt) VALUES ${placeholders}`, values);
    }
  }

  // Print stats
  let totalNew = 0;
  for (const [roleSlug, s] of Object.entries(stats)) {
    const total = s.new + s.existing;
    totalNew += s.new;
    const warnings = s.notFound > 0 ? ` ⚠️ ${s.notFound} not found` : '';
    console.log(`✅ ${roleSlug.padEnd(25)} → +${s.new} new, ${s.existing} existing = ${total} total${warnings}`);
  }

  console.log(`\n=== Total new permissions inserted: ${totalNew} ===\n`);

  // Final verification
  console.log('=== Final Role-Permission Counts ===');
  const final = await conn.query(`
    SELECT r.slug, r.name, COUNT(rp.id) as cnt
    FROM roles r LEFT JOIN role_permissions rp ON r.id = rp.roleId
    GROUP BY r.id ORDER BY r.level DESC
  `);
  final.forEach(r => console.log(`  ${r.slug.padEnd(25)} ${r.name.padEnd(25)} → ${String(r.cnt).padStart(3)} perms`));

  await conn.end();
  console.log('\nDone! ✅');
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
