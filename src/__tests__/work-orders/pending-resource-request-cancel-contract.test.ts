import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (relativePath: string) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');

describe('RWOP pending resource request cancellation contract', () => {
  const materialApi = read('src/app/api/repairs/material-requests/[id]/route.ts');
  const toolApi = read('src/app/api/repairs/tool-requests/[id]/route.ts');
  const workOrderUi = read('src/components/modules/MaintenancePages.tsx');

  it('keeps material cancellation pending-only, owner-aware, plant-scoped and audited', () => {
    expect(materialApi).toContain('export async function DELETE');
    expect(materialApi).toContain('authorizeMaterialRequestPlant');
    expect(materialApi).toContain("existing.status !== 'pending'");
    expect(materialApi).toContain('const ownsRequest = existing.requestedById === session.userId');
    expect(materialApi).toContain('canReviewResourceRequestAsSupervisor(');
    expect(materialApi).toContain("existing.workOrder?.assignedSupervisorId");
    expect(materialApi).toContain("'repair_material_requests.update'");
    expect(materialApi).toContain("where: { id, status: 'pending' }");
    expect(materialApi).toContain("entityType: 'repair_material_request'");
  });

  it('keeps tool cancellation pending-only, owner-aware, plant-scoped and audited', () => {
    expect(toolApi).toContain('export async function DELETE');
    expect(toolApi).toContain('authorizeToolRequestPlant');
    expect(toolApi).toContain("toolReq.status !== 'pending'");
    expect(toolApi).toContain('const ownsRequest = toolReq.requestedById === session.userId');
    expect(toolApi).toContain('canReviewResourceRequestAsSupervisor(');
    expect(toolApi).toContain('toolReq.workOrder?.assignedSupervisorId');
    expect(toolApi).toContain("'repair_tool_requests.update'");
    expect(toolApi).toContain("deleteMany({ where: { id, status: 'pending' } })");
    expect(toolApi).toContain("entityType: 'repair_tool_request'");
  });

  it('shows cancel only to an allowed actor while the request is pending', () => {
    expect(workOrderUi).toContain('const canCancelPendingResourceRequest');
    expect(workOrderUi).toContain("requestRow?.status !== 'pending'");
    expect(workOrderUi).toContain('requestRow.requestedById === user.id');
    expect(workOrderUi).toContain('requestRow.requestedBy?.id === user.id');
    expect(workOrderUi).toContain("hasPermission(requiredPermission)");
    expect(workOrderUi).toContain("roleSlugs.includes('maintenance_manager')");
    expect(workOrderUi).toContain("roleSlugs.includes('plant_manager')");
    expect(workOrderUi).toContain("roleSlugs.includes('maintenance_supervisor')");
    expect(workOrderUi).toContain('wo?.assignedSupervisorId === user.id');
  });

  it('cancels material and tool requests from WO details and refreshes recommendations', () => {
    expect(workOrderUi).toContain('handleCancelMaterialRequest');
    expect(workOrderUi).toContain('handleCancelToolRequest');
    expect(workOrderUi).toContain('api.delete(`/api/repairs/material-requests/${requestRow.id}`)');
    expect(workOrderUi).toContain('api.delete(`/api/repairs/tool-requests/${requestRow.id}`)');
    expect(workOrderUi).toContain("toast.success('Material request cancelled')");
    expect(workOrderUi).toContain("toast.success('Tool request cancelled')");
    expect(workOrderUi).toContain('fetchSuggestedItems();');
    expect(workOrderUi).toContain('Cancel pending material request');
    expect(workOrderUi).toContain('Cancel pending tool request');
  });
});
