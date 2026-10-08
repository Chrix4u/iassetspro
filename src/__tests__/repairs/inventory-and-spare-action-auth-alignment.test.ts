import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');

describe('Repairs inventory and spare-action UI authorization alignment', () => {
  it('shows New GRN only to actors the receive API will authorize', () => {
    const ui = read('src/components/modules/InventoryPages.tsx');
    const route = read('src/app/api/purchase-orders/[id]/receive/route.ts');

    expect(route).toContain("['inventory.update', 'inventory.stock_in', 'inventory.manage']");
    expect(ui).toContain("hasPermission('inventory.stock_in')");
    expect(ui).toContain("hasPermission('inventory.manage')");
    expect(ui).toContain("hasPermission('inventory.update')");
    expect(ui).not.toContain("(hasPermission('inventory.create') || isAdmin()) && <Button onClick={() => setCreateOpen(true)} className=\"bg-emerald-600 hover:bg-emerald-700 text-white\"><Plus className=\"h-4 w-4 mr-2\" />New GRN</Button>");
  });

  it('shows reusable-tool commissioning to the same store/tool-shop roles as the API', () => {
    const ui = read('src/components/modules/InventoryPages.tsx');
    const route = read('src/app/api/inventory/[id]/commission-tools/route.ts');

    expect(route).toContain("const ALLOWED_ROLES = ['inventory_manager', 'store_keeper', 'tools_shop_attendant']");
    expect(route).toContain("hasAnyPermission(session, ['inventory.stock_out', 'inventory.manage'])");
    expect(ui).toContain("const canCommissionTools = isAdmin()\n    || hasPermission('inventory.stock_out')\n    || hasPermission('inventory.manage')");
    expect(ui).toContain("'inventory_manager'");
    expect(ui).toContain("'store_keeper'");
    expect(ui).toContain("'tools_shop_attendant'");
    expect(ui).toContain('canCommissionTools &&');
  });

  it('gates spare-return workflow buttons with the same operational authority as the API', () => {
    const ui = read('src/components/modules/RepairsPagesLegacy.tsx');
    const route = read('src/app/api/repairs/spare-part-returns/[id]/route.ts');
    const policy = read('src/lib/spare-part-return-authorization.ts');

    expect(route).toContain("from '@/lib/spare-part-return-authorization'");
    expect(route).toContain('canInspectSparePartReturn(actor)');
    expect(route).toContain('canCompleteSpareRefurbishment(actor, existing)');
    expect(route).toContain('canReturnSparePartToStore(actor)');
    expect(policy).toContain("'store_keeper'");
    expect(policy).toContain("'maintenance_supervisor'");
    expect(policy).toContain('actor.userId === record.refurbisherId');

    expect(ui).toContain('canInspectSparePartReturn(user)');
    expect(ui).toContain('canStartSpareRefurbishment(user)');
    expect(ui).toContain('canCompleteSpareRefurbishment(r, user)');
    expect(ui).toContain('canDisposeSparePartReturn(user)');
    expect(ui).not.toContain("r.status === 'inspected' && r.refurbishmentNeeded && (isAdmin() || hasPermission('spare_part_returns.update'))");
    expect(ui).not.toContain("r.status === 'refurbishing' && (isAdmin() || hasPermission('spare_part_returns.update'))");
  });
});
