/**
 * Reconcile the canonical status_transitions rows without touching unrelated data.
 *
 * Run on VPS:
 *   cd /home/lightworld/webapps/iassetspro && bun run scripts/seed-transitions.ts
 *
 * Driver-only preflight (no database connection or writes):
 *   bun run scripts/seed-transitions.ts --check-driver
 *
 * Database-schema preflight (read-only):
 *   bun run scripts/seed-transitions.ts --check-schema
 *
 * Safe to run repeatedly:
 * - canonical rows are updated/inserted in place
 * - unrelated/custom transitions are preserved
 * - two known legacy transitions that bypass the verified → closed lifecycle are removed
 *
 * Uses the mariadb driver directly to avoid PrismaClient adapter issues in one-off
 * production maintenance scripts.
 */

// mariadb 3.5.x exposes the Promise API as named ESM exports. Using the named
// createConnection export also avoids Bun requiring a non-existent default
// export from mariadb/promise.js.
import { createConnection } from 'mariadb';

type Transition = {
  entityType: 'maintenance_request' | 'work_order';
  fromStatus: string | null;
  toStatus: string;
  allowedRoleSlugs: string;
  requiresReason: boolean;
};

type DbConnection = Awaited<ReturnType<typeof createConnection>>;

if (process.argv.includes('--check-driver')) {
  if (typeof createConnection !== 'function') {
    console.error('❌ MariaDB driver import check failed: createConnection is unavailable.');
    process.exit(1);
  }
  console.log('✅ MariaDB driver import check passed: createConnection is available.');
  process.exit(0);
}

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
  { entityType: 'work_order', fromStatus: 'approved', toStatus: 'cancelled', allowedRoleSlugs: JSON.stringify(['planner', 'admin', 'maintenance_planner', 'maintenance_manager']), requiresReason: true },
  { entityType: 'work_order', fromStatus: 'planned', toStatus: 'cancelled', allowedRoleSlugs: JSON.stringify(['planner', 'admin', 'maintenance_planner', 'maintenance_manager']), requiresReason: true },
  { entityType: 'work_order', fromStatus: 'assigned', toStatus: 'cancelled', allowedRoleSlugs: JSON.stringify(['planner', 'supervisor', 'admin', 'maintenance_planner', 'maintenance_supervisor', 'maintenance_manager']), requiresReason: true },
  { entityType: 'work_order', fromStatus: 'in_progress', toStatus: 'cancelled', allowedRoleSlugs: JSON.stringify(['supervisor', 'admin', 'maintenance_supervisor', 'maintenance_manager']), requiresReason: true },
  { entityType: 'work_order', fromStatus: 'waiting_parts', toStatus: 'cancelled', allowedRoleSlugs: JSON.stringify(['supervisor', 'admin', 'maintenance_supervisor', 'maintenance_manager']), requiresReason: true },
  { entityType: 'work_order', fromStatus: 'in_progress', toStatus: 'on_hold', allowedRoleSlugs: JSON.stringify(['supervisor', 'admin', 'maintenance_supervisor', 'maintenance_manager']), requiresReason: true },
  { entityType: 'work_order', fromStatus: 'on_hold', toStatus: 'in_progress', allowedRoleSlugs: JSON.stringify(['supervisor', 'admin', 'maintenance_supervisor', 'maintenance_manager']), requiresReason: false },
  { entityType: 'work_order', fromStatus: 'on_hold', toStatus: 'cancelled', allowedRoleSlugs: JSON.stringify(['supervisor', 'admin', 'maintenance_supervisor', 'maintenance_manager']), requiresReason: true },
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

const REQUIRED_STATUS_TRANSITION_COLUMNS = [
  'id',
  'entityType',
  'fromStatus',
  'toStatus',
  'allowedRoleSlugs',
  'requiresApproval',
  'requiresReason',
  'sortOrder',
  'createdAt',
] as const;

