import { describe, expect, it } from 'vitest';
import { csvCell } from '@/lib/csv';

describe('csvCell', () => {
  it('quotes values and doubles embedded quotes', () => {
    expect(csvCell('Line 1, "Mixer"')).toBe('"Line 1, ""Mixer"""');
  });

  it.each([
    '=2+2',
    '+SUM(A1:A2)',
    '-1+2',
    '@SUM(A1:A2)',
    ' =2+2',
    '\t=2+2',
    '\r=2+2',
  ])('neutralizes spreadsheet-formula input %j', (value) => {
    expect(csvCell(value)).toBe(`"'${value}"`);
  });

  it('does not alter ordinary values apart from CSV quoting', () => {
    expect(csvCell('TEMA-PRT-L01-P03')).toBe('"TEMA-PRT-L01-P03"');
    expect(csvCell(null)).toBe('""');
  });
});
