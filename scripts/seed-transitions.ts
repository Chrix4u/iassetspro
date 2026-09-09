/**
 * Reconcile the canonical status_transitions rows without touching unrelated data.
 *
 * Run on VPS:
 *   cd /home/lightworld/webapps/iassetspro && bun run scripts/seed-transitions.ts
 *
 * Safe to run repeatedly:
 * - canonical rows are updated/inserted in place
 * - unrelated/custom transitions are preserved
 * - two known legacy transitions that bypass the verified → closed lifecycle are removed
 *
 * Uses the mariadb driver directly to avoid PrismaClient adapter issues in one-off
 * production maintenance scripts.
 */

import mariadb from 'mariadb';

type Transition = {
  entityType: 'maintenance_request' | 'work_order';
  fromStatus: string | null;
  toStatus: string;
  allowedRoleSlugs: string;
  requiresReason: boolean;
};

type DbConnection = Awaited<ReturnType<typeof mariadb.createConnection>>;

function getDbConfig() {
  const host = process.env.DB_HOST || process.env.MYSQL_HOST;
  const port = parseInt(process.env.DB_PORT || process.env.MYSQL_PORT || '3306', 10);
  const user = process.env.DB_USER || process.env.MYSQL_USER;
  const password = process.env.DB_PASSWORD || process.env.MYSQL_PASSWORD;
  const database = process.env.DB_NAME || process.env.MYSQL_DATABASE;

  if (host && user && password && database) {
    return { host, port, user, password, database };
  }

  const dbUrl = process.env.DATABASE_URL || '';
  if (dbUrl.startsWith('mysql://')) {
    const url = new URL(dbUrl);
    return {
      host: url.hostname,
      port: parseInt(url.port || '3306', 10),
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: url.pathname.slice(1),
    };
  }

  console.error('❌ No database credentials found. Set DB_HOST, DB_USER, DB_PASSWORD, DB_NAME or DATABASE_URL.');
  process.exit(1);
}

const MR_TRANSITIONS: Transition[] = [
  {
    entityType: 'maintenance_request',
    fromStatus: null,
    toStatus: 'pending',
    allowedRoleSlugs: JSON.stringify([
      'operator', 'supervisor', 'planner', 'admin',
      'production_operator', 'plant_manager', 'maintenance_manager',
    ]),
    requiresReason: false,
  },
  {
    entityType: 'maintenance_request',
    fromStatus: 'pending',
    toStatus: 'in_progress',
    allowedRoleSlugs: JSON.stringify([
      'supervisor', 'admin', 'maintenance_supervisor', 'maintenance_manager', 'plant_manager',
    ]),
    requiresReason: false,
  },
  {
    entityType: 'maintenance_request',
    fromStatus: 'pending',
    toStatus: 'approved',
    allowedRoleSlugs: JSON.stringify([
      'admin', 'maintenance_supervisor', 'maintenance_manager', 'plant_manager',
    ]),
    requiresReason: false,
  },
  {
    entityType: 'maintenance_request',
    fromStatus: 'pending',
    toStatus: 'rejected',
    allowedRoleSlugs: JSON.stringify([
      'admin', 'maintenance_supervisor', 'maintenance_manager', 'plant_manager',
    ]),
    requiresReason: true,
  },
  {
    entityType: 'maintenance_request',
    fromStatus: 'approved',
    toStatus: 'converted',
    allowedRoleSlugs: JSON.stringify([
      'planner', 'admin', 'maintenance_planner', 'maintenance_manager',
    ]),
    requiresReason: false,
  },
];

