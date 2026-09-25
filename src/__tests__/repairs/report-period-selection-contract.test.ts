import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const page = fs.readFileSync('src/components/repairs/reporting/RWOPReportingPage.tsx', 'utf8');

describe('Repairs report period selection contract', () => {
  it('supports arbitrary custom date ranges', () => {
    expect(page).toContain('<DateRangePicker');
    expect(page).toContain("startDate: from || ''");
    expect(page).toContain("endDate: to || ''");
    expect(page).toContain('Or choose any custom From/To dates above.');
  });

  it('offers practical quick period presets', () => {
    for (const label of [
      'Today',
      'Last 7 Days',
      'This Week',
      'Last 30 Days',
      'This Month',
      'Last 90 Days',
      'This Quarter',
      'Year to Date',
      'This Year',
    ]) expect(page).toContain(label);
  });

  it('passes the selected date range into Excel and PDF exports', () => {
    expect(page).toContain('dateFrom: filters.startDate || undefined');
    expect(page).toContain('dateTo: filters.endDate || undefined');
    expect(page).toContain("params.set('from', filters.startDate)");
    expect(page).toContain("params.set('to', filters.endDate)");
  });
});
