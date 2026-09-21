import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (file: string) =>
  fs.readFileSync(path.join(process.cwd(), file), 'utf8');

describe('pending WO resource request cancellation', () => {
  const material = read('src/app/api/repairs/material-requests/[id]/route.ts');
  const tool = read('src/app/api/repairs/tool-requests/[id]/route.ts');
  const ui = read('src/components/modules/MaintenancePages.tsx');

  it('restricts cancellation to pending requester or accountable maintenance management', () => {
    expect(material).toContain("existing.status !== 'pending'");
    expect(material).toContain('canReviewResourceRequestAsSupervisor(');
    expect(material).toContain("'repair_material_requests.update'");
    expect(material).toContain('Only the requester or accountable maintenance management can cancel this pending material request');

    expect(tool).toContain("toolReq.status !== 'pending'");
    expect(tool).toContain('canReviewResourceRequestAsSupervisor(');
    expect(tool).toContain("'repair_tool_requests.update'");
    expect(tool).toContain('Only the requester or accountable maintenance management can cancel this pending tool request');
  });

  it('restores a cancelled technician-submitted planner material recommendation', () => {
    expect(material).toContain("existing.source === 'technician_from_planner_recommendation'");
    expect(material).toContain("status: 'requested'");
    expect(material).toContain("data: { status: 'planned' }");
    expect(material).toContain('db.$transaction');
    expect(tool).toContain('db.$transaction');
  });

  it('shows cancellation only for authorized pending rows and refreshes recommendations', () => {
    expect(ui).toContain('resourceCancelTarget');
    expect(ui).toContain('canCancelPendingResourceRequest');
    expect(ui).toContain("requestRow?.status !== 'pending'");
    expect(ui).toContain("wo.assignedSupervisorId === user.id");
    expect(ui).toContain('handleCancelMaterialRequest');
    expect(ui).toContain('handleCancelToolRequest');
    expect(ui).toContain('confirmPendingResourceCancel');
    expect(ui).toContain('fetchSuggestedItems();');
    expect(ui).toContain('Cancel Material Request');
    expect(ui).toContain('Cancel Tool Request');
  });
});