async function verifyPhysicalSchema(conn: DbConnection) {
  const rows = await conn.query(
    'SHOW COLUMNS FROM status_transitions',
  ) as Array<{ Field: string }>;

  const actual = new Set(rows.map((row) => row.Field));
  const missing = REQUIRED_STATUS_TRANSITION_COLUMNS.filter((column) => !actual.has(column));

  if (missing.length > 0) {
    throw new Error(`status_transitions schema mismatch; missing columns: ${missing.join(', ')}`);
  }

  console.log('✅ status_transitions physical schema verified');
}

async function upsertTransition(
  conn: DbConnection,
  transition: Transition,
  sortOrder: number,
) {
  if (transition.fromStatus === null) {
    const existing = await conn.query(
      `SELECT id
       FROM status_transitions
       WHERE entityType = ? AND fromStatus IS NULL AND toStatus = ?
       ORDER BY createdAt ASC
       LIMIT 1`,
      [transition.entityType, transition.toStatus],
    ) as Array<{ id: string }>;

    if (existing[0]?.id) {
      await conn.query(
        `UPDATE status_transitions
         SET allowedRoleSlugs = ?, requiresReason = ?, sortOrder = ?
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
          (id, entityType, fromStatus, toStatus, allowedRoleSlugs, requiresReason, sortOrder, createdAt)
         VALUES (UUID(), ?, NULL, ?, ?, ?, ?, NOW())`,
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
      (id, entityType, fromStatus, toStatus, allowedRoleSlugs, requiresReason, sortOrder, createdAt)
     VALUES (UUID(), ?, ?, ?, ?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE
       allowedRoleSlugs = VALUES(allowedRoleSlugs),
       requiresReason = VALUES(requiresReason),
       sortOrder = VALUES(sortOrder)`,
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

  const conn = await createConnection({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    multipleStatements: false,
  });

  try {
    await verifyPhysicalSchema(conn);

    if (process.argv.includes('--check-schema')) {
      console.log('✅ Schema-only check completed; no transition rows were changed.');
      return;
    }

    console.log('✅ Connected! Reconciling canonical status_transitions...');

    let committed = false;

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
           WHERE entityType = 'work_order' AND fromStatus = ? AND toStatus = ?`,
          [stale.fromStatus, stale.toStatus],
        );
      }
      console.log('  ✅ Removed legacy direct-close/reopen transitions');

      const verifiedClose = await conn.query(
        `SELECT COUNT(*) AS cnt
         FROM status_transitions
         WHERE entityType = 'work_order' AND fromStatus = 'verified' AND toStatus = 'closed'`,
      ) as Array<{ cnt: number }>;

      const directClose = await conn.query(
        `SELECT COUNT(*) AS cnt
         FROM status_transitions
         WHERE entityType = 'work_order' AND fromStatus = 'completed' AND toStatus = 'closed'`,
      ) as Array<{ cnt: number }>;

      if (Number(verifiedClose[0]?.cnt || 0) !== 1 || Number(directClose[0]?.cnt || 0) !== 0) {
        throw new Error('Canonical WO close path verification failed');
      }

      // Perform all fallible verification queries before commit. Once commit
      // succeeds, the script must not report a transactional failure that could
      // make a deploy controller restore an older runtime against new lifecycle data.
      const rows = await conn.query(
        `SELECT entityType, COUNT(*) AS total
         FROM status_transitions
         WHERE entityType IN ('maintenance_request', 'work_order')
         GROUP BY entityType`,
      ) as Array<{ entityType: string; total: number }>;

      await conn.commit();
      committed = true;

      for (const row of rows) {
        console.log(`  ✅ ${row.entityType}: ${row.total} transition rows present`);
      }
      console.log('  ✅ Critical check PASSED: completed → verified → closed is enforced');
    } catch (error) {
      if (!committed) {
        try {
          await conn.rollback();
        } catch (rollbackError) {
          const rollbackMessage = rollbackError instanceof Error ? rollbackError.message : String(rollbackError);
          console.error('❌ Rollback attempt also failed:', rollbackMessage);
        }
      }
      throw error;
    }
  } finally {
    try {
      await conn.end();
    } catch (closeError) {
      const closeMessage = closeError instanceof Error ? closeError.message : String(closeError);
      console.warn(`⚠️ MariaDB connection close warning: ${closeMessage}`);
    }
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
