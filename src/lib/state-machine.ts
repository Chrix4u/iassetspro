import { Prisma, PrismaClient } from '@prisma/client';
import { db } from '@/lib/db';

// ============================================================================
// TYPES
// ============================================================================

/** Minimal session interface matching auth.ts SessionData shape */
interface SessionLike {
  userId: string;
  roles: string[];
  permissions: string[];
}

/** Result of a transition permission check */
interface TransitionCheck {
  allowed: boolean;
  reason?: string;
  transition?: {
    fromStatus: string | null;
    toStatus: string;
    allowedRoleSlugs: string[];
    requiresReason: boolean;
  };
}

/** A single available transition for display / UI consumption */
interface AvailableTransition {
  fromStatus: string | null;
  toStatus: string;
  allowedRoleSlugs: string[];
  requiresReason: boolean;
}

/** Result of executing a status transition */
interface ExecuteResult {
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
}

/** Entity types that support the DB-driven state machine */
type EntityType = 'work_order' | 'maintenance_request';

type CanonicalTransition = {
  fromStatus: string | null;
  toStatus: string;
  allowedRoleSlugs: string;
  requiresReason: boolean;
};

// ============================================================================
// DEFAULT TRANSITIONS (auto-seeded when table is empty)
// Keep these exactly aligned with scripts/seed-transitions.ts.
// ============================================================================

export const DEFAULT_MR_TRANSITIONS = [
  {
    fromStatus: null as string | null,
    toStatus: 'pending',
    allowedRoleSlugs: JSON.stringify([
      'operator', 'supervisor', 'planner', 'admin',
      'production_operator', 'plant_manager', 'maintenance_manager',
    ]),
    requiresReason: false,
  },
  {
    fromStatus: 'pending',
    toStatus: 'in_progress',
    allowedRoleSlugs: JSON.stringify([
      'supervisor', 'admin', 'maintenance_supervisor', 'maintenance_manager', 'plant_manager',
    ]),
    requiresReason: false,
  },
  {
    fromStatus: 'pending',
    toStatus: 'approved',
    allowedRoleSlugs: JSON.stringify([
      'admin', 'maintenance_supervisor', 'maintenance_manager', 'plant_manager',
    ]),
    requiresReason: false,
  },
  {
    fromStatus: 'pending',
    toStatus: 'rejected',
    allowedRoleSlugs: JSON.stringify([
      'admin', 'maintenance_supervisor', 'maintenance_manager', 'plant_manager',
    ]),
    requiresReason: true,
  },
  {
    fromStatus: 'approved',
    toStatus: 'converted',
    allowedRoleSlugs: JSON.stringify([
      'planner', 'admin', 'maintenance_planner', 'maintenance_manager',
    ]),
    requiresReason: false,
  },
];