const WO_TRANSITIONS: Transition[] = [
  { entityType: 'work_order', fromStatus: null, toStatus: 'draft', allowedRoleSlugs: JSON.stringify(['planner', 'admin', 'maintenance_planner', 'maintenance_manager', 'plant_manager']), requiresReason: false },
  { entityType: 'work_order', fromStatus: 'draft', toStatus: 'requested', allowedRoleSlugs: JSON.stringify(['planner', 'admin', 'maintenance_planner', 'maintenance_manager']), requiresReason: false },
  { entityType: 'work_order', fromStatus: 'draft', toStatus: 'approved', allowedRoleSlugs: JSON.stringify(['planner', 'admin', 'maintenance_planner', 'maintenance_manager']), requiresReason: false },
  { entityType: 'work_order', fromStatus: 'approved', toStatus: 'planned', allowedRoleSlugs: JSON.stringify(['planner', 'admin', 'maintenance_planner', 'maintenance_manager']), requiresReason: false },
  { entityType: 'work_order', fromStatus: 'draft', toStatus: 'assigned', allowedRoleSlugs: JSON.stringify(['planner', 'supervisor', 'admin', 'maintenance_planner', 'maintenance_supervisor', 'maintenance_manager', 'plant_manager']), requiresReason: false },
  { entityType: 'work_order', fromStatus: 'requested', toStatus: 'assigned', allowedRoleSlugs: JSON.stringify(['planner', 'supervisor', 'admin', 'maintenance_planner', 'maintenance_supervisor', 'maintenance_manager', 'plant_manager']), requiresReason: false },
  { entityType: 'work_order', fromStatus: 'approved', toStatus: 'assigned', allowedRoleSlugs: JSON.stringify(['planner', 'supervisor', 'admin', 'maintenance_planner', 'maintenance_supervisor', 'maintenance_manager', 'plant_manager']), requiresReason: false },
  { entityType: 'work_order', fromStatus: 'planned', toStatus: 'assigned', allowedRoleSlugs: JSON.stringify(['planner', 'supervisor', 'admin', 'maintenance_planner', 'maintenance_supervisor', 'maintenance_manager', 'plant_manager']), requiresReason: false },
  { entityType: 'work_order', fromStatus: 'assigned', toStatus: 'in_progress', allowedRoleSlugs: JSON.stringify(['technician', 'admin', 'maintenance_technician', 'maintenance_supervisor', 'maintenance_manager']), requiresReason: false },
  { entityType: 'work_order', fromStatus: 'in_progress', toStatus: 'waiting_parts', allowedRoleSlugs: JSON.stringify(['technician', 'planner', 'admin', 'maintenance_technician', 'maintenance_planner', 'maintenance_manager']), requiresReason: false },
  { entityType: 'work_order', fromStatus: 'in_progress', toStatus: 'completed', allowedRoleSlugs: JSON.stringify(['technician', 'admin', 'maintenance_technician', 'maintenance_supervisor', 'maintenance_manager']), requiresReason: false },
  { entityType: 'work_order', fromStatus: 'waiting_parts', toStatus: 'in_progress', allowedRoleSlugs: JSON.stringify(['technician', 'planner', 'admin', 'maintenance_technician', 'maintenance_planner', 'maintenance_manager']), requiresReason: false },
  { entityType: 'work_order', fromStatus: 'draft', toStatus: 'cancelled', allowedRoleSlugs: JSON.stringify(['planner', 'admin', 'maintenance_planner', 'maintenance_manager']), requiresReason: true },
  { entityType: 'work_order', fromStatus: 'requested', toStatus: 'cancelled', allowedRoleSlugs: JSON.stringify(['planner', 'admin', 'maintenance_planner', 'maintenance_manager']), requiresReason: true },
  { entityType: 'work_order', fromStatus: 'assigned', toStatus: 'cancelled', allowedRoleSlugs: JSON.stringify(['planner', 'supervisor', 'admin', 'maintenance_planner', 'maintenance_supervisor', 'maintenance_manager']), requiresReason: true },
  { entityType: 'work_order', fromStatus: 'in_progress', toStatus: 'cancelled', allowedRoleSlugs: JSON.stringify(['supervisor', 'admin', 'maintenance_supervisor', 'maintenance_manager']), requiresReason: true },
  { entityType: 'work_order', fromStatus: 'waiting_parts', toStatus: 'cancelled', allowedRoleSlugs: JSON.stringify(['supervisor', 'admin', 'maintenance_supervisor', 'maintenance_manager']), requiresReason: true },
  { entityType: 'work_order', fromStatus: 'in_progress', toStatus: 'on_hold', allowedRoleSlugs: JSON.stringify(['supervisor', 'admin', 'maintenance_supervisor', 'maintenance_manager']), requiresReason: true },
  { entityType: 'work_order', fromStatus: 'on_hold', toStatus: 'in_progress', allowedRoleSlugs: JSON.stringify(['supervisor', 'admin', 'maintenance_supervisor', 'maintenance_manager']), requiresReason: false },
  { entityType: 'work_order', fromStatus: 'in_progress', toStatus: 'waiting_tools', allowedRoleSlugs: JSON.stringify(['technician', 'planner', 'admin', 'maintenance_technician', 'maintenance_planner', 'maintenance_manager']), requiresReason: false },
  { entityType: 'work_order', fromStatus: 'waiting_tools', toStatus: 'in_progress', allowedRoleSlugs: JSON.stringify(['technician', 'planner', 'admin', 'maintenance_technician', 'maintenance_planner', 'maintenance_manager']), requiresReason: false },
  { entityType: 'work_order', fromStatus: 'waiting_tools', toStatus: 'cancelled', allowedRoleSlugs: JSON.stringify(['supervisor', 'admin', 'maintenance_supervisor', 'maintenance_manager']), requiresReason: true },
  { entityType: 'work_order', fromStatus: 'in_progress', toStatus: 'waiting_shutdown', allowedRoleSlugs: JSON.stringify(['technician', 'planner', 'admin', 'maintenance_technician', 'maintenance_planner', 'maintenance_manager']), requiresReason: false },
  { entityType: 'work_order', fromStatus: 'waiting_shutdown', toStatus: 'in_progress', allowedRoleSlugs: JSON.stringify(['technician', 'planner', 'admin', 'maintenance_technician', 'maintenance_planner', 'maintenance_manager']), requiresReason: false },
  { entityType: 'work_order', fromStatus: 'waiting_shutdown', toStatus: 'cancelled', allowedRoleSlugs: JSON.stringify(['supervisor', 'admin', 'maintenance_supervisor', 'maintenance_manager']), requiresReason: true },
  { entityType: 'work_order', fromStatus: 'in_progress', toStatus: 'waiting_permit', allowedRoleSlugs: JSON.stringify(['technician', 'planner', 'admin', 'maintenance_technician', 'maintenance_planner', 'maintenance_manager']), requiresReason: false },
  { entityType: 'work_order', fromStatus: 'waiting_permit', toStatus: 'in_progress', allowedRoleSlugs: JSON.stringify(['technician', 'planner', 'admin', 'maintenance_technician', 'maintenance_planner', 'maintenance_manager']), requiresReason: false },
  { entityType: 'work_order', fromStatus: 'waiting_permit', toStatus: 'cancelled', allowedRoleSlugs: JSON.stringify(['supervisor', 'admin', 'maintenance_supervisor', 'maintenance_manager']), requiresReason: true },
  { entityType: 'work_order', fromStatus: 'in_progress', toStatus: 'pending_handover', allowedRoleSlugs: JSON.stringify(['technician', 'planner', 'admin', 'maintenance_technician', 'maintenance_planner', 'maintenance_manager', 'maintenance_supervisor']), requiresReason: false },
  { entityType: 'work_order', fromStatus: 'pending_handover', toStatus: 'in_progress', allowedRoleSlugs: JSON.stringify(['technician', 'planner', 'admin', 'maintenance_technician', 'maintenance_planner', 'maintenance_manager']), requiresReason: false },
  { entityType: 'work_order', fromStatus: 'pending_handover', toStatus: 'cancelled', allowedRoleSlugs: JSON.stringify(['supervisor', 'admin', 'maintenance_supervisor', 'maintenance_manager']), requiresReason: true },
  { entityType: 'work_order', fromStatus: 'completed', toStatus: 'verified', allowedRoleSlugs: JSON.stringify(['supervisor', 'admin', 'maintenance_supervisor', 'maintenance_manager', 'plant_manager']), requiresReason: false },
  { entityType: 'work_order', fromStatus: 'verified', toStatus: 'closed', allowedRoleSlugs: JSON.stringify(['planner', 'admin', 'maintenance_planner', 'maintenance_manager', 'plant_manager']), requiresReason: false },
  { entityType: 'work_order', fromStatus: 'completed', toStatus: 'in_progress', allowedRoleSlugs: JSON.stringify(['supervisor', 'admin', 'maintenance_supervisor', 'maintenance_manager', 'plant_manager']), requiresReason: true },
  { entityType: 'work_order', fromStatus: 'verified', toStatus: 'in_progress', allowedRoleSlugs: JSON.stringify(['supervisor', 'admin', 'maintenance_supervisor', 'maintenance_manager', 'plant_manager']), requiresReason: true },
];

