import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (file: string) =>
  fs.readFileSync(path.join(process.cwd(), file), 'utf8');

describe('pending WO resource request cancellation', () => {
  it('lets the requester or accountable maintenance management cancel only pending material requests', () => {
    const route = read('src/app/api/repairs/material-requests/[id]/route.ts');

    expect(route).toContain("existing.status !== 'pending'");
    expect(route).toContain('canReviewResourceRequestAsSupervisor');
    expect(route).toContain("existing.requestedById === session.userId");
    expect(route).toContain("source === 'technician_from_planner_recommendation'");
    expect(route).toContain("status: 'planned'");
    expect(route).toContain('db.$transaction');
  });

  it('applies the same accountable boundary to pending tool requests', () => {
    const route = read('src/app/api/repairs/tool-requests/[id]/route.ts');

    expect(route).toContain("toolReq.status !== 'pending'");
    expect(route).toContain('canReviewResourceRequestAsSupervisor');
    expect(route).toContain("toolReq.requestedById === session.userId");
    expect(route).toContain('db.$transaction');
  });

  it('renders confirmed Cancel actions on WO detail only for eligible pending requests', () => {
    const ui = read('src/components/modules/MaintenancePages.tsx');

    expect(ui).toContain('const canCancelPendingResourceRequest');
    expect(ui).toContain("requestRow?.status !== 'pending'");
    expect(ui).toContain('handleCancelMaterialRequest(mr)');
    expect(ui).toContain('handleCancelToolRequest(tr)');
    expect(ui).toContain('confirmPendingResourceCancel');
    expect(ui).toContain('confirmLabel="Cancel Request"');
    expect(ui).toContain('return to planned status');
  });
});
