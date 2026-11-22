import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  findAsset: vi.fn(),
  findMeters: vi.fn(),
  findTasks: vi.fn(),
  findSchedules: vi.fn(),
  findLatestReading: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    asset: { findUnique: mocks.findAsset },
    assetMeter: { findMany: mocks.findMeters },
    pmScheduleTask: { findMany: mocks.findTasks },
    pmSchedule: { findMany: mocks.findSchedules },
    meterReading: { findFirst: mocks.findLatestReading },
  },
}));
vi.mock('@/lib/auth', () => ({
  getSession: () => ({ userId: 'planner' }),
  isAdmin: () => true,
  hasPermission: () => true,
}));
vi.mock('@/lib/plant-scope', () => ({
  getPlantScope: async () => ({ denyAccess: false }),
  canAccessPlantStrict: () => true,
}));

import { GET } from '@/app/api/production-surveys/pm-progress/route';

const observedAt = new Date('2026-11-20T08:00:00.000Z');
const meter = (lastReadingAt: Date | null, currentValue = 0) => ({
  id: 'meter-1', name: 'Gross output', unit: 'yards', meterType: 'production',
  currentValue, lastReadingAt, isActive: true,
});
const task = (assetMeterId: string | null = 'meter-1') => ({
  id: 'task-1', assetMeterId, meterName: 'Gross output', frequencyUnit: 'yards',
  nextDueReading: 5000, frequencyInterval: 5000,
  pmTask: { description: 'Inspect loom gearbox' },
  schedule: {
    id: 'schedule-1', title: 'Loom output PM', isActive: true,
    autoGenerateWO: true, recurrenceAuthority: 'task',
  },
});
const fetchProgress = async () => {
  const result = await GET(new NextRequest('http://localhost/api/production-surveys/pm-progress?assetId=asset-1'));
  expect(result.status).toBe(200);
  return (await result.json()).data.thresholds[0] as {
    state: string; currentValue: number | null; remaining: number | null; meterId: string | null; nextDueReading: number; readingSource?: string;
  };
};

