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

  it('sends planner-selected materials during MR conversion', () => {
    expect(maintenanceUi).toContain(
      'requiredParts: inventoryEnabled && convertForm.requiredParts.length > 0 ? convertForm.requiredParts : undefined',
    );
    expect(planningService).toContain('await tx.workOrderMaterial.create({');
    expect(planningService).toContain('await tx.repairMaterialRequest.create({');
    expect(planningService).toContain("source: 'planner_suggested'");
    expect(planningService).toContain('suggestedParts: JSON.stringify(suggestedParts)');
  });

  it('keeps server-side WO details resilient to partial legacy conversion records', () => {
    expect(woDetailApi).toContain('const actualMaterialRequests');
    expect(woDetailApi).toContain('const projectedMaterialRequests');
    expect(woDetailApi).toContain("material.status !== 'planned'");
    expect(woDetailApi).toContain("source: 'planner_suggested'");
    expect(woDetailApi).toContain('projectionOnly: true');
    expect(woDetailApi).toContain('...projectedMaterialRequests');
  });

  it('reconciles suggested materials from all durable server representations', () => {
    expect(suggestedItemsApi).toContain('const reconciledParts = new Map');
    expect(suggestedItemsApi).toContain('for (const material of wo.materials)');
    expect(suggestedItemsApi).toContain('for (const request of wo.repairMaterialRequests)');
    expect(suggestedItemsApi).toContain('suggestedParts = inventoryResourcesOperational ? [...reconciledParts.values()] : []');
  });

  it('hydrates planner materials from the main WO payload before auxiliary requests finish', () => {
    expect(maintenanceUi).toContain('const hydrateSuggestedResourcesFromWO = useCallback');
    expect(maintenanceUi).toContain('for (const part of parseSnapshot(workOrder?.suggestedParts))');
    expect(maintenanceUi).toContain('for (const material of Array.isArray(workOrder?.materials)');
    expect(maintenanceUi).toContain('for (const request of Array.isArray(workOrder?.repairMaterialRequests)');
    expect(maintenanceUi).toContain("request.source !== 'planner_suggested'");
    expect(maintenanceUi).toContain('hydrateSuggestedResourcesFromWO(res.data)');
  });

  it('merges auxiliary suggested-item results instead of erasing durable planner materials', () => {
    expect(maintenanceUi).toContain('const mergeSuggestedResourceRows = useCallback');
    expect(maintenanceUi).toContain("mergeSuggestedResourceRows(current, incomingParts, 'itemId')");
    expect(maintenanceUi).toContain("mergeSuggestedResourceRows(current, incomingTools, 'toolId')");
    expect(maintenanceUi).toContain('incomingParts.length > 0');
    expect(maintenanceUi).toContain('incomingTools.length > 0');
    expect(maintenanceUi).not.toContain(
      'setSuggestedParts(materialResourcesEnabled ? (res.data.suggestedParts || []) : [])',
    );
  });
});
