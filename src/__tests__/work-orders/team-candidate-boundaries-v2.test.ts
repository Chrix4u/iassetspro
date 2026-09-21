import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (relativePath: string) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');

describe('work-order team candidate boundaries', () => {
  it('uses a WO-scoped active maintenance-technician directory', () => {
    const candidates = read('src/app/api/work-orders/[id]/team-candidates/route.ts');
    expect(candidates).toContain('authorizeWorkOrderPlant(request, session, id)');
    expect(candidates).toContain("role: { slug: 'maintenance_technician' }");
    expect(candidates).toContain('plantAccess: { some: { plantId: wo.plantId } }');
    expect(candidates).toContain('id: { notIn: [...excludedIds] }');
  });

  it('rejects non-technicians at direct-add, request and approval boundaries', () => {
    const direct = read('src/app/api/work-orders/[id]/team-members/route.ts');
    const request = read('src/app/api/work-orders/[id]/team-member-requests/route.ts');
    const approve = read('src/app/api/work-orders/[id]/team-member-requests/[reqId]/route.ts');
    expect(direct).toContain('Selected user must be an active maintenance technician');
    expect(request).toContain('Requested user must be an active maintenance technician');
    expect(request).toContain("if (!['assistant', 'technician'].includes(role))");
    expect(approve).toContain('Selected user is not an active maintenance technician.');
  });

  it('uses scoped candidates and canonical execution roles in the UI', () => {
    const ui = read('src/components/modules/MaintenancePages.tsx');
    expect(ui).toContain('/team-candidates?');
    expect(ui).toContain('<SelectItem value="technician">Technician</SelectItem>');
    expect(ui).toContain('<SelectItem value="team_leader">Team Leader</SelectItem>');
  });
});
