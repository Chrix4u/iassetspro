import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8');

describe('pending RWOP resource cancellation', () => {
  it('binds cancellation to requester or accountable supervisor/management', () => {
    const material = read('src/app/api/repairs/material-requests/[id]/route.ts');
    const tool = read('src/app/api/repairs/tool-requests/[id]/route.ts');

    expect(material).toContain('canReviewResourceRequestAsSupervisor');
    expect(material).toContain("existing.workOrder?.assignedSupervisorId");
    expect(material).toContain('Only the requester or accountable maintenance management can cancel');
    expect(tool).toContain('canReviewResourceRequestAsSupervisor');
    expect(tool).toContain('toolReq.workOrder?.assignedSupervisorId');
    expect(tool).toContain('Only the requester or accountable maintenance management can cancel');
  });

  it('uses compare-and-delete semantics and atomic audit', () => {
    const material = read('src/app/api/repairs/material-requests/[id]/route.ts');
    const tool = read('src/app/api/repairs/tool-requests/[id]/route.ts');

    expect(material).toContain("where: { id, status: 'pending' }");
    expect(material).toContain('db.$transaction');
    expect(tool).toContain("where: { id, status: 'pending' }");
    expect(tool).toContain('db.$transaction');
  });

  it('restores a cancelled planner-recommended material to planned state', () => {
    const material = read('src/app/api/repairs/material-requests/[id]/route.ts');

    expect(material).toContain("existing.source === 'technician_from_planner_recommendation'");
    expect(material).toContain("status: 'requested'");
    expect(material).toContain("status: 'planned'");
    expect(material).toContain('existing.workOrder?.plannerId');
  });

  it('keeps the existing technician confirmation UI wired to DELETE', () => {
    const panel = read('src/components/modules/TechnicianWorkOrderV11Panels.tsx');

    expect(panel).toContain('cancelRequestTarget');
    expect(panel).toContain('confirmRequestCancellation');
    expect(panel).toContain('api.delete(`/api/repairs/material-requests/${id}`)');
    expect(panel).toContain('api.delete(`/api/repairs/tool-requests/${id}`)');
  });
});
