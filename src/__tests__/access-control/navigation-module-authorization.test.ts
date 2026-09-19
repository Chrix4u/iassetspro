import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { canAccessPage, isPageModuleAvailable } from '@/lib/pageAccess';

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

describe('navigation, module and workflow authorization contracts', () => {
  it('keeps technician stock lookup permission separate from Inventory navigation', () => {
    const technicianPermissions = new Set([
      'dashboard.view',
      'inventory.view',
      'parts.view',
      'work_orders.view_own',
      'repair_material_requests.view_own',
      'repair_tool_requests.view_own',
    ]);
    const hasPermission = (slug: string) => technicianPermissions.has(slug);
    const modules = new Set(['core', 'inventory', 'work_orders', 'repairs']);

    expect(canAccessPage('inventory-items', hasPermission, false, modules)).toBe(false);
    expect(canAccessPage('maintenance-work-orders', hasPermission, false, modules)).toBe(true);
    expect(canAccessPage('repairs-material-requests', hasPermission, false, modules)).toBe(true);
  });

  it('does not let admin or permission grants bypass disabled modules', () => {
    const allPermissions = () => true;
    const coreOnly = new Set(['core']);

    expect(isPageModuleAvailable('pm-calendar', coreOnly)).toBe(false);
    expect(canAccessPage('pm-calendar', allPermissions, true, coreOnly)).toBe(false);
    expect(canAccessPage('pm-calendar', allPermissions, true, new Set(['core', 'pm_schedules']))).toBe(true);
  });

  it('fails closed while optional module state is unresolved', () => {
    expect(isPageModuleAvailable('pm-schedules', null)).toBe(false);
    expect(isPageModuleAvailable('dashboard', null)).toBe(true);
  });

  it('requires both license activation and enablement before optional modules enter navigation state', () => {
    const navigationStore = read('src/stores/navigationStore.ts');
    expect(navigationStore).toContain("m.isActive === true && m.isEnabled === true");
    expect(navigationStore).toContain("set({ enabledModules: new Set(['core']) })");
    expect(navigationStore).not.toContain('null = not loaded yet (show all)');
  });

  it('uses one access policy across desktop, mobile, router, palette and global search', () => {
    const sidebar = read('src/components/shared/Sidebar.tsx');
    const mobile = read('src/components/shared/MobileBottomNav.tsx');
    const app = read('src/components/EAMApp.tsx');
    const palette = read('src/components/CommandPalette.tsx');
    const search = read('src/components/shared/GlobalSearch.tsx');

    for (const source of [sidebar, mobile, palette, search]) {
      expect(source).toContain('canAccessPage');
    }
    expect(app).toContain('hasPagePermission');
    expect(app).toContain('isPageModuleAvailable');
    expect(app).toContain('moduleAllowed');
  });

  it('keeps Repairs Maintenance, PM Maintenance and compliance navigation distinct', () => {
    const sidebar = read('src/components/shared/Sidebar.tsx');
    expect(sidebar).toContain("label: 'Repairs Maintenance'");
    expect(sidebar).toContain("label: 'PM Maintenance'");
    expect(sidebar).toContain("label: 'Maintenance Compliance'");

    const pmGroup = sidebar.slice(
      sidebar.indexOf("label: 'PM Maintenance'"),
      sidebar.indexOf("label: 'Maintenance Compliance'"),
    );
    expect(pmGroup).toContain("page: 'pm-schedules'");
    expect(pmGroup).toContain("page: 'pm-calendar'");
    expect(pmGroup).not.toContain("page: 'maintenance-work-orders'");
    expect(pmGroup).not.toContain("page: 'repairs-material-requests'");
    expect(pmGroup).not.toContain("page: 'maintenance-calibration'");
  });

  it('does not fail open PM widgets on dashboards', () => {
    const dashboard = read('src/components/modules/DashboardPages.tsx');
    const maintenance = read('src/components/modules/MaintenancePages.tsx');

    expect(dashboard).not.toContain("api.get('/api/modules')");
    expect(dashboard).not.toContain('enabledModules.size === 0 ||');
    expect(dashboard).toContain("pmEnabled && canAccessPage('pm-schedules'");
    expect(maintenance).toContain("const pmEnabled = enabledModules?.has('pm_schedules') ?? false");
    expect(maintenance).toContain('PM Compliance — only when PM is licensed and enabled');
    expect(maintenance).toContain('canAccessPage(a.page');
  });

  it('mirrors assigned-supervisor authorization in material and tool request actions', () => {
    const ui = read('src/components/modules/RepairsPagesLegacy.tsx');
    const materialRoute = read('src/app/api/repairs/material-requests/[id]/route.ts');
    const toolRoute = read('src/app/api/repairs/tool-requests/[id]/route.ts');

    const helperStart = ui.indexOf('function canApproveResourceRequestAsSupervisor');
    const helperEnd = ui.indexOf('function canApproveAsStore', helperStart);
    const helper = ui.slice(helperStart, helperEnd);

    expect(helper).toContain("userRoles.includes('maintenance_supervisor')");
    expect(helper).toContain('request.workOrder.assignedSupervisorId === userId');
    expect(helper).not.toContain('maintenance_planner');
    expect(helper).not.toContain('repair_material_requests.update');

    expect(materialRoute).toContain('canReviewResourceRequestAsSupervisor(session, matReq.workOrder.assignedSupervisorId)');
    expect(toolRoute).toContain('canReviewResourceRequestAsSupervisor(session, toolReq.workOrder.assignedSupervisorId)');
  });

  it('shows create and custody actions only to actors accepted by the APIs', () => {
    const ui = read('src/components/modules/RepairsPagesLegacy.tsx');
    const toolRoute = read('src/app/api/repairs/tool-requests/[id]/route.ts');
    const transferRoute = read('src/app/api/repairs/tool-transfers/route.ts');

    expect(ui).toContain("hasPermission('repair_material_requests.create') || isAdmin()");
    expect(ui).toContain("hasPermission('repair_tool_requests.create') || isAdmin()");
    expect(ui).toContain('canManageToolRequestCustody(r, user)');
    expect(ui).toContain('canManageToolRequestCustody(detailItem, user)');

    expect(toolRoute).toContain("action === 'return' && !isAdmin(session) && toolReq.requestedById !== session.userId");
    expect(transferRoute).toContain("!isAdmin(session) && fromUserId !== session.userId");
  });

  it('binds completion review and closure to assigned maintenance responsibility', () => {
    const ui = read('src/components/modules/RepairsPagesLegacy.tsx');
    const route = read('src/app/api/repairs/completion/[workOrderId]/route.ts');

    expect(route).toContain('canReviewResourceRequestAsSupervisor(session, wo.assignedSupervisorId)');
    expect(route).toContain("hasRole(session, 'maintenance_planner') && Boolean(wo.plannerId) && wo.plannerId === session.userId");
    expect(ui).toContain('canSubmitRepairCompletion(completion, user)');
    expect(ui).toContain('canApproveResourceRequestAsSupervisor(completion, user)');
    expect(ui).toContain('canCloseRepairCompletion(completion, user)');
  });
});
