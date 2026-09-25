import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const legacy = fs.readFileSync('src/services/repairsReportXlsx.service.ts', 'utf8');
const safe = fs.readFileSync('src/services/repairsReportXlsxSafe.service.ts', 'utf8');
const page = fs.readFileSync('src/components/repairs/reporting/RWOPReportingPage.tsx', 'utf8');

describe('repairs operational KPI report suite contract', () => {
  it('registers dedicated breakdown management report types', () => {
    for (const type of [
      'breakdown-frequency',
      'response-time-performance',
      'repair-time-mttr',
      'reliability-bad-actors',
    ]) {
      expect(legacy).toContain(`'${type}'`);
      expect(page).toContain(`xlsxType: '${type}'`);
      expect(safe).toContain(`reportType === '${type}'`);
    }
  });

  it('builds breakdown Pareto, response, MTTR and reliability workbooks', () => {
    expect(safe).toContain("reportName: 'Breakdown Frequency Report'");
    expect(safe).toContain("reportName: 'Response Time Performance'");
    expect(safe).toContain("reportName: 'Repair Time / MTTR Report'");
    expect(safe).toContain("reportName: 'Reliability & Repeat Failure Report'");
    expect(safe).toContain("addDataSheet(wb, 'Machine Pareto'");
    expect(safe).toContain("addDataSheet(wb, 'Weekly Frequency'");
    expect(safe).toContain("addDataSheet(wb, 'Response by Machine'");
    expect(safe).toContain("addDataSheet(wb, 'MTTR by Machine'");
    expect(safe).toContain("addDataSheet(wb, 'Bad Actors'");
    expect(safe).toContain("addDataSheet(wb, 'Repeat Failures'");
  });

  it('calculates MTBF only from observed intervals between failures', () => {
    expect(safe).toContain('const intervals = ordered.slice(1)');
    expect(safe).toContain("mtbfDays: intervals.length ? Number(average(intervals).toFixed(2)) : ''");
  });

  it('expands downtime into weekly, machine, category and impact analysis', () => {
    expect(safe).toContain("reportName: 'Downtime & Production Loss'");
    expect(safe).toContain("addDataSheet(wb, 'Weekly Downtime'");
    expect(safe).toContain("addDataSheet(wb, 'By Machine'");
    expect(safe).toContain("addDataSheet(wb, 'By Category'");
    expect(safe).toContain("addDataSheet(wb, 'By Impact'");
    expect(safe).toContain("reportType === 'downtime'");
  });
});