describe('PM threshold presentation matches engine observation gates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findAsset.mockResolvedValue({ id: 'asset-1', plantId: 'plant-1' });
    mocks.findMeters.mockResolvedValue([meter(null)]);
    mocks.findTasks.mockResolvedValue([task()]);
    mocks.findSchedules.mockResolvedValue([]);
    mocks.findLatestReading.mockResolvedValue(null);
  });

  it('does not treat a never-observed default-zero AssetMeter as measured production', async () => {
    expect(await fetchProgress()).toMatchObject({
      state: 'awaiting_reading', currentValue: null, remaining: null,
    });
  });

  it('uses a registered meter value once an actual reading is recorded', async () => {
    mocks.findMeters.mockResolvedValue([meter(observedAt, 4200)]);
    expect(await fetchProgress()).toMatchObject({
      state: 'approaching', currentValue: 4200, remaining: 800,
    });
  });

  it('accepts a genuinely observed zero reading without treating it as missing', async () => {
    mocks.findMeters.mockResolvedValue([meter(observedAt, 0)]);
    expect(await fetchProgress()).toMatchObject({
      state: 'upcoming', currentValue: 0, remaining: 5000,
    });
  });

  it('shows historical unlinked PM tasks without an active meter registration', async () => {
    mocks.findMeters.mockResolvedValue([]);
    mocks.findTasks.mockResolvedValue([task(null)]);
    mocks.findLatestReading.mockResolvedValue({ value: 2700, readingDate: observedAt });
    expect(await fetchProgress()).toMatchObject({
      state: 'upcoming', currentValue: 2700, remaining: 2300, meterId: null,
    });
    expect(mocks.findLatestReading).toHaveBeenCalledWith(expect.objectContaining({
      where: { assetId: 'asset-1', meterName: 'Gross output', unit: 'yards' },
    }));
  });

  it('shows an unregistered legacy task as awaiting reading instead of hiding it', async () => {
    mocks.findMeters.mockResolvedValue([]);
    mocks.findTasks.mockResolvedValue([task(null)]);
    expect(await fetchProgress()).toMatchObject({
      state: 'awaiting_reading', currentValue: null, remaining: null, meterId: null,
    });
  });

  it('does not confuse a missing linked meter with an unlinked historical task', async () => {
    mocks.findMeters.mockResolvedValue([]);
    const response = await GET(new NextRequest('http://localhost/api/production-surveys/pm-progress?assetId=asset-1'));
    expect(response.status).toBe(200);
    expect((await response.json()).data.thresholds).toHaveLength(0);
    expect(mocks.findLatestReading).not.toHaveBeenCalled();
  });

  it('shows a historical schedule threshold when only legacy readings exist', async () => {
    mocks.findMeters.mockResolvedValue([]);
    mocks.findTasks.mockResolvedValue([]);
    mocks.findSchedules.mockResolvedValue([{
      id: 'schedule-legacy', title: 'Legacy output schedule', autoGenerateWO: true,
      frequencyValue: 5000, frequencyUnit: 'yards', meterName: 'Gross output',
      trigger: {
        isActive: true, triggerType: 'meter', triggerValue: 5000,
        triggerConfig: JSON.stringify({
          source: 'asset_meter_reading', meterName: 'Gross output',
          unit: 'yards', baselineValue: 1000,
        }),
      },
    }]);
    mocks.findLatestReading.mockResolvedValue({ value: 6400, readingDate: observedAt });
    expect(await fetchProgress()).toMatchObject({
      state: 'due', currentValue: 6400, nextDueReading: 6000, meterId: null,
    });
  });

  const componentHourSchedule = (hours: number | null, baseline: number | undefined = 480) => ({
    id: 'schedule-500h', title: 'Drive motor 500-hour service', frequencyType: 'meter_based',
    autoGenerateWO: true, frequencyValue: 500, frequencyUnit: null, meterName: null,
    component: { id: 'component-1', name: 'Drive motor', assetId: 'asset-1', operatingHours: hours },
    trigger: {
      isActive: true, triggerType: 'meter', triggerValue: 500,
      triggerConfig: JSON.stringify({
        source: 'component_operating_hours', componentId: 'component-1',
        ...(Number.isNaN(baseline) ? {} : { baselineHours: baseline }), unit: 'hours',
      }),
    },
  });

  it('shows a legacy component-hour PM schedule at the correct baseline and next threshold', async () => {
    mocks.findMeters.mockResolvedValue([]);
    mocks.findTasks.mockResolvedValue([]);
    mocks.findSchedules.mockResolvedValue([componentHourSchedule(480)]);
    expect(await fetchProgress()).toMatchObject({
      state: 'upcoming', currentValue: 480, remaining: 500,
      nextDueReading: 980, meterId: null, readingSource: 'component_operating_hours',
    });
    expect(mocks.findLatestReading).not.toHaveBeenCalled();
  });

  it('identifies a reached legacy component-hour PM threshold without changing a meter', async () => {
    mocks.findMeters.mockResolvedValue([]);
    mocks.findTasks.mockResolvedValue([]);
    mocks.findSchedules.mockResolvedValue([componentHourSchedule(980)]);
    expect(await fetchProgress()).toMatchObject({
      state: 'due', currentValue: 980, remaining: 0,
      nextDueReading: 980, readingSource: 'component_operating_hours',
    });
    expect(mocks.findLatestReading).not.toHaveBeenCalled();
  });

  it('does not fabricate a component-hour PM baseline before it is configured', async () => {
    mocks.findMeters.mockResolvedValue([]);
    mocks.findTasks.mockResolvedValue([]);
    mocks.findSchedules.mockResolvedValue([componentHourSchedule(480, Number.NaN)]);
    const response = await GET(new NextRequest('http://localhost/api/production-surveys/pm-progress?assetId=asset-1'));
    expect(response.status).toBe(200);
    expect((await response.json()).data.thresholds).toHaveLength(0);
  });

  it('ignores orphaned legacy components instead of pretending they have runtime readings', async () => {
    mocks.findMeters.mockResolvedValue([]);
    mocks.findTasks.mockResolvedValue([]);
    mocks.findSchedules.mockResolvedValue([{
      ...componentHourSchedule(480),
      component: { id: 'elsewhere', name: 'Wrong plant motor', assetId: 'asset-other', operatingHours: 980 },
    }]);
    const response = await GET(new NextRequest('http://localhost/api/production-surveys/pm-progress?assetId=asset-1'));
    expect(response.status).toBe(200);
    expect((await response.json()).data.thresholds).toHaveLength(0);
  });

  it('does not mislabel an incompatible legacy trigger source as component hours', async () => {
    mocks.findMeters.mockResolvedValue([]);
    mocks.findTasks.mockResolvedValue([]);
    const legacy = componentHourSchedule(980);
    mocks.findSchedules.mockResolvedValue([{
      ...legacy,
      trigger: {
        ...legacy.trigger,
        triggerConfig: JSON.stringify({ source: 'asset_meter_reading', baselineHours: 480 }),
      },
    }]);
    const response = await GET(new NextRequest('http://localhost/api/production-surveys/pm-progress?assetId=asset-1'));
    expect(response.status).toBe(200);
    expect((await response.json()).data.thresholds).toHaveLength(0);
    expect(mocks.findLatestReading).not.toHaveBeenCalled();
  });

  it('preserves historical unlinked PM tasks with a real meter-reading baseline', async () => {
    mocks.findTasks.mockResolvedValue([task(null)]);
    mocks.findLatestReading.mockResolvedValue({ value: 2700, readingDate: observedAt });
    expect(await fetchProgress()).toMatchObject({
      state: 'upcoming', currentValue: 2700, remaining: 2300,
    });
  });
});
