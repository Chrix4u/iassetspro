import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { isAdmin, type SessionData } from '@/lib/auth';

// ============================================================================
// PLANT SCOPING — Multi-Plant Data Isolation
// ============================================================================

export interface PlantScopeResult {
  /** Explicitly selected plant ID from X-Plant-ID header (null if not selected) */
  plantId: string | null;
  /** All plants this user has access to via UserPlant assignments */
  accessiblePlantIds: string[];
  /** Whether an explicit plant was selected via X-Plant-ID header */
  isScoped: boolean;
  /** When true, the caller should return 403 Forbidden */
  denyAccess?: boolean;
  /** When true, user is system-wide (admin/plant_manager) — sees all plants */
  isSystemWide: boolean;
  /** Access level for the selected plant (null if not scoped or system-wide) */
  accessLevel: 'read' | 'write' | 'admin' | 'none' | null;
}

/**
 * Resolve plant scope from the request headers and user session.
 *
 * Semantic model:
 * - System admin / plant_manager WITHOUT X-Plant-ID → isSystemWide=true, no filter applied.
 * - System admin / plant_manager WITH X-Plant-ID → explicitly narrowed to that plant.
 *
 * - Regular user WITH valid X-Plant-ID:
 *     → isScoped=true, plantId=that plant, filter exact plant.
 *
 * - Regular user WITH invalid (unauthorized) X-Plant-ID:
 *     → denyAccess=true, caller must return 403.
 *
 * - Regular user WITHOUT X-Plant-ID:
 *     → isScoped=false, accessiblePlantIds=ALL user's assigned plants.
 *     → List APIs MUST filter: plantId IN accessiblePlantIds
 *     → Direct-ID APIs MUST check entity.plantId belongs to accessiblePlantIds
 *     → NEVER treat "no plant selected" as unrestricted database access.
 *
 * @param request — NextRequest (reads X-Plant-ID header)
 * @param session — Validated session from getSession()
 */
export async function getPlantScope(
  request: NextRequest,
  session: SessionData,
): Promise<PlantScopeResult> {
  const plantIdHeader = request.headers.get('X-Plant-ID');

  // Admin and plant_manager actors are system-wide when no plant is selected.
  // When the UI deliberately sends X-Plant-ID, honor that narrower context so
  // list pages, dashboards and reports reflect the plant the actor selected.
  // A privileged actor may select any plant; the explicit filter itself remains
  // fail-safe because it can only narrow the query, never widen it.
  if (isAdmin(session) || session.roles.includes('plant_manager')) {
    if (plantIdHeader) {
      return {
        plantId: plantIdHeader,
        accessiblePlantIds: [plantIdHeader],
        isScoped: true,
        isSystemWide: false,
        accessLevel: 'admin',
      };
    }
    return {
      plantId: null,
      accessiblePlantIds: [],
      isScoped: false,
      isSystemWide: true,
      accessLevel: null,
    };
  }

  // Load the user's plant assignments (cache per-request is handled by DB pool)
  const userPlants = await db.userPlant.findMany({
    where: { userId: session.userId },
    select: { plantId: true, accessLevel: true },
  });

  const accessiblePlantIds = userPlants.map((up) => up.plantId);

  // No explicit plant selected — return all accessible plants
  if (!plantIdHeader) {
    return {
      plantId: null,
      accessiblePlantIds,
      isScoped: false,
      isSystemWide: false,
      accessLevel: null,
    };
  }

  // Explicit plant selected — validate user has access
  const matchedPlant = userPlants.find((up) => up.plantId === plantIdHeader);

  if (!matchedPlant) {
    // FAIL-CLOSED: User explicitly requested a plant they don't have access to.
    return {
      plantId: null,
      accessiblePlantIds,
      isScoped: true,
      denyAccess: true,
      isSystemWide: false,
      accessLevel: 'none',
    };
  }

  return {
    plantId: matchedPlant.plantId,
    accessiblePlantIds,
    isScoped: true,
    isSystemWide: false,
    accessLevel: matchedPlant.accessLevel as 'read' | 'write' | 'admin',
  };
}