const LEGACY_FORBIDDEN_WO_TRANSITIONS = [
  { fromStatus: 'completed', toStatus: 'closed' },
  { fromStatus: 'closed', toStatus: 'in_progress' },
];

async function upsertTransition(
  conn: DbConnection,
  transition: Transition,
  sortOrder: number,
) {
  if (transition.fromStatus === null) {
    const existing = await conn.query(
      `SELECT id
       FROM status_transitions
       WHERE entity_type = ? AND from_status IS NULL AND to_status = ?
       ORDER BY created_at ASC
       LIMIT 1`,
      [transition.entityType, transition.toStatus],
    ) as Array<{ id: string }>;

    if (existing[0]?.id) {
      await conn.query(
        `UPDATE status_transitions
         SET allowed_role_slugs = ?, requires_reason = ?, sort_order = ?, updated_at = NOW()
         WHERE id = ?`,
        [
          transition.allowedRoleSlugs,
          transition.requiresReason ? 1 : 0,
          sortOrder,
          existing[0].id,
        ],
      );
    } else {
      await conn.query(
        `INSERT INTO status_transitions
          (id, entity_type, from_status, to_status, allowed_role_slugs, requires_reason, sort_order, created_at, updated_at)
         VALUES (UUID(), ?, NULL, ?, ?, ?, ?, NOW(), NOW())`,
        [
          transition.entityType,
          transition.toStatus,
          transition.allowedRoleSlugs,
          transition.requiresReason ? 1 : 0,
          sortOrder,
        ],
      );
    }
    return;
  }

  await conn.query(
    `INSERT INTO status_transitions
      (id, entity_type, from_status, to_status, allowed_role_slugs, requires_reason, sort_order, created_at, updated_at)
     VALUES (UUID(), ?, ?, ?, ?, ?, ?, NOW(), NOW())
     ON DUPLICATE KEY UPDATE
       allowed_role_slugs = VALUES(allowed_role_slugs),
       requires_reason = VALUES(requires_reason),
       sort_order = VALUES(sort_order),
       updated_at = NOW()`,
    [
      transition.entityType,
      transition.fromStatus,
      transition.toStatus,
      transition.allowedRoleSlugs,
      transition.requiresReason ? 1 : 0,
      sortOrder,
    ],
  );
}

