import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

describe('RBAC and module navigation hardening contract', () => {
  const sidebar = read('src/components/shared/Sidebar.tsx');
  const mobile = read('src/components/shared/MobileBottomNav.tsx');
  const navigationStore = read('src/stores/navigationStore.ts');
  const moduleHook = read('src/hooks/useModuleEnabled.ts');
  const app = read('src/components/EAMApp.tsx');
  const inventory = read('src/app/api/inventory/route.ts');
  const inventoryLookup = read('src/app/api/inventory/lookup/route.ts');
  const inventoryDetail = read('src/app/api/inventory/[id]/route.ts');
  const repairs = read('src/components/modules/RepairsPagesLegacy.tsx');
  const dashboard = read('src/components/modules/DashboardPages.tsx');
  const maintenance = read('src/components/modules/MaintenancePages.tsx');
  const inventoryPages = read('src/components/modules/InventoryPages.tsx');
  const inventoryLocations = read('src/app/api/inventory/locations/route.ts');
  const inventoryAdjustments = read('src/app/api/inventory/adjustments/route.ts');
  const inventoryRequests = read('src/app/api/inventory/requests/route.ts');
  const inventoryTransfers = read('src/app/api/inventory/transfers/route.ts');
  const inventoryTransferAction = read('src/app/api/inventory/transfers/[id]/route.ts');
  const suppliers = read('src/app/api/suppliers/route.ts');
  const purchaseOrders = read('src/app/api/purchase-orders/route.ts');
  const purchaseOrderDetail = read('src/app/api/purchase-orders/[id]/route.ts');
  const purchaseOrderApprove = read('src/app/api/purchase-orders/[id]/approve/route.ts');
  const purchaseOrderReceive = read('src/app/api/purchase-orders/[id]/receive/route.ts');
  const receivingRecords = read('src/app/api/receiving-records/route.ts');

  it('separates repairs maintenance from preventive maintenance and filters child routes', () => {
    expect(sidebar).toContain("label: 'Repairs Maintenance'");
    expect(sidebar).toContain("label: 'Preventive Maintenance (PM)'");
    expect(sidebar).toContain("moduleCode: 'pm_schedules'");
    expect(sidebar).toContain('children = g.children.filter');
    expect(sidebar).not.toContain("label: 'Inventory', icon: Package, perm: 'inventory.view',");
    expect(mobile).toContain('permOr?: string[]');
    expect(mobile).toContain("label: 'Preventive Maintenance (PM)'");
  });

  it('keeps mobile landing tiles aligned with exact page permission and module activation', () => {
    expect(mobile).toContain("page: 'maintenance-requests'");
    expect(mobile).toContain("permOr: ['maintenance_requests.view', 'maintenance_requests.view_own']");
    expect(mobile).toContain("page: 'repairs-material-requests', label: 'Repair Resources'");
    expect(mobile).toContain("'repair_material_requests.view_own'");
    expect(mobile).toContain("page: 'reports-maintenance', label: 'Reports'");
    expect(mobile).toContain("moduleCode: 'reports'");
    expect(mobile).toContain("page: 'safety-incidents', label: 'Safety'");
    expect(mobile).toContain("moduleCode: 'safety'");
    expect(mobile).toContain("page: 'production-orders', label: 'Production'");
    expect(mobile).toContain("moduleCode: 'production'");
    expect(mobile).toContain("page: 'quality-inspections', label: 'Quality'");
    expect(mobile).toContain("moduleCode: 'quality'");
    expect(mobile).toContain("page: 'iot-devices', label: 'IoT'");
    expect(mobile).toContain("perm: 'iot_devices.view'");
    expect(mobile).toContain("moduleCode: 'iot_sensors'");
    expect(mobile).toContain("page: 'analytics-kpi', label: 'Analytics'");
    expect(mobile).toContain("moduleCode: 'analytics'");
    expect(mobile).toContain("adminOnly: true");
  });

  it('treats Notifications as an optional module on navigation and direct-page guards', () => {
    expect(sidebar).toContain("page: 'notifications', moduleCode: 'notifications'");
    expect(app).toContain("'notifications': 'notifications'");
  });

  it('fails closed when optional module state cannot be verified', () => {
    expect(navigationStore).toContain("new Set(['core'])");
    expect(navigationStore).toContain('m.isActive && m.isEnabled');
    expect(moduleHook).toContain('if (enabledModules === null) return false');
    expect(app).toContain('moduleAccessDenied');
    expect(app).toContain("'pm-calendar': 'pm_schedules'");
    expect(app).toContain("'assets-bom': ['assets', 'bom']");
    expect(app).toContain("'quality-capa': ['quality', 'capa']");
    expect(app).toContain("'reports-production': ['reports', 'production']");
    expect(app).toContain('permissionAccessDenied');
  });

  it('does not use basic technician inventory lookup permission as full inventory access', () => {
    expect(inventory).toContain('hasAnyPermission(session');
    expect(inventory).toContain('Insufficient inventory permissions');
    expect(inventoryDetail).toContain('hasAnyPermission(session');
    expect(inventoryDetail).toContain('canAccessPlant');
    expect(inventoryLookup).toContain("'repair_material_requests.create'");
    expect(inventoryLookup).toContain('currentStock: true');
    expect(inventoryLookup).not.toContain('unitCost: true');
    expect(inventoryLookup).not.toContain('supplier: true');
    expect(repairs).toContain("api.get('/api/inventory/lookup')");
  });

  it('matches supervisor approval visibility to the server assigned-supervisor contract', () => {
    expect(repairs).toContain("userRoles.includes('maintenance_manager') || userRoles.includes('plant_manager')");
    expect(repairs).toContain('request.workOrder.assignedSupervisorId ===');
    expect(repairs).not.toContain("userRoles.includes('maintenance_planner')");
    expect(repairs).not.toContain("return isAdmin() || userRoles.some((slug: string) => supervisorRoles.includes(slug)) || hasPermission('repair_material_requests.update')");
  });

  it('uses granular inventory permissions for action-button visibility', () => {
    expect(inventoryPages).toContain("hasPermission('inventory_locations.create')");
    expect(inventoryPages).toContain("hasPermission('inventory_adjustments.create')");
    expect(inventoryPages).toContain("hasPermission('material_requisitions.create')");
    expect(inventoryPages).toContain("hasPermission('inventory_transfers.create')");
    expect(inventoryPages).toContain("hasPermission('inventory_transfers.approve')");
    expect(inventoryPages).toContain("hasPermission('inventory_transfers.update')");
    expect(inventoryPages).toContain("hasPermission('vendors.create')");
    expect(inventoryPages).toContain("hasPermission('purchase_orders.create')");
    expect(inventoryPages).toContain("hasPermission('purchase_orders.approve')");
    expect(inventoryPages).toContain("hasPermission('purchase_orders.receive')");
  });

  it('does not allow authentication alone to expose inventory/procurement APIs', () => {
    expect(inventoryLocations).toContain('hasAnyPermission(session');
    expect(inventoryAdjustments).toContain('hasAnyPermission(session');
    expect(inventoryRequests).toContain('hasAnyPermission(session');
    expect(inventoryTransfers).toContain('hasAnyPermission(session');
    expect(suppliers).toContain('hasAnyPermission(session');
    expect(purchaseOrders).toContain('hasAnyPermission(session');
    expect(purchaseOrderDetail).toContain('hasAnyPermission(session');
    expect(receivingRecords).toContain('hasAnyPermission(session');
  });

  it('aligns procurement and transfer mutations with their exact server permissions', () => {
    expect(purchaseOrders).toContain("hasPermission(session, 'purchase_orders.create')");
    expect(purchaseOrderDetail).toContain("hasPermission(session, 'purchase_orders.update')");
    expect(purchaseOrderApprove).toContain("hasPermission(session, 'purchase_orders.approve')");
    expect(purchaseOrderReceive).toContain("hasPermission(session, 'purchase_orders.receive')");
    expect(inventoryTransferAction).toContain("body.action === 'approve'");
    expect(inventoryTransferAction).toContain("'inventory_transfers.approve'");
    expect(inventoryTransferAction).toContain("'inventory_transfers.update'");
  });

  it('removes PM widgets and shortcuts when PM is disabled', () => {
    expect(dashboard).toContain('const pmEnabled = enabledModules.has(MODULE_CODES.PM_SCHEDULES)');
    expect(dashboard).toContain("!['pm-schedules', 'pm-templates', 'pm-triggers', 'pm-calendar'].includes(a.page) || enabledModules.has(MODULE_CODES.PM_SCHEDULES)");
    expect(maintenance).toContain("a.page !== 'pm-calendar' || pmEnabled");
    expect(maintenance).toContain('{pmEnabled && (');
  });
});
