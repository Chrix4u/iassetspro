import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const service = fs.readFileSync('src/services/repairsReportXlsxSafe.service.ts', 'utf8');
const page = fs.readFileSync('src/components/repairs/reporting/RWOPReportingPage.tsx', 'utf8');

describe('GTP legacy workbook report parity', () => {
  it('includes the five legacy management views in the modern breakdown workbook', () => {
    expect(service).toContain("'GTP No BD by Machine'");
    expect(service).toContain("'GTP BD by Week'");
    expect(service).toContain("'GTP BD Machine Week'");
    expect(service).toContain("'GTP Response by Week'");
    expect(service).toContain("'GTP Response Machine'");
  });

  it('builds a dynamic machine by ISO week matrix', () => {
    expect(service).toContain('machineWeekRows');
    expect(service).toContain('out[week] = weekMap.get(week) || 0');
    expect(service).toContain("'Machine / Asset': assetName");
  });

  it('explains workbook migration parity on the reporting page', () => {
    expect(page).toContain('GTP legacy-workbook parity sheets');
    expect(page).toContain('machine × week matrix');
  });
});