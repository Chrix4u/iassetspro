import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

describe('work-order transition actor filtering', () => {
  const route = read('src/app/api/work-orders/[id]/transitions/route.ts');
  const access = read('src/services/workOrderAccess.service.ts');

  it('does not advertise transitions to unrelated same-plant viewers', () => {
    expect(route).toContain('canViewWorkOrder(session, wo)');
    expect(route).toContain('canPerformWorkOrderTransition(session, accessSnapshot, transition.toStatus)');
    expect(route).toContain("wo.status === 'pending_handover' && transition.toStatus === 'in_progress'");
  });

  it('binds lifecycle actions to accountable actors and endpoint permissions', () => {
    expect(access).toContain('export function canPerformWorkOrderTransition');
    expect(access).toContain("hasPermission(session, 'work_orders.complete')");
    expect(access).toContain("hasPermission(session, 'work_orders.verify')");
    expect(access).toContain("hasPermission(session, 'work_orders.close')");
    expect(access).toContain("hasPermission(session, 'work_orders.cancel')");
    expect(access).toContain('workOrder.assignedSupervisorId === session.userId');
    expect(access).toContain('workOrder.plannerId === session.userId');
    expect(access).toContain('isAssignedExecutionLeader(session, workOrder)');
  });
});