export const DEFAULT_WO_TRANSITIONS = [
  { fromStatus: null as string | null, toStatus: 'draft', allowedRoleSlugs: JSON.stringify(['planner', 'admin', 'maintenance_planner', 'maintenance_manager', 'plant_manager']), requiresReason: false },
  { fromStatus: 'draft', toStatus: 'requested', allowedRoleSlugs: JSON.stringify(['planner', 'admin', 'maintenance_planner', 'maintenance_manager']), requiresReason: false },
  { fromStatus: 'draft', toStatus: 'approved', allowedRoleSlugs: JSON.stringify(['planner', 'admin', 'maintenance_planner', 'maintenance_manager']), requiresReason: false },
  { fromStatus: 'approved', toStatus: 'planned', allowedRoleSlugs: JSON.stringify(['planner', 'admin', 'maintenance_planner', 'maintenance_manager']), requiresReason: false },
  { fromStatus: 'draft', toStatus: 'assigned', allowedRoleSlugs: JSON.stringify(['planner', 'supervisor', 'admin', 'maintenance_planner', 'maintenance_supervisor', 'maintenance_manager', 'plant_manager']), requiresReason: false },
  { fromStatus: 'requested', toStatus: 'assigned', allowedRoleSlugs: JSON.stringify(['planner', 'supervisor', 'admin', 'maintenance_planner', 'maintenance_supervisor', 'maintenance_manager', 'plant_manager']), requiresReason: false },
  { fromStatus: 'approved', toStatus: 'assigned', allowedRoleSlugs: JSON.stringify(['planner', 'supervisor', 'admin', 'maintenance_planner', 'maintenance_supervisor', 'maintenance_manager', 'plant_manager']), requiresReason: false },
  { fromStatus: 'planned', toStatus: 'assigned', allowedRoleSlugs: JSON.stringify(['planner', 'supervisor', 'admin', 'maintenance_planner', 'maintenance_supervisor', 'maintenance_manager', 'plant_manager']), requiresReason: false },
  { fromStatus: 'assigned', toStatus: 'in_progress', allowedRoleSlugs: JSON.stringify(['technician', 'admin', 'maintenance_technician', 'maintenance_supervisor', 'maintenance_manager']), requiresReason: false },
  { fromStatus: 'in_progress', toStatus: 'waiting_parts', allowedRoleSlugs: JSON.stringify(['technician', 'planner', 'admin', 'maintenance_technician', 'maintenance_planner', 'maintenance_manager']), requiresReason: false },
  { fromStatus: 'in_progress', toStatus: 'completed', allowedRoleSlugs: JSON.stringify(['technician', 'admin', 'maintenance_technician', 'maintenance_supervisor', 'maintenance_manager']), requiresReason: false },
  { fromStatus: 'waiting_parts', toStatus: 'in_progress', allowedRoleSlugs: JSON.stringify(['technician', 'planner', 'admin', 'maintenance_technician', 'maintenance_planner', 'maintenance_manager']), requiresReason: false },
  { fromStatus: 'draft', toStatus: 'cancelled', allowedRoleSlugs: JSON.stringify(['planner', 'admin', 'maintenance_planner', 'maintenance_manager']), requiresReason: true },
  { fromStatus: 'requested', toStatus: 'cancelled', allowedRoleSlugs: JSON.stringify(['planner', 'admin', 'maintenance_planner', 'maintenance_manager']), requiresReason: true },
  { fromStatus: 'approved', toStatus: 'cancelled', allowedRoleSlugs: JSON.stringify(['planner', 'admin', 'maintenance_planner', 'maintenance_manager']), requiresReason: true },
  { fromStatus: 'planned', toStatus: 'cancelled', allowedRoleSlugs: JSON.stringify(['planner', 'admin', 'maintenance_planner', 'maintenance_manager']), requiresReason: true },
  { fromStatus: 'assigned', toStatus: 'cancelled', allowedRoleSlugs: JSON.stringify(['planner', 'supervisor', 'admin', 'maintenance_planner', 'maintenance_supervisor', 'maintenance_manager']), requiresReason: true },
  { fromStatus: 'in_progress', toStatus: 'cancelled', allowedRoleSlugs: JSON.stringify(['supervisor', 'admin', 'maintenance_supervisor', 'maintenance_manager']), requiresReason: true },
  { fromStatus: 'waiting_parts', toStatus: 'cancelled', allowedRoleSlugs: JSON.stringify(['supervisor', 'admin', 'maintenance_supervisor', 'maintenance_manager']), requiresReason: true },
  { fromStatus: 'in_progress', toStatus: 'on_hold', allowedRoleSlugs: JSON.stringify(['supervisor', 'admin', 'maintenance_supervisor', 'maintenance_manager']), requiresReason: true },
  { fromStatus: 'on_hold', toStatus: 'in_progress', allowedRoleSlugs: JSON.stringify(['supervisor', 'admin', 'maintenance_supervisor', 'maintenance_manager']), requiresReason: false },
  { fromStatus: 'on_hold', toStatus: 'cancelled', allowedRoleSlugs: JSON.stringify(['supervisor', 'admin', 'maintenance_supervisor', 'maintenance_manager']), requiresReason: true },
  { fromStatus: 'in_progress', toStatus: 'waiting_tools', allowedRoleSlugs: JSON.stringify(['technician', 'planner', 'admin', 'maintenance_technician', 'maintenance_planner', 'maintenance_manager']), requiresReason: false },
  { fromStatus: 'waiting_tools', toStatus: 'in_progress', allowedRoleSlugs: JSON.stringify(['technician', 'planner', 'admin', 'maintenance_technician', 'maintenance_planner', 'maintenance_manager']), requiresReason: false },
  { fromStatus: 'waiting_tools', toStatus: 'cancelled', allowedRoleSlugs: JSON.stringify(['supervisor', 'admin', 'maintenance_supervisor', 'maintenance_manager']), requiresReason: true },
  { fromStatus: 'in_progress', toStatus: 'waiting_shutdown', allowedRoleSlugs: JSON.stringify(['technician', 'planner', 'admin', 'maintenance_technician', 'maintenance_planner', 'maintenance_manager']), requiresReason: false },
  { fromStatus: 'waiting_shutdown', toStatus: 'in_progress', allowedRoleSlugs: JSON.stringify(['technician', 'planner', 'admin', 'maintenance_technician', 'maintenance_planner', 'maintenance_manager']), requiresReason: false },
  { fromStatus: 'waiting_shutdown', toStatus: 'cancelled', allowedRoleSlugs: JSON.stringify(['supervisor', 'admin', 'maintenance_supervisor', 'maintenance_manager']), requiresReason: true },
  { fromStatus: 'in_progress', toStatus: 'waiting_permit', allowedRoleSlugs: JSON.stringify(['technician', 'planner', 'admin', 'maintenance_technician', 'maintenance_planner', 'maintenance_manager']), requiresReason: false },
  { fromStatus: 'waiting_permit', toStatus: 'in_progress', allowedRoleSlugs: JSON.stringify(['technician', 'planner', 'admin', 'maintenance_technician', 'maintenance_planner', 'maintenance_manager']), requiresReason: false },
  { fromStatus: 'waiting_permit', toStatus: 'cancelled', allowedRoleSlugs: JSON.stringify(['supervisor', 'admin', 'maintenance_supervisor', 'maintenance_manager']), requiresReason: true },
  { fromStatus: 'in_progress', toStatus: 'pending_handover', allowedRoleSlugs: JSON.stringify(['technician', 'planner', 'admin', 'maintenance_technician', 'maintenance_planner', 'maintenance_manager', 'maintenance_supervisor']), requiresReason: false },
  { fromStatus: 'pending_handover', toStatus: 'in_progress', allowedRoleSlugs: JSON.stringify(['technician', 'planner', 'admin', 'maintenance_technician', 'maintenance_planner', 'maintenance_manager']), requiresReason: false },
  { fromStatus: 'pending_handover', toStatus: 'cancelled', allowedRoleSlugs: JSON.stringify(['supervisor', 'admin', 'maintenance_supervisor', 'maintenance_manager']), requiresReason: true },
  { fromStatus: 'completed', toStatus: 'verified', allowedRoleSlugs: JSON.stringify(['supervisor', 'admin', 'maintenance_supervisor', 'maintenance_manager', 'plant_manager']), requiresReason: false },
  { fromStatus: 'verified', toStatus: 'closed', allowedRoleSlugs: JSON.stringify(['planner', 'admin', 'maintenance_planner', 'maintenance_manager', 'plant_manager']), requiresReason: false },
  { fromStatus: 'completed', toStatus: 'in_progress', allowedRoleSlugs: JSON.stringify(['supervisor', 'admin', 'maintenance_supervisor', 'maintenance_manager', 'plant_manager']), requiresReason: true },
  { fromStatus: 'verified', toStatus: 'in_progress', allowedRoleSlugs: JSON.stringify(['supervisor', 'admin', 'maintenance_supervisor', 'maintenance_manager', 'plant_manager']), requiresReason: true },
];

