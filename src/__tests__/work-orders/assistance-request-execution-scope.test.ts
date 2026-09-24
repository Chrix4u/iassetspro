import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const read = (path: string) => fs.readFileSync(path, 'utf8');

describe('RWOP assistance request execution scope', () => {
  const route = read('src/app/api/work-orders/[id]/team-member-requests/route.ts');
  const access = read('src/services/workOrderAccess.service.ts');

  it('uses the canonical execution-member helper for assistance creation', () => {
    expect(route).toContain('isWorkOrderExecutionMember(session, wo)');
    expect(route).toContain('teamMembers: { select: { userId: true, role: true, accessLevel: true } }');
    expect(route).not.toContain("tm => tm.userId === session.userId && tm.accessLevel !== 'read_only'");
  });

  it('canonical execution scope excludes handover-only and read-only membership', () => {
    expect(access).toContain("member.role !== 'handover_receiver'");
    expect(access).toContain("member.accessLevel !== 'read_only'");
  });

  it('keeps accountable assignment management as the only non-execution override', () => {
    expect(route).toContain("hasAnyPermission(session, ['work_orders.assign_supervisor', 'work_orders.assign_technician'])");
    expect(route).toContain('canManageWorkOrder(session, wo) || wo.assignedBy === session.userId');
    expect(route).toContain('Only assigned execution staff or accountable assignment management can request additional members.');
  });
});
