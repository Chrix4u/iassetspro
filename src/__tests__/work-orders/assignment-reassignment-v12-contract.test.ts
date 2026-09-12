import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const read = (path: string) => fs.readFileSync(path, 'utf8');

describe('RWOP V1.2 assignment and reassignment contract', () => {
  it('uses the canonical direct-assignment planner before database writes', () => {
    const route = read('src/app/api/work-orders/[id]/assign/route.ts');
    expect(route).toContain('buildDirectAssignmentPlan(assignedTo, teamLeaderId, teamMembers)');
    expect(route).toContain('directPlan = planResult.plan');
  });

  it('clears stale technician ownership when routing an assigned WO to a supervisor', () => {
    const route = read('src/app/api/work-orders/[id]/assign/route.ts');
    expect(route).toContain('effectiveAssignedTo = null;');
    expect(route).toContain('effectiveTeamLeaderId = null;');
    expect(route).toContain('await tx.workOrderTeamMember.deleteMany({ where: { workOrderId: id } });');
  });

  it('replaces the execution roster instead of retaining former technicians', () => {
    const route = read('src/app/api/work-orders/[id]/assign/route.ts');
    expect(route).toContain('userId: { notIn: directPlan.executionMemberIds }');
    expect(route).toContain('for (const member of directPlan.members)');
  });

  it('uses compare-and-set semantics for assigned-to-assigned reassignment', () => {
    const route = read('src/app/api/work-orders/[id]/assign/route.ts');
    expect(route).toContain('const claimed = await tx.workOrder.updateMany');
    expect(route).toContain("status: 'assigned'");
    expect(route).toContain('updatedAt: wo.updatedAt');
    expect(route).toContain('if (claimed.count !== 1)');
    expect(route).toContain('Assignment conflict for work order');
  });

  it('surfaces concurrent reassignment as HTTP 409 instead of a generic 500', () => {
    const route = read('src/app/api/work-orders/[id]/assign/route.ts');
    expect(route).toContain("message.startsWith('Assignment conflict for work order')");
    expect(route).toContain('? 409');
  });
});
