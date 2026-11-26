import { describe, expect, it } from 'vitest';
import { productionCsvCell, reportedProductionValue } from '@/lib/production-survey-csv';

describe('production survey CSV semantics', () => {
  it('distinguishes unreported output from an approved zero', () => {
    expect(productionCsvCell(reportedProductionValue(false, 0))).toBe('""');
    expect(productionCsvCell(reportedProductionValue(true, 0))).toBe('"0"');
    expect(productionCsvCell(reportedProductionValue(true, 1200))).toBe('"1200"');
    expect(productionCsvCell(null)).toBe('""');
  });

  it('preserves numeric values and safely quotes ordinary text', () => {
    expect(productionCsvCell(-5)).toBe('"-5"');
    expect(productionCsvCell(12.5)).toBe('"12.5"');
    expect(productionCsvCell('Machine, "A"')).toBe('"Machine, ""A"""');
  });

  it.each(['=1+1', '+2', '-2', '@SUM(A1)', '  =1+1', '\tplain', '\rplain', '\nplain', '\uFEFF=1+1', '＝1+1'])(
    'neutralizes formula-like text or leading control characters: %j',
    value => expect(productionCsvCell(value)).toBe('"'+ "'" + value + '"'),
  );
});
