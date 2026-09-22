import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const read = (path: string) => fs.readFileSync(path, 'utf8');

describe('RWOP V1.2 authorization/isolation contract', () => {
  it('does not treat ordinary work_orders.view as a view-all grant', () => {
    const access = read('src/services/workOrderAccess.service.ts');
    const route = read('src/app/api/work-orders/[id]/route.ts');

    expect(access).toContain("hasPermission(session, 'work_orders.view_all')");
    expect(access).not.toContain("hasPermission(session, 'work_orders.view')");
    expect(route).toContain('if (!canViewWorkOrder(session, wo))');
    expect(route).not.toContain("hasPermission(session, 'work_orders.view') || hasPermission(session, 'work_orders.view_all')");
  });

  it('keeps capabilities behind exact-WO plant and relationship authorization', () => {
    const route = read('src/app/api/work-orders/[id]/capabilities/route.ts');

    expect(route).toContain('authorizeWorkOrderExecutionAccess(request, session, id)');
    expect(route).toContain('if (!access.ok) return access.response');
    expect(route).toContain('if (!canViewWorkOrder(session, wo))');
    expect(route).toContain('maintenanceRequest:');
    expect(route).toContain('select: { requestedBy: true }');
    expect(route).not.toContain('canAccessPlant(plantScope, wo.plantId)');
  });

  it('prevents generic PUT from bypassing canonical assignment controls', () => {
    const route = read('src/app/api/work-orders/[id]/route.ts');

    expect(route).toContain("'assignedTo', 'teamLeaderId', 'assignedSupervisorId', 'assignmentType', 'teamMembers'");
    expect(route).toContain("Field '${field}' is assignment-owned");
    expect(route).toContain(`/api/work-orders/${'${id}'}/assign`);
    expect(route).toContain('roster replacement and concurrency controls are enforced');
  });

  it('prevents generic PUT from bypassing canonical department planning validation', () => {
    const route = read('src/app/api/work-orders/[id]/route.ts');
    const planRoute = read('src/app/api/work-orders/[id]/plan/route.ts');

    expect(route).toContain('if (body.departmentId !== undefined)');
    expect(route).toContain("Field 'departmentId' is planning-owned");
    expect(planRoute).toContain("error: 'Selected department belongs to a different plant'");
  });

  it('limits generic work-order edits to accountable management actors', () => {
    const route = read('src/app/api/work-orders/[id]/route.ts');

    expect(route).toContain('if (!canManageWorkOrder(session, existing))');
    expect(route).toContain('assigned supervisor/planner or maintenance management');
  });

  it('applies the canonical relationship policy to sensitive WO subresource reads', () => {
    const relationshipScopedRoutes = [
      'src/app/api/work-orders/[id]/comments/route.ts',
      'src/app/api/work-orders/[id]/attachments/route.ts',
      'src/app/api/work-orders/[id]/attachments/[attachmentId]/route.ts',
      'src/app/api/work-orders/[id]/measurements/route.ts',
      'src/app/api/work-orders/[id]/downtime/route.ts',
      'src/app/api/work-orders/[id]/personal-tools/route.ts',
      'src/app/api/work-orders/[id]/components/route.ts',
      'src/app/api/work-orders/[id]/readiness/route.ts',
      'src/app/api/work-orders/[id]/status-history/route.ts',
      'src/app/api/work-orders/[id]/suggested-items/route.ts',
      'src/app/api/work-orders/[id]/tasks/route.ts',
    ];

    for (const path of relationshipScopedRoutes) {
      const source = read(path);
      expect(source, path).toContain('canViewWorkOrder');
      expect(source, path).not.toContain("hasPermission(session, 'work_orders.view') || hasPermission(session, 'work_orders.view_all')");
      expect(source, path).not.toContain("hasAnyPermission(session, ['work_orders.view', 'work_orders.view_all'])");
    }
  });

  it('requires accountable management relationship as well as generic management permission', () => {
    const managementScopedRoutes = [
      'src/app/api/work-orders/[id]/materials/route.ts',
      'src/app/api/work-orders/[id]/attachments/route.ts',
      'src/app/api/work-orders/[id]/downtime/route.ts',
      'src/app/api/work-orders/[id]/personal-tools/route.ts',
      'src/app/api/work-orders/[id]/components/route.ts',
      'src/app/api/work-orders/[id]/tasks/route.ts',
      'src/app/api/work-orders/[id]/suggested-items/route.ts',
      'src/app/api/work-orders/[id]/team-member-requests/route.ts',
      'src/app/api/work-orders/[id]/team-member-requests/[reqId]/route.ts',
      'src/app/api/work-orders/[id]/team-members/route.ts',
      'src/app/api/work-orders/[id]/team-members/[memberId]/route.ts',
    ];

    for (const path of managementScopedRoutes) {
      expect(read(path), path).toContain('canManageWorkOrder');
    }
  });

  it('does not allow task creation or team removal to skip WO plant authorization', () => {
    const tasks = read('src/app/api/work-orders/[id]/tasks/route.ts');
    const removal = read('src/app/api/work-orders/[id]/team-members/[memberId]/route.ts');
    const suggested = read('src/app/api/work-orders/[id]/suggested-items/route.ts');

    expect(tasks).toContain('const plantAuth = await authorizeWorkOrderPlant(request, session, id);');
    expect(removal).toContain('const plantAuth = await authorizeWorkOrderPlant(request, session, id);');
    expect(suggested).toContain('const plantAuth = await authorizeWorkOrderExecutionAccess(request, session, id);');
  });

  it('keeps primary assignee and team-leader ownership changes on the canonical assignment path', () => {
    const removal = read('src/app/api/work-orders/[id]/team-members/[memberId]/route.ts');

    expect(removal).toContain('member.userId === wo.assignedTo');
    expect(removal).toContain('member.userId === wo.teamLeaderId');
    expect(removal).toContain('Use the canonical assignment workflow');
  });

  it('validates assistance targets and suggested resources against the WO plant', () => {
    const assistance = read('src/app/api/work-orders/[id]/team-member-requests/route.ts');
    const suggested = read('src/app/api/work-orders/[id]/suggested-items/route.ts');

    expect(assistance).toContain('Requested user does not have access to the work order plant');
    expect(suggested).toContain('Inventory item belongs to a different plant');
    expect(suggested).toContain('Tool belongs to a different plant');
    // Initial recommendation submission goes to the accountable WO supervisor;
    // downstream store notifications happen only after supervisor approval.
    expect(suggested).toContain('wo.assignedSupervisorId');
    expect(suggested).toContain('await notifyUser(');
    expect(suggested).not.toContain("userRoles: { some: { role: { slug: { in: ['store_keeper', 'inventory_manager', 'tools_shop_attendant', 'admin'] } } } }");
  });
});
