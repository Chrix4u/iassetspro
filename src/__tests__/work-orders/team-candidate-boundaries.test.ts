import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (relativePath: string) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');

describe('work-order team candidate boundaries', () => {
  const candidates = read('src/app/api/work-orders/[id]/team-candidates/route.ts');
  const directTeam = read('src/app/api/work-orders/[id]/team-members/route.ts');
  const requests = read('src/app/api/work-orders/[id]/team-member-requests/route.ts');
  const reviews = read('src/app/api/work-orders/[id]/team-member-requests/[reqId]/route.ts');
  const maintenance = read('src/components/modules/MaintenancePages.tsx');

  it('scopes candidate discovery to accountable WO assignment actors and the WO plant', () => {
    expect(candidates).toContain('authorizeWorkOrderPlant(request, session, id)');
    expect(candidates).toContain("hasAnyPermission(session, ['work_orders.assign_supervisor', 'work_orders.assign_technician'])");
    expect(candidates).toContain('canManageWorkOrder(session, wo) || wo.assignedBy === session.userId');
    expect(candidates).toContain("status: 'active'");
    expect(candidates).toContain('plantAccess: { some: { plantId: wo.plantId } }');
    expect(candidates).toContain("role: { slug: 'maintenance_technician' }");
    expect(candidates).toContain('id: { notIn: [...excludedIds] }');
  });

  it('applies requested trade matching on the server', () => {
    expect(candidates).toContain("const requestedTrade = searchParams.get('trade')?.trim() || ''");
    expect(candidates).toContain('...user.userSkills.flatMap((skill) => [skill.trade.name, skill.trade.code])');
    expect(candidates).toContain('return labels.includes(normalizedTrade)');
  });

  it('rejects non-technicians and invalid assistance roles before assignment', () => {
    expect(directTeam).toContain("const VALID_TEAM_ROLES = ['assistant', 'technician', 'team_leader']");
    expect(directTeam).toContain("row.role.slug === 'maintenance_technician'");
    expect(directTeam).toContain('Selected user must be an active maintenance technician');
    expect(requests).toContain("if (!['assistant', 'technician'].includes(role))");
    expect(requests).toContain('role must be assistant or technician');
    expect(requests).toContain("row.role.slug === 'maintenance_technician'");
    expect(requests).toContain('Requested user must be an active maintenance technician');
  });

  it('rechecks technician role and trade when a request is approved', () => {
    expect(reviews).toContain("assignee.userRoles.some((row) => row.role.slug === 'maintenance_technician')");
    expect(reviews).toContain('Selected user is not an active maintenance technician.');
    expect(reviews).toContain('Selected technician does not have the requested trade/skill');
  });

  it('uses WO-scoped candidate lookup for direct add and request approval', () => {
    const addDialog = maintenance.match(
      /\{\/\* Add Team Member Dialog \*\/\}[\s\S]*?\{\/\* Request Team Member Dialog/
    )?.[0] || '';
    expect(addDialog).toContain('/team-candidates?');
    expect(addDialog).not.toContain('/api/users?limit=100');

    const approveDialog = maintenance.match(
      /\{\/\* Assign Technician Dialog[\s\S]*?\{\/\* Right Panel/
    )?.[0] || '';
    expect(approveDialog).toContain('/team-candidates?');
    expect(approveDialog).not.toContain('/api/workers?role=technician');
  });

  it('keeps UI team roles aligned with canonical execution roles', () => {
    const addDialog = maintenance.match(
      /\{\/\* Add Team Member Dialog \*\/\}[\s\S]*?\{\/\* Request Team Member Dialog/
    )?.[0] || '';
    expect(addDialog).toContain('<SelectItem value="assistant">Assistant</SelectItem>');
    expect(addDialog).toContain('<SelectItem value="technician">Technician</SelectItem>');
    expect(addDialog).toContain('<SelectItem value="team_leader">Team Leader</SelectItem>');
    expect(addDialog).not.toContain('<SelectItem value="specialist">Specialist</SelectItem>');
    expect(addDialog).not.toContain('<SelectItem value="supervisor">Supervisor</SelectItem>');

    const requestDialog = maintenance.match(
      /\{\/\* Request Team Member Dialog[\s\S]*?\{\/\* Assign Technician Dialog/
    )?.[0] || '';
    expect(requestDialog).toContain('<SelectItem value="assistant">Assistant</SelectItem>');
    expect(requestDialog).toContain('<SelectItem value="technician">Technician</SelectItem>');
    expect(requestDialog).not.toContain('<SelectItem value="team_leader">Team Leader</SelectItem>');
    expect(requestDialog).not.toContain('<SelectItem value="specialist">Specialist</SelectItem>');
  });
});
