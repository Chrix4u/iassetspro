import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { canAccessPlantStrict, type PlantScopeResult } from '@/lib/plant-scope';

const DENY_ACCESS_SENTINEL = '__ACCESS_DENIED__';

type ChecklistTargetValidation =
  | { ok: true }
  | { ok: false; status: 400 | 403; error: string };

function effectivePlantIds(scope: PlantScopeResult): string[] {
  if (scope.isSystemWide) return [];
  if (scope.isScoped && scope.plantId) return [scope.plantId];
  return scope.accessiblePlantIds;
}

/**
 * Checklist records do not have a direct plantId relation, so visibility must
 * be derived from their optional asset/department targets. Unscoped checklists
 * (no asset and no department) are global reference checklists and remain
 * visible to callers who hold pm_checklists.view.
 */
export async function buildChecklistScopeWhere(scope: PlantScopeResult): Promise<Prisma.ChecklistWhereInput> {
  if (scope.denyAccess) return { id: DENY_ACCESS_SENTINEL };
  if (scope.isSystemWide) return {};

  const plantIds = effectivePlantIds(scope);
  if (plantIds.length === 0) {
    return {
      OR: [
        { assetId: null, departmentId: null },
      ],
    };
  }

  const [assets, departments] = await Promise.all([
    db.asset.findMany({
      where: { plantId: { in: plantIds } },
      select: { id: true },
    }),
    db.department.findMany({
      where: { plantId: { in: plantIds } },
      select: { id: true },
    }),
  ]);

  const assetIds = assets.map((asset) => asset.id);
  const departmentIds = departments.map((department) => department.id);

  return {
    OR: [
      { assetId: { in: assetIds.length > 0 ? assetIds : [DENY_ACCESS_SENTINEL] } },
      {
        assetId: null,
        departmentId: {
          in: departmentIds.length > 0 ? departmentIds : [DENY_ACCESS_SENTINEL],
        },
      },
      { assetId: null, departmentId: null },
    ],
  };
}

/** Validate create/update targets and enforce that an asset + department pair belongs to one plant. */
export async function validateChecklistTargets(
  scope: PlantScopeResult,
  assetId: string | null,
  departmentId: string | null,
): Promise<ChecklistTargetValidation> {
  const [asset, department] = await Promise.all([
    assetId
      ? db.asset.findUnique({ where: { id: assetId }, select: { id: true, plantId: true } })
      : Promise.resolve(null),
    departmentId
      ? db.department.findUnique({ where: { id: departmentId }, select: { id: true, plantId: true } })
      : Promise.resolve(null),
  ]);

  if (assetId && !asset) return { ok: false, status: 400, error: 'Asset not found' };
  if (departmentId && !department) return { ok: false, status: 400, error: 'Department not found' };

  if (asset && !canAccessPlantStrict(scope, asset.plantId)) {
    return { ok: false, status: 403, error: 'Asset plant access denied' };
  }
  if (department && !canAccessPlantStrict(scope, department.plantId)) {
    return { ok: false, status: 403, error: 'Department plant access denied' };
  }
  if (asset && department && asset.plantId !== department.plantId) {
    return { ok: false, status: 400, error: 'Asset and department must belong to the same plant' };
  }

  return { ok: true };
}

/** Direct-ID access check for an already persisted checklist. */
export async function canAccessChecklistTargets(
  scope: PlantScopeResult,
  checklist: { assetId: string | null; departmentId: string | null },
): Promise<boolean> {
  if (scope.denyAccess) return false;
  if (scope.isSystemWide) return true;
  if (!checklist.assetId && !checklist.departmentId) return true;

  const validation = await validateChecklistTargets(scope, checklist.assetId, checklist.departmentId);
  return validation.ok;
}
