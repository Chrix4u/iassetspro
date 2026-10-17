import { describe, expect, it } from 'vitest';
import {
  PM_FREQUENCY_MODES,
  PM_TIME_UNITS,
  calculateNextDueDate,
  isAutoCalculableFrequency,
  isMeterFrequencyType,
  normalizePmFrequency,
  resolveMeterTriggerTransition,
  resolvePmFrequencyInput,
  resolvePmNextDueDateForUpdate,
  serializePmFrequency,
  validatePmFrequencySelection,
} from '@/lib/pm-utils';

describe('canonical PM frequency model', () => {
  it('exposes exactly Time/Day and Meter modes', () => {
    expect(PM_FREQUENCY_MODES).toEqual(['time_day', 'meter']);
  });

  it('exposes exactly the approved Time/Day units', () => {
    expect(PM_TIME_UNITS).toEqual([
      'minutes',
      'hours',
      'days',
      'weeks',
      'months',
      'years',
    ]);
  });

  it.each([
    ['daily', 2, 'time_day', 'days', 2],
    ['weekly', 2, 'time_day', 'weeks', 2],
    ['biweekly', 2, 'time_day', 'weeks', 4],
    ['monthly', 3, 'time_day', 'months', 3],
    ['quarterly', 2, 'time_day', 'months', 6],
    ['semiannual', 2, 'time_day', 'months', 12],
    ['annual', 2, 'time_day', 'years', 2],
    ['custom_days', 5, 'time_day', 'days', 5],
    ['custom_hours', 500, 'meter', 'hours', 500],
    ['meter_based', 750, 'meter', 'hours', 750],
    ['time_minutes', 15, 'time_day', 'minutes', 15],
    ['time_hours', 8, 'time_day', 'hours', 8],
    ['time_days', 10, 'time_day', 'days', 10],
    ['time_weeks', 3, 'time_day', 'weeks', 3],
    ['time_months', 4, 'time_day', 'months', 4],
    ['time_years', 2, 'time_day', 'years', 2],
  ])(
    'normalizes %s without changing its effective cadence',
    (frequencyType, value, frequencyMode, frequencyUnit, frequencyValue) => {
      expect(normalizePmFrequency(frequencyType, value)).toEqual({
        frequencyMode,
        frequencyUnit,
        frequencyValue,
      });
    },
  );

  it.each([
    ['minutes', 'time_minutes'],
    ['hours', 'time_hours'],
    ['days', 'time_days'],
    ['weeks', 'time_weeks'],
    ['months', 'time_months'],
    ['years', 'time_years'],
  ])('serializes Time/Day %s without legacy cadence aliases', (unit, frequencyType) => {
    expect(serializePmFrequency('time_day', unit, 3)).toEqual({
      frequencyType,
      frequencyValue: 3,
    });
  });

  it('serializes the currently supported Meter source as operating hours', () => {
    expect(serializePmFrequency('meter', 'hours', 500)).toEqual({
      frequencyType: 'meter_based',
      frequencyValue: 500,
    });
  });

  it('keeps legacy custom_hours as a Meter schedule, never calendar hours', () => {
    expect(normalizePmFrequency('custom_hours', 250)).toEqual({
      frequencyMode: 'meter',
      frequencyUnit: 'hours',
      frequencyValue: 250,
    });
    expect(serializePmFrequency('time_day', 'hours', 250).frequencyType).toBe('time_hours');
  });

  it.each([
    ['time_day', 'minutes', 1, null],
    ['time_day', 'years', 1, null],
    ['meter', 'hours', 100, null],
    ['time_day', 'cycles', 1, 'Select a valid Time/Day unit'],
    ['meter', 'days', 100, 'Select a supported meter unit'],
    ['time_day', 'days', 0, 'Frequency value must be greater than 0'],
    ['time_day', 'days', -1, 'Frequency value must be greater than 0'],
    ['time_day', 'days', Number.NaN, 'Frequency value must be greater than 0'],
  ])('validates mode/unit/value compatibility', (mode, unit, value, expectedError) => {
    expect(validatePmFrequencySelection(mode, unit, value)).toBe(expectedError);
  });

  it.each([
    ['time_minutes', 30, '2026-01-15T12:30:00.000Z'],
    ['time_hours', 8, '2026-01-15T20:00:00.000Z'],
    ['time_days', 2, '2026-01-17T12:00:00.000Z'],
    ['time_weeks', 2, '2026-01-29T12:00:00.000Z'],
    ['time_months', 2, '2026-03-15T12:00:00.000Z'],
    ['time_years', 2, '2028-01-15T12:00:00.000Z'],
  ])('calculates next due date for %s', (frequencyType, value, expectedIso) => {
    const start = new Date('2026-01-15T12:00:00.000Z');
    expect(calculateNextDueDate(start, frequencyType, value)?.toISOString()).toBe(expectedIso);
    expect(isAutoCalculableFrequency(frequencyType)).toBe(true);
  });

  it('does not calculate a calendar due date for Meter schedules', () => {
    const start = new Date('2026-01-15T12:00:00.000Z');
    expect(calculateNextDueDate(start, 'meter_based', 500)).toBeNull();
    expect(isAutoCalculableFrequency('meter_based')).toBe(false);
  });
});

