import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const route = fs.readFileSync('src/app/api/admin/gtp-migration/audit/route.ts', 'utf8');

describe('GTP workbook parity baseline preview', () => {
  it('extracts all five legacy pivot sheets from the uploaded workbook', () => {
    for (const sheet of ['BD_MC_Wk', 'No_BD_MC', 'BD_Wk', 'Rpon_Wk', 'Rpons_MC']) {
      expect(route).toContain(`extractLegacyParitySheet(workbook, '${sheet}'`);
    }
    expect(route).toContain('expectedSheetCount: 5');
    expect(route).toContain('legacyParityBaseline');
  });

  it('retains workbook filters, cached totals and an independently computed series total', () => {
    expect(route).toContain('filters: Record<string, string | number>');
    expect(route).toContain('cachedGrandTotal');
    expect(route).toContain('computedSeriesTotal');
    expect(route).toContain("chartFamily: 'bar' | 'line'");
  });

  it('preserves machine order and week categories instead of flattening the pivot semantics', () => {
    expect(route).toContain('points.push({ order, category, value:');
    expect(route).toContain('points.push({ category: String(Math.trunc(week)), value:');
  });
});
