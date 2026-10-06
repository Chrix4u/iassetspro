import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => fs.readFileSync(path, 'utf8');

describe('Repairs procurement and reusable tool closure contracts', () => {
  it('keeps PO lists, direct reads, approvals and receipts inside plant boundaries', () => {
    const list = read('src/app/api/purchase-orders/route.ts');
    const detail = read('src/app/api/purchase-orders/[id]/route.ts');
    const approve = read('src/app/api/purchase-orders/[id]/approve/route.ts');
    const receive = read('src/app/api/purchase-orders/[id]/receive/route.ts');
    expect(list).toContain('purchaseOrderPlantWhere');
    expect(list).toContain('A purchase order cannot mix inventory items from different plants');
    expect(detail).toContain('canAccessPurchaseOrderLines');
    expect(approve).toContain('canAccessPurchaseOrderLines');
    expect(receive).toContain('canAccessPurchaseOrderLines');
  });

  it('makes receiving concurrency-safe and never promotes bad receipts into usable stock', () => {
    const receive = read('src/app/api/purchase-orders/[id]/receive/route.ts');
    expect(receive).toContain('pg_advisory_xact_lock');
    expect(receive).toContain('tx.$executeRawUnsafe');
    expect(receive).not.toContain('tx.$queryRawUnsafe');
    expect(receive).toContain('PO line was received concurrently');
    expect(receive).toContain("const stockCredited = condition === 'good'");
    expect(receive).toContain('Invalid receiving condition');
  });

  it('aligns purchased-tool commissioning permissions and preserves the tool purchase date edit field', () => {
    const commission = read('src/app/api/inventory/[id]/commission-tools/route.ts');
    const toolEdit = read('src/app/api/tools/[id]/route.ts');
    expect(commission).toContain("hasAnyPermission(session, ['inventory.stock_out', 'inventory.manage'])");
    expect(commission).toContain('tx.$executeRawUnsafe');
    expect(commission).not.toContain('tx.$queryRawUnsafe');
    expect(commission).toContain("type: 'purchase_commission'");
    expect(toolEdit).toContain("'status', 'location', 'purchaseDate', 'purchaseCost'");
  });

  it('scopes the receiving ledger and its KPIs to the current plant scope', () => {
    const receiving = read('src/app/api/receiving-records/route.ts');
    expect(receiving).toContain('getPlantFilterWhere');
    expect(receiving).toContain('item: itemPlantWhere');
    expect(receiving).toContain('Insufficient permissions');
  });
});
