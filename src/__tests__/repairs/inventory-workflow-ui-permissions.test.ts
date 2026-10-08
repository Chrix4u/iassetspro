import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8');
const ui = read('src/components/modules/InventoryPages.tsx');
const adjustmentCreateRoute = read('src/app/api/inventory/adjustments/route.ts');
const adjustmentUpdateRoute = read('src/app/api/inventory/adjustments/[id]/route.ts');
const requestCreateRoute = read('src/app/api/inventory/requests/route.ts');
const transferCreateRoute = read('src/app/api/inventory/transfers/route.ts');
const transferUpdateRoute = read('src/app/api/inventory/transfers/[id]/route.ts');

describe('inventory workflow UI permission alignment', () => {
  it('uses the adjustment permissions enforced by the API and exposes pending decisions', () => {
    expect(adjustmentCreateRoute).toContain("hasPermission(session, 'inventory_adjustments.create')");
    expect(adjustmentUpdateRoute).toContain("hasPermission(session, 'inventory_adjustments.update')");
    expect(ui).toContain("hasPermission('inventory_adjustments.create')");
    expect(ui).toContain("hasPermission('inventory_adjustments.update')");
    expect(ui).toContain("handleAction(a.id, 'approve')");
    expect(ui).toContain("handleAction(a.id, 'reject')");
  });

  it('uses material requisition create authority for inventory requests', () => {
    expect(requestCreateRoute).toContain("hasPermission(session, 'material_requisitions.create')");
    expect(ui).toContain("hasPermission('material_requisitions.create')");
  });

  it('uses transfer-specific create/update authority for transfer workflow actions', () => {
    expect(transferCreateRoute).toContain("hasPermission(session, 'inventory_transfers.create')");
    expect(transferUpdateRoute).toContain("hasPermission(session, 'inventory_transfers.update')");
    expect(ui).toContain("hasPermission('inventory_transfers.create')");
    expect(ui).toContain("hasPermission('inventory_transfers.update')");
    expect(ui).not.toContain("(hasPermission('inventory.delete') || isAdmin()) && (t.status === 'pending' || t.status === 'in_transit')");
  });
});
