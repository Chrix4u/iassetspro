import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (file: string) =>
  fs.readFileSync(path.join(process.cwd(), file), 'utf8');

describe('pending resource request cancellation accountability', () => {
  it('limits material cancellation to requester or accountable maintenance management', () => {
    const route = read('src/app/api/repairs/material-requests/[id]/route.ts');
    expect(route).toContain('const ownsRequest = existing.requestedById === session.userId');
    expect(route).toContain('canReviewResourceRequestAsSupervisor(');
    expect(route).toContain("'repair_material_requests.update'");
    expect(route).toContain('Only the requester or accountable maintenance management can cancel this pending material request');
  });

  it('restores a submitted planner material recommendation after cancellation', () => {
    const route = read('src/app/api/repairs/material-requests/[id]/route.ts');
    expect(route).toContain("existing.source === 'technician_from_planner_recommendation'");
    expect(route).toContain("status: 'requested'");
    expect(route).toContain("data: { status: 'planned' }");
    expect(route).toContain('db.$transaction');
  });

  it('limits tool cancellation to requester or accountable maintenance management', () => {
    const route = read('src/app/api/repairs/tool-requests/[id]/route.ts');
    expect(route).toContain('const ownsRequest = toolReq.requestedById === session.userId');
    expect(route).toContain('canReviewResourceRequestAsSupervisor(');
    expect(route).toContain("'repair_tool_requests.update'");
    expect(route).toContain('Only the requester or accountable maintenance management can cancel this pending tool request');
    expect(route).toContain('db.$transaction');
  });
});
