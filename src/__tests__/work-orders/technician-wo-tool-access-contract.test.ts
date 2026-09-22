import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (file: string) =>
  fs.readFileSync(path.join(process.cwd(), file), 'utf8');

describe('technician exact-WO tool access contract', () => {
  it('allows direct execution membership to authorize only the exact work order', () => {
    const access = read('src/services/workOrderAccess.service.ts');
    const plant = read('src/lib/plant-auth-helpers.ts');

    expect(access).toContain('export function isWorkOrderExecutionMember');
    expect(access).toContain('workOrder.assignedTo === userId');
    expect(access).toContain('workOrder.teamLeaderId === userId');
    expect(access).toContain('workOrder.teamMembers?.some((member) => member.userId === userId)');

    expect(plant).toContain('export async function authorizeWorkOrderExecutionAccess');
    expect(plant).toContain('isWorkOrderExecutionMember(session, wo)');
    expect(plant).toContain("plantId: wo.plantId");
    expect(plant).toContain("accessLevel: 'read'");
  });

  it('keeps WO-scoped tool lookup inside the WO plant and execution relationship', () => {
    const route = read('src/app/api/work-orders/[id]/tool-candidates/route.ts');
    const proxy = read('src/proxy.ts');

    expect(route).toContain('authorizeWorkOrderExecutionAccess(request, session, id)');
    expect(route).toContain('isWorkOrderExecutionMember(session, wo)');
    expect(route).toContain("hasPermission(session, 'repair_tool_requests.create')");
    expect(route).toContain('plantId: wo.plantId');
    expect(route).toContain('isActive: true');
    expect(proxy).toContain('/tool-candidates');
    expect(proxy).toContain("['work_orders', 'repairs', 'tools']");
  });

  it('uses exact-WO access for personal tools, planner recommendations and request submission', () => {
    const personal = read('src/app/api/work-orders/[id]/personal-tools/route.ts');
    const suggested = read('src/app/api/work-orders/[id]/suggested-items/route.ts');
    const requests = read('src/app/api/repairs/tool-requests/route.ts');

    expect(personal).toContain('authorizeWorkOrderExecutionAccess(request, session, id)');
    expect(suggested).toContain('authorizeWorkOrderExecutionAccess(request, session, id)');
    expect(requests).toContain('authorizeWorkOrderExecutionAccess(request, session, workOrderId)');
    expect(requests).toContain("if (tool.plantId !== wo.plantId)");
  });

  it('uses the scoped selector in the technician request dialog', () => {
    const ui = read('src/components/modules/MaintenancePages.tsx');
    const anchor = ui.indexOf('toolsLookupCache.current');
    expect(anchor).toBeGreaterThan(-1);
    const slice = ui.slice(Math.max(0, anchor - 1500), anchor + 2500);

    expect(slice).toContain('/api/work-orders/${id}/tool-candidates?status=available&limit=100');
    expect(slice).not.toContain('/api/tools?mode=lookup');
  });
});
