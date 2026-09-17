import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const read = (path: string) => fs.readFileSync(path, 'utf8');

describe('work order supervisor ownership and defaults', () => {
  it('requires an explicit responsible supervisor for direct technician assignment', () => {
    const page = read('src/components/modules/MaintenancePages.tsx');

    expect(page).toContain('Responsible Supervisor *');
    expect(page).toContain('responsibleSupervisorId');
    expect(page).toContain("payload.assignedSupervisorId = form.responsibleSupervisorId || undefined");
    expect(page).toContain("payload.assignedSupervisorId = convertForm.responsibleSupervisorId || undefined");
    expect(page).toContain("api.post(\`/api/work-orders/\${id}/assign\`, assignmentPayload)");
    expect(page).toContain('Select the responsible supervisor who will verify this work order');
  });

  it('stores configurable RWOP defaults and pre-populates new planning forms', () => {
    const page = read('src/components/modules/MaintenancePages.tsx');
    const settings = read('src/components/modules/SettingsPages.tsx');
    const route = read('src/app/api/settings/work-order-defaults/route.ts');

    expect(page).toContain('loadWorkOrderDefaults()');
    expect(page).toContain('defaults.safetyNotes');
    expect(page).toContain('defaults.ppeRequired');
    expect(settings).toContain('Work Order Form Defaults');
    expect(settings).toContain('/api/settings/work-order-defaults');
    expect(route).toContain("const CONFIG_KEY = 'rwop_work_order_defaults'");
    expect(route).toContain('db.systemConfig.upsert');
    expect(route).toContain('db.auditLog.create');
    expect(route).toContain('isAdmin(session)');
  });

  it('keeps technician completion, supervisor verification, and planner closure separate', () => {
    const capabilities = read('src/app/api/work-orders/[id]/capabilities/route.ts');

    expect(capabilities).toContain('canSubmitCompletion:');
    expect(capabilities).toContain("canVerify: (isSupervisor || isAdminUser) && wo.status === 'completed'");
    expect(capabilities).toContain("canClose: (isPlanner || isAdminUser) && wo.status === 'verified'");
  });
});
