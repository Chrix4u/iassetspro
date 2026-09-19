import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

describe('navigation, module, and action permission boundaries', () => {
  const sidebar = read('src/components/shared/Sidebar.tsx');
  const mobile = read('src/components/shared/MobileBottomNav.tsx');
  const app = read('src/components/EAMApp.tsx');
  const moduleHook = read('src/hooks/useModuleEnabled.ts');
  const navStore = read('src/stores/navigationStore.ts');
  const modulesApi = read('src/app/api/modules/route.ts');
  const pageAccess = read('src/lib/page-access.ts');
  const dashboard = read('src/components/modules/DashboardPages.tsx');
  const maintenance = read('src/components/modules/MaintenancePages.tsx');
  const repairs = read('src/components/modules/RepairsPagesLegacy.tsx');
  const inventoryApi = read('src/app/api/inventory/route.ts');
  const materialListApi = read('src/app/api/repairs/material-requests/route.ts');
  const toolListApi = read('src/app/api/repairs/tool-requests/route.ts');
  const permissionSeed = read('prisma/seed-permissions-only.ts');
  const fullSeed = read('prisma/seed.ts');
  const uatSeed = read('scripts/seed-repairs-uat.ts');
  const singleTechUat = read('e2e/repairs/scenario-a-single-tech.spec.ts');
  const repairsModuleMigration = read('prisma/migrations/20260919215000_register_repairs_module/migration.sql');

  it('separates Repairs Maintenance from PM Maintenance', () => {
    expect(sidebar).toContain("label: 'Repairs Maintenance'");
    expect(sidebar).toContain("label: 'PM Maintenance'");
    expect(sidebar).toContain("label: 'PM Maintenance', icon: Calendar, perm: 'pm_schedules.view', moduleCode: 'pm_schedules'");
    expect(sidebar).not.toContain("label: 'Maintenance', icon: Wrench");
    expect(mobile).toContain("label: 'Repairs Maintenance'");
    expect(mobile).toContain("label: 'PM Maintenance'");
  });

  it('filters each navigation child by its own permission and enabled module', () => {
    expect(sidebar).toContain('pageHasPermission(child.page');
    expect(sidebar).toContain('pageModuleIsEnabled(child.page');
    expect(sidebar).toContain("group.children!.filter(childVisible)");
    expect(app).toContain('PAGE_PERMISSIONS[page]');
    expect(app).toContain('pageModuleIsEnabled(page, enabledModules)');
    expect(pageAccess).toContain("'inventory-items': ['inventory.view_all'");
  });

  it('maps every permissioned page to a module so direct navigation cannot bypass licensing', () => {
    const [permissionSection, moduleAndRest] = pageAccess.split('export const PAGE_MODULES');
    const [moduleSection] = moduleAndRest.split('export const CORE_MODULE_CODES');
    const permissionPages = [...permissionSection.matchAll(/^\s*'([^']+)':\s*\[/gm)].map((m) => m[1]);
    const modulePages = new Set([...moduleSection.matchAll(/^\s*'([^']+)':\s*'[^']+'/gm)].map((m) => m[1]));
    expect(permissionPages.filter((page) => !modulePages.has(page))).toEqual([]);
  });

  it('fails closed for optional disabled or unlicensed modules', () => {
    expect(modulesApi).toContain('const systemLicenseValid');
    expect(modulesApi).toContain('m.isSystemLicensed === true');
    expect(modulesApi).toContain('m.validUntil >= now');
    expect(modulesApi).toContain('const isLicensed');
    expect(navStore).toContain('m.isLicensed === true');
    expect(navStore).toContain('m.isEnabled === true');
    expect(navStore).toContain('m.isActive === true');
    expect(navStore).toContain('set({ enabledModules: new Set<string>() })');
    expect(pageAccess).toContain('if (CORE_MODULE_CODES.has(code)) return true');
    expect(pageAccess).toContain('if (enabledModules === null) return false');
    expect(sidebar).toContain('if (CORE_MODULE_CODES.has(normalized)) return true');
    expect(mobile).toContain('if (!CORE_MODULE_CODES.has(code)');
    expect(moduleHook).toContain('if (CORE_MODULE_CODES.has(normalized)) return true');
    expect(moduleHook).toContain('if (enabledModules === null) return false');
    expect(moduleHook).not.toContain('if (enabledModules === null) return true');
  });

  it('removes PM widgets and actions when PM is disabled', () => {
    expect(dashboard).toContain("const pmEnabled = pageModuleIsEnabled('pm-schedules', enabledModules)");
    expect(dashboard).not.toContain('enabledModules.size === 0 || enabledModules.has(MODULE_CODES.PM_SCHEDULES)');
    expect(dashboard).toContain('{pmEnabled && <button onClick={() => navigate(\'pm-schedules\')}');
    expect(maintenance).toContain('const pmEnabled = useModuleEnabled(MODULE_CODES.PM_SCHEDULES)');
    expect(maintenance).toContain("a.page !== 'pm-calendar' || pmEnabled");
    expect(maintenance).toContain('{pmEnabled && <Card');
  });

  it('keeps technician inventory access request-scoped rather than exposing the workspace', () => {
    expect(inventoryApi).toContain("const isLookup = mode === 'lookup'");
    expect(inventoryApi).toContain('const canUseInventoryWorkspace');
    expect(inventoryApi).toContain('const canLookupForWork');
    expect(inventoryApi).toContain("'repair_material_requests.create'");
    expect(inventoryApi).toContain('unitOfMeasure: true');
    expect(repairs).toContain("api.get('/api/inventory?mode=lookup&limit=500')");
    expect(sidebar).toContain("label: 'Inventory', icon: Package, perm: 'inventory.view_all'");
    expect(singleTechUat).toContain("expect(blockedInventory.status).toBe(403)");
    expect(singleTechUat).toContain('/api/inventory?mode=lookup&search=');
    expect(singleTechUat).toContain('expect(lookupMaterial.unitCost).toBeUndefined()');
  });

  it('does not grant the maintenance technician the full inventory workspace in seed bundles', () => {
    const permissionTech = permissionSeed.match(/maintenance_technician:\s*\[([\s\S]*?)\n\s*\],/);
    const fullTech = fullSeed.match(/maintenance_technician:\s*\[([\s\S]*?)\n\s*\],/);
    expect(permissionTech?.[1]).toBeTruthy();
    expect(fullTech?.[1]).toBeTruthy();
    expect(permissionTech?.[1]).not.toContain("'inventory.view'");
    expect(fullTech?.[1]).not.toContain("'inventory.view'");
    expect(permissionTech?.[1]).toContain("'repair_material_requests.create'");
    expect(fullTech?.[1]).toContain("'repair_material_requests.create'");
  });

  it('models Repairs as a licensed optional domain without implicitly enabling PM', () => {
    expect(fullSeed).toContain("{ code: 'repairs', name: 'Repairs Maintenance'");
    expect(uatSeed).toContain("where: { code: 'repairs' }");
    expect(uatSeed).toContain("isSystemLicensed: true");
    expect(uatSeed).toContain("isEnabled: true");
    expect(uatSeed).toContain("isActive: true");
    expect(uatSeed).not.toContain("where: { code: 'pm_schedules' }");
    expect(repairsModuleMigration).toContain("'repairs'");
    expect(repairsModuleMigration).toContain('INSERT INTO `system_modules`');
    expect(repairsModuleMigration).toContain('INSERT INTO `company_modules`');
    expect(repairsModuleMigration).not.toContain("'pm_schedules'");
  });

  it('matches resource approval buttons to the accountable supervisor rule', () => {
    expect(repairs).toContain('function canApproveAsSupervisor(request: any, user: any)');
    expect(repairs).toContain("roles.includes('maintenance_manager') || roles.includes('plant_manager')");
    expect(repairs).toContain("roles.includes('maintenance_supervisor')");
    expect(repairs).toContain('request.workOrder.assignedSupervisorId === userId');
    expect(repairs).not.toContain("return isAdmin() || userRoles.some((slug: string) => supervisorRoles.includes(slug)) || hasPermission('repair_material_requests.update')");
    expect(materialListApi).toContain('assignedSupervisorId: true');
    expect(toolListApi).toContain('assignedSupervisorId: true');
  });

  it('shows request creation only when the matching API create permission exists', () => {
    expect(repairs).toContain("hasPermission('repair_material_requests.create') || isAdmin()");
    expect(repairs).toContain("hasPermission('repair_tool_requests.create') || isAdmin()");
    expect(repairs).not.toContain("hasPermission('repair_material_requests.update') || hasPermission('work_orders.create') || hasPermission('work_orders.update')");
  });
});
