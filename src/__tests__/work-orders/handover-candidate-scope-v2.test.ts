import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (file: string) =>
  fs.readFileSync(path.join(process.cwd(), file), 'utf8');

describe('work-order handover candidate scope', () => {
  it('discovers eligible receivers through the exact work order', () => {
    const route = read('src/app/api/work-orders/[id]/handover/route.ts');
    const ui = read('src/components/modules/TechnicianWorkOrderPage.tsx');

    expect(route).toContain("mode !== 'candidates'");
    expect(route).toContain("canPerformWorkOrderTransition(session, wo, 'pending_handover')");
    expect(route).toContain("role: { slug: 'maintenance_technician' }");
    expect(route).toContain("handoverUserHasEffectivePermission(candidate, 'work_orders.start')");
    expect(ui).toContain("new URLSearchParams({ mode: 'candidates' })");
    expect(ui).toContain('/api/work-orders/${id}/handover?${params.toString()}');
    expect(ui).not.toContain('/api/users?role=maintenance_technician&status=active');
  });

  it('grants pending receiver read-only custody then promotes on resume', () => {
    const initiate = read('src/services/workOrderHandoverInitiation.service.ts');
    const resume = read('src/services/repairHandoverResume.service.ts');

    expect(initiate).toContain("handoverUserHasEffectivePermission(receiver, 'work_orders.start')");
    expect(initiate).toContain("role: 'handover_receiver'");
    expect(initiate).toContain("accessLevel: 'read_only'");
    expect(resume).toContain('receiver is no longer authorized to execute maintenance work');
    expect(resume).toContain("existingMember.role === 'handover_receiver'");
    expect(resume).toContain("accessLevel: 'full'");
  });

  it('requires explicit handover execution permission at the route boundary', () => {
    const route = read('src/app/api/work-orders/[id]/handover/route.ts');
    expect(route).toContain("hasAnyPermission(session, ['work_orders.update', 'work_orders.start'])");
  });
});
