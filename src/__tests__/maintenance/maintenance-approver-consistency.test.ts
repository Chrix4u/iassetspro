import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const departmentsRoute = fs.readFileSync('src/app/api/departments/route.ts', 'utf8');
const departmentRoute = fs.readFileSync('src/app/api/departments/[id]/route.ts', 'utf8');
const maintenanceRequestsRoute = fs.readFileSync('src/app/api/maintenance-requests/route.ts', 'utf8');
const approveRoute = fs.readFileSync('src/app/api/maintenance-requests/[id]/approve/route.ts', 'utf8');
const rejectRoute = fs.readFileSync('src/app/api/maintenance-requests/[id]/reject/route.ts', 'utf8');
const assignPlannerRoute = fs.readFileSync('src/app/api/maintenance-requests/[id]/assign-planner/route.ts', 'utf8');
const workersRoute = fs.readFileSync('src/app/api/workers/route.ts', 'utf8');
const approverPolicyPath = 'src/lib/maintenance-approvers.ts';

describe('maintenance approver eligibility contract', () => {
  it('uses one shared eligibility policy when configuring and assigning department supervisors', () => {
    expect(departmentsRoute).toContain("from '@/lib/maintenance-approvers'");
    expect(departmentRoute).toContain("from '@/lib/maintenance-approvers'");
    expect(maintenanceRequestsRoute).toContain("from '@/lib/maintenance-approvers'");
    expect(workersRoute).toContain("from '@/lib/maintenance-approvers'");
  });

  it('defines approvers by effective maintenance approval permission, not duplicated role names', () => {
    expect(fs.existsSync(approverPolicyPath)).toBe(true);
    if (!fs.existsSync(approverPolicyPath)) return;

    const policy = fs.readFileSync(approverPolicyPath, 'utf8');
    expect(policy).toContain("maintenance_requests.approve");
    expect(policy).toContain('directPerms');
    expect(policy).toContain('rolePermissions');
  });

  it('does not block operator request intake when an auto-derived department supervisor is stale', () => {
    expect(maintenanceRequestsRoute).toContain('const supervisorWasExplicit = Boolean(explicitSupervisorId);');
    expect(maintenanceRequestsRoute).toContain('resolvedSupervisorId = null;');
    expect(maintenanceRequestsRoute).toContain('if (supervisorWasExplicit)');
  });

  it('does not define maintenance approvers by a duplicated hard-coded role list', () => {
    expect(maintenanceRequestsRoute).not.toContain("['maintenance_supervisor', 'maintenance_manager', 'plant_manager', 'admin']");
  });

  it('does not reintroduce a maintenance_supervisor-only role gate in supervised workflow actions', () => {
    expect(approveRoute).toContain("hasAnyPermission(session, ['maintenance_requests.approve'])");
    expect(rejectRoute).toContain("hasAnyPermission(session, ['maintenance_requests.reject'])");
    expect(assignPlannerRoute).toContain("hasAnyPermission(session, ['maintenance_requests.assign_planner'])");
    expect(approveRoute).not.toContain("r.role?.slug === 'maintenance_supervisor'");
    expect(rejectRoute).not.toContain("r.role?.slug === 'maintenance_supervisor'");
    expect(assignPlannerRoute).not.toContain("r.role?.slug === 'maintenance_supervisor'");
  });
});
