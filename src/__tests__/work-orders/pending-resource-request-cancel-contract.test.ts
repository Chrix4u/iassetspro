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
    expect(materialApi).toContain('existing.requestedById !== session.userId');
    expect(materialApi).toContain("hasRole(session, 'maintenance_supervisor')");
    expect(materialApi).toContain("hasRole(session, 'maintenance_manager')");
    expect(materialApi).toContain("hasRole(session, 'plant_manager')");
    expect(materialApi).toContain("deleteMany({ where: { id, status: 'pending' } })");
    expect(materialApi).toContain("entityType: 'repair_material_request'");
  });

  it('keeps tool cancellation pending-only, owner-aware, plant-scoped and audited', () => {
    expect(toolApi).toContain('export async function DELETE');
    expect(toolApi).toContain('authorizeToolRequestPlant');
    expect(toolApi).toContain("toolReq.status !== 'pending'");
    expect(toolApi).toContain('toolReq.requestedById !== session.userId');
    expect(toolApi).toContain("hasRole(session, 'maintenance_supervisor')");
    expect(toolApi).toContain("hasRole(session, 'maintenance_manager')");
    expect(toolApi).toContain("hasRole(session, 'plant_manager')");
    expect(toolApi).toContain("deleteMany({ where: { id, status: 'pending' } })");
    expect(toolApi).toContain("entityType: 'repair_tool_request'");
  });

  it('shows cancel only to an allowed actor while the request is pending', () => {
    expect(workOrderUi).toContain('const canCancelPendingResourceRequest');
    expect(workOrderUi).toContain("requestRow?.status !== 'pending'");
    expect(workOrderUi).toContain('requestRow.requestedById === user.id');
    expect(workOrderUi).toContain('requestRow.requestedBy?.id === user.id');
    expect(workOrderUi).toContain("'maintenance_supervisor', 'maintenance_manager', 'plant_manager'");
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
