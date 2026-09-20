import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

describe('navigation and Repairs RBAC contract', () => {
  const sidebar = read('src/components/shared/Sidebar.tsx');
  const mobile = read('src/components/shared/MobileBottomNav.tsx');
  const navigationStore = read('src/stores/navigationStore.ts');
  const modulesApi = read('src/app/api/modules/route.ts');
  const repairsUi = read('src/components/modules/RepairsPagesLegacy.tsx');
  const inventoryApi = read('src/app/api/inventory/route.ts');
  const toolsApi = read('src/app/api/tools/route.ts');
  const toolTransferApi = read('src/app/api/repairs/tool-transfers/route.ts');
  const seed = read('prisma/seed.ts');

  it('separates Repairs Maintenance from PM Maintenance', () => {
    expect(sidebar).toContain("label: 'Repairs Maintenance'");
    expect(sidebar).toContain("label: 'PM Maintenance'");
    expect(sidebar).toContain("page: 'pm-calendar'");
    expect(mobile).toContain("label: 'PM Maintenance'");
    expect(mobile).toContain("label: 'Repairs Maintenance'");
  });

  it('requires system licensing plus company activation for non-core modules', () => {
    expect(modulesApi).toContain('const isUsable = systemLicensed && companyLicensed && companyEnabled');
    expect(modulesApi).toContain('withinLicenseWindow');
    expect(navigationStore).toContain('m.isUsable === true');
    expect(navigationStore).toContain('new Set<string>()');
  });

  it('does not grant broad Inventory, Parts or Tool Registry access to technicians', () => {
    const start = seed.indexOf('maintenance_technician: [');
    const end = seed.indexOf('\n  ],', start);
    const technicianBundle = seed.slice(start, end);
    expect(technicianBundle).not.toContain("'inventory.view'");
    expect(technicianBundle).not.toContain("'parts.view'");
    expect(technicianBundle).not.toContain("'tools.view'");
    expect(technicianBundle).toContain("'repair_material_requests.create'");
    expect(technicianBundle).toContain("'repair_tool_requests.create'");
  });

  it('protects full registry reads while preserving scoped repair catalogs', () => {
    expect(inventoryApi).toContain("hasPermission(session, 'inventory.view')");
    expect(toolsApi).toContain("hasPermission(session, 'tools.view')");
    expect(repairsUi).toContain('/api/repairs/catalog/materials');
    expect(repairsUi).toContain('/api/repairs/catalog/tools');
    expect(repairsUi).toContain('/api/repairs/catalog/my-tools');
  });

  it('mirrors store and supervisor action visibility instead of generic update permissions', () => {
    expect(repairsUi).toContain('function canApproveAsSupervisor(request: any, user: any)');
    expect(repairsUi).not.toContain("maintenance_planner', 'plant_manager']");
    expect(repairsUi).not.toContain("hasPermission('repair_tool_transfers.update')) && detailItem.status === 'pending'");
    expect(repairsUi).toContain("hasOutstandingItems(r) && r.requestedById === user?.id");
  });

  it('requires the current custodian to initiate a tool transfer', () => {
    expect(toolTransferApi).toContain('fromUserId !== session.userId');
    expect(toolTransferApi).toContain('Only the current tool custodian can initiate a transfer');
  });
});
