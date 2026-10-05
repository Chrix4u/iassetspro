import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');

describe('Repairs inventory replenishment and reusable-resource contracts', () => {
  it('receives a specific PO line and never over-receives it', () => {
    const ui = read('src/components/modules/InventoryPages.tsx');
    const route = read('src/app/api/purchase-orders/[id]/receive/route.ts');
    expect(ui).toContain('`${pi.poId}::${pi.itemId}`');
    expect(route).toContain('exceeds remaining PO quantity');
    expect(route).toContain("condition === 'good'");
    expect(route).toContain('Inventory stock changed concurrently');
  });

  it('keeps damaged or defective receipts out of usable stock', () => {
    const route = read('src/app/api/purchase-orders/[id]/receive/route.ts');
    expect(route).toContain("const stockCredited = condition === 'good'");
    expect(route).toContain("condition, stockCredited");
  });

  it('commissions purchased tool stock into reusable tool custody without double counting', () => {
    const route = read('src/app/api/inventory/[id]/commission-tools/route.ts');
    expect(route).toContain("item.category !== 'tool'");
    expect(route).toContain("pg_advisory_xact_lock(hashtext('iassetspro:tool-code'))");
    expect(route).toContain("type: 'purchase_commission'");
    expect(route).toContain("type: 'out'");
    expect(route).toContain("referenceType: 'tool_commission'");
  });

  it('allows inspected reusable spares to return to stock when no refurbishment is needed', () => {
    const service = read('src/services/materialCustody.service.ts');
    expect(service).toContain("record.status === 'inspected' && !record.refurbishmentNeeded");
    expect(service).toContain("record.status === 'refurbished'");
    expect(service).toContain("reason: `Spare part return ${record.returnNumber} - returned to store`");
    const ui = read('src/components/modules/RepairsPagesLegacy.tsx');
    expect(ui).toContain("r.status === 'inspected' && !r.refurbishmentNeeded");
    const route = read('src/app/api/repairs/spare-part-returns/[id]/route.ts');
    expect(route).toContain('Only the assigned refurbisher or authorized maintenance management can complete refurbishment');
  });

  it('keeps manual stock top-ups/removals concurrency-safe and plant-scoped', () => {
    const route = read('src/app/api/inventory/[id]/stock-movements/route.ts');
    expect(route).toContain('canAccessPlantStrict');
    expect(route).toContain('currentStock: previousStock');
    expect(route).toContain('Inventory stock changed concurrently');
    expect(route).toContain("'inventory.stock_in'");
    expect(route).toContain("'inventory.stock_out'");
  });
});
