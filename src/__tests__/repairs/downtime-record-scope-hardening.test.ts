import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const read = (path: string) => fs.readFileSync(path, 'utf8');

describe('RWOP downtime record scope hardening', () => {
  const list = read('src/app/api/repairs/downtime/route.ts');
  const detail = read('src/app/api/repairs/downtime/[id]/route.ts');

  it('requires a legitimate downtime/work-order view grant', () => {
    expect(list).toContain("hasAnyPermission(session, ['downtime.view', 'work_orders.view', 'work_orders.view_own'])");
    expect(detail).toContain("hasAnyPermission(session, ['downtime.view', 'work_orders.view', 'work_orders.view_own'])");
  });

  it('scopes non-view-all downtime lists to canonical work-order relationships', () => {
    expect(list).toContain('hasWorkOrderViewOverride(session)');
    expect(list).toContain('{ assignedTo: session.userId }');
    expect(list).toContain('{ teamLeaderId: session.userId }');
    expect(list).toContain('{ assignedSupervisorId: session.userId }');
    expect(list).toContain('{ plannerId: session.userId }');
    expect(list).toContain('{ teamMembers: { some: { userId: session.userId } } }');
    expect(list).toContain('{ maintenanceRequest: { requestedBy: session.userId } }');
  });

  it('prevents downtime creation against an unrelated or inaccessible work order', () => {
    expect(list).toContain('canAccessPlantStrict(plantScope, wo.plantId)');
    expect(list).toContain('canViewWorkOrder(session, wo)');
    expect(list).toContain('this work order is outside your workflow scope');
  });

  it('requires plant and work-order relationship scope for direct-id reads', () => {
    expect(detail).toContain('canAccessPlantStrict(plantScope, recordPlantId)');
    expect(detail).toContain('canViewWorkOrder(session, record.workOrder)');
    expect(detail).toContain('this downtime record is outside your work-order scope');
    expect(detail).toContain('maintenanceRequest: { select: { requestedBy: true } }');
  });

  it('keeps edits and deletes with the creator, accountable supervisor, or management override', () => {
    expect(detail).toContain('hasWorkOrderManagementOverride(session)');
    expect(detail).toContain('existing.workOrder?.assignedSupervisorId === session.userId');
    expect(detail).toContain('existing.createdById !== session.userId && !canManageRecord');
    expect(detail).toContain('canAccessPlantStrict(plantScope, recordPlantId)');
  });
});