/** Track whether seeding has been attempted this process to avoid repeated attempts */
let _seedAttempted = false;

async function upsertCanonicalTransition(
  tx: PrismaClient,
  entityType: EntityType,
  transition: CanonicalTransition,
  sortOrder: number,
): Promise<void> {
  const updateData = {
    allowedRoleSlugs: transition.allowedRoleSlugs,
    requiresReason: transition.requiresReason,
    sortOrder,
  };

  // `fromStatus = NULL` represents a real initial state. Prisma compound-unique
  // upserts cannot safely use a nullable member, and MySQL UNIQUE indexes also
  // allow multiple NULL values. Preserve NULL semantics explicitly rather than
  // inventing an empty-string sentinel.
  if (transition.fromStatus === null) {
    const existing = await tx.statusTransition.findFirst({
      where: {
        entityType,
        fromStatus: null,
        toStatus: transition.toStatus,
      },
      select: { id: true },
    });

    if (existing) {
      await tx.statusTransition.update({ where: { id: existing.id }, data: updateData });
    } else {
      await tx.statusTransition.create({
        data: {
          entityType,
          fromStatus: null,
          toStatus: transition.toStatus,
          ...updateData,
        },
      });
    }
    return;
  }

  await tx.statusTransition.upsert({
    where: {
      entityType_fromStatus_toStatus: {
        entityType,
        fromStatus: transition.fromStatus,
        toStatus: transition.toStatus,
      },
    },
    update: updateData,
    create: {
      entityType,
      fromStatus: transition.fromStatus,
      toStatus: transition.toStatus,
      ...updateData,
    },
  });
}

