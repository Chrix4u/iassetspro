import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  resolveLegacyHeaderTbmCadence,
  syncLegacyTbmShadowState,
} from '@/services/pm/legacyTbmCompatibility.service';

describe('legacyTbmCompatibility.service cadence mapping', () => {
  it.each([
    ['daily', 2, null, 2, 'days'],
    ['weekly', 3, null, 3, 'weeks'],
    ['biweekly', 2, null, 4, 'weeks'],
    ['monthly', 2, null, 2, 'months'],
    ['quarterly', 2, null, 6, 'months'],
    ['semiannual', 2, null, 12, 'months'],
    ['annual', 2, null, 2, 'years'],
    ['annually', 3, null, 3, 'years'],
    ['yearly', 4, null, 4, 'years'],
    ['custom', 9, null, 9, 'days'],
    ['custom_days', 11, null, 11, 'days'],
    ['time_day', 5, 'days', 5, 'days'],
    ['time_day', 6, 'weeks', 6, 'weeks'],
    ['time_day', 7, 'months', 7, 'months'],
    ['time_day', 8, 'years', 8, 'years'],
  ] as const)('maps %s deterministically to task-level TBM', (frequencyType, frequencyValue, frequencyUnit, interval, unit) => {
    expect(resolveLegacyHeaderTbmCadence({ frequencyType, frequencyValue, frequencyUnit })).toEqual({
      frequencyInterval: interval,
      frequencyUnit: unit,
    });
  });

  it.each([
    ['custom_hours', 12, null],
    ['time_day', 30, 'minutes'],
    ['time_day', 12, 'hours'],
    ['meter', 500, 'hours'],
    ['meter_based', 500, null],
  ] as const)('rejects %s because it cannot map losslessly to current task-level TBM', (frequencyType, frequencyValue, frequencyUnit) => {
    expect(resolveLegacyHeaderTbmCadence({ frequencyType, frequencyValue, frequencyUnit })).toBeNull();
  });

  it('rejects invalid intervals instead of normalizing corrupt legacy data to one', () => {
    expect(resolveLegacyHeaderTbmCadence({ frequencyType: 'daily', frequencyValue: 0, frequencyUnit: null })).toBeNull();
    expect(resolveLegacyHeaderTbmCadence({ frequencyType: 'weekly', frequencyValue: -2, frequencyUnit: null })).toBeNull();
  });
});

const tx = {
  pmScheduleTask: { updateMany: vi.fn() },
};

const shadowInput = (overrides: Record<string, unknown> = {}) => ({
  scheduleId: 'schedule-1',
  frequencyType: 'quarterly',
  frequencyValue: 1,
  frequencyUnit: null,
  leadDays: 5,
  lastCompletedDate: new Date('2026-09-30T00:00:00.000Z'),
  nextDueDate: new Date('2026-12-31T00:00:00.000Z'),
  ...overrides,
});

describe('legacyTbmCompatibility.service shadow synchronization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tx.pmScheduleTask.updateMany.mockResolvedValue({ count: 2 });
  });

  it('synchronizes supported legacy header recurrence into TBM shadow rows', async () => {
    await syncLegacyTbmShadowState(tx as never, shadowInput());

    expect(tx.pmScheduleTask.updateMany).toHaveBeenCalledWith({
      where: { scheduleId: 'schedule-1', maintenanceMode: 'tbm' },
      data: {
        frequencyInterval: 3,
        frequencyUnit: 'months',
        leadDays: 5,
        lastCompletedAt: new Date('2026-09-30T00:00:00.000Z'),
        nextDueDate: new Date('2026-12-31T00:00:00.000Z'),
        isActive: true,
      },
    });
  });

  it('deactivates TBM shadow rows when the legacy cadence no longer maps losslessly', async () => {
    await syncLegacyTbmShadowState(tx as never, shadowInput({
      frequencyType: 'custom_hours', frequencyValue: 12,
    }));

    expect(tx.pmScheduleTask.updateMany).toHaveBeenCalledWith({
      where: { scheduleId: 'schedule-1', maintenanceMode: 'tbm' },
      data: { isActive: false },
    });
  });
});
