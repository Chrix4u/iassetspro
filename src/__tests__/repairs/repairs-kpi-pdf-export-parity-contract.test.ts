import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const route = fs.readFileSync('src/app/api/repairs/reports/route.ts', 'utf8');
const page = fs.readFileSync('src/components/repairs/reporting/RWOPReportingPage.tsx', 'utf8');

describe('repairs KPI PDF export parity contract', () => {
  const types = [
    'breakdown-frequency',
    'response-time-performance',
    'repair-time-mttr',
    'reliability-bad-actors',
  ];

  it('accepts all KPI report types in the Repairs PDF endpoint', () => {
    for (const type of types) {
      expect(route).toContain(`'${type}'`);
      expect(page).toContain(`pdfType: '${type}'`);
    }
  });

  it('uses one shared breakdown KPI dataset for the dedicated PDFs', () => {
    expect(route).toContain('handleBreakdownKpiReport');
    expect(route).toContain("case 'breakdown-frequency':");
    expect(route).toContain("case 'response-time-performance':");
    expect(route).toContain("case 'repair-time-mttr':");
    expect(route).toContain("case 'reliability-bad-actors':");
  });

  it('renders machine, week, trade and reliability tables', () => {
    expect(route).toContain("title: 'Top Machines by Breakdown Count'");
    expect(route).toContain("title: 'Weekly Breakdown Frequency'");
    expect(route).toContain("title: 'Response by Trade'");
    expect(route).toContain("title: 'MTTR by Machine'");
    expect(route).toContain("title: 'Bad Actor Ranking'");
  });
});
