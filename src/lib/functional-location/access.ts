import type { Prisma } from '@prisma/client';
import { canAccessPlant, type PlantScopeResult } from '@/lib/plant-scope';

/**
 * Functional-location trees may contain installation-wide/global ancestors
 * (Company, Site groupings, etc.) as well as plant-scoped descendants.
 *
 * Regular users may see global ancestors plus nodes for plants they can access.
 * A regular user with no plant assignments therefore sees global nodes only —
 * never an unrestricted functional-location query.
 */
export function getFunctionalLocationPlantWhere(
  plantScope: PlantScopeResult,
): Prisma.FunctionalLocationWhereInput {
  if (plantScope.denyAccess) {
    return { id: '__ACCESS_DENIED__' };
  }

  if (plantScope.isSystemWide) {
    return {};
  }

  if (plantScope.isScoped && plantScope.plantId) {
    return {
      OR: [
        { plantId: null },
        { plantId: plantScope.plantId },
      ],
    };
  }

  if (plantScope.accessiblePlantIds.length > 0) {
    return {
      OR: [
        { plantId: null },
        { plantId: { in: plantScope.accessiblePlantIds } },
      ],
    };
  }

  return { plantId: null };
}

/**
 * Global functional-location mutations are configuration-level operations and
 * require a system-wide actor. Plant-scoped nodes may be mutated only when the
 * actor can access that plant.
 */
export function canMutateFunctionalLocationForScope(
  plantScope: PlantScopeResult,
  plantId: string | null | undefined,
): boolean {
  if (plantScope.denyAccess) return false;
  if (!plantId) return plantScope.isSystemWide;
  return canAccessPlant(plantScope, plantId);
}
