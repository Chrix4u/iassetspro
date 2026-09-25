import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const route = fs.readFileSync('src/app/api/reports/maintenance/route.ts', 'utf8');
const page = fs.readFileSync('src/components/repairs/reporting/RWOPReportingPage.tsx', 'utf8');

describe('live GTP breakdown performance dashboard contract', () => {
  it('calculates weekly and asset breakdown performance server-side', () => {
    expect(route).toContain('const breakdownPerformance = {');
    expect(route).toContain('breakdownCount: breakdownOrders.length');
    expect(route).toContain('avgResponseMinutes');
    expect(route).toContain('avgRepairMinutes');
    expect(route).toContain('avgRestorationMinutes');
    expect(route).toContain('recordedDowntimeMinutes');
    expect(route).toContain('weekly: [...breakdownWeeklyMap.entries()]');
    expect(route).toContain('byAsset: [...breakdownAssetMap.values()]');
  });

  it('exposes the GTP metrics directly on the RWOP reporting page', () => {
    expect(page).toContain('Breakdown Performance & Response');
    expect(page).toContain('Weekly Breakdown Count');
    expect(page).toContain('Top Machines by Breakdown Count');
    expect(page).toContain('Avg Repair / MTTR');
    expect(page).toContain('Data quality:');
  });
});
