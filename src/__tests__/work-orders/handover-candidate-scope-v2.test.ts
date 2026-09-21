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

  it('keeps WO capability flags on the same actor-aware contract', () => {
    const capabilities = read('src/app/api/work-orders/[id]/capabilities/route.ts');

    expect(capabilities).toContain("canPerformWorkOrderTransition(session, wo, 'on_hold')");
    expect(capabilities).toContain("canPerformWorkOrderTransition(session, wo, 'in_progress')");
    expect(capabilities).toContain("canPerformWorkOrderTransition(session, wo, 'completed')");
    expect(capabilities).toContain("canPerformWorkOrderTransition(session, wo, 'pending_handover')");
    expect(capabilities).toContain("canPerformWorkOrderTransition(session, wo, 'verified')");
    expect(capabilities).toContain("canPerformWorkOrderTransition(session, wo, 'closed')");
    expect(capabilities).toContain("hasPermission(session, 'repair_material_requests.create')");
    expect(capabilities).toContain("hasPermission(session, 'assistance_requests.create')");
    expect(capabilities).toContain("hasPermission(session, 'time_logs.create')");
  });

  it('routes completed and verified rework through the canonical rework endpoint', () => {
    const ui = read('src/components/modules/MaintenancePages.tsx');

    expect(ui).toContain("const isRework = t.toStatus === 'in_progress'");
    expect(ui).toContain("['completed', 'verified'].includes(wo.status)");
    expect(ui).toContain('actionName = isRework');
    expect(ui).toContain("case 'rework':");
    expect(ui).toContain('/api/work-orders/${id}/rework');
    expect(ui).toContain('label: isRework');
    expect(ui).toContain("'Request Rework'");
  });
  it('requires explicit handover execution permission at the route boundary', () => {
    const route = read('src/app/api/work-orders/[id]/handover/route.ts');
    expect(route).toContain("hasAnyPermission(session, ['work_orders.update', 'work_orders.start'])");
  });
});
