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
  const technicianPanels = read('src/components/modules/TechnicianWorkOrderV11Panels.tsx');

  it('persists planner-selected materials as recommendations during MR conversion', () => {
    expect(maintenanceUi).toContain(
      'requiredParts: inventoryEnabled && convertForm.requiredParts.length > 0 ? convertForm.requiredParts : undefined',
    );
    expect(planningService).toContain('await tx.workOrderMaterial.create({');
    expect(planningService).toContain('suggestedParts: JSON.stringify(suggestedParts)');
    expect(planningService).toContain('recommendedById: session.userId');
    expect(planningService).not.toContain('repairMaterialRequest.create');
    expect(planningService).not.toContain('repairToolRequest.create');
    expect(planningService).not.toContain('repairToolRequestItem.create');
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

  it('keeps planner-selected tools visible when canonical tool requests are missing', () => {
    expect(planningService).toContain('suggestedTools: JSON.stringify(suggestedTools)');
    expect(woDetailApi).toContain('const actualToolRequests');
    expect(woDetailApi).toContain('const projectedToolRequests');
    expect(woDetailApi).toContain("JSON.parse(wo.suggestedTools || '[]')");
    expect(woDetailApi).toContain("source: 'planner_suggested'");
    expect(woDetailApi).toContain('...projectedToolRequests');
  });

  it('reconciles suggested tools from request headers and request items', () => {
    expect(suggestedItemsApi).toContain('const reconciledTools = new Map');
    expect(suggestedItemsApi).toContain('for (const item of request.items)');
    expect(suggestedItemsApi).toContain('for (const request of wo.repairToolRequests)');
    expect(suggestedItemsApi).toContain('tr.items.some((item) => item.toolId === t.toolId)');
    expect(suggestedItemsApi).toContain('suggestedTools = toolResourcesOperational');
  });

  it('keeps technician WO resource lookups scoped and projects planner-tool snapshots', () => {
    expect(technicianPanels).toContain("'/api/inventory?mode=lookup&limit=100'");
    expect(technicianPanels).toContain('/api/work-orders/${workOrderId}/tool-options');
    expect(technicianPanels).not.toContain("api.get<InventoryOption[]>('/api/inventory')");
    expect(technicianPanels).not.toContain('/api/tools?mode=lookup&status=available&limit=100');
    expect(technicianPanels).toContain('const plannerToolSnapshot = (() => {');
    expect(technicianPanels).toContain('const projectedPlannerToolRequests = plannerToolSnapshot');
    expect(technicianPanels).toContain('const toolRequests = [...canonicalToolRequests, ...projectedPlannerToolRequests]');
  });

  it('creates approval requests only when assigned execution staff submit recommendations', () => {
    expect(suggestedItemsApi).toContain("action === 'submit_recommendations'");
    expect(suggestedItemsApi).toContain('Only assigned execution staff can submit recommended resources for approval');
    expect(suggestedItemsApi).toContain("source: 'technician_from_planner_recommendation'");
    expect(suggestedItemsApi).toContain('requestedById: session.userId');
    expect(suggestedItemsApi).toContain('const requestedToolIds = new Set<string>()');
    expect(suggestedItemsApi).toContain('for (const item of request.items)');
    expect(suggestedItemsApi).toContain('await tx.repairToolRequest.create({');
    expect(suggestedItemsApi).toContain('await tx.repairToolRequestItem.create({');
    expect(suggestedItemsApi).toContain('await tx.repairMaterialRequest.create({');
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
