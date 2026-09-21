import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (file: string) =>
  fs.readFileSync(path.join(process.cwd(), file), 'utf8');

describe('pending WO resource request cancellation', () => {
  it('binds cancellation to requester or accountable maintenance management', () => {
    const material = read('src/app/api/repairs/material-requests/[id]/route.ts');
    const tool = read('src/app/api/repairs/tool-requests/[id]/route.ts');

    expect(material).toContain('existing.requestedById === session.userId');
    expect(material).toContain('existing.workOrder?.assignedSupervisorId');
    expect(material).toContain("canReviewResourceRequestAsSupervisor(");
    expect(material).toContain('Only the requester or accountable maintenance management can cancel this pending material request');
    expect(material).toContain("where: { id, status: 'pending' }");

    expect(tool).toContain('toolReq.requestedById === session.userId');
    expect(tool).toContain('toolReq.workOrder?.assignedSupervisorId');
    expect(tool).toContain("canReviewResourceRequestAsSupervisor(");
    expect(tool).toContain('Only the requester or accountable maintenance management can cancel this pending tool request');
    expect(tool).toContain("where: { id, status: 'pending' }");
  });

  it('exposes confirmed cancellation actions from WO Details and refreshes resource state', () => {
    const ui = read('src/components/modules/MaintenancePages.tsx');

    expect(ui).toContain('handleCancelMaterialRequest');
    expect(ui).toContain('handleCancelToolRequest');
    expect(ui).toContain('confirmPendingResourceCancel');
    expect(ui).toContain('canCancelPendingResourceRequest');
    expect(ui).toContain('/api/repairs/material-requests/');
    expect(ui).toContain('/api/repairs/tool-requests/');
    expect(ui).toContain("'Material request cancelled'");
    expect(ui).toContain("'Tool request cancelled'");
    expect(ui).toContain('await fetchWO();');
    expect(ui).toContain('await fetchSuggestedItems();');
    expect(ui).toContain('confirmLabel="Cancel Request"');
    expect(ui).toContain('variant="destructive"');
    expect(ui).toContain('Cancel pending material request');
    expect(ui).toContain('Cancel pending tool request');
  });
});
