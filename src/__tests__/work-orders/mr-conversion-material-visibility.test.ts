import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

function read(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

describe('MR → WO planner material visibility', () => {
  const maintenanceUi = read('src/components/modules/MaintenancePages.tsx');
  const planningService = read('src/services/repairPlanning.service.ts');
  const woDetailApi = read('src/app/api/work-orders/[id]/route.ts');
  const suggestedItemsApi = read('src/app/api/work-orders/[id]/suggested-items/route.ts');

  it('sends planner-selected inventory parts in the conversion payload when Inventory is operational', () => {
    expect(maintenanceUi).toContain(
      "requiredParts: inventoryEnabled && convertForm.requiredParts.length > 0 ? convertForm.requiredParts : undefined",
    );
    expect(maintenanceUi).toContain(
      "arr.push({ itemId: id, quantity: 1 })",
    );
  });

  it('persists selected material in canonical WO material/request/snapshot representations', () => {
    expect(planningService).toContain('await tx.workOrderMaterial.create({');
    expect(planningService).toContain("status: 'planned'");
    expect(planningService).toContain('await tx.repairMaterialRequest.create({');
    expect(planningService).toContain("source: 'planner_suggested'");
    expect(planningService).toContain('suggestedParts.push({');
    expect(planningService).toContain('suggestedParts: JSON.stringify(suggestedParts)');
  });

  it('reconciles planner material from durable sources in the suggested-items endpoint', () => {
    expect(suggestedItemsApi).toContain('const reconciledParts = new Map');
    expect(suggestedItemsApi).toContain('for (const material of wo.materials)');
    expect(suggestedItemsApi).toContain('for (const request of wo.repairMaterialRequests)');
    expect(suggestedItemsApi).toContain('suggestedParts = inventoryResourcesOperational ? [...reconciledParts.values()] : []');
  });

  it('projects planned material into WO details when a canonical request row is missing', () => {
    expect(woDetailApi).toContain('const projectedMaterialRequests');
    expect(woDetailApi).toContain("material.status !== 'planned'");
    expect(woDetailApi).toContain("status: 'planned'");
    expect(woDetailApi).toContain('projectionOnly: true');
    expect(woDetailApi).toContain('...projectedMaterialRequests');
  });

  it('hydrates planner-selected materials from the main WO payload before auxiliary refresh', () => {
    expect(maintenanceUi).toContain('const hydrateSuggestedResourcesFromWO = useCallback');
    expect(maintenanceUi).toContain('for (const material of Array.isArray(workOrder?.materials) ? workOrder.materials : [])');
    expect(maintenanceUi).toContain('for (const request of Array.isArray(workOrder?.repairMaterialRequests) ? workOrder.repairMaterialRequests : [])');
    expect(maintenanceUi).toContain('hydrateSuggestedResourcesFromWO(res.data)');
    expect(maintenanceUi).toContain('setSuggestedParts([...partMap.values()])');
  });

  it('does not erase durable material state when the auxiliary suggested-items response is empty', () => {
    expect(maintenanceUi).toContain('const incomingParts = Array.isArray(res.data.suggestedParts) ? res.data.suggestedParts : []');
    expect(maintenanceUi).toContain('} else if (incomingParts.length > 0) {');
    expect(maintenanceUi).toContain('setSuggestedParts(incomingParts)');
    expect(maintenanceUi).not.toContain(
      'setSuggestedParts(materialResourcesEnabled ? (res.data.suggestedParts || []) : [])',
    );
  });
});
