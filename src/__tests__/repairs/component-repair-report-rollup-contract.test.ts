import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const route = fs.readFileSync('src/app/api/repairs/reports/detailed/route.ts', 'utf8');

describe('component repair report roll-up contract', () => {
  it('keeps machine totals separate from component-attributable costs', () => {
    expect(route).toContain("'Component Material Cost'");
    expect(route).toContain("'WO Material Cost (Machine Total)'");
    expect(route).toContain("'WO Total Cost (Machine Total)'");
    expect(route).toContain('cost remains at machine/work-order level');
  });

  it('uses consumed quantity when available for component material costing', () => {
    expect(route).toContain('material.consumedQty ?? material.quantityIssued ?? 0');
  });

  it('exports a component summary without duplicating machine-level WO totals', () => {
    expect(route).toContain('const componentSummaryMap = new Map');
    expect(route).toContain("'Repair WO Count'");
    expect(route).toContain("XLSX.utils.book_append_sheet(wb, wsComponents, 'Component Summary')");
  });
});
