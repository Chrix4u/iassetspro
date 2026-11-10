import { describe, expect, it } from 'vitest';
import type { PmResourceLifecycleBucket } from '@/lib/pm-resource-lifecycle';
import {
  summarizePmForwardJobPack, type PmForwardJobPackData,
} from '@/lib/pm-forward-job-pack';

function bucket(overrides: Partial<PmResourceLifecycleBucket> = {}): PmResourceLifecycleBucket {
  return {
    total: 2, notSubmitted: 0, awaitingApproval: 0, approvedOrReserved: 1,
    issuedWithQuantity: 1, partialOrUnverified: 0, rejectedOrReturned: 0,
    entries: [], ...overrides,
  };
}
function job(overrides: Partial<PmForwardJobPackData> = {}): PmForwardJobPackData {
  return {
    readyForPlanning: true, blockingIssues: [], warnings: [],
    checklist: { taskCount: 2, estimatedMinutes: 80 },
    resources: {
      unresolvedPartLabels: [], unresolvedToolLabels: [],
      lifecycle: { materials: bucket(), tools: bucket() },
    },
    modules: { repairs: true, inventory: true, tools: true },
    ...overrides,
  };
}

describe('PM forward job-pack read-only resource evidence', () => {
  it('does not treat approved/reserved inventory as quantity issued', () => {
    const summary = summarizePmForwardJobPack(job());
    expect(summary.materials).toMatchObject({
      total: 2, issued: 1, outstanding: 1, verified: false,
    });
    expect(summary.executionAuthorized).toBe(false);
  });

  it('does not infer readiness when a tool module is unavailable', () => {
    const summary = summarizePmForwardJobPack(job({
      modules: { repairs: true, inventory: true, tools: false },
    }));
    expect(summary.tools.verified).toBe(false);
    expect(summary.tools.message).toContain('unavailable');
  });

  it('never calls an empty resource mapping complete', () => {
    const summary = summarizePmForwardJobPack(job({
      resources: {
        unresolvedPartLabels: [], unresolvedToolLabels: [],
        lifecycle: { materials: bucket({ total: 0, issuedWithQuantity: 0 }),
          tools: bucket({ total: 0, issuedWithQuantity: 0 }) },
      },
    }));
    expect(summary.materials.verified).toBe(false);
    expect(summary.tools.verified).toBe(false);
  });

  it('keeps unmapped required parts visible even when mapped parts are issued', () => {
    const summary = summarizePmForwardJobPack(job({
      resources: {
        unresolvedPartLabels: ['Bearing seal'], unresolvedToolLabels: [],
        lifecycle: {
          materials: bucket({ total: 2, issuedWithQuantity: 2, approvedOrReserved: 0 }),
          tools: bucket(),
        },
      },
    }));
    expect(summary.materials.verified).toBe(false);
    expect(summary.materials.message).toContain('1 unmapped');
  });

  it('keeps planning accountability and execution permission distinct', () => {
    const ready = summarizePmForwardJobPack(job({
      resources: {
        unresolvedPartLabels: [], unresolvedToolLabels: [],
        lifecycle: {
          materials: bucket({ total: 2, issuedWithQuantity: 2, approvedOrReserved: 0 }),
          tools: bucket({ total: 2, issuedWithQuantity: 2, approvedOrReserved: 0 }),
        },
      },
    }));
    expect(ready.planningAssignmentsComplete).toBe(true);
    expect(ready.materials.verified).toBe(true);
    expect(ready.tools.verified).toBe(true);
    expect(ready.executionAuthorized).toBe(false);

    const blocked = summarizePmForwardJobPack(job({
      readyForPlanning: false,
      blockingIssues: [{ code: 'supervisor_missing', label: 'Assign a supervisor' }],
    }));
    expect(blocked.planningAssignmentsComplete).toBe(false);
  });

  it('does not fabricate issue evidence when lifecycle is absent', () => {
    const summary = summarizePmForwardJobPack(job({
      resources: { unresolvedPartLabels: [], unresolvedToolLabels: [] },
    }));
    expect(summary.materials.verified).toBe(false);
    expect(summary.tools.verified).toBe(false);
  });
});
