import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

describe('MR conversion accountable-planner boundary', () => {
  const route = read('src/app/api/maintenance-requests/[id]/convert/route.ts');
  const service = read('src/services/repairPlanning.service.ts');
  const ui = read('src/components/modules/MaintenancePages.tsx');

  it('requires the exact assigned planner when an MR has a planner', () => {
    expect(route).toContain('mr.assignedPlannerId && mr.assignedPlannerId !== session.userId && !isAdmin(session)');
    expect(service).toContain('mr.assignedPlannerId && mr.assignedPlannerId !== session.userId && !isAdmin');
    expect(ui).toContain('mr.assignedPlannerId === user?.id || isAdminUser || !mr.assignedPlannerId');
  });

  it('requires approved workflow state before conversion', () => {
    expect(route).toContain("if (mr.status !== 'approved')");
    expect(service).toContain("if (mr.status !== 'approved')");
    expect(ui).toContain("mr.status === 'approved'");
  });

  it('keeps convert permission and plant authorization in front of ownership checks', () => {
    const permissionIndex = route.indexOf("maintenance_requests.convert_to_wo");
    const plantIndex = route.indexOf('authorizeMaintenanceRequestPlant');
    const plannerIndex = route.indexOf('mr.assignedPlannerId && mr.assignedPlannerId !== session.userId');

    expect(permissionIndex).toBeGreaterThan(-1);
    expect(plantIndex).toBeGreaterThan(permissionIndex);
    expect(plannerIndex).toBeGreaterThan(plantIndex);
  });
});
