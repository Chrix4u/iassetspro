import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (relativePath: string) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');

describe('RWOP pending resource request cancellation', () => {
  const materialApi = read('src/app/api/repairs/material-requests/[id]/route.ts');
  const toolApi = read('src/app/api/repairs/tool-requests/[id]/route.ts');
  const ui = read('src/components/modules/MaintenancePages.tsx');

  it('keeps material cancellation pending-only, plant-scoped and accountable', () => {
    expect(materialApi).toContain('export async function DELETE');
    expect(materialApi).toContain('authorizeMaterialRequestPlant(request, session, id)');
    expect(materialApi).toContain("existing.status !== 'pending'");
    expect(materialApi).toContain('const ownsRequest = existing.requestedById === session.userId');
    expect(materialApi).toContain('canReviewResourceRequestAsSupervisor(');
    expect(materialApi).toContain('existing.workOrder?.assignedSupervisorId');
    expect(materialApi).toContain("'repair_material_requests.update'");
  });

  it('atomically restores a cancelled technician recommendation to planned', () => {
    expect(materialApi).toContain("existing.source === 'technician_from_planner_recommendation'");
    expect(materialApi).toContain("status: 'requested'");
    expect(materialApi).toContain("status: 'planned'");
    expect(materialApi).toContain('existing.workOrder?.plannerId');
    expect(materialApi).toContain('{ requestedBy: existing.workOrder.plannerId }');
    expect(materialApi).toContain('await db.$transaction(async (tx) =>');
    expect(materialApi).toContain("entityType: 'repair_material_request'");
  });

  it('keeps tool cancellation pending-only, plant-scoped and accountable', () => {
    expect(toolApi).toContain('export async function DELETE');
    expect(toolApi).toContain('authorizeToolRequestPlant(request, session, id)');
    expect(toolApi).toContain("toolReq.status !== 'pending'");
    expect(toolApi).toContain('const ownsRequest = toolReq.requestedById === session.userId');
    expect(toolApi).toContain('canReviewResourceRequestAsSupervisor(');
    expect(toolApi).toContain('toolReq.workOrder?.assignedSupervisorId');
    expect(toolApi).toContain("'repair_tool_requests.update'");
    expect(toolApi).toContain('await db.$transaction(async (tx) =>');
    expect(toolApi).toContain("entityType: 'repair_tool_request'");
  });

  it('only exposes Cancel for an eligible actor while the request is pending', () => {
    expect(ui).toContain('const canCancelPendingResourceRequest');
    expect(ui).toContain("requestRow?.status !== 'pending'");
    expect(ui).toContain('requestRow.requestedById === user.id');
    expect(ui).toContain('requestRow.requestedBy?.id === user.id');
    expect(ui).toContain('hasPermission(requiredPermission)');
    expect(ui).toContain("roleSlugs.includes('maintenance_manager')");
    expect(ui).toContain("roleSlugs.includes('plant_manager')");
    expect(ui).toContain("roleSlugs.includes('maintenance_supervisor')");
    expect(ui).toContain('wo?.assignedSupervisorId === user.id');
  });

  it('uses a destructive confirmation dialog and refreshes both WO and recommendations', () => {
    expect(ui).toContain('handleCancelMaterialRequest');
    expect(ui).toContain('handleCancelToolRequest');
    expect(ui).toContain('confirmPendingResourceCancel');
    expect(ui).toContain("kind === 'material'");
    expect(ui).toContain('/api/repairs/material-requests/');
    expect(ui).toContain('/api/repairs/tool-requests/');
    expect(ui).toContain("'Material request cancelled'");
    expect(ui).toContain("'Tool request cancelled'");
    expect(ui).toContain('fetchWO();');
    expect(ui).toContain('fetchSuggestedItems();');
    expect(ui).toContain('confirmLabel="Cancel Request"');
    expect(ui).toContain('variant="destructive"');
    expect(ui).toContain('title="Cancel pending material request"');
    expect(ui).toContain('title="Cancel pending tool request"');
  });
});
