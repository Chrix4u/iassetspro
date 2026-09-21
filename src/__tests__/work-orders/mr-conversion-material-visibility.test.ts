import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

function read(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

describe('MR → WO planner material handoff', () => {
  const maintenanceUi = read('src/components/modules/MaintenancePages.tsx');
  const planningService = read('src/services/repairPlanning.service.ts');
  const woDetailApi = read('src/app/api/work-orders/[id]/route.ts');
  const suggestedItemsApi = read('src/app/api/work-orders/[id]/suggested-items/route.ts');

  it('sends planner-selected parts in the MR conversion payload', () => {
    expect(maintenanceUi).toContain(
      "requiredParts: convertForm.requiredParts.length > 0 ? convertForm.requiredParts : undefined",
    );
    expect(maintenanceUi).toContain(
      "arr.push({ itemId: id, quantity: 1 })",
    );
  });

  it('persists each planner-selected material in both canonical WO representations', () => {
    expect(planningService).toContain('await tx.workOrderMaterial.create({');
    expect(planningService).toContain("status: 'planned'");
    expect(planningService).toContain('await tx.repairMaterialRequest.create({');
    expect(planningService).toContain("source: 'planner_suggested'");
    expect(planningService).toContain('suggestedParts.push({');
    expect(planningService).toContain('suggestedParts: JSON.stringify(suggestedParts)');
  });

  it('reconciles suggested materials from snapshots, WO materials, and material requests', () => {
    expect(suggestedItemsApi).toContain('const reconciledParts = new Map');
    expect(suggestedItemsApi).toContain('for (const material of wo.materials)');
    expect(suggestedItemsApi).toContain('for (const request of wo.repairMaterialRequests)');
    expect(suggestedItemsApi).toContain('suggestedParts = [...reconciledParts.values()]');
    expect(suggestedItemsApi).toContain("request.status === 'rejected'");
  });

  it('projects legacy planned materials onto WO details instead of hiding them', () => {
    expect(woDetailApi).toContain('const projectedMaterialRequests');
    expect(woDetailApi).toContain("material.status !== 'planned'");
    expect(woDetailApi).toContain("status: 'planned'");
    expect(woDetailApi).toContain('projectionOnly: true');
    expect(woDetailApi).toContain('...projectedMaterialRequests');
  });

  it('hydrates resource UI from the durable WO payload before auxiliary enrichment', () => {
    expect(maintenanceUi).toContain('const hydrateSuggestedResourcesFromWO = useCallback');
    expect(maintenanceUi).toContain('hydrateSuggestedResourcesFromWO(res.data)');
    expect(maintenanceUi).toContain('if (incomingParts.length > 0) setSuggestedParts(incomingParts)');
    expect(maintenanceUi).toContain('if (incomingTools.length > 0) setSuggestedTools(incomingTools)');
    expect(maintenanceUi).not.toContain('setSuggestedParts(res.data.suggestedParts || [])');
    expect(maintenanceUi).not.toContain('setSuggestedTools(res.data.suggestedTools || [])');
  });

  it('renders projected planner materials safely without fake request actions', () => {
    expect(maintenanceUi).toContain("mr.status === 'planned'");
    expect(maintenanceUi).toContain('mr.projectionOnly');
    expect(maintenanceUi).toContain('Planner-selected during MR conversion');
    expect(maintenanceUi).toContain("request: any) => !request.projectionOnly");
  });
});
