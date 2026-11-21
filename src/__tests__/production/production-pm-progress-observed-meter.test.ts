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
    state: string; currentValue: number | null; remaining: number | null;
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

  it('preserves historical unlinked PM tasks with a real meter-reading baseline', async () => {
    mocks.findTasks.mockResolvedValue([task(null)]);
    mocks.findLatestReading.mockResolvedValue({ value: 2700, readingDate: observedAt });
    expect(await fetchProgress()).toMatchObject({
      state: 'upcoming', currentValue: 2700, remaining: 2300,
    });
  });
});