describe('PM schedule API frequency input', () => {
  it('resolves canonical Time/Day input into the persisted time unit', () => {
    expect(resolvePmFrequencyInput({
      frequencyMode: 'time_day',
      frequencyUnit: 'months',
      frequencyValue: '3',
    })).toEqual({
      ok: true,
      value: { frequencyType: 'time_months', frequencyValue: 3 },
    });
  });

  it('resolves canonical Meter input into the existing operating-hours trigger type', () => {
    expect(resolvePmFrequencyInput({
      frequencyMode: 'meter',
      frequencyUnit: 'hours',
      frequencyValue: 500,
    })).toEqual({
      ok: true,
      value: { frequencyType: 'meter_based', frequencyValue: 500 },
    });
  });

  it.each([
    [{ frequencyMode: 'time_day', frequencyUnit: 'cycles', frequencyValue: 1 }, 'Select a valid Time/Day unit'],
    [{ frequencyMode: 'meter', frequencyUnit: 'days', frequencyValue: 100 }, 'Select a supported meter unit'],
    [{ frequencyMode: 'time_day', frequencyValue: 1 }, 'Select a valid Time/Day unit'],
    [{ frequencyUnit: 'days', frequencyValue: 1 }, 'Select a valid frequency type'],
    [{ frequencyMode: 'time_day', frequencyUnit: 'days', frequencyValue: 0 }, 'Frequency value must be a positive whole number'],
    [{ frequencyMode: 'time_day', frequencyUnit: 'days', frequencyValue: -1 }, 'Frequency value must be a positive whole number'],
    [{ frequencyMode: 'time_day', frequencyUnit: 'days', frequencyValue: 1.5 }, 'Frequency value must be a positive whole number'],
    [{ frequencyMode: 'time_day', frequencyUnit: 'days', frequencyValue: 'abc' }, 'Frequency value must be a positive whole number'],
  ])('rejects invalid canonical API input %#', (input, error) => {
    expect(resolvePmFrequencyInput(input)).toEqual({ ok: false, error });
  });

  it.each([
    ['monthly', '2', 'monthly', 2],
    ['time_days', 5, 'time_days', 5],
    ['custom_hours', 250, 'custom_hours', 250],
    ['meter_based', 750, 'meter_based', 750],
  ])('keeps legacy/storage clients compatible for %s', (frequencyType, frequencyValue, persistedType, persistedValue) => {
    expect(resolvePmFrequencyInput({ frequencyType, frequencyValue })).toEqual({
      ok: true,
      value: { frequencyType: persistedType, frequencyValue: persistedValue },
    });
  });

  it('rejects an unknown legacy frequency type', () => {
    expect(resolvePmFrequencyInput({ frequencyType: 'fortnightly', frequencyValue: 1 })).toEqual({
      ok: false,
      error: 'Invalid PM frequency type',
    });
  });
});

