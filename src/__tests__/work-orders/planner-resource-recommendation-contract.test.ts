import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

describe('planner resource recommendation workflow contract', () => {
  const planning = read('src/services/repairPlanning.service.ts');
  const suggested = read('src/app/api/work-orders/[id]/suggested-items/route.ts');
  const workOrder = read('src/app/api/work-orders/[id]/route.ts');
  const ui = read('src/components/modules/MaintenancePages.tsx');

  it('persists planner choices as recommendations instead of approval requests', () => {
    expect(planning).toContain('suggestedParts: JSON.stringify(suggestedParts)');
    expect(planning).toContain('suggestedTools: JSON.stringify(suggestedTools)');
    expect(planning).toContain('recommendedById: session.userId');
    expect(planning).toContain('recommendedAt: now.toISOString()');
    expect(planning).not.toContain('repairMaterialRequest.create');
    expect(planning).not.toContain('repairToolRequest.create');
    expect(planning).not.toContain('repairToolRequestItem.create');
  });

  it('requires the real assigned execution actor to submit recommendations', () => {
    expect(suggested).toContain('const isExecutionActor');
    expect(suggested).toContain('wo.assignedTo === session.userId');
    expect(suggested).toContain('wo.teamLeaderId === session.userId');
    expect(suggested).toContain('wo.teamMembers.some((member) => member.userId === session.userId)');
    expect(suggested).toContain('Only assigned execution staff can submit recommended resources for approval');
    expect(suggested).toContain("action === 'submit_recommendations'");
  });

  it('attributes submitted requests to the execution actor and preserves legacy history', () => {
    expect(suggested).toContain("source: 'technician_from_planner_recommendation'");
    expect(suggested).toContain('requestedById: session.userId');
    expect(suggested).toContain("status: { notIn: ['pending', 'rejected'] }");
    expect(suggested).toContain('Superseded when');
    expect(suggested).toContain('const requestedToolIds = new Set<string>()');
    expect(suggested).toContain('for (const item of request.items)');
  });

  it('keeps module licensing fail-closed around resource operations', () => {
    expect(suggested).toContain('getUnavailableOperationalModules');
    expect(suggested).toContain("unavailableModules.has('repairs')");
    expect(suggested).toContain('inventoryResourcesOperational');
    expect(suggested).toContain('toolResourcesOperational');
  });

  it('keeps planner snapshots durable on work-order detail views', () => {
    expect(workOrder).toContain('const projectedMaterialRequests');
    expect(workOrder).toContain('const projectedToolRequests');
    expect(workOrder).toContain("source: 'planner_suggested'");
    expect(workOrder).toContain('projectionOnly: true');
  });

  it('offers recommendation review controls only to execution users in the WO UI', () => {
    expect(ui).toContain('Planner Recommended Materials & Tools');
    expect(ui).toContain('handleSuggestedQuantityChange');
    expect(ui).toContain('handleSubmitSuggestedRecommendations');
    expect(ui).toContain("action: 'remove_recommendation'");
    expect(ui).toContain("action: 'submit_recommendations'");
    expect(ui).toContain("canPerformWorkActions && !isWOFinalized && part.pipelineStatus === 'suggested'");
    expect(ui).toContain("canPerformWorkActions && !isWOFinalized && tool.pipelineStatus === 'suggested'");
    expect(ui).toContain('Submit Recommendations');
    expect(ui).not.toContain('handleSendToStore');
  });
});
