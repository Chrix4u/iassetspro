import { describe, expect, it } from 'vitest';
import * as pmUtils from '@/lib/pm-utils';

type PmUtilsContract = typeof pmUtils & {
  TIME_DAY_FREQUENCY_UNITS?: readonly string[];
  normalizePmFrequency?: (
    frequencyType: string,
    frequencyValue: number,
    frequencyUnit?: string | null,
  ) => { type: string; value: number; unit: string | null };
};

const contract = pmUtils as PmUtilsContract;

describe('canonical PM frequency model', () => {
  it('exposes only Time/Day and Meter as frequency types', () => {
    expect(pmUtils.PM_FREQUENCY_TYPES).toEqual(['time_day', 'meter']);
    expect(pmUtils.isPmFrequencyType('time_day')).toBe(true);
    expect(pmUtils.isPmFrequencyType('meter')).toBe(true);
    expect(pmUtils.isPmFrequencyType('daily')).toBe(false);
  });

  it('exposes the six allowed Time/Day units', () => {
    expect(contract.TIME_DAY_FREQUENCY_UNITS).toEqual([
      'minutes',
      'hours',
      'days',
      'weeks',
      'months',
      'years',
    ]);
  });

  it('normalizes legacy calendar presets without losing their cadence', () => {
    expect(contract.normalizePmFrequency).toBeTypeOf('function');
    const normalize = contract.normalizePmFrequency!;

    expect(normalize('daily', 1)).toEqual({ type: 'time_day', value: 1, unit: 'days' });
    expect(normalize('weekly', 1)).toEqual({ type: 'time_day', value: 1, unit: 'weeks' });
    expect(normalize('biweekly', 1)).toEqual({ type: 'time_day', value: 2, unit: 'weeks' });
    expect(normalize('monthly', 1)).toEqual({ type: 'time_day', value: 1, unit: 'months' });
    expect(normalize('quarterly', 1)).toEqual({ type: 'time_day', value: 3, unit: 'months' });
    expect(normalize('semiannual', 1)).toEqual({ type: 'time_day', value: 6, unit: 'months' });
    expect(normalize('annual', 1)).toEqual({ type: 'time_day', value: 1, unit: 'years' });
    expect(normalize('custom_days', 14)).toEqual({ type: 'time_day', value: 14, unit: 'days' });
    expect(normalize('custom_hours', 6)).toEqual({ type: 'time_day', value: 6, unit: 'hours' });
    expect(normalize('meter_based', 500)).toEqual({ type: 'meter', value: 500, unit: null });
  });

  it('preserves an already canonical Time/Day unit', () => {
    expect(contract.normalizePmFrequency).toBeTypeOf('function');
    expect(contract.normalizePmFrequency!('time_day', 3, 'months')).toEqual({
      type: 'time_day',
      value: 3,
      unit: 'months',
    });
  });

  it('calculates Time/Day schedules using value plus unit', () => {
    const from = new Date('2026-01-15T10:00:00.000Z');
    const calculate = pmUtils.calculateNextDueDate as unknown as (
      fromDate: Date,
      frequencyType: string,
      frequencyValue: number,
      frequencyUnit?: string | null,
    ) => Date | null;

    expect(calculate(from, 'time_day', 30, 'minutes')?.toISOString())
      .toBe('2026-01-15T10:30:00.000Z');
    expect(calculate(from, 'time_day', 6, 'hours')?.toISOString())
      .toBe('2026-01-15T16:00:00.000Z');
    expect(calculate(from, 'time_day', 3, 'months')?.toISOString())
      .toBe('2026-04-15T10:00:00.000Z');
  });

  it('does not produce a calendar due date for Meter schedules', () => {
    const calculate = pmUtils.calculateNextDueDate as unknown as (
      fromDate: Date,
      frequencyType: string,
      frequencyValue: number,
      frequencyUnit?: string | null,
    ) => Date | null;

    expect(calculate(new Date('2026-01-15T10:00:00.000Z'), 'meter', 500, 'hours')).toBeNull();
  });

  it('formats canonical frequencies using the selected unit', () => {
    const format = pmUtils.formatFrequencyLabel as unknown as (
      frequencyType: string,
      frequencyValue: number,
      frequencyUnit?: string | null,
    ) => string;

    expect(format('time_day', 3, 'months')).toBe('Every 3 months');
    expect(format('meter', 500, 'hours')).toBe('Every 500 hours');
  });
});
