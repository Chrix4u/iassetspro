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
  const moduleAccess = read('src/lib/module-access.ts');
  const moduleUpdateApi = read('src/app/api/modules/[id]/route.ts');
  const pageAccess = read('src/lib/page-access.ts');
  const commandPalette = read('src/components/CommandPalette.tsx');
  const globalSearch = read('src/components/shared/GlobalSearch.tsx');
  const searchApi = read('src/app/api/search/route.ts');
  const searchSuggestApi = read('src/app/api/search/suggest/route.ts');
  const searchAccess = read('src/lib/search-access.ts');
  const enterpriseSearch = read('src/services/enterpriseSearch.service.ts');
  const moduleReclassificationMigration = read('prisma/migrations/20260920182000_reclassify_operational_modules/migration.sql');
  const dashboard = read('src/components/modules/DashboardPages.tsx');
  const dashboardApi = read('src/app/api/dashboard/stats/route.ts');
  const repairsUatApi = read('e2e/repairs/helpers/api.ts');
  const maintenance = read('src/components/modules/MaintenancePages.tsx');
  const repairs = read('src/components/modules/RepairsPagesLegacy.tsx');
  const inventoryApi = read('src/app/api/inventory/route.ts');
  const toolsApi = read('src/app/api/tools/route.ts');
  const materialListApi = read('src/app/api/repairs/material-requests/route.ts');
  const toolListApi = read('src/app/api/repairs/tool-requests/route.ts');
  const toolDetailApi = read('src/app/api/repairs/tool-requests/[id]/route.ts');
  const toolTransferApi = read('src/app/api/repairs/tool-transfers/route.ts');
  const toolTransferDetailApi = read('src/app/api/repairs/tool-transfers/[id]/route.ts');
  const completionApi = read('src/app/api/repairs/completion/[workOrderId]/route.ts');
  const mrDetailApi = read('src/app/api/maintenance-requests/[id]/route.ts');
  const mrRejectApi = read('src/app/api/maintenance-requests/[id]/reject/route.ts');
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
    expect(pageAccess).toContain("'inventory': ['inventory.view_all'");
  });

  it('maps every permissioned page to a module so direct navigation cannot bypass licensing', () => {
    const [permissionSection, moduleAndRest] = pageAccess.split('export const PAGE_MODULES');
    const [moduleSection] = moduleAndRest.split('export const CORE_MODULE_CODES');
    const permissionPages = [...permissionSection.matchAll(/^\s*'([^']+)':\s*\[/gm)].map((m) => m[1]);
    const modulePages = new Set([...moduleSection.matchAll(/^\s*'([^']+)':\s*(?:'[^']+'|\[[^\]]+\])/gm)].map((m) => m[1]));
    expect(permissionPages.filter((page) => !modulePages.has(page))).toEqual([]);
  });

  it('fails closed for every operational disabled or unlicensed module', () => {
    expect(moduleAccess).toContain("CONTROL_PLANE_CORE_MODULE_CODES = new Set(['core', 'modules'])");
    expect(moduleAccess).toContain('systemModule.isSystemLicensed === true');
    expect(moduleAccess).toContain('Boolean(companyModule?.licensedAt)');
    expect(moduleAccess).toContain('companyModule?.isEnabled === true');
    expect(moduleAccess).toContain('companyModule?.isActive === true');
    expect(modulesApi).toContain('isSystemModuleLicensed(m, now)');
    expect(modulesApi).toContain('isControlPlaneCoreModule(m.code)');
    expect(navStore).toContain('m.isLicensed === true');
    expect(navStore).toContain('m.isEnabled === true');
    expect(navStore).toContain('m.isActive === true');
    expect(navStore).toContain('set({ enabledModules: new Set<string>() })');
    expect(pageAccess).toContain("CORE_MODULE_CODES = new Set(['core'])");
    expect(pageAccess).toContain('codes.every((code) =>');
    expect(pageAccess).toContain('enabledModules?.has(code) === true');
    expect(moduleHook).toContain('if (CORE_MODULE_CODES.has(normalized)) return true');
    expect(moduleHook).toContain('if (enabledModules === null) return false');
    expect(moduleHook).not.toContain('if (enabledModules === null) return true');
    expect(mobile).toContain('pageModuleIsEnabled(page, enabledModules)');
  });

  it('treats assets, WO, requests, and inventory as license-controlled operational modules', () => {
    expect(fullSeed).toContain("{ code: 'assets', name: 'Asset Management', description: 'Complete asset registry, hierarchy, tracking, and lifecycle management', isCore: false");
    expect(fullSeed).toContain("{ code: 'maintenance_requests', name: 'Maintenance Requests', description: 'Submit, review, approve, and convert maintenance requests with full workflow', isCore: false");
    expect(fullSeed).toContain("{ code: 'work_orders', name: 'Work Orders', description: 'Plan, assign, execute, and track maintenance work orders with SLA management', isCore: false");
    expect(fullSeed).toContain("{ code: 'inventory', name: 'Inventory & Spare Parts', description: 'Manage spare parts inventory, stock levels, locations, and replenishment', isCore: false");
    expect(moduleUpdateApi).toContain('isControlPlaneCoreModule(systemModule.code)');
    expect(moduleReclassificationMigration).toContain("'assets', 'maintenance_requests', 'work_orders', 'inventory'");
    expect(moduleReclassificationMigration).toContain('SET `isCore` = 0');
  });

  it('requires every module behind composite analytics and report pages', () => {
    expect(pageAccess).toContain("'reports-inventory': ['reports', 'inventory']");
    expect(pageAccess).toContain("'reports-production': ['reports', 'production']");
    expect(pageAccess).toContain("'reports-quality': ['reports', 'quality']");
    expect(pageAccess).toContain("'reports-safety': ['reports', 'safety']");
    expect(pageAccess).toContain("'reports-asset': ['reports', 'assets']");
    expect(pageAccess).toContain("'reports-maintenance': ['reports', 'work_orders', 'maintenance_requests']");
    expect(pageAccess).toContain("'maintenance-analytics': ['work_orders', 'analytics']");
    expect(pageAccess).toContain("'repairs-analytics': ['repairs', 'analytics']");
  });

  it('applies module gating to mobile navigation, command palette, app shell, and global search', () => {
    expect(mobile).toContain('pageModuleIsEnabled(page, enabledModules)');
    expect(commandPalette).toContain('pageModuleIsEnabled(page, enabledModules)');
    expect(commandPalette).toContain('buildNavigationItems().filter');
    expect(mobile).toContain('const resolvedPage = candidates.find((page) => canOpenPage(page))');
    expect(mobile).toContain('return resolvedPage ? [{ ...item, page: resolvedPage }] : []');
    expect(globalSearch).toContain('setResults(Array.isArray(res.data.groups) ? res.data.groups : [])');
    expect(app).toContain("pageModuleIsEnabled('notifications', enabledModules)");
    expect(searchApi).toContain('buildSearchAccessContext(request, session)');
    expect(searchApi).toContain('const groups = [...grouped.entries()]');
    expect(searchApi).toContain('...results,');
    expect(searchApi).toContain('groups,');
    expect(searchSuggestApi).toContain('buildSearchAccessContext(request, session)');
    expect(searchAccess).toContain('buildOperationalModuleSet(moduleRows)');
    expect(searchAccess).toContain("operationalModules.has('work_orders')");
    expect(searchAccess).toContain("operationalModules.has('maintenance_requests')");
    expect(enterpriseSearch).toContain("where.plantId = plantIds.length > 0 ? { in: plantIds } : '__ACCESS_DENIED__'");
    expect(enterpriseSearch).toContain("{ teamMembers: { some: { userId } } }");
  });

  it('keeps dashboard own-work cards and data aligned with view_own scope', () => {
    expect(dashboard).toContain('pageHasPermission(card.page, hasPermission, isAdmin())');
    expect(dashboard).toContain('pageHasPermission(action.page, hasPermission, isAdmin())');
    expect(dashboardApi).toContain("where: { userId: session.userId }");
    expect(dashboardApi).toContain("{ assignedTo: session.userId }");
    expect(dashboardApi).toContain("{ id: { in: teamIds } }");
    expect(dashboardApi).toContain("where: { ...woWhere, createdAt: { gte: sevenDaysAgo } }");
    expect(dashboardApi).toContain("where: { ...mrWhere, createdAt: { gte: sevenDaysAgo } }");
    expect(dashboardApi).toContain("pendingMrWhere = { ...plantFilter");
    expect(dashboardApi).not.toContain('db.$queryRaw');
  });

  it('hides dashboard module cards when their destination page is not authorized', () => {
    expect(dashboard).toContain('pageHasPermission(mod.page, hasPermission, isAdmin())');
    expect(dashboard).toContain('pageModuleIsEnabled(mod.page, enabledModules)');
    expect(dashboard).toContain("page: 'inventory-items' as PageName");
    expect(dashboard).toContain("pageHasPermission('analytics-kpi', hasPermission, isAdmin())");
    expect(dashboard).toContain("pageHasPermission('reports-financial', hasPermission, isAdmin())");
  });

  it('keeps repair UAT tool discovery on the constrained lookup endpoint', () => {
    expect(repairsUatApi).toContain("/api/tools?mode=lookup&search=");
    expect(repairsUatApi).not.toContain("/api/tools?search=");
  });

  it('uses valid indirect plant scopes for optional-module dashboard models', () => {
    expect(dashboardApi).toContain('const departmentPlantFilter');
    expect(dashboardApi).toContain('const iotAlertPlantFilter');
    expect(dashboardApi).toContain('...departmentPlantFilter');
    expect(dashboardApi).toContain('...iotAlertPlantFilter');
    expect(dashboardApi).toContain('canViewSafetyKPIs');
    expect(dashboardApi).toContain('canViewIoTKPIs');
    expect(dashboardApi).toContain('canViewQualityKPIs');
    expect(dashboardApi).not.toContain("db.iotAlert.count({ where: { ...plantFilter, status: 'active' } })");
    expect(dashboardApi).not.toContain("db.nonConformanceReport.count({ where: { ...plantFilter");
    expect(dashboardApi).not.toContain("db.qualityAudit.count({ where: { ...plantFilter");
  });

  it('redacts unauthorized or disabled cross-module dashboard data server-side', () => {
    expect(dashboardApi).toContain("const dashboardModuleCodes = [");
    expect(dashboardApi).toContain("'assets'");
    expect(dashboardApi).toContain("'maintenance_requests'");
    expect(dashboardApi).toContain("'work_orders'");
    expect(dashboardApi).toContain("'inventory'");
    expect(dashboardApi).toContain("'notifications'");
    expect(dashboardApi).toContain('buildOperationalModuleSet(moduleRows)');
    expect(dashboardApi).toContain("moduleOperational('assets')");
    expect(dashboardApi).toContain("moduleOperational('inventory')");
    expect(dashboardApi).toContain("moduleOperational('pm_schedules')");
    expect(dashboardApi).toContain("moduleOperational('work_orders')");
    expect(dashboardApi).toContain("moduleOperational('maintenance_requests')");
    expect(dashboardApi).toContain('assetHealth: canViewAssetKPIs ?');
    expect(dashboardApi).toContain('inventoryAlerts: canViewInventoryKPIs ?');
    expect(dashboardApi).toContain('pmScheduleAlerts: canViewPmKPIs ?');
    expect(dashboardApi).toContain('costAnalysis: canViewFinancialKPIs ?');
    expect(dashboardApi).toContain('canViewNotificationsKPIs');
  });

  it('initializes dashboard module guards before any KPI or chart reads them', () => {
    const pmGuardIndex = dashboard.indexOf("const pmEnabled = pageHasPermission('pm-schedules'");
    const pmChartUseIndex = dashboard.indexOf("...(pmEnabled ? [{ type: 'preventive'");
    const pmActionUseIndex = dashboard.indexOf("{pmEnabled && <button");

    expect(pmGuardIndex).toBeGreaterThan(-1);
    expect(pmChartUseIndex).toBeGreaterThan(pmGuardIndex);
    expect(pmActionUseIndex).toBeGreaterThan(pmGuardIndex);
  });

  it('removes PM widgets and actions when PM is disabled', () => {
    expect(dashboard).toContain("pageHasPermission('pm-schedules', hasPermission, isAdmin())");
    expect(dashboard).toContain("pageModuleIsEnabled('pm-schedules', enabledModules)");
    expect(dashboard).not.toContain('enabledModules.size === 0 || enabledModules.has(MODULE_CODES.PM_SCHEDULES)');
    expect(dashboard).toContain('{pmEnabled && <button onClick={() => navigate(\'pm-schedules\')}');
    expect(dashboard).toContain("...(pmEnabled ? [{ type: 'preventive'");
    expect(dashboard).toContain('if (pmEnabled) {');
    expect(dashboard).toContain('key="planned-ratio"');
    expect(maintenance).toContain('const pmEnabled = useModuleEnabled(MODULE_CODES.PM_SCHEDULES)');
    expect(maintenance).toContain("a.page !== 'pm-calendar' || pmEnabled");
    expect(maintenance).toContain('{pmEnabled && <Card');
    expect(maintenance).toContain("...(pmEnabled ? [{ type: 'Preventive'");
  });

  it('gates Repairs resource pages and completion embeds by their source modules', () => {
    expect(pageAccess).toContain("'repairs-material-requests': ['repairs', 'inventory']");
    expect(pageAccess).toContain("'repairs-spare-part-returns': ['repairs', 'inventory']");
    expect(pageAccess).toContain("'repairs-tool-requests': ['repairs', 'tools']");
    expect(pageAccess).toContain("'repairs-tool-transfers': ['repairs', 'tools']");
    expect(pageAccess).toContain("'repairs-damaged-tools': ['repairs', 'tools']");
    expect(repairs).toContain('const inventoryEnabled = useModuleEnabled(MODULE_CODES.INVENTORY)');
    expect(repairs).toContain('const toolsEnabled = useModuleEnabled(MODULE_CODES.TOOLS)');
    expect(repairs).toContain('const reportsEnabled = useModuleEnabled(MODULE_CODES.REPORTS)');
    expect(repairs).toContain('const analyticsEnabled = useModuleEnabled(MODULE_CODES.ANALYTICS)');
    expect(repairs).toContain('toolsEnabled');
    expect(repairs).toContain('inventoryEnabled');
    expect(repairs).toContain('{(toolsEnabled || inventoryEnabled) && <Card');
    expect(repairs).toContain("{assetsEnabled && <div className='space-y-2'>");
  });
  it('keeps technician inventory access request-scoped rather than exposing the workspace', () => {
    expect(inventoryApi).toContain("const isLookup = mode === 'lookup'");
    expect(inventoryApi).toContain('const canUseInventoryWorkspace');
    expect(inventoryApi).toContain('const canLookupForWork');
    expect(inventoryApi).toContain("'repair_material_requests.create'");
    expect(inventoryApi).toContain('unitOfMeasure: true');
    expect(repairs).toContain("api.get('/api/inventory?mode=lookup&limit=500')");
    expect(inventoryApi).toContain("'work_orders.create'");
    expect(inventoryApi).toContain("'work_orders.update'");
    expect(inventoryApi).toContain("'maintenance_requests.update'");
    expect(maintenance).toContain("api.get('/api/inventory?mode=lookup&limit=100')");
    expect(maintenance).not.toContain("api.get('/api/inventory?limit=100')");
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

  it('models Repairs and its explicit UAT dependencies without implicitly enabling PM', () => {
    expect(fullSeed).toContain("{ code: 'repairs', name: 'Repairs Maintenance'");
    expect(uatSeed).toContain("code: 'repairs'");
    expect(uatSeed).toContain("code: 'work_orders'");
    expect(uatSeed).toContain("code: 'maintenance_requests'");
    expect(uatSeed).toContain("code: 'assets'");
    expect(uatSeed).toContain("code: 'inventory'");
    expect(uatSeed).toContain("code: 'tools'");
    expect(uatSeed).toContain("code: 'reports'");
    expect(uatSeed).toContain("code: 'analytics'");
    expect(uatSeed).toContain("companyId: '__default__'");
    expect(uatSeed).toContain("isSystemLicensed: true");
    expect(uatSeed).toContain("isEnabled: true");
    expect(uatSeed).toContain("isActive: true");
    expect(uatSeed).not.toContain("code: 'pm_schedules'");
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

  it('keeps tool return and transfer actions aligned with actual custody', () => {
    expect(toolDetailApi).toContain("if (action === 'return')");
    expect(toolDetailApi).toContain('toolReq.requestedById !== session.userId');
    expect(toolDetailApi).toContain('Only the technician/custodian who received this tool request may submit its return');
    expect(toolTransferApi).toContain('fromUserId !== session.userId');
    expect(toolTransferApi).toContain('tool.assignedToId !== fromUserId');
    expect(repairs).toContain('function canActAsToolCustodian(request: any, user: any)');
    expect(repairs).toContain('function canTransferToolCustody(request: any, user: any)');
    expect(singleTechUat).toContain('expect(blockedReturn.status).toBe(403)');
    expect(singleTechUat).toContain('expect(blockedTransfer.status).toBe(403)');
  });

  it('shows request creation only when the matching API create permission exists', () => {
    expect(repairs).toContain("hasPermission('repair_material_requests.create') || isAdmin()");
    expect(repairs).toContain("hasPermission('repair_tool_requests.create') || isAdmin()");
    expect(repairs).not.toContain("hasPermission('repair_material_requests.update') || hasPermission('work_orders.create') || hasPermission('work_orders.update')");
  });

  it('does not let update permissions imply domain-wide repair visibility', () => {
    expect(repairs).toContain("canViewAllRepairData(user, ['repair_material_requests.view', 'repair_material_requests.view_all'])");
    expect(repairs).toContain("canViewAllRepairData(user, ['repair_tool_requests.view', 'repair_tool_requests.view_all'])");
    expect(repairs).not.toContain("hasPermission('repair_material_requests.update') || hasPermission('work_orders.view_all')");
  });

  it('does not render or load a page before its permission and module checks pass', () => {
    expect(app).toContain('const moduleResolved = pageModuleStateResolved(page, enabledModules)');
    expect(app).toContain('const pageAllowed = permissionAllowed && moduleAllowed');
    expect(app).toContain('if (!moduleResolved || !pageAllowed) return;');
    expect(app).toContain('if (!moduleResolved || !pageAllowed) return <LoadingSkeleton />;');
  });

  it('uses the authoritative department supervisor for MR action visibility and rejection', () => {
    expect(mrDetailApi).toContain('supervisorId: true');
    expect(maintenance).toContain('const accountableSupervisorId = mr.departmentId');
    expect(maintenance).toContain('mr.department?.supervisorId');
    expect(maintenance).not.toContain('The frontend can\'t easily query Department.supervisorId');
    expect(mrRejectApi).toContain('const department = await db.department.findUnique');
    expect(mrRejectApi).toContain('department.supervisorId !== session.userId');
    expect(mrRejectApi).not.toContain('const requesterDept = mr.requester?.department');
    expect(mrRejectApi).not.toContain('const deptMatch = requesterDept && userDept');
  });

  it('binds completion review and closure to the assigned accountable actors', () => {
    expect(completionApi).toContain('wo.assignedSupervisorId === session.userId');
    expect(completionApi).toContain('wo.plannerId === session.userId');
    expect(completionApi).toContain("hasRole(session, 'maintenance_supervisor')");
    expect(completionApi).toContain("hasRole(session, 'maintenance_planner')");
    expect(completionApi).not.toContain('Only supervisors, managers, or planners can perform this action');
    expect(repairs).toContain('function canSubmitCompletion(completion: any, user: any)');
    expect(repairs).toContain('function canReviewCompletion(completion: any, user: any)');
    expect(repairs).toContain('function canCloseCompletion(completion: any, user: any)');
    expect(repairs).toContain('completion.workOrder.assignedSupervisorId === userId');
    expect(repairs).toContain('completion.workOrder.plannerId === userId');
    expect(repairs).not.toContain("completion.supervisorStatus === 'pending_review' && (hasPermission('work_orders.update') || isAdmin())");
  });

  it('keeps tool transfer approvals and physical handover controls aligned with the API', () => {
    expect(repairs).not.toContain("hasPermission('repair_tool_transfers.update')");
    expect(repairs).toContain('canApproveAsStore(user)');
    expect(repairs).toContain("t.status === 'awaiting_handover' && user?.id === t.fromUserId");
    expect(repairs).toContain("t.status === 'awaiting_handover' && user?.id === t.toUserId");
    expect(repairs).not.toContain('user?.id === t.fromUserId || isAdmin()');
    expect(repairs).not.toContain('user?.id === t.toUserId || isAdmin()');
    expect(toolTransferDetailApi).toContain('session.userId !== transfer.fromUserId');
    expect(toolTransferDetailApi).toContain('session.userId !== transfer.toUserId');
  });

  it('separates the Tool Registry workspace from constrained repair tool lookups', () => {
    expect(toolsApi).toContain("const isLookup = mode === 'lookup'");
    expect(toolsApi).toContain('const canUseToolWorkspace');
    expect(toolsApi).toContain('const canLookupForWork');
    expect(toolsApi).toContain("'repair_tool_requests.create'");
    expect(toolsApi).toContain("'repair_tool_transfers.create'");
    expect(toolsApi).toContain("'damaged_tool_reports.create'");
    expect(toolsApi).toContain('if (isLookup ? !canLookupForWork && !canUseToolWorkspace : !canUseToolWorkspace)');
    expect(toolsApi).toContain('assignedToId: true');
    expect(toolsApi).not.toContain('purchaseCost: true');
    expect(pageAccess).toContain("'maintenance-tools': ['tools.manage', 'tools.create', 'tools.update', 'tools.delete']");
    expect(maintenance).toContain("api.get('/api/tools?mode=lookup&limit=100')");
    expect(repairs).toContain("api.get('/api/tools?mode=lookup&limit=500')");
    expect(repairs).toContain("api.get('/api/tools?mode=lookup&limit=999')");
  });
});
