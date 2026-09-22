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

  it('keeps WO-scoped resource lookups inside the WO plant and execution relationship', () => {
    const tools = read('src/app/api/work-orders/[id]/tool-candidates/route.ts');
    const inventory = read('src/app/api/work-orders/[id]/inventory-candidates/route.ts');
    const proxy = read('src/proxy.ts');

    expect(tools).toContain('authorizeWorkOrderExecutionAccess(request, session, id)');
    expect(tools).toContain('isWorkOrderExecutionMember(session, wo)');
    expect(tools).toContain("hasPermission(session, 'repair_tool_requests.create')");
    expect(tools).toContain('plantId: wo.plantId');
    expect(tools).toContain('isActive: true');

    expect(inventory).toContain('authorizeWorkOrderExecutionAccess(request, session, id)');
    expect(inventory).toContain('isWorkOrderExecutionMember(session, wo)');
    expect(inventory).toContain("hasPermission(session, 'repair_material_requests.create')");
    expect(inventory).toContain('plantId: wo.plantId');
    expect(inventory).toContain('isActive: true');

    expect(proxy).toContain('/tool-candidates');
    expect(proxy).toContain('/inventory-candidates');
    expect(proxy).toContain("['work_orders', 'repairs', 'tools']");
    expect(proxy).toContain("['work_orders', 'repairs', 'inventory']");
  });

  it('uses exact-WO access for personal tools, planner recommendations and resource submission', () => {
    const personal = read('src/app/api/work-orders/[id]/personal-tools/route.ts');
    const suggested = read('src/app/api/work-orders/[id]/suggested-items/route.ts');
    const toolRequests = read('src/app/api/repairs/tool-requests/route.ts');
    const materialRequests = read('src/app/api/work-orders/[id]/materials/route.ts');

    expect(personal).toContain('authorizeWorkOrderExecutionAccess(request, session, id)');
    expect(suggested).toContain('authorizeWorkOrderExecutionAccess(request, session, id)');
    expect(toolRequests).toContain('authorizeWorkOrderExecutionAccess(request, session, workOrderId)');
    expect(toolRequests).toContain("if (tool.plantId !== wo.plantId)");
    expect(materialRequests).toContain('authorizeWorkOrderExecutionAccess(request, session, id)');
    expect(materialRequests).toContain("invItem.plantId !== wo.plantId");
  });

  it('uses scoped selectors in technician request surfaces', () => {
    const ui = read('src/components/modules/MaintenancePages.tsx');
    const v11 = read('src/components/modules/TechnicianWorkOrderV11Panels.tsx');

    const toolAnchor = ui.indexOf('toolsLookupCache.current');
    expect(toolAnchor).toBeGreaterThan(-1);
    const toolSlice = ui.slice(Math.max(0, toolAnchor - 1500), toolAnchor + 2500);
    expect(toolSlice).toContain('/api/work-orders/${id}/tool-candidates?status=available&limit=100');
    expect(toolSlice).not.toContain('/api/tools?mode=lookup');

    expect(ui).toContain('/api/work-orders/${id}/inventory-candidates?limit=100');
    expect(v11).toContain('/api/work-orders/${workOrderId}/tool-candidates?status=available&limit=100');
    expect(v11).toContain('/api/work-orders/${workOrderId}/inventory-candidates?limit=100');
    expect(v11).not.toContain('/api/tools?mode=lookup&status=available&limit=100');
    expect(v11).not.toContain('/api/inventory?mode=lookup&limit=100');
  });
});