describe('PM schedule update timing', () => {
  const now = new Date('2026-02-01T08:00:00.000Z');

  it('recognizes only real Meter-backed persistence values as meter frequencies', () => {
    expect(isMeterFrequencyType('meter_based')).toBe(true);
    expect(isMeterFrequencyType('custom_hours')).toBe(true);
    expect(isMeterFrequencyType('time_hours')).toBe(false);
    expect(isMeterFrequencyType('monthly')).toBe(false);
  });

  it('recalculates a changed Time/Day schedule from the last completed date', () => {
    const next = resolvePmNextDueDateForUpdate({
      frequencyType: 'time_months',
      frequencyValue: 3,
      lastCompletedDate: new Date('2026-01-15T12:00:00.000Z'),
      previousNextDueDate: new Date('2026-02-15T12:00:00.000Z'),
      requestedNextDueDate: undefined,
      timingChanged: true,
      now,
    });
    expect(next?.toISOString()).toBe('2026-04-15T12:00:00.000Z');
  });

  it('uses now when a changed Time/Day schedule has never been completed', () => {
    const next = resolvePmNextDueDateForUpdate({
      frequencyType: 'time_days',
      frequencyValue: 10,
      lastCompletedDate: null,
      previousNextDueDate: null,
      requestedNextDueDate: undefined,
      timingChanged: true,
      now,
    });
    expect(next?.toISOString()).toBe('2026-02-11T08:00:00.000Z');
  });

  it('keeps an explicit valid Time/Day due date', () => {
    const requested = new Date('2026-05-01T08:00:00.000Z');
    expect(resolvePmNextDueDateForUpdate({
      frequencyType: 'time_months',
      frequencyValue: 3,
      lastCompletedDate: new Date('2026-01-15T12:00:00.000Z'),
      previousNextDueDate: new Date('2026-02-15T12:00:00.000Z'),
      requestedNextDueDate: requested,
      timingChanged: true,
      now,
    })).toEqual(requested);
  });

  it('auto-recalculates a Time/Day schedule when an explicit due date is cleared', () => {
    const next = resolvePmNextDueDateForUpdate({
      frequencyType: 'time_weeks',
      frequencyValue: 2,
      lastCompletedDate: new Date('2026-01-15T12:00:00.000Z'),
      previousNextDueDate: new Date('2026-01-29T12:00:00.000Z'),
      requestedNextDueDate: null,
      timingChanged: false,
      now,
    });
    expect(next?.toISOString()).toBe('2026-01-29T12:00:00.000Z');
  });

  it('preserves the existing Time/Day due date when timing did not change', () => {
    const previous = new Date('2026-03-15T12:00:00.000Z');
    expect(resolvePmNextDueDateForUpdate({
      frequencyType: 'time_months',
      frequencyValue: 1,
      lastCompletedDate: new Date('2026-02-15T12:00:00.000Z'),
      previousNextDueDate: previous,
      requestedNextDueDate: undefined,
      timingChanged: false,
      now,
    })).toEqual(previous);
  });

  it('always clears calendar next-due state for Meter schedules', () => {
    expect(resolvePmNextDueDateForUpdate({
      frequencyType: 'meter_based',
      frequencyValue: 500,
      lastCompletedDate: null,
      previousNextDueDate: new Date('2026-03-15T12:00:00.000Z'),
      requestedNextDueDate: new Date('2026-05-01T08:00:00.000Z'),
      timingChanged: true,
      now,
    })).toBeNull();
  });
});

describe('PM Meter trigger lifecycle decisions', () => {
  it.each([
    ['monthly', 'meter_based', false, true, 'create'],
    ['meter_based', 'meter_based', true, true, 'reconcile'],
    ['custom_hours', 'meter_based', true, false, 'reconcile'],
    ['meter_based', 'time_days', true, true, 'remove'],
    ['time_days', 'time_weeks', true, false, 'remove'],
    ['meter_based', 'meter_based', true, false, 'none'],
    ['time_days', 'time_weeks', false, true, 'none'],
  ])(
    'chooses %s → %s with trigger=%s targetChanged=%s as %s',
    (previousFrequencyType, nextFrequencyType, hasTrigger, targetChanged, expected) => {
      expect(resolveMeterTriggerTransition({
        previousFrequencyType,
        nextFrequencyType,
        hasTrigger,
        targetChanged,
      })).toBe(expected);
    },
  );
});
