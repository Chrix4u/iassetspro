import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { canAccessPage } from '@/lib/page-access';

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

describe('permission and licensed-module navigation contract', () => {
  it('fails closed for disabled PM even for an admin', () => {
    const disabledModules = new Set(['core', 'modules', 'work_orders', 'repairs']);

    expect(canAccessPage('pm-calendar', {
      permissions: ['pm_schedules.view'],
      isAdmin: false,
      enabledModules: disabledModules,
    })).toBe(false);

    expect(canAccessPage('pm-calendar', {
      permissions: [],
      isAdmin: true,
      enabledModules: disabledModules,
    })).toBe(false);
  });

  it('requires both permission and effective module availability', () => {
    const modules = new Set(['core', 'modules', 'inventory', 'repairs', 'pm_schedules']);

    expect(canAccessPage('inventory-items', {
      permissions: [],
      isAdmin: false,
      enabledModules: modules,
    })).toBe(false);

    expect(canAccessPage('inventory-items', {
      permissions: ['inventory.view'],
      isAdmin: false,
      enabledModules: modules,
    })).toBe(true);

    expect(canAccessPage('repairs-material-requests', {
      permissions: ['repair_material_requests.view_own'],
      isAdmin: false,
      enabledModules: modules,
    })).toBe(true);
  });

  it('uses effective license state instead of fail-open module flags', () => {
    const navigation = read('src/stores/navigationStore.ts');
    const modulesApi = read('src/app/api/modules/route.ts');

    expect(navigation).toContain("new Set(['core', 'modules'])");
    expect(navigation).toContain('m.isAvailable === true');
    expect(navigation).not.toContain('m.isEnabled || m.isCore');
    expect(navigation).not.toContain('show all sidebar items');
    expect(modulesApi).toContain('const isAvailable =');
    expect(modulesApi).toContain('vendorLicenseValid');
    expect(modulesApi).toContain('companyLicensed');
  });

  it('protects full Inventory while preserving a scoped technician material catalog', () => {
    const inventory = read('src/app/api/inventory/route.ts');
    const catalog = read('src/app/api/repairs/material-catalog/route.ts');
    const seed = read('prisma/seed.ts');

    expect(inventory).toContain("hasPermission(session, 'inventory.view')");
    expect(catalog).toContain("hasPermission(session, 'repair_material_requests.create')");
    expect(catalog).toContain('workOrder.teamMembers.some');
    expect(catalog).toContain('currentStock: { gt: 0 }');
    expect(catalog).toContain('unitOfMeasure: true');
    expect(catalog).not.toContain('unitCost: true');

    const technicianBundleStart = seed.indexOf('maintenance_technician: [');
    expect(technicianBundleStart).toBeGreaterThan(-1);
    const technicianBundle = seed.slice(technicianBundleStart, technicianBundleStart + 2600);
    expect(technicianBundle).not.toContain("'inventory.view'");
  });

  it('keeps Repairs Maintenance and Preventive Maintenance navigation separate', () => {
    const sidebar = read('src/components/shared/Sidebar.tsx');
    const mobile = read('src/components/shared/MobileBottomNav.tsx');
    const palette = read('src/components/CommandPalette.tsx');

    expect(sidebar).toContain("label: 'Repairs Maintenance'");
    expect(sidebar).toContain("label: 'Preventive Maintenance (PM)'");
    expect(sidebar).toContain('canAccessPage(child.page');
    expect(mobile).toContain("label: 'Preventive Maintenance'");
    expect(mobile).toContain('canAccessPage(item.page, accessContext)');
    expect(palette).toContain('canAccessPage(item.page, accessContext)');
  });

  it('does not expose approval controls through generic update permissions', () => {
    const repairsUi = read('src/components/modules/RepairsPagesLegacy.tsx');
    const maintenanceUi = read('src/components/modules/MaintenancePages.tsx');

    expect(repairsUi).toContain('canReviewAsAssignedSupervisor');
    expect(repairsUi).not.toContain('canApproveAsSupervisor');
    expect(repairsUi).not.toContain("hasPermission('repair_tool_transfers.update')");
    expect(repairsUi).not.toContain("maintenance_planner', 'plant_manager'");
    expect(maintenanceUi).toContain("wo?.assignedSupervisorId === user?.id");
  });

  it('hides embedded PM widgets when PM is unavailable', () => {
    const dashboard = read('src/components/modules/DashboardPages.tsx');
    const maintenance = read('src/components/modules/MaintenancePages.tsx');

    expect(dashboard).not.toContain("api.get('/api/modules')");
    expect(dashboard).toContain("const pmEnabled = canAccessPage('pm-schedules', accessContext)");
    expect(dashboard).toContain('{pmEnabled && (');
    expect(maintenance).toContain("const pmEnabled = canAccessPage('pm-schedules', accessContext)");
    expect(maintenance).toContain('PM Compliance — visible only when the PM module is licensed and enabled');
  });
});
