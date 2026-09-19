import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

function block(source: string, start: string, end: string): string {
  const from = source.indexOf(start);
  expect(from, `missing block start: ${start}`).toBeGreaterThanOrEqual(0);
  const to = source.indexOf(end, from + start.length);
  expect(to, `missing block end: ${end}`).toBeGreaterThan(from);
  return source.slice(from, to);
}

describe('permissioned navigation and module isolation contract', () => {
  const sidebar = read('src/components/shared/Sidebar.tsx');
  const navigationStore = read('src/stores/navigationStore.ts');
  const moduleHook = read('src/hooks/useModuleEnabled.ts');
  const pageAccess = read('src/lib/page-access.ts');
  const appShell = read('src/components/EAMApp.tsx');
  const dashboard = read('src/components/modules/DashboardPages.tsx');
  const maintenancePages = read('src/components/modules/MaintenancePages.tsx');
  const repairsUi = read('src/components/modules/RepairsPagesLegacy.tsx');
  const inventoryRoute = read('src/app/api/inventory/route.ts');
  const materialCatalog = read('src/app/api/repairs/material-catalog/route.ts');
  const toolRequestAction = read('src/app/api/repairs/tool-requests/[id]/route.ts');
  const toolTransferCreate = read('src/app/api/repairs/tool-transfers/route.ts');
  const seed = read('prisma/seed.ts');
  const seedPermissions = read('prisma/seed-permissions-only.ts');
  const ensureRepairs = read('src/app/api/modules/ensure-repairs/route.ts');

  it('fails closed for disabled or unlicensed business modules', () => {
    expect(navigationStore).toContain("if (code === 'core')");
    expect(navigationStore).toContain('m.isSystemLicensed === true && m.isEnabled === true && m.isActive === true');
    expect(navigationStore).not.toContain('if (m.isCore) {\n            enabled.add(code)');
    expect(moduleHook).toContain('if (enabledModules === null) return false');
    expect(sidebar).toContain('return enabledModules !== null && enabledModules.has(normalized)');
    expect(appShell).toContain('arePageModulesEnabled(page, enabledModules)');
  });

  it('separates Repairs Maintenance from PM Maintenance and filters child pages', () => {
    expect(sidebar).toContain("label: 'Repairs Maintenance'");
    expect(sidebar).toContain("label: 'PM Maintenance'");
    expect(sidebar).toContain("{ page: 'pm-calendar', label: 'PM Calendar'");
    expect(sidebar).toContain('const children = group.children.filter');
    expect(sidebar).toContain('return pageVisible(child.page, child.moduleCode)');

    const inventoryGroup = block(sidebar, "label: 'Inventory'", "label: 'Reports'");
    expect(inventoryGroup).not.toContain("page: 'repairs-material-requests'");
    expect(inventoryGroup).not.toContain("page: 'repairs-tool-requests'");
  });

  it('keeps PM widgets hidden when the PM module is unavailable', () => {
    expect(dashboard).not.toContain('enabledModules.size === 0 || enabledModules.has(MODULE_CODES.PM_SCHEDULES)');
    expect(dashboard).toContain('const pmEnabled = enabledModules !== null && enabledModules.has(MODULE_CODES.PM_SCHEDULES)');
    expect(dashboard).toContain('{pmEnabled && (');
    expect(maintenancePages).toContain('const pmEnabled = useModuleEnabled(MODULE_CODES.PM_SCHEDULES)');
    expect(maintenancePages).toContain("a.page !== 'pm-calendar' || pmEnabled");
  });

  it('hides notifications and asset widgets when their modules are disabled', () => {
    expect(pageAccess).toContain("notifications: ['notifications']");
    expect(sidebar).toContain("page: 'notifications', moduleCode: 'notifications'");
    expect(appShell).toContain("const notificationsEnabled = enabledModules !== null && enabledModules.has('notifications')");
    expect(appShell).toContain('{notificationsEnabled && <NotificationPopover />}');
    expect(dashboard).toContain("const assetsEnabled = enabledModules !== null && enabledModules.has(MODULE_CODES.ASSETS)");
    expect(dashboard).toContain("const notificationsEnabled = enabledModules !== null && enabledModules.has('notifications')");
    expect(dashboard).toContain('if (assetsEnabled)');
    expect(dashboard).toContain('notificationsEnabled && myKPIs.unreadNotifications > 0');
  });

  it('removes full Inventory access from maintenance technicians', () => {
    const technicianSeed = block(seed, 'maintenance_technician: [', '// ── 7. PRODUCTION MANAGER');
    const technicianPermissionSeed = block(seedPermissions, 'maintenance_technician: [', '// ── 7. PRODUCTION MANAGER');
    for (const roleBlock of [technicianSeed, technicianPermissionSeed]) {
      expect(roleBlock).not.toContain("'inventory.view'");
      expect(roleBlock).not.toContain("'parts.view'");
      expect(roleBlock).toContain("'repair_material_requests.create'");
    }

    expect(inventoryRoute).toContain("hasPermission(session, 'inventory.view')");
    expect(inventoryRoute).toContain('Insufficient permissions');
  });

  it('uses a repair-scoped material catalog instead of the full Inventory API', () => {
    expect(repairsUi).toContain('/api/repairs/material-catalog?workOrderId=');
    expect(repairsUi).not.toContain("api.get('/api/inventory?limit=500')");
    expect(materialCatalog).toContain("hasPermission(session, 'repair_material_requests.create')");
    expect(materialCatalog).toContain('workOrderTeamMember.findFirst');
    expect(materialCatalog).toContain('workOrder.assignedTo === session.userId');
    expect(materialCatalog).toContain('plantId: workOrder.plantId');
    expect(materialCatalog).toContain('currentStock: true');
    expect(materialCatalog).not.toContain('unitCost: true');
    expect(materialCatalog).not.toContain('supplier:');
  });

  it('shows supervisor approval only to actors accepted by the API contract', () => {
    const supervisorHelper = block(repairsUi, 'function canApproveAsSupervisor', 'function canManageIssuedToolCustody');
    expect(supervisorHelper).toContain("'maintenance_manager'");
    expect(supervisorHelper).toContain("'plant_manager'");
    expect(supervisorHelper).toContain("'maintenance_supervisor'");
    expect(supervisorHelper).toContain('request.workOrder.assignedSupervisorId === userId');
    expect(supervisorHelper).not.toContain("'maintenance_planner'");
    expect(supervisorHelper).not.toContain('repair_material_requests.update');
  });

  it('keeps store and tool-custody actions actor-specific', () => {
    expect(repairsUi).not.toContain("hasPermission('repair_tool_transfers.update')");
    expect(repairsUi).toContain('canApproveAsStore(user)');
    expect(repairsUi).toContain('canManageIssuedToolCustody(r, user)');
    expect(toolRequestAction).toContain("action === 'return' && !isAdmin(session) && toolReq.requestedById !== session.userId");
    expect(toolTransferCreate).toContain('fromUserId !== session.userId');
    expect(toolTransferCreate).toContain('Only the current tool custodian can initiate a transfer');
  });

  it('keeps Repairs independently toggleable from the platform kernel', () => {
    expect(seed).toContain("{ code: 'repairs', name: 'Repairs Maintenance'");
    const repairsModuleSeed = seed.slice(seed.indexOf("{ code: 'repairs'"), seed.indexOf("{ code: 'inventory'"));
    expect(repairsModuleSeed).toContain('isCore: false');
    expect(ensureRepairs).toContain('isCore: false');
    expect(ensureRepairs).toContain('update: { isCore: false }');
  });

  it('maps page access to module/license gates rather than sidebar visibility alone', () => {
    expect(pageAccess).toContain("'pm-calendar': ['pm_schedules']");
    expect(pageAccess).toContain("'repairs-material-requests': ['repairs']");
    expect(pageAccess).toContain("'inventory-items': ['inventory']");
    expect(pageAccess).toContain("'maintenance-risk-assessment': ['work_orders', 'risk_assessment']");
    expect(pageAccess).toContain("'repairs-downtime': ['repairs', 'downtime']");
    expect(pageAccess).toContain("'reports-production': ['reports', 'production']");
    expect(appShell).toContain('const modulesAllowed = arePageModulesEnabled(page, enabledModules)');
  });
});
