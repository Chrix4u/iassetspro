import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

describe('RBAC and licensed-module visibility contract', () => {
  const sidebar = read('src/components/shared/Sidebar.tsx');
  const mobile = read('src/components/shared/MobileBottomNav.tsx');
  const navigation = read('src/stores/navigationStore.ts');
  const moduleHook = read('src/hooks/useModuleEnabled.ts');
  const app = read('src/components/EAMApp.tsx');
  const dashboard = read('src/components/modules/DashboardPages.tsx');
  const repairs = read('src/components/modules/RepairsPagesLegacy.tsx');
  const maintenance = read('src/components/modules/MaintenancePages.tsx');
  const inventory = read('src/app/api/inventory/route.ts');
  const inventoryDetail = read('src/app/api/inventory/[id]/route.ts');
  const inventoryAccess = read('src/lib/inventory-access.ts');
  const materialCatalog = read('src/app/api/repairs/material-catalog/route.ts');
  const materialRoute = read('src/app/api/repairs/material-requests/route.ts');
  const pmSchedulesRoute = read('src/app/api/pm-schedules/route.ts');
  const pmScheduleDetailRoute = read('src/app/api/pm-schedules/[id]/route.ts');
  const pmTemplatesRoute = read('src/app/api/pm-templates/route.ts');
  const toolRoute = read('src/app/api/repairs/tool-requests/route.ts');
  const seed = read('prisma/seed-permissions-only.ts');

  it('fails closed while module/license state is unknown or unavailable', () => {
    expect(navigation).toContain("set({ enabledModules: new Set(['core']) })");
    expect(navigation).not.toContain('keep null so all sidebar items remain visible');
    expect(moduleHook).toContain('if (enabledModules === null) return false');
    expect(sidebar).toContain('if (!modulesLoaded) return false');
    expect(mobile).toContain('if (!enabledModules) return false');
    expect(dashboard).not.toContain('enabledModules.size === 0 || enabledModules.has(MODULE_CODES.PM_SCHEDULES)');
  });

  it('keeps PM navigation and embedded UI separate from repair maintenance', () => {
    expect(sidebar).toContain("label: 'Repair Maintenance'");
    expect(sidebar).toContain("label: 'Repair Execution'");
    expect(sidebar).toContain("label: 'Preventive Maintenance (PM)'");
    expect(sidebar).toContain("moduleCode: 'pm_schedules'");
    expect(sidebar).toContain("page: 'pm-calendar'");
    expect(mobile).toContain("label: 'Preventive Maintenance'");
    expect(maintenance).toContain('const pmEnabled = useModuleEnabled(MODULE_CODES.PM_SCHEDULES)');
    expect(maintenance).toContain('{pmEnabled && (');
    expect(maintenance).toContain('const repairsEnabled = useModuleEnabled(MODULE_CODES.REPAIRS)');
    expect(maintenance).toContain('Repair Maintenance Dashboard');
  });

  it('filters child menu items by their own permissions instead of parent visibility alone', () => {
    expect(sidebar).toContain('permissionAllowed(child.perm, child.permOr)');
    expect(sidebar).toContain("permOr: ['repair_material_requests.view', 'repair_material_requests.view_all', 'repair_material_requests.view_own']");
    expect(sidebar).toContain("perm: 'pm_templates.view'");
    expect(sidebar).toContain("page: 'inventory-locations', label: 'Locations', icon: MapPin, perm: 'inventory_locations.view'");
    expect(sidebar).toContain("page: 'reports-inventory', label: 'Inventory Reports', icon: Package, perm: 'reports.view', moduleCode: 'inventory'");
  });

  it('blocks disabled modules even when navigating directly to a page', () => {
    expect(app).toContain("if (pageName.startsWith('pm-')) return ['pm_schedules']");
    expect(app).toContain("if (pageName.startsWith('inventory-') || pageName === 'inventory') return ['inventory']");
    expect(app).toContain("if (pageName === 'reports-inventory') return ['reports', 'inventory']");
    expect(app).toContain("if (pageName === 'reports-production') return ['reports', 'production']");
    expect(app).toContain("nonCoreRequiredModules.some(code => !enabledModules.has(code))");
    expect(app).toContain("if (moduleDisabled)");
    expect(app).toContain("if (modulesPending || moduleDisabled) return <LoadingSkeleton />");
  });


  it('keeps PM authorization independent from repair work-order permissions', () => {
    expect(pmSchedulesRoute).toContain("hasPermission(session, 'pm_schedules.view')");
    expect(pmSchedulesRoute).toContain("hasPermission(session, 'pm_schedules.create')");
    expect(pmSchedulesRoute).not.toContain("hasPermission(session, 'work_orders.create')");
    expect(pmScheduleDetailRoute).toContain("hasPermission(session, 'pm_schedules.view')");
    expect(pmScheduleDetailRoute).toContain("hasPermission(session, 'pm_schedules.update')");
    expect(pmScheduleDetailRoute).toContain("hasPermission(session, 'pm_schedules.delete')");
    expect(pmScheduleDetailRoute).not.toContain("hasPermission(session, 'work_orders.update')");
    expect(pmTemplatesRoute).toContain("hasPermission(session, 'pm_templates.view')");
    expect(maintenance).toContain("hasPermission('pm_schedules.create')");
    expect(maintenance).toContain("hasPermission('pm_schedules.update')");
    expect(maintenance).toContain("hasPermission('pm_templates.create')");
    expect(maintenance).not.toContain("hasPermission('roles.update')");
  });

  it('does not grant maintenance technicians the full Inventory module', () => {
    const technicianBlock = seed.split('// ── 6. MAINTENANCE TECHNICIAN ──')[1]?.split('// ── 7. PRODUCTION MANAGER')[0] || '';
    expect(technicianBlock).not.toContain("'inventory.view'");
    expect(sidebar).toContain("'inventory.view_all', 'inventory.manage'");
    expect(app).toContain("const inventoryRoles = ['inventory_manager', 'store_keeper', 'tools_shop_attendant']");
    expect(inventoryAccess).toContain('canAccessFullInventory');
    expect(inventory).toContain('if (!canAccessFullInventory(session))');
    expect(inventoryDetail).toContain('if (!canAccessFullInventory(session))');
  });

  it('uses a work-order-scoped minimal catalog for technician material selection', () => {
    expect(materialCatalog).toContain("const workOrderId = searchParams.get('workOrderId')");
    expect(materialCatalog).toContain('const isExecutionActor =');
    expect(materialCatalog).toContain('Only the assigned technician or work-order team can browse materials');
    expect(materialCatalog).toContain('select: {');
    expect(repairs).toContain('/api/repairs/material-catalog?');
    expect(repairs).not.toContain("const fetchInventoryItems = useCallback(async () => {\n    const res = await api.get('/api/inventory?limit=500')");
  });

  it('shows supervisor approval controls only to actors accepted by the server policy', () => {
    expect(repairs).toContain('function canApproveAsSupervisor(request: any, user: any)');
    expect(repairs).toContain("roles.has('maintenance_supervisor')");
    expect(repairs).toContain('request.workOrder.assignedSupervisorId === actor?.id');
    expect(repairs).not.toContain("hasPermission('repair_material_requests.update')");
    expect(maintenance).toContain("wo.assignedSupervisorId === user?.id");
    expect(maintenance).toContain("hasPermission('repair_material_requests.create')");
    expect(maintenance).toContain("hasPermission('repair_tool_transfers.create')");
    expect(materialRoute).toContain('assignedSupervisorId: true');
    expect(toolRoute).toContain('assignedSupervisorId: true');
  });
});
