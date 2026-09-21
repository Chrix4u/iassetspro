import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

describe('accountable WO lifecycle route boundaries', () => {
  it('binds broad lifecycle APIs to the actor-aware access policy', () => {
    const request = read('src/app/api/work-orders/[id]/request/route.ts');
    const approve = read('src/app/api/work-orders/[id]/approve/route.ts');
    const plan = read('src/app/api/work-orders/[id]/plan/route.ts');
    const assign = read('src/app/api/work-orders/[id]/assign/route.ts');
    const cancel = read('src/app/api/work-orders/[id]/cancel/route.ts');
    const close = read('src/app/api/work-orders/[id]/close/route.ts');

    expect(request).toContain('canPlanWorkOrderForActor(session, wo)');
    expect(approve).toContain('canPlanWorkOrderForActor(session, wo)');
    expect(plan).toContain('canPlanWorkOrderForActor(session, wo)');
    expect(assign).toContain('canAssignWorkOrderForActor(session, wo)');
    expect(cancel).toContain('canCancelWorkOrderForActor(session, wo)');
    expect(close).toContain("hasAnyPermission(session, ['work_orders.close'])");
    expect(close).not.toContain("['work_orders.update', 'work_orders.close']");
  });

  it('preserves planner ownership during management approval/planning overrides', () => {
    const approve = read('src/app/api/work-orders/[id]/approve/route.ts');
    const plan = read('src/app/api/work-orders/[id]/plan/route.ts');
    expect(approve).toContain('plannerId: wo.plannerId ?? (');
    expect(plan).toContain('plannerId: wo.plannerId ?? (');
    expect(approve).not.toContain('plannerId: session.userId,');
    expect(plan).not.toContain('plannerId: session.userId,');
  });
});
