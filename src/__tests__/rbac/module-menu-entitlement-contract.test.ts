import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

describe('RBAC navigation and module entitlement contract', () => {
  const navStore = read('src/stores/navigationStore.ts');
  const moduleHook = read('src/hooks/useModuleEnabled.ts');
  const sidebar = read('src/components/shared/Sidebar.tsx');
  const mobile = read('src/components/shared/MobileBottomNav.tsx');
  const app = read('src/components/EAMApp.tsx');
  const dashboard = read('src/components/modules/DashboardPages.tsx');
  const access = read('src/lib/page-access.ts');
  const inventoryApi = read('src/app/api/inventory/route.ts');
  const repairs = read('src/components/modules/RepairsPagesLegacy.tsx');
  const seed = read('prisma/seed-permissions-only.ts');

  it('requires non-core modules to be both licensed and enabled and fails closed', () => {
    expect(navStore).toContain('m.isActive === true && m.isEnabled === true');
    expect(navStore).toContain('set({ enabledModules: new Set<string>() })');
    expect(moduleHook).toContain("if (enabledModules === null) return false");
    expect(dashboard).not.toContain('enabledModules.size === 0 || enabledModules.has(MODULE_CODES.PM_SCHEDULES)');
    expect(dashboard).toContain('const pmEnabled = enabledModules.has(MODULE_CODES.PM_SCHEDULES)');
  });

  it('separates Repairs Maintenance from Preventive Maintenance navigation', () => {
    expect(sidebar).toContain("label: 'Repairs Maintenance'");
    expect(sidebar).toContain("label: 'Preventive Maintenance (PM)'");
    expect(sidebar).toContain("page: 'pm-calendar'");
    expect(sidebar).toContain("moduleCode: 'pm_schedules'");
    expect(mobile).toContain("label: 'Preventive Maintenance'");
  });

  it('uses one canonical page policy for menu visibility and route guarding', () => {
    expect(access).toContain('PAGE_PERMISSIONS');
    expect(access).toContain('PAGE_MODULES');
    expect(sidebar).toContain("import { PAGE_MODULES, PAGE_PERMISSIONS } from '@/lib/page-access'");
    expect(app).toContain("import { PAGE_MODULES, PAGE_PERMISSIONS } from '@/lib/page-access'");
    expect(sidebar).toContain('const canonicalPerms = PAGE_PERMISSIONS[child.page] || []');
  });

  it('does not expose full Inventory access to maintenance technicians', () => {
    const techStart = seed.indexOf('maintenance_technician: [');
    const techEnd = seed.indexOf('\n  ],', techStart);
    const technicianBundle = seed.slice(techStart, techEnd);
    expect(technicianBundle).not.toContain("'inventory.view'");
    expect(technicianBundle).not.toContain("'parts.view'");

    expect(inventoryApi).toContain("purpose !== 'repair_request' || !workOrderId");
    expect(inventoryApi).toContain("{ assignedTo: session.userId }");
    expect(inventoryApi).toContain("{ teamMembers: { some: { userId: session.userId } } }");
    expect(inventoryApi).toContain("return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 })");
  });

  it('hides repair actions that the API would reject', () => {
    expect(repairs).toContain("request.workOrder.assignedSupervisorId === userId");
    expect(repairs).not.toContain("|| hasPermission('repair_tool_transfers.update'))");
    expect(repairs).toContain("hasPermission('repair_material_requests.create') || isAdmin()");
    expect(repairs).toContain("hasPermission('repair_tool_requests.create') || isAdmin()");
  });
});
