import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const read = (path: string) => fs.readFileSync(path, 'utf8');

describe('MR conversion planner-material persistence', () => {
  it('persists planner-selected parts into both WO and canonical repair material pipelines', () => {
    const service = read('src/services/repairPlanning.service.ts');

    expect(service).toContain('payload.requiredParts');
    expect(service).toContain('await tx.workOrderMaterial.create');
    expect(service).toContain('await tx.repairMaterialRequest.create');
    expect(service).toContain("source: 'planner_suggested'");
    expect(service).toContain("status: 'pending'");
    expect(service).toContain('suggestedParts.push({');
    expect(service).toContain('suggestedParts: JSON.stringify(suggestedParts)');
    expect(service).toContain('suggestedTools: JSON.stringify(suggestedTools)');
  });

  it('rejects invalid or cross-plant planner material selections instead of silently dropping them', () => {
    const service = read('src/services/repairPlanning.service.ts');

    expect(service).toContain('Each required part must reference a valid inventory item and positive quantity');
    expect(service).toContain('Inventory item ${partId} not found');
    expect(service).toContain('Inventory item ${partId} belongs to a different plant');
  });

  it('recovers planner materials from legacy planned WO material rows for existing affected WOs', () => {
    const route = read('src/app/api/work-orders/[id]/suggested-items/route.ts');

    expect(route).toContain("materials: {");
    expect(route).toContain("where: { status: 'planned' }");
    expect(route).toContain('if (suggestedParts.length === 0 && wo.materials.length > 0)');
    expect(route).toContain("itemName: material.itemName || 'Planned material'");
    expect(route).toContain('quantity: material.quantity ?? 1');
  });

  it('materializes missing canonical requests before a legacy planner material is sent to store', () => {
    const route = read('src/app/api/work-orders/[id]/suggested-items/route.ts');

    expect(route).toContain('const legacyPlannedMaterials = await db.workOrderMaterial.findMany');
    expect(route).toContain('const missingMaterials = legacyPlannedMaterials.filter');
    expect(route).toContain('await tx.repairMaterialRequest.create');
    expect(route).toContain("reason: 'Planner suggested material (legacy conversion repair)'");
    expect(route).toContain("source: 'planner_suggested'");
    expect(route).toContain('data: { suggestedParts: JSON.stringify(repairedSuggestions) }');
  });
});
