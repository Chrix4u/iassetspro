import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const route = fs.readFileSync('src/app/api/reports/maintenance/route.ts', 'utf8');

describe('RWOP closure exception reporting contract', () => {
  it('returns actionable closure compliance exception rows', () => {
    expect(route).toContain('const closureExceptionWatchlist = closureRows');
    expect(route).toContain('missingRca: row.requiresRca && !row.rcaComplete');
    expect(route).toContain('awaitingSupervisorApproval: !row.supervisorApproved');
    expect(route).toContain("awaitingPlannerClosure: row.status === 'closed' && !row.plannerClosed");
    expect(route).toContain('reworkCount: row.reworkCount');
    expect(route).toContain('closureExceptionWatchlist,');
  });

  it('carries readable work-order and asset identity into the queue', () => {
    expect(route).toContain('title: wo.title');
    expect(route).toContain('assetName: asset.assetName');
    expect(route).toContain('assetTag: asset.assetTag');
  });
});
