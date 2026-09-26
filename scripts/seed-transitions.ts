/**
 * Reconcile canonical status_transitions on PostgreSQL.
 *
 * Driver-only preflight: bun run scripts/seed-transitions.ts --check-driver
 * Database-schema preflight: bun run scripts/seed-transitions.ts --check-schema
 * Safe to run repeatedly; unrelated/custom transitions are preserved.
 */
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';

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
  const result = await conn.query<{ column_name: string }>(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'status_transitions'`,
  );

  const actual = new Set(result.rows.map((row) => row.column_name));
  const missing = REQUIRED_STATUS_TRANSITION_COLUMNS.filter((column) => !actual.has(column));
  if (missing.length > 0) {
    throw new Error(`status_transitions schema mismatch; missing columns: ${missing.join(', ')}`);
  }
  console.log('✅ status_transitions physical schema verified');
}

async function upsertTransition(conn: DbConnection, transition: Transition, sortOrder: number) {
  if (transition.fromStatus === null) {
    const existing = await conn.query<{ id: string }>(
      `SELECT "id"
         FROM "status_transitions"
        WHERE "entityType" = $1 AND "fromStatus" IS NULL AND "toStatus" = $2
        ORDER BY "createdAt" ASC
        LIMIT 1`,
      [transition.entityType, transition.toStatus],
    );

    if (existing.rows[0]?.id) {
      await conn.query(
        `UPDATE "status_transitions"
            SET "allowedRoleSlugs" = $1, "requiresReason" = $2, "sortOrder" = $3
          WHERE "id" = $4`,
        [transition.allowedRoleSlugs, transition.requiresReason, sortOrder, existing.rows[0].id],
      );
    } else {
      await conn.query(
        `INSERT INTO "status_transitions"
          ("id", "entityType", "fromStatus", "toStatus", "allowedRoleSlugs", "requiresReason", "sortOrder", "createdAt")
         VALUES ($1, $2, NULL, $3, $4, $5, $6, NOW())`,
        [randomUUID(), transition.entityType, transition.toStatus, transition.allowedRoleSlugs, transition.requiresReason, sortOrder],
      );
    }
    return;
  }

  await conn.query(
    `INSERT INTO "status_transitions"
      ("id", "entityType", "fromStatus", "toStatus", "allowedRoleSlugs", "requiresReason", "sortOrder", "createdAt")
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
     ON CONFLICT ("entityType", "fromStatus", "toStatus")
     DO UPDATE SET
       "allowedRoleSlugs" = EXCLUDED."allowedRoleSlugs",
       "requiresReason" = EXCLUDED."requiresReason",
       "sortOrder" = EXCLUDED."sortOrder"`,
    [
      randomUUID(),
      transition.entityType,
      transition.fromStatus,
      transition.toStatus,
      transition.allowedRoleSlugs,
      transition.requiresReason,
      sortOrder,
    ],
  );
}

async function seedTransitions() {
  const databaseUrl = getDatabaseUrl();
  const url = new URL(databaseUrl);
  console.log(`🔄 Connecting to PostgreSQL: ${url.hostname}/${url.pathname.slice(1)}...`);

  const conn = new Client({ connectionString: databaseUrl });
  await conn.connect();

  try {
    await verifyPhysicalSchema(conn);

    if (process.argv.includes('--check-schema')) {
      console.log('✅ Schema-only check completed; no transition rows were changed.');
      return;
    }

    console.log('✅ Connected! Reconciling canonical status_transitions...');
    let committed = false;

    try {
      await conn.query('BEGIN');

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
          `DELETE FROM "status_transitions"
            WHERE "entityType" = 'work_order' AND "fromStatus" = $1 AND "toStatus" = $2`,
          [stale.fromStatus, stale.toStatus],
        );
      }

      const verifiedClose = await conn.query<{ cnt: string }>(
        `SELECT COUNT(*)::text AS cnt
           FROM "status_transitions"
          WHERE "entityType" = 'work_order' AND "fromStatus" = 'verified' AND "toStatus" = 'closed'`,
      );
      const directClose = await conn.query<{ cnt: string }>(
        `SELECT COUNT(*)::text AS cnt
           FROM "status_transitions"
          WHERE "entityType" = 'work_order' AND "fromStatus" = 'completed' AND "toStatus" = 'closed'`,
      );

      if (Number(verifiedClose.rows[0]?.cnt || 0) !== 1 || Number(directClose.rows[0]?.cnt || 0) !== 0) {
        throw new Error('Canonical WO close path verification failed');
      }

      const rows = await conn.query<{ entityType: string; total: string }>(
        `SELECT "entityType", COUNT(*)::text AS total
           FROM "status_transitions"
          WHERE "entityType" IN ('maintenance_request', 'work_order')
          GROUP BY "entityType"`,
      );

      await conn.query('COMMIT');
      committed = true;

      for (const row of rows.rows) {
        console.log(`  ✅ ${row.entityType}: ${row.total} transition rows present`);
      }
      console.log('  ✅ Critical check PASSED: completed → verified → closed is enforced');
    } catch (error) {
      if (!committed) {
        try { await conn.query('ROLLBACK'); } catch {}
      }
      throw error;
    }
  } finally {
    try {
      await conn.end();
    } catch (closeError) {
      const closeMessage = closeError instanceof Error ? closeError.message : String(closeError);
      console.warn(`⚠️ PostgreSQL connection close warning: ${closeMessage}`);
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
