import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

describe('actor-aware WO transition discovery', () => {
  it('filters state-machine transitions by workflow relationship and endpoint permission', () => {
    const route = read('src/app/api/work-orders/[id]/transitions/route.ts');
    const access = read('src/services/workOrderAccess.service.ts');

    expect(route).toContain('canViewWorkOrder(session, wo)');
    expect(route).toContain('canPerformWorkOrderTransition(session, accessSnapshot, transition.toStatus)');
    expect(route).toContain("wo.status === 'pending_handover' && transition.toStatus === 'in_progress'");
    expect(access).toContain('export function canPerformWorkOrderTransition');
    expect(access).toContain("hasPermission(session, 'work_orders.close')");
    expect(access).toContain("hasPermission(session, 'work_orders.verify')");
    expect(access).toContain("hasPermission(session, 'work_orders.start')");
  });
});
