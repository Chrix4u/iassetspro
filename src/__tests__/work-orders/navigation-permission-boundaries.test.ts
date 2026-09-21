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
  const dashboardApi = read('src/app/api/dashboard/stats/route.ts');
  const repairsUatApi = read('e2e/repairs/helpers/api.ts');
  const maintenance = read('src/components/modules/MaintenancePages.tsx');
  const stateMachine = read('src/lib/state-machine.ts');
  const repairs = read('src/components/modules/RepairsPagesLegacy.tsx');
  const inventoryApi = read('src/app/api/inventory/route.ts');
  const toolsApi = read('src/app/api/tools/route.ts');
  const materialListApi = read('src/app/api/repairs/material-requests/route.ts');
  const toolListApi = read('src/app/api/repairs/tool-requests/route.ts');
  const toolDetailApi = read('src/app/api/repairs/tool-requests/[id]/route.ts');
  const toolTransferApi = read('src/app/api/repairs/tool-transfers/route.ts');
  const toolTransferDetailApi = read('src/app/api/repairs/tool-transfers/[id]/route.ts');
  const completionApi = read('src/app/api/repairs/completion/[workOrderId]/route.ts');
  const verificationService = read('src/services/workOrderVerification.service.ts');
  const closureService = read('src/services/workOrderClosure.service.ts');
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
    const modulePages = new Set(
      [...moduleSection.matchAll(/^\s*'([^']+)':\s*(?:'[^']+'|\[[^\]]+\])/gm)].map((m) => m[1]),
    );
    expect(permissionPages.filter((page) => !modulePages.has(page))).toEqual([]);
  });

  it('fails closed for every disabled or unlicensed operational module', () => {
    expect(modulesApi).toContain('isSystemModuleLicensed(m, now)');
    expect(modulesApi).toContain('isControlPlaneCoreModule(m.code)');
    expect(navStore).toContain('m.isLicensed === true');
    expect(navStore).toContain('m.isEnabled === true');
    expect(navStore).toContain('m.isActive === true');
    expect(navStore).toContain('set({ enabledModules: new Set<string>() })');
    expect(pageAccess).toContain("CORE_MODULE_CODES = new Set(['core'])");
    expect(pageAccess).toContain('codes.every((code) =>');
    expect(pageAccess).toContain('enabledModules?.has(code) === true');
    expect(sidebar).toContain('CORE_MODULE_CODES.has(normalized)');
    expect(mobile).toContain('pageModuleIsEnabled(page, enabledModules)');
    expect(moduleHook).toContain('if (CORE_MODULE_CODES.has(normalized)) return true');
    expect(moduleHook).toContain('if (enabledModules === null) return false');
    expect(moduleHook).not.toContain('if (enabledModules === null) return true');
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
    expect(dashboardApi).toContain('const dashboardModuleCodes = [');
    expect(dashboardApi).toContain('buildOperationalModuleSet(moduleRows)');
    expect(dashboardApi).toContain("moduleOperational('assets')");
    expect(dashboardApi).toContain("moduleOperational('inventory')");
    expect(dashboardApi).toContain("moduleOperational('maintenance_requests')");
    expect(dashboardApi).toContain("moduleOperational('work_orders')");
    expect(dashboardApi).toContain("moduleOperational('pm_schedules')");
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

  it('filters work-order lifecycle transitions by effective permission as well as role', () => {
    expect(stateMachine).toContain('function hasEffectiveTransitionPermission(');
    expect(stateMachine).toContain("case 'assigned':");
    expect(stateMachine).toContain("'work_orders.assign_supervisor', 'work_orders.assign_technician'");
    expect(stateMachine).toContain("case 'completed':");
    expect(stateMachine).toContain("return hasAny('work_orders.complete')");
    expect(stateMachine).toContain("case 'verified':");
    expect(stateMachine).toContain("return hasAny('work_orders.verify')");
    expect(stateMachine).toContain("case 'cancelled':");
    expect(stateMachine).toContain("return hasAny('work_orders.cancel')");
    expect(stateMachine).toContain('hasEffectiveTransitionPermission(entityType, currentStatus, t.toStatus, session)');
  });

  it('matches direct team-management visibility to accountable assignment authority', () => {
    expect(maintenance).toContain('const hasAssignmentPermission = admin');
    expect(maintenance).toContain("hasPermission('work_orders.assign_supervisor')");
    expect(maintenance).toContain("hasPermission('work_orders.assign_technician')");
    expect(maintenance).toContain("['maintenance_manager', 'plant_manager'].includes(slug)");
    expect(maintenance).toContain('wo.assignedSupervisorId === user.id');
    expect(maintenance).toContain('wo.plannerId === user.id');
    expect(maintenance).toContain('wo.assignedById === user.id');
    expect(maintenance).toContain('() => canManageTeamDirectly');
    expect(maintenance).not.toContain("if (hasPermission('work_orders.assign_supervisor')) return true");
  });

  it('hides unauthorized execution controls instead of rendering disabled actions', () => {
    expect(maintenance).toContain('const canPerformWorkActions = !isReadOnly && isWorkerOnThisWO');
    expect(maintenance).toContain('{canPerformWorkActions && <Button size="sm" variant="ghost"');
    expect(maintenance).toContain('{canPerformWorkActions && <Button size="sm" variant="outline"');
    expect(maintenance).toContain('{toolResourcesEnabled && canPerformWorkActions && <button');
    expect(maintenance).toContain('{materialResourcesEnabled && canPerformWorkActions && <button');
    expect(maintenance).toContain("!isWOFinalized && canPerformWorkActions && (");
  });

  it('never lets a read-only team row disable the primary assignee resource controls', () => {
    expect(maintenance).toContain('if (wo.assignedToId === user.id) return false');
    expect(maintenance).toContain("tm.accessLevel === 'read_only'");
    expect(maintenance).toContain('const canPerformWorkActions = !isReadOnly && isWorkerOnThisWO');
    expect(maintenance).toContain('const workActionDisabled = isWOFinalized || !canPerformWorkActions');
    expect(maintenance).toContain("api.get('/api/inventory?mode=lookup&limit=100')");
    expect(maintenance).toContain("api.get('/api/tools?mode=lookup&limit=100')");
    expect(maintenance).not.toContain("api.get('/api/tools?status=available&limit=100')");
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

  it('models Repairs UAT with explicit licensed dependencies without implicitly enabling PM', () => {
    expect(fullSeed).toContain("{ code: 'repairs', name: 'Repairs Maintenance'");
    expect(uatSeed).toContain('const uatModules = [');
    expect(uatSeed).toContain("code: 'repairs'");
    expect(uatSeed).toContain("code: 'work_orders'");
    expect(uatSeed).toContain("code: 'maintenance_requests'");
    expect(uatSeed).toContain("code: 'assets'");
    expect(uatSeed).toContain("code: 'inventory'");
    expect(uatSeed).toContain("code: 'tools'");
    expect(uatSeed).toContain("where: { code: moduleDef.code }");
    expect(uatSeed).toContain('isSystemLicensed: true');
    expect(uatSeed).toContain('isEnabled: true');
    expect(uatSeed).toContain('isActive: true');
    expect(uatSeed).not.toContain("code: 'pm_schedules'");
    expect(repairsModuleMigration).toContain("'repairs'");
    expect(repairsModuleMigration).toContain('INSERT INTO `system_modules`');
    expect(repairsModuleMigration).toContain('INSERT INTO `company_modules`');
    expect(repairsModuleMigration).not.toContain("'pm_schedules'");
  });

  it('matches resource approval buttons to the accountable supervisor rule', () => {
    expect(repairs).toContain('function canApproveAsSupervisor(');
    expect(repairs).toContain('requiredPermission?: string');
    expect(repairs).toContain('if (requiredPermission && !hasPermission(requiredPermission)) return false;');
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
    expect(toolTransferApi).toContain('const effectiveFromUserId = tool.assignedToId');
    expect(toolTransferApi).toContain('effectiveFromUserId !== session.userId');
    expect(toolTransferApi).toContain('proposedFromUserId && proposedFromUserId !== effectiveFromUserId');
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

  it('hides MR workflow actions when their effective permission is revoked', () => {
    expect(maintenance).toContain("hasPermission('maintenance_requests.approve')");
    expect(maintenance).toContain("hasPermission('maintenance_requests.reject')");
    expect(maintenance).toContain("hasPermission('maintenance_requests.assign_planner')");
    expect(maintenance).toContain("hasPermission('maintenance_requests.convert_to_wo')");
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
    expect(completionApi).toContain('verifyRepairWorkOrder');
    expect(completionApi).toContain('closeRepairWorkOrder');
    expect(completionApi).toContain("hasPermission(session, 'work_orders.verify')");
    expect(completionApi).toContain("hasPermission(session, 'work_orders.close')");
    expect(verificationService).toContain('wo.assignedSupervisorId === session.userId');
    expect(verificationService).toContain("['admin', 'maintenance_manager', 'plant_manager'].includes(role)");
    expect(closureService).toContain('wo.plannerId === session.userId');
    expect(closureService).toContain("['admin', 'maintenance_manager', 'plant_manager'].includes(role)");
    expect(completionApi).not.toContain('Only supervisors, managers, or planners can perform this action');
    expect(repairs).toContain('function canSubmitCompletion(completion: any, user: any)');
    expect(repairs).toContain('function canReviewCompletion(completion: any, user: any)');
    expect(repairs).toContain('function canCloseCompletion(completion: any, user: any)');
    expect(repairs).toContain("hasPermission('work_orders.verify')");
    expect(repairs).toContain("hasPermission('work_orders.close')");
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
