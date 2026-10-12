import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const departmentsRoute = fs.readFileSync('src/app/api/departments/route.ts', 'utf8');
const departmentRoute = fs.readFileSync('src/app/api/departments/[id]/route.ts', 'utf8');
const maintenanceRequestsRoute = fs.readFileSync('src/app/api/maintenance-requests/route.ts', 'utf8');
const workersRoute = fs.readFileSync('src/app/api/workers/route.ts', 'utf8');

describe('maintenance approver eligibility contract', () => {
  it('uses one shared eligibility policy when configuring and assigning department supervisors', () => {
    expect(departmentsRoute).toContain("from '@/lib/maintenance-approvers'");
    expect(departmentRoute).toContain("from '@/lib/maintenance-approvers'");
    expect(maintenanceRequestsRoute).toContain("from '@/lib/maintenance-approvers'");
    expect(workersRoute).toContain("from '@/lib/maintenance-approvers'");
  });

  it('does not block operator request intake when an auto-derived department supervisor is stale', () => {
    expect(maintenanceRequestsRoute).toContain('const supervisorWasExplicit = Boolean(explicitSupervisorId);');
    expect(maintenanceRequestsRoute).toContain('resolvedSupervisorId = null;');
    expect(maintenanceRequestsRoute).toContain('if (supervisorWasExplicit)');
  });

  it('does not define maintenance approvers by a duplicated hard-coded role list', () => {
    expect(maintenanceRequestsRoute).not.toContain("['maintenance_supervisor', 'maintenance_manager', 'plant_manager', 'admin']");
  });
});
