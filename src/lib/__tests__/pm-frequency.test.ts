import { describe, expect, it } from 'vitest';
import {
  PM_FREQUENCY_TYPES,
  PM_TIME_UNITS,
  calculateTimeDayNextDueDate,
  normalizePmFrequency,
  validateCanonicalPmFrequency,
} from '@/lib/pm-frequency';

describe('PM frequency contract', () => {
  it('exposes exactly Time/Day and Meter as schedule frequency types', () => {
    expect(PM_FREQUENCY_TYPES).toEqual([
      { value: 'time_day', label: 'Time/Day' },
      { value: 'meter', label: 'Meter' },
    ]);
  });

  it('exposes only the supported Time/Day units', () => {
    expect(PM_TIME_UNITS).toEqual([
      { value: 'minutes', label: 'Minutes' },
      { value: 'hours', label: 'Hours' },
      { value: 'days', label: 'Days' },
      { value: 'weeks', label: 'Weeks' },
      { value: 'months', label: 'Months' },
      { value: 'years', label: 'Years' },
    ]);
  });

  it.each([
    ['daily', 1, 'days'],
    ['weekly', 1, 'weeks'],
    ['monthly', 1, 'months'],
    ['quarterly', 3, 'months'],
    ['annually', 1, 'years'],
    ['yearly', 1, 'years'],
    ['custom', 5, 'days'],
    ['custom_hours', 250, 'hours'],
  ] as const)(
    'normalizes legacy %s schedules to Time/Day without losing the interval',
    (frequencyType, expectedValue, expectedUnit) => {
      expect(
        normalizePmFrequency({
          frequencyType,
          frequencyValue:
            frequencyType === 'custom' || frequencyType === 'custom_hours'
              ? expectedValue
              : null,
        })
      ).toMatchObject({
        frequencyType: 'time_day',
        frequencyValue: expectedValue,
        frequencyUnit: expectedUnit,
        meterName: null,
      });
    }
  );

  it('normalizes legacy meter schedules while preserving legacy runtime-hour semantics', () => {
    expect(
      normalizePmFrequency({
        frequencyType: 'meter_based',
        frequencyValue: 500,
        meterName: 'Run Hours',
      })
    ).toEqual({
      frequencyType: 'meter',
      frequencyValue: 500,
      frequencyUnit: 'hours',
      meterName: 'Run Hours',
    });
  });

  it('preserves canonical Time/Day schedules', () => {
    expect(
      normalizePmFrequency({
        frequencyType: 'time_day',
        frequencyValue: 3,
        frequencyUnit: 'months',
      })
    ).toEqual({
      frequencyType: 'time_day',
      frequencyValue: 3,
      frequencyUnit: 'months',
      meterName: null,
    });
  });

  it('calculates next due dates from a Time/Day interval and unit', () => {
    const start = new Date('2026-01-15T10:00:00.000Z');

    expect(calculateTimeDayNextDueDate(start, 90, 'minutes').toISOString()).toBe(
      '2026-01-15T11:30:00.000Z'
    );
    expect(calculateTimeDayNextDueDate(start, 2, 'weeks').toISOString()).toBe(
      '2026-01-29T10:00:00.000Z'
    );
    expect(calculateTimeDayNextDueDate(start, 3, 'months').toISOString()).toBe(
      '2026-04-15T10:00:00.000Z'
    );
    expect(calculateTimeDayNextDueDate(start, 1, 'years').toISOString()).toBe(
      '2027-01-15T10:00:00.000Z'
    );
  });

  it('rejects invalid Time/Day units', () => {
    expect(
      validateCanonicalPmFrequency({
        frequencyType: 'time_day',
        frequencyValue: 1,
        frequencyUnit: 'kilometres',
      })
    ).toEqual({
      ok: false,
      error: 'Time/Day frequency unit must be minutes, hours, days, weeks, months, or years',
    });
  });

  it('requires a configured meter name and unit for Meter schedules', () => {
    expect(
      validateCanonicalPmFrequency({
        frequencyType: 'meter',
        frequencyValue: 500,
        frequencyUnit: '',
        meterName: '',
      })
    ).toEqual({
      ok: false,
      error: 'Meter frequency requires a configured asset meter and unit',
    });
  });

  it('accepts a Meter schedule using the selected asset meter unit', () => {
    expect(
      validateCanonicalPmFrequency({
        frequencyType: 'meter',
        frequencyValue: 500,
        frequencyUnit: 'km',
        meterName: 'Odometer',
      })
    ).toEqual({ ok: true });
  });
});
