import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const legacy = fs.readFileSync('src/services/repairsReportXlsx.service.ts', 'utf8');
const safe = fs.readFileSync('src/services/repairsReportXlsxSafe.service.ts', 'utf8');
const page = fs.readFileSync('src/components/repairs/reporting/RWOPReportingPage.tsx', 'utf8');

describe('GTP breakdown performance reporting contract', () => {
  it('registers a dedicated breakdown performance report type', () => {
    expect(legacy).toContain("'breakdown-performance'");
    expect(safe).toContain("reportType === 'breakdown-performance'");
    expect(page).toContain("xlsxType: 'breakdown-performance'");
  });

  it('separates response, repair and restoration intervals', () => {
    expect(safe).toContain("header: 'Response Time (min)'");
    expect(safe).toContain("header: 'Repair Time (min)'");
    expect(safe).toContain("header: 'Reported→Restored (min)'");
    expect(safe).toContain("header: 'Recorded Downtime (min)'");
    expect(safe).toContain('minutesBetweenDates(wo.createdAt, wo.actualStart)');
    expect(safe).toContain('minutesBetweenDates(wo.actualStart, wo.actualEnd)');
    expect(safe).toContain('minutesBetweenDates(wo.createdAt, wo.actualEnd)');
  });

  it('exports weekly, machine, trade and detail views', () => {
    expect(safe).toContain("addDataSheet(wb, 'Breakdown Detail'");
    expect(safe).toContain("addDataSheet(wb, 'Weekly Trend'");
    expect(safe).toContain("addDataSheet(wb, 'By Machine'");
    expect(safe).toContain("addDataSheet(wb, 'By Trade'");
  });

  it('includes GTP core KPIs and modern maintenance measures', () => {
    expect(safe).toContain("label: 'Number of Breakdowns'");
    expect(safe).toContain("label: 'Avg Response Time (min)'");
    expect(safe).toContain("label: 'Avg Repair Time / MTTR (min)'");
    expect(safe).toContain("label: 'Recorded Downtime (hrs)'");
  });
});
