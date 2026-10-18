import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { calculateNextDueDate, isAutoCalculableFrequency, isPmFrequencyType } from '@/lib/pm-utils';

const collection = fs.readFileSync('src/app/api/pm-schedules/route.ts', 'utf8');
const detail = fs.readFileSync('src/app/api/pm-schedules/[id]/route.ts', 'utf8');

describe('PM frequency validation contract', () => {
  it('recognizes only supported schedule frequencies', () => {
    expect(isPmFrequencyType('time_day')).toBe(true);
    expect(isPmFrequencyType('meter')).toBe(true);
    expect(isPmFrequencyType('monthly')).toBe(false);
    expect(isPmFrequencyType('custom_hours')).toBe(false);
    expect(isPmFrequencyType('monthy')).toBe(false);
    expect(isPmFrequencyType('')).toBe(false);
  });

  it('never silently converts an unknown frequency into monthly recurrence', () => {
    expect(calculateNextDueDate(new Date('2026-10-06T00:00:00Z'), 'monthy', 1)).toBeNull();
    expect(isAutoCalculableFrequency('monthy')).toBe(false);
  });

  it('rejects invalid type and non-positive/non-integer interval on create', () => {
    expect(collection).toContain('Invalid PM frequency type');
    expect(collection).toContain('Frequency value must be a positive whole number');
    expect(collection).toContain('frequencyValue: canonicalFrequency.frequencyValue');
  });

  it('applies the same validation to schedule edits', () => {
    expect(detail).toContain('!isPmFrequencyType(rawFrequencyType)');
    expect(detail).toContain('Number.isInteger(normalizedFrequencyValue)');
    expect(detail).toContain('updateData.frequencyValue = canonicalFrequencyForUpdate.frequencyValue');
  });
});
