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

  it('keeps the existing canonical MR conversion persistence contract', () => {
    expect(planningService).toContain('await tx.workOrderMaterial.create({');
    expect(planningService).toContain('await tx.repairMaterialRequest.create({');
    expect(planningService).toContain("source: 'planner_suggested'");
    expect(planningService).toContain('suggestedParts: JSON.stringify(suggestedParts)');
  });

  it('keeps server recovery from all durable planner-material representations', () => {
    expect(suggestedItemsApi).toContain('const reconciledParts = new Map');
    expect(suggestedItemsApi).toContain('for (const material of wo.materials)');
    expect(suggestedItemsApi).toContain('for (const request of wo.repairMaterialRequests)');
    expect(suggestedItemsApi).toContain('suggestedParts = [...reconciledParts.values()]');
    expect(woDetailApi).toContain('const projectedMaterialRequests');
    expect(woDetailApi).toContain('projectionOnly: true');
  });

  it('hydrates the client from the durable WO payload before auxiliary enrichment', () => {
    expect(maintenanceUi).toContain('const hydrateSuggestedResourcesFromWO = useCallback');
    expect(maintenanceUi).toContain('hydrateSuggestedResourcesFromWO(res.data)');
    expect(maintenanceUi).toContain(
      '}, [materialResourcesEnabled, toolResourcesEnabled]);',
    );
  });

  it('never lets an empty auxiliary response erase an enabled material or tool', () => {
    expect(maintenanceUi).toContain(
      'else if (incomingParts.length > 0) {\n          setSuggestedParts(incomingParts);',
    );
    expect(maintenanceUi).toContain(
      'else if (incomingTools.length > 0) {\n          setSuggestedTools(incomingTools);',
    );
    expect(maintenanceUi).not.toContain(
      'setSuggestedParts(materialResourcesEnabled ? (res.data.suggestedParts || []) : [])',
    );
    expect(maintenanceUi).not.toContain(
      'setSuggestedTools(toolResourcesEnabled ? (res.data.suggestedTools || []) : [])',
    );
  });

  it('does not resurrect rejected planner resources from older snapshots', () => {
    expect(maintenanceUi).toContain('const rejectedPartIds = new Set(');
    expect(maintenanceUi).toContain('rejectedPartIds.has(String(part.itemId))');
    expect(maintenanceUi).toContain('rejectedPartIds.has(String(material.itemId))');
    expect(maintenanceUi).toContain('const rejectedToolIds = new Set(');
    expect(maintenanceUi).toContain('rejectedToolIds.has(String(tool.toolId))');
  });

  it('still clears resource UI immediately when its licensed module is unavailable', () => {
    expect(maintenanceUi).toContain('if (!materialResourcesEnabled) {');
    expect(maintenanceUi).toContain('setSuggestedParts([]);');
    expect(maintenanceUi).toContain('if (!toolResourcesEnabled) {');
    expect(maintenanceUi).toContain('setSuggestedTools([]);');
    expect(maintenanceUi).toContain(
      'if (!materialResourcesEnabled && !toolResourcesEnabled)',
    );
    expect(maintenanceUi).toContain(
      '}, [materialResourcesEnabled, toolResourcesEnabled]);',
    );
  });
});