// Sentinel value that will never match any real plant ID in the database.
// Used to produce an empty result set when access is denied.
const DENY_ACCESS_SENTINEL = '__ACCESS_DENIED__';

/**
 * Check whether a given plantId belongs to the user's accessible set.
 * Returns true if the user should be allowed to access that plant.
 * System-wide users always return true.
 */
export function canAccessPlant(
  plantScope: PlantScopeResult,
  entityPlantId: string | null | undefined,
): boolean {
  if (plantScope.isSystemWide) return true;
  if (!entityPlantId) return true; // entity has no plant — not plant-scoped
  if (plantScope.denyAccess) return false;
  return plantScope.accessiblePlantIds.includes(entityPlantId);
}

/**
 * Strict plant access check for operational entities that MUST have a plant.
 *
 * Unlike canAccessPlant (which returns true for null entityPlantId),
 * this function returns false for null entityPlantId unless the user is
 * system-wide (admin/plant_manager).
 *
 * Use this for Repairs operational records (WO, MR, Material Request,
 * Tool Request) where plantId=null represents a data integrity issue,
 * not a "no plant scoping needed" situation.
 */
export function canAccessPlantStrict(
  plantScope: PlantScopeResult,
  entityPlantId: string | null | undefined,
): boolean {
  if (plantScope.isSystemWide) return true;
  if (!entityPlantId) return false; // operational entity MUST have a plant
  if (plantScope.denyAccess) return false;
  return plantScope.accessiblePlantIds.includes(entityPlantId);
}

/**
 * Returns a Prisma-compatible where clause fragment for plant filtering.
 *
 * - When `denyAccess` is true, returns a never-matching filter.
 * - When plant scoping is active (`isScoped && plantId`), returns `{ plantId: "..." }`.
 * - When not scoped but user has accessible plants, returns `{ plantId: { in: [...] } }`.
 * - System-wide: returns empty `{}` (no filter).
 *
 * @param plantScope — Result from getPlantScope()
 * @param plantIdField — The model field name (default: 'plantId')
 */
export function getPlantFilterWhere(
  plantScope: PlantScopeResult,
  plantIdField: string = 'plantId',
): Record<string, unknown> {
  // Fail-closed: if access is denied, produce a filter that matches nothing
  if (plantScope.denyAccess) {
    return { [plantIdField]: DENY_ACCESS_SENTINEL };
  }

  // System-wide: no filter
  if (plantScope.isSystemWide) {
    return {};
  }

  // Explicit plant selected
  if (plantScope.isScoped && plantScope.plantId) {
    return { [plantIdField]: plantScope.plantId };
  }

  // No explicit plant selected, but user has accessible plants
  // CRITICAL: filter to ONLY the user's assigned plants
  if (plantScope.accessiblePlantIds.length > 0) {
    return { [plantIdField]: { in: plantScope.accessiblePlantIds } };
  }

  // User has NO plant assignments at all — return nothing
  return { [plantIdField]: DENY_ACCESS_SENTINEL };
}

/**
 * Apply a plant filter to an existing where clause.
 *
 * SECURITY CONTRACT: this function mutates the supplied object AND returns it.
 * This is intentional and fail-safe: callers that use the return value and older
 * callers that invoke `applyPlantScope(where, scope)` for its side effect both
 * receive the same enforced plant constraint. Ignoring the return value must never
 * silently turn a plant-scoped query into an unrestricted query.
 *
 * If `plantScope.denyAccess` is true, the applied filter never matches any rows.
 * Callers that want an explicit 403 should still check `plantScope.denyAccess` first.
 *
 * @param where — Existing Prisma where clause
 * @param plantScope — Result from getPlantScope()
 * @param plantIdField — The model field name (default: 'plantId')
 */
export function applyPlantScope<T extends Record<string, unknown>>(
  where: T,
  plantScope: PlantScopeResult,
  plantIdField: string = 'plantId',
): T {
  const plantFilter = getPlantFilterWhere(plantScope, plantIdField);
  if (Object.keys(plantFilter).length === 0) {
    return where;
  }
  Object.assign(where, plantFilter);
  return where;
}