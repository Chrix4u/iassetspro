import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = fs.readFileSync('src/components/modules/InventoryPages.tsx', 'utf8');

describe('purchase order line item state', () => {
  it('uses functional line-item updates so item selection and unit-cost hydration compose', () => {
    expect(source).toContain('setLineItems(current => current.map((lineItem, i) =>');
    expect(source).toContain("updateLineItem(idx, 'itemId', v)");
    expect(source).toContain("updateLineItem(idx, 'unitCost', String(selectedItem.unitCost || 0))");
    expect(source).not.toContain('const updated = [...lineItems]');
  });

  it('shows GRN remaining quantity using the inventory item id used by the selected PO item', () => {
    expect(source).toContain('pi.itemId === form.itemId && pi.poId === form.purchaseOrder)?.remaining || 0');
    expect(source).not.toContain('pi.id === form.itemId && pi.poId === form.purchaseOrder)?.remaining || 0');
  });
});
