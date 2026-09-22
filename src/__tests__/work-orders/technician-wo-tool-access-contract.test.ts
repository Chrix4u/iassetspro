import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (file: string) =>
  fs.readFileSync(path.join(process.cwd(), file), 'utf8');

describe('technician WO-scoped tool access', () => {
  it('provides a relationship-scoped tool selector hard-filtered to the WO plant', () => {
    const route = read('src/app/api/work-orders/[id]/tool-options/route.ts');

    expect(route).toContain('canViewWorkOrder(session, wo)');
    expect(route).toContain('wo.assignedTo === session.userId');
    expect(route).toContain('wo.teamLeaderId === session.userId');
    expect(route).toContain('wo.teamMembers.some((member) => member.userId === session.userId)');
    expect(route).toContain("hasPermission(session, 'repair_tool_requests.create')");
    expect(route).toContain('plantId: wo.plantId');
    expect(route).toContain('isActive: true');
  });

  it('keeps module gating on the nested selector', () => {
    const proxy = read('src/proxy.ts');

    expect(proxy).toContain("/^\\/api\\/work-orders\\/[^/]+\\/tool-options");
    expect(proxy).toContain("return ['work_orders', 'repairs', 'tools']");
  });

  it('lets exact execution assignment use personal tools without plant-wide access', () => {
    const route = read('src/app/api/work-orders/[id]/personal-tools/route.ts');

    expect(route).toContain('const isExecutionMember =');
    expect(route).toContain('wo.assignedTo === session.userId');
    expect(route).toContain('if (!isExecutionMember) {');
    expect(route).toContain('authorizeWorkOrderPlant(request, session, id)');
  });

  it('applies the same relationship boundary to tool request submission and WO-scoped reads', () => {
    const route = read('src/app/api/repairs/tool-requests/route.ts');

    expect(route).toContain('const isExecutionActor = Boolean(woTeam) || isAssignee');
    expect(route).toContain('if (!isExecutionActor) {');
    expect(route).toContain('canAccessPlantStrict(plantScope, wo.plantId)');
    expect(route).toContain('if (!canViewWorkOrderExecutionScope) {');
  });

  it('uses the WO-scoped selector and preloads planner recommendations in the technician UI', () => {
    const ui = read('src/components/modules/MaintenancePages.tsx');

    expect(ui).toContain('const openToolRequestDialog = () => {');
    expect(ui).toContain("tool.pipelineStatus === 'suggested'");
    expect(ui).toContain('/api/work-orders/${id}/tool-options?${params.toString()}');
    expect(ui).toContain('onClick={openToolRequestDialog}');
    expect(ui).toContain('Planner recommended');
  });
});
