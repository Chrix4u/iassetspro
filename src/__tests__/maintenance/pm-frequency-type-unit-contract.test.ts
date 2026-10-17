import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  PM_FREQUENCY_TYPES,
  PM_TIME_UNITS,
  calculateNextDueDate,
  normalizePmFrequency,
} from '@/lib/pm-utils';

const maintenancePage = fs.readFileSync('src/components/modules/MaintenancePages.tsx', 'utf8');
const createRoute = fs.readFileSync('src/app/api/pm-schedules/route.ts', 'utf8');
const updateRoute = fs.readFileSync('src/app/api/pm-schedules/[id]/route.ts', 'utf8');
const schema = fs.readFileSync('prisma/schema.prisma', 'utf8');

describe('PM frequency type and unit contract', () => {
  it('uses only Time/Day and Meter as canonical frequency types', () => {
    expect(PM_FREQUENCY_TYPES).toEqual(['time_day', 'meter']);
    expect(PM_TIME_UNITS).toEqual(['minutes', 'hours', 'days', 'weeks', 'months', 'years']);
  });

  it('normalizes legacy cadence schedules without changing their meaning', () => {
    expect(normalizePmFrequency('daily', 2)).toMatchObject({ type: 'time_day', unit: 'days', value: 2 });
    expect(normalizePmFrequency('weekly', 2)).toMatchObject({ type: 'time_day', unit: 'weeks', value: 2 });
    expect(normalizePmFrequency('biweekly', 2)).toMatchObject({ type: 'time_day', unit: 'weeks', value: 4 });
    expect(normalizePmFrequency('monthly', 2)).toMatchObject({ type: 'time_day', unit: 'months', value: 2 });
    expect(normalizePmFrequency('quarterly', 2)).toMatchObject({ type: 'time_day', unit: 'months', value: 6 });
    expect(normalizePmFrequency('semiannual', 2)).toMatchObject({ type: 'time_day', unit: 'months', value: 12 });
    expect(normalizePmFrequency('annual', 2)).toMatchObject({ type: 'time_day', unit: 'years', value: 2 });
    expect(normalizePmFrequency('custom_hours', 8)).toMatchObject({ type: 'time_day', unit: 'hours', value: 8 });
    expect(normalizePmFrequency('custom_days', 10)).toMatchObject({ type: 'time_day', unit: 'days', value: 10 });
    expect(normalizePmFrequency('meter_based', 500)).toMatchObject({ type: 'meter', value: 500 });
  });

  it('calculates all Time/Day units and leaves Meter schedules to their meter trigger', () => {
    const base = new Date('2026-01-15T10:00:00.000Z');
    expect(calculateNextDueDate(base, 'time_day', 30, 'minutes')?.toISOString()).toBe('2026-01-15T10:30:00.000Z');
    expect(calculateNextDueDate(base, 'time_day', 2, 'hours')?.toISOString()).toBe('2026-01-15T12:00:00.000Z');
    expect(calculateNextDueDate(base, 'time_day', 3, 'days')?.toISOString()).toBe('2026-01-18T10:00:00.000Z');
    expect(calculateNextDueDate(base, 'time_day', 2, 'weeks')?.toISOString()).toBe('2026-01-29T10:00:00.000Z');
    expect(calculateNextDueDate(base, 'time_day', 2, 'months')?.toISOString()).toBe('2026-03-15T10:00:00.000Z');
    expect(calculateNextDueDate(base, 'time_day', 1, 'years')?.toISOString()).toBe('2027-01-15T10:00:00.000Z');
    expect(calculateNextDueDate(base, 'meter', 500, 'hours')).toBeNull();
  });

  it('persists the dependent unit and validates it on create and update', () => {
    expect(schema).toMatch(/frequencyType\s+String/);
    expect(schema).toMatch(/frequencyUnit\s+String\?/);
    expect(createRoute).toContain('frequencyUnit');
    expect(updateRoute).toContain('frequencyUnit');
  });

  it('offers only Time/Day or Meter in the form and uses component-bound runtime counters for Meter', () => {
    expect(maintenancePage).toContain('value="time_day"');
    expect(maintenancePage).toContain('Time / Day');
    expect(maintenancePage).toContain('value="meter"');
    expect(maintenancePage).toContain('Meter');
    expect(maintenancePage).toContain('Frequency Unit');
    expect(maintenancePage).toContain('/runtime');
    expect(maintenancePage).not.toContain("['daily', 'weekly', 'biweekly', 'monthly', 'quarterly', 'semiannual', 'annual', 'custom_hours', 'custom_days', 'meter_based']");
  });
});
