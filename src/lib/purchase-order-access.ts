import type { Prisma } from '@prisma/client';
import { canAccessPlantStrict, getPlantFilterWhere, type PlantScopeResult } from '@/lib/plant-scope';

type PurchaseOrderPlantLine = { item: { plantId: string } };

export function canAccessPurchaseOrderLines(
  plantScope: PlantScopeResult,
  items: PurchaseOrderPlantLine[],
): boolean {
  return items.length > 0 && items.every((line) => canAccessPlantStrict(plantScope, line.item.plantId));
}

export function purchaseOrderPlantWhere(plantScope: PlantScopeResult): Prisma.PurchaseOrderWhereInput {
  if (plantScope.isSystemWide && !plantScope.isScoped) return {};
  const itemPlantWhere = getPlantFilterWhere(plantScope) as Prisma.InventoryItemWhereInput;
  return {
    items: {
      some: { item: itemPlantWhere },
      every: { item: itemPlantWhere },
    },
  };
}