/**
 * Seed ALL canonical transitions from the authoritative DEFAULT_*_TRANSITIONS arrays.
 *
 * Non-null transitions use the database compound unique key. Initial transitions
 * preserve `fromStatus = NULL` and use find/update/create because the nullable
 * compound key is not a valid Prisma upsert selector.
 *
 * Accepts an optional Prisma client so both the Next.js runtime (default `db`)
 * and external scripts (their own PrismaClient) can call it.
 */
export async function seedCanonicalTransitions(
  client?: PrismaClient,
): Promise<number> {
  const tx = client ?? db;
  let seeded = 0;

  for (let i = 0; i < DEFAULT_MR_TRANSITIONS.length; i++) {
    await upsertCanonicalTransition(tx, 'maintenance_request', DEFAULT_MR_TRANSITIONS[i], i);
    seeded++;
  }

  for (let i = 0; i < DEFAULT_WO_TRANSITIONS.length; i++) {
    await upsertCanonicalTransition(tx, 'work_order', DEFAULT_WO_TRANSITIONS[i], i);
    seeded++;
  }

  return seeded;
}

/**
 * Ensure the status_transitions table has the required rows.
 * If the table is empty (e.g., after a fresh deploy), auto-seed it.
 * Uses the canonical seedCanonicalTransitions() which is idempotent.
 * Returns true if seeding was performed, false if already populated.
 */
