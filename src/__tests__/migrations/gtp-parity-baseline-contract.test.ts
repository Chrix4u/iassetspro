import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const route = fs.readFileSync('src/app/api/admin/gtp-migration/audit/route.ts', 'utf8');
const page = fs.readFileSync('src/components/modules/GtpMigrationPage.tsx', 'utf8');

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
    expect(route).toContain('metricRowIndex');
    expect(route).toContain('rows.slice(0, metricRowIndex >= 0 ? metricRowIndex : 8)');
    expect(route).toContain('blankrows: false');
    expect(route).toContain('cachedGrandTotal');
    expect(route).toContain('computedSeriesTotal');
    expect(route).toContain("chartFamily: 'bar' | 'line'");
  });

  it('preserves machine order and week categories instead of flattening the pivot semantics', () => {
    expect(route).toContain('points.push({ order, category, value:');
    expect(route).toContain('points.push({ category: String(Math.trunc(week)), value:');
  });

  it('does not create false duplicate-machine blockers when several rows map to one Asset', () => {
    expect(route).toContain('registeredOverrideAssetCodes');
    expect(route).toContain('if (!registeredOverrideAssetCodes.has(syntheticCode))');
    expect(route).toContain('registeredOverrideAssetCodes.add(syntheticCode)');
  });

  it('surfaces the workbook acceptance baseline alongside the newer source-parity panel', () => {
    expect(page).toContain('Workbook Report & Graph Parity');
    expect(page).toContain('Workbook Parity Baseline');
    expect(page).toContain('Cached total');
    expect(page).toContain('Independent total');
    expect(page).toContain('Cached value needs review');
    expect(page).toContain('Reconciled');
  });
});
