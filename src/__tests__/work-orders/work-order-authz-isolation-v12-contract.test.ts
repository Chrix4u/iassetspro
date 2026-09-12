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

  it('keeps capabilities behind strict plant and relationship authorization', () => {
    const route = read('src/app/api/work-orders/[id]/capabilities/route.ts');

    expect(route).toContain("getPlantScope, canAccessPlantStrict");
    expect(route).toContain('!canAccessPlantStrict(plantScope, wo.plantId)');
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
});
