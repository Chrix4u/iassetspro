import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (relativePath: string) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');

describe('work-order team candidate boundaries v2', () => {
  const candidates = read('src/app/api/work-orders/[id]/team-candidates/route.ts');
  const directTeam = read('src/app/api/work-orders/[id]/team-members/route.ts');
  const requests = read('src/app/api/work-orders/[id]/team-member-requests/route.ts');
  const reviews = read('src/app/api/work-orders/[id]/team-member-requests/[reqId]/route.ts');
  const ui = read('src/components/modules/MaintenancePages.tsx');

  it('scopes candidate discovery to accountable assignment actors, technicians, and the WO plant', () => {
    expect(candidates).toContain('authorizeWorkOrderPlant(request, session, id)');
    expect(candidates).toContain("hasAnyPermission(session, ['work_orders.assign_supervisor', 'work_orders.assign_technician'])");
    expect(candidates).toContain('canManageWorkOrder(session, wo) || wo.assignedBy === session.userId');
    expect(candidates).toContain("status: 'active'");
    expect(candidates).toContain('plantAccess: { some: { plantId: wo.plantId } }');
    expect(candidates).toContain("role: { slug: 'maintenance_technician' }");
    expect(candidates).toContain('id: { notIn: [...excludedIds] }');
  });

  it('does server-side trade matching and never trusts the client directory filter', () => {
    expect(candidates).toContain("const requestedTrade = searchParams.get('trade')?.trim() || ''");
    expect(candidates).toContain('...user.userSkills.flatMap((skill) => [skill.trade.name, skill.trade.code])');
    expect(candidates).toContain('return labels.includes(normalizedTrade)');
    expect(requests).toContain('Requested user does not have the requested trade/skill');
    expect(reviews).toContain('Selected technician does not have the requested trade/skill');
  });

  it('rejects non-technicians in direct add, request-by-person, and approval flows', () => {
    expect(directTeam).toContain("row.role.slug === 'maintenance_technician'");
    expect(directTeam).toContain('Selected user must be an active maintenance technician');
    expect(requests).toContain("if (!['assistant', 'technician'].includes(role))");
    expect(requests).toContain("row.role.slug === 'maintenance_technician'");
    expect(requests).toContain('Requested user must be an active maintenance technician');
    expect(reviews).toContain("row.role.slug === 'maintenance_technician'");
    expect(reviews).toContain('Selected user is not an active maintenance technician.');
  });

  it('uses only the WO-scoped candidate directory in team assignment dialogs', () => {
    const addDialog = ui.match(
      /\{\/\* Add Team Member Dialog \*\/\}[\s\S]*?\{\/\* Request Team Member Dialog/
    )?.[0] || '';
    const approveDialog = ui.match(
      /\{\/\* Assign Technician Dialog[\s\S]*?\{\/\* Right Panel/
    )?.[0] || '';

    expect(addDialog).toContain('/team-candidates?');
    expect(addDialog).not.toContain('/api/workers?role=all');
    expect(addDialog).toContain('<SelectItem value="technician">Technician</SelectItem>');
    expect(addDialog).toContain('<SelectItem value="team_leader">Team Leader</SelectItem>');

    expect(approveDialog).toContain('/team-candidates?');
    expect(approveDialog).not.toContain('/api/workers?role=technician');
  });
});
