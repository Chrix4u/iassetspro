import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  recordFindMany: vi.fn(),
  recordGroupBy: vi.fn(),
  planFindMany: vi.fn(),
}));
vi.mock('@/lib/db', () => ({
  db: {
    productionShiftRecord: { findMany: mocks.recordFindMany, groupBy: mocks.recordGroupBy },
    productionShiftPlan: { findMany: mocks.planFindMany },
  },
}));
vi.mock('@/lib/auth', () => ({
  getSession: () => ({ userId: 'admin', roles: ['admin'] }),
  isAdmin: () => true,
  hasPermission: () => true,
}));
vi.mock('@/lib/plant-scope', () => ({
  getPlantScope: async () => ({
    isSystemWide: true, isScoped: false, accessiblePlantIds: [], denyAccess: false,
  }),
  getPlantFilterWhere: () => ({}),
}));
vi.mock('@/lib/production-shift-access', () => ({
  requiresCrewScope: () => false,
}));
vi.mock('@/lib/production-shift-survey', () => ({
  reportingWeekStart: (d: Date) => d.toISOString().slice(0, 10),
  surveyTotals: () => ({ downtimeMinutes: 0, productiveMinutes: 480 }),
}));

import { GET } from '@/app/api/production-surveys/report/route';

const date = (day: number) => new Date('2026-11-' + String(day).padStart(2, '0') + 'T00:00:00.000Z');
const asset = { name: 'Weaving machine A', assetTag: 'WM-A' };
const record = (day: number, output: number) => ({
  productionDate: date(day), assetId: 'asset-A', unit: 'yards',
  asset, shift: { name: 'Morning', code: 'M' },
  outputQuantity: output, defectiveQuantity: 0, startDelayMinutes: 0,
  targetQuantity: 20, availableMinutes: 480, repairMinutes: 0,
  preventiveMinutes: 0, breakMinutes: 0, standardUtilizationPct: null,
  standardSpeed: null, meterReadingId: null, productCode: null,
});
const plan = (day: number) => ({
  id: 'plan-' + day, assetId: 'asset-A', unit: 'yards',
  productionDate: date(day), targetQuantity: 20, asset,
});
describe('production reports chronological cumulative totals', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Historical approved record on Nov 9 has no planner shift. New shift
    // plans Nov 10-11 are populated first in the report's grouping map.
    mocks.recordFindMany.mockResolvedValue([record(9, 5), record(10, 7), record(11, 13)]);
    mocks.planFindMany.mockResolvedValue([plan(10), plan(11)]);
    mocks.recordGroupBy.mockResolvedValue([{
      assetId: 'asset-A', unit: 'yards', _sum: { outputQuantity: 50 },
    }]);
  });

  it('does not let a legacy approved record hide an unreported scheduled shift', async () => {
    mocks.recordFindMany.mockResolvedValue([{ ...record(10, 7), planId: null }]);
    mocks.planFindMany.mockResolvedValue([plan(10), plan(11)]);
    mocks.recordGroupBy.mockResolvedValue([]);
    const response = await GET(new NextRequest(
      'http://localhost/api/production-surveys/report?group=day&from=2026-11-10&to=2026-11-11',
    ));
    expect(response.status).toBe(200);
    const { data } = await response.json() as { data: Array<{
      period: string; shifts: number; output: number; plannedShifts: number; unapprovedOrMissingShifts: number;
    }> };
    expect(data.map(x => [x.period, x.shifts, x.output, x.plannedShifts, x.unapprovedOrMissingShifts])).toEqual([
      ['2026-11-10', 1, 7, 1, 1],
      ['2026-11-11', 0, 0, 1, 1],
    ]);
  });

  it('counts approved records against their actual scheduled plan', async () => {
    mocks.recordFindMany.mockResolvedValue([{ ...record(10, 7), planId: 'plan-10' }]);
    mocks.planFindMany.mockResolvedValue([plan(10), plan(11)]);
    mocks.recordGroupBy.mockResolvedValue([]);
    const response = await GET(new NextRequest(
      'http://localhost/api/production-surveys/report?group=day&from=2026-11-10&to=2026-11-11',
    ));
    expect(response.status).toBe(200);
    const { data } = await response.json() as { data: Array<{
      period: string; plannedShifts: number; unapprovedOrMissingShifts: number;
    }> };
    expect(data.map(x => [x.period, x.plannedShifts, x.unapprovedOrMissingShifts])).toEqual([
      ['2026-11-10', 1, 0],
      ['2026-11-11', 1, 1],
    ]);
  });

  it('sorts legacy approved shifts before newer planned periods for all-time cumulative production', async () => {
    const request = new NextRequest(
      'http://localhost/api/production-surveys/report?group=day&from=2026-11-09&to=2026-11-11',
    );
    const response = await GET(request);
    expect(response.status).toBe(200);
    const { data } = await response.json() as {
      data: Array<{ period: string; output: number; cumulativeProduction: number; workbookCumulativeProduction: number }>;
    };
    expect(data.map(({ period, output, cumulativeProduction, workbookCumulativeProduction }) =>
      [period, output, cumulativeProduction, workbookCumulativeProduction])).toEqual([
      ['2026-11-09', 5, 55, 5],
      ['2026-11-10', 7, 62, 7],
      ['2026-11-11', 13, 75, 13],
    ]);
  });
});
