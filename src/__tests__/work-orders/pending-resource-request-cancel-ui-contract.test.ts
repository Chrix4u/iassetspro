import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (file: string) =>
  fs.readFileSync(path.join(process.cwd(), file), 'utf8');

describe('pending resource request cancellation UI', () => {
  const ui = read('src/components/modules/MaintenancePages.tsx');

  it('shows cancellation only for pending requests and accountable actors', () => {
    expect(ui).toContain('const canCancelPendingResourceRequest = (');
    expect(ui).toContain("resourceRequest?.status !== 'pending'");
    expect(ui).toContain('resourceRequest.requestedById || resourceRequest.requestedBy?.id');
    expect(ui).toContain("hasPermission(permission)");
    expect(ui).toContain("slugs.includes('maintenance_manager')");
    expect(ui).toContain("slugs.includes('plant_manager')");
    expect(ui).toContain("slugs.includes('maintenance_supervisor')");
    expect(ui).toContain('wo.assignedSupervisorId === user.id');
    expect(ui).toContain("canCancelPendingResourceRequest(mr, 'repair_material_requests.update')");
    expect(ui).toContain("canCancelPendingResourceRequest(tr, 'repair_tool_requests.update')");
  });

  it('cancels through canonical DELETE endpoints and refreshes recommendation state', () => {
    expect(ui).toContain('/api/repairs/material-requests/${pendingRequestCancel.id}');
    expect(ui).toContain('/api/repairs/tool-requests/${pendingRequestCancel.id}');
    expect(ui).toContain('await Promise.all([fetchWO(), fetchSuggestedItems()])');
    expect(ui).toContain('Material request cancelled');
    expect(ui).toContain('Tool request cancelled');
  });

  it('requires destructive confirmation before cancelling', () => {
    expect(ui).toContain('open={!!pendingRequestCancel}');
    expect(ui).toContain('Yes, Cancel Request');
    expect(ui).toContain('variant="destructive"');
    expect(ui).toContain('If it came from a planner recommendation');
  });

  it('does not expose material approval actions to unrelated supervisors', () => {
    expect(ui).toContain('canReviewMaterialRequestAsAccountableSupervisor');
    expect(ui).toContain("hasPermission('repair_material_requests.update')");
    expect(ui).toContain('wo.assignedSupervisorId === user.id');
    expect(ui).not.toContain('isSupervisorOrAdminLocal()');
  });
});