async function ensureTransitionsSeeded(): Promise<boolean> {
  if (_seedAttempted) return false;

  try {
    const count = await db.statusTransition.count();
    if (count > 0) {
      _seedAttempted = true;
      return false;
    }

    console.warn('[state-machine] status_transitions table is empty — auto-seeding default transitions...');

    const seeded = await seedCanonicalTransitions();
    console.warn(`[state-machine] ✅ Auto-seeded ${seeded} default status transitions`);

    _seedAttempted = true;
    return true;
  } catch (err) {
    console.error('[state-machine] ❌ Auto-seed failed:', err);
    _seedAttempted = true; // Don't keep trying
    return false;
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function isCanonicalTransitionPair(
  entityType: EntityType,
  fromStatus: string | null,
  toStatus: string,
): boolean {
  const definitions = entityType === 'work_order'
    ? DEFAULT_WO_TRANSITIONS
    : DEFAULT_MR_TRANSITIONS;

  return definitions.some(
    (transition) => transition.fromStatus === fromStatus && transition.toStatus === toStatus,
  );
}

/**
 * Parse a JSON string array safely.
 * Returns an empty array on failure or non-array input.
 */
function parseRoleSlugs(json: string): string[] {
  try {
    const parsed = JSON.parse(json);
    if (Array.isArray(parsed)) {
      return parsed.filter((v) => typeof v === 'string');
    }
    return [];
  } catch {
    return [];
  }
}

/** Check whether the session has the admin role. */
function isAdmin(session: SessionLike): boolean {
  return session.roles.includes('admin');
}

/** Determine if the session's roles intersect with the allowed role slugs. */
function hasAllowedRole(
  session: SessionLike,
  allowedRoleSlugs: string[],
): boolean {
  if (isAdmin(session)) return true;
  return allowedRoleSlugs.some((slug) => session.roles.includes(slug));
}

function transitionConflictMessage(
  entityType: EntityType,
  entityId: string,
  fromStatus: string,
  toStatus: string,
): string {
  return `Transition conflict for ${entityType} "${entityId}": expected status "${fromStatus}" before moving to "${toStatus}". The record changed concurrently; reload and retry.`;
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Check if a status transition is allowed for a given user.
 */
export async function checkTransition(
  entityType: EntityType,
  fromStatus: string | null,
  toStatus: string,
  session: SessionLike,
  tx?: Prisma.TransactionClient,
): Promise<TransitionCheck> {
  const client = tx ?? db;

  // Persisted transition rows are data, not authority. Old deployments may
  // contain obsolete lifecycle pairs; fail closed unless the pair is present in
  // the canonical definitions shipped with this application version.
  if (!isCanonicalTransitionPair(entityType, fromStatus, toStatus)) {
    return {
      allowed: false,
      reason: `Transition from "${fromStatus ?? 'initial'}" to "${toStatus}" is not part of the canonical ${entityType} lifecycle.`,
    };
  }

  let rule = await client.statusTransition.findFirst({
    where: {
      entityType,
      toStatus,
      fromStatus: fromStatus === null ? null : fromStatus,
    },
  });

  if (!rule) {
    const seeded = await ensureTransitionsSeeded();
    if (seeded) {
      rule = await client.statusTransition.findFirst({
        where: {
          entityType,
          toStatus,
          fromStatus: fromStatus === null ? null : fromStatus,
        },
      });
    }
  }

  if (!rule) {
    const hint = `Database table 'status_transitions' may be empty or missing the required row. ` +
      `Expected: entityType='${entityType}', fromStatus='${fromStatus ?? 'NULL'}', toStatus='${toStatus}'. ` +
      `Run: bun run scripts/seed-transitions.ts`;
    console.error(`[state-machine] No transition rule: entityType=${entityType}, from=${fromStatus ?? 'NULL'}, to=${toStatus} — ${hint}`);
    return {
      allowed: false,
      reason: `No transition rule found from "${fromStatus ?? 'initial'}" to "${toStatus}" for ${entityType}. ${hint}`,
    };
  }

  const allowedRoleSlugs = parseRoleSlugs(rule.allowedRoleSlugs);

  if (!hasAllowedRole(session, allowedRoleSlugs)) {
    console.error(`[state-machine] Role mismatch: userRoles=[${session.roles.join(',')}], required=[${allowedRoleSlugs.join(',')}], entityType=${entityType}, from=${fromStatus}, to=${toStatus}`);
    return {
      allowed: false,
      reason: `Your role (${session.roles.join(', ')}) does not allow this transition. Required roles: ${allowedRoleSlugs.join(', ')}.`,
    };
  }

  return {
    allowed: true,
    reason: undefined,
    transition: {
      fromStatus: rule.fromStatus,
      toStatus: rule.toStatus,
      allowedRoleSlugs,
      requiresReason: rule.requiresReason,
    },
  };
}

/**
 * Execute a validated status transition.
 *
 * The final write is a compare-and-set on the status observed during validation.
 * This is the authoritative concurrency boundary: two Hold/Cancel/Handover/
 * completion/review requests cannot both commit transitions from the same stale
 * state. The loser receives a conflict and its surrounding transaction rolls
 * back any timer/audit side effects.
 */
export async function executeTransition(
  entityType: EntityType,
  entityId: string,
  toStatus: string,
  session: SessionLike,
  options?: {
    reason?: string;
    extraData?: Record<string, unknown>;
    tx?: Prisma.TransactionClient;
  },
): Promise<ExecuteResult> {
  const tx = options?.tx;

  let currentStatus: string | null = null;

  if (entityType === 'work_order') {
    const wo = await (tx ?? db).workOrder.findUnique({
      where: { id: entityId },
      select: { status: true },
    });
    if (!wo) return { success: false, error: `Work order "${entityId}" not found.` };
    currentStatus = wo.status;
  } else {
    const mr = await (tx ?? db).maintenanceRequest.findUnique({
      where: { id: entityId },
      select: { status: true },
    });
    if (!mr) return { success: false, error: `Maintenance request "${entityId}" not found.` };
    currentStatus = mr.status;
  }

  const check = await checkTransition(entityType, currentStatus, toStatus, session, tx);
  if (!check.allowed) {
    return { success: false, error: check.reason };
  }

  if (check.transition?.requiresReason && !options?.reason?.trim()) {
    return {
      success: false,
      error: `This transition from "${currentStatus ?? 'initial'}" to "${toStatus}" requires a reason.`,
    };
  }

  // Both persisted entity models have non-null status columns. A null value here
  // would indicate corrupt/unexpected persistence and must never degrade into an
  // unconditional update.
  if (currentStatus === null) {
    return {
      success: false,
      error: `Cannot execute transition for ${entityType} "${entityId}" because its persisted status is null.`,
    };
  }

  const updatePayload: Record<string, unknown> = {
    status: toStatus,
    ...options?.extraData,
  };

  // Conversion carries the created WO id on the MR row.
  if (entityType === 'maintenance_request' && toStatus === 'converted' && options?.extraData?.workOrderId) {
    updatePayload.workOrderId = options.extraData.workOrderId;
  }

  try {
    if (entityType === 'work_order') {
      const apply = async (client: Prisma.TransactionClient) => {
        const claimed = await client.workOrder.updateMany({
          where: { id: entityId, status: currentStatus },
          data: updatePayload as Prisma.WorkOrderUpdateManyMutationInput,
        });
        if (claimed.count !== 1) {
          throw new Error(transitionConflictMessage(entityType, entityId, currentStatus, toStatus));
        }

        await client.workOrderStatusHistory.create({
          data: {
            workOrderId: entityId,
            fromStatus: currentStatus,
            toStatus,
            performedById: session.userId,
            notes: options?.reason ?? null,
          },
        });
      };

      if (tx) {
        await apply(tx);
      } else {
        await db.$transaction(apply);
      }

      const updated = await (tx ?? db).workOrder.findUnique({ where: { id: entityId } });
      return {
        success: true,
        data: updated as unknown as Record<string, unknown>,
      };
    }

    const apply = async (client: Prisma.TransactionClient) => {
      const claimed = await client.maintenanceRequest.updateMany({
        where: { id: entityId, status: currentStatus },
        data: updatePayload as Prisma.MaintenanceRequestUpdateManyMutationInput,
      });
      if (claimed.count !== 1) {
        throw new Error(transitionConflictMessage(entityType, entityId, currentStatus, toStatus));
      }

      await client.maintenanceRequestComment.create({
        data: {
          maintenanceRequestId: entityId,
          userId: session.userId,
          content: `[Status Change] ${currentStatus} → ${toStatus}${
            options?.reason ? ` | Reason: ${options.reason}` : ''
          }`,
        },
      });
    };

    if (tx) {
      await apply(tx);
    } else {
      await db.$transaction(apply);
    }

    const updated = await (tx ?? db).maintenanceRequest.findUnique({
      where: { id: entityId },
    });
    return {
      success: true,
      data: updated as unknown as Record<string, unknown>,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, error: `Failed to execute transition: ${message}` };
  }
}

/** Get all valid transitions available from a given status for a user. */
export async function getAvailableTransitions(
  entityType: EntityType,
  currentStatus: string | null,
  session: SessionLike,
): Promise<AvailableTransition[]> {
  await ensureTransitionsSeeded();

  const rules = await db.statusTransition.findMany({
    where: {
      entityType,
      fromStatus: currentStatus === null ? null : currentStatus,
    },
    orderBy: { sortOrder: 'asc' },
  });

  const admin = isAdmin(session);

  return rules
    .map((rule) => ({
      fromStatus: rule.fromStatus,
      toStatus: rule.toStatus,
      allowedRoleSlugs: parseRoleSlugs(rule.allowedRoleSlugs),
      requiresReason: rule.requiresReason,
    }))
    .filter((transition) => isCanonicalTransitionPair(
      entityType,
      transition.fromStatus,
      transition.toStatus,
    ))
    .filter((transition) => {
      if (admin) return true;
      return transition.allowedRoleSlugs.some((slug) => session.roles.includes(slug));
    });
}