async function seedTransitions() {
  const config = getDbConfig();
  console.log(`🔄 Connecting to MariaDB: ${config.host}/${config.database}...`);

  const conn = await mariadb.createConnection({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    multipleStatements: false,
  });

  console.log('✅ Connected! Reconciling canonical status_transitions...');

  try {
    await conn.beginTransaction();

    for (let i = 0; i < MR_TRANSITIONS.length; i++) {
      await upsertTransition(conn, MR_TRANSITIONS[i], i);
    }
    console.log(`  ✅ Reconciled ${MR_TRANSITIONS.length} MR transitions`);

    for (let i = 0; i < WO_TRANSITIONS.length; i++) {
      await upsertTransition(conn, WO_TRANSITIONS[i], i);
    }
    console.log(`  ✅ Reconciled ${WO_TRANSITIONS.length} WO transitions`);

    for (const stale of LEGACY_FORBIDDEN_WO_TRANSITIONS) {
      await conn.query(
        `DELETE FROM status_transitions
         WHERE entity_type = 'work_order' AND from_status = ? AND to_status = ?`,
        [stale.fromStatus, stale.toStatus],
      );
    }
    console.log('  ✅ Removed legacy direct-close/reopen transitions');

    const verifiedClose = await conn.query(
      `SELECT COUNT(*) AS cnt
       FROM status_transitions
       WHERE entity_type = 'work_order' AND from_status = 'verified' AND to_status = 'closed'`,
    ) as Array<{ cnt: number }>;

    const directClose = await conn.query(
      `SELECT COUNT(*) AS cnt
       FROM status_transitions
       WHERE entity_type = 'work_order' AND from_status = 'completed' AND to_status = 'closed'`,
    ) as Array<{ cnt: number }>;

    if (Number(verifiedClose[0]?.cnt || 0) !== 1 || Number(directClose[0]?.cnt || 0) !== 0) {
      throw new Error('Canonical WO close path verification failed');
    }

    await conn.commit();

    const rows = await conn.query(
      `SELECT entity_type, COUNT(*) AS total
       FROM status_transitions
       WHERE entity_type IN ('maintenance_request', 'work_order')
       GROUP BY entity_type`,
    ) as Array<{ entity_type: string; total: number }>;

    for (const row of rows) {
      console.log(`  ✅ ${row.entity_type}: ${row.total} transition rows present`);
    }
    console.log('  ✅ Critical check PASSED: completed → verified → closed is enforced');
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    await conn.end();
  }
}

seedTransitions()
  .then(() => {
    console.log('\n✅ Done! Canonical maintenance-request and work-order transitions are reconciled.');
    process.exit(0);
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error('❌ Seed failed:', message);
    process.exit(1);
  });
