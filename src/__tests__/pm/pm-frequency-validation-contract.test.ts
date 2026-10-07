import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { calculateNextDueDate, isAutoCalculableFrequency, isPmFrequencyType } from '@/lib/pm-utils';

const collection = fs.readFileSync('src/app/api/pm-schedules/route.ts', 'utf8');
const detail = fs.readFileSync('src/app/api/pm-schedules/[id]/route.ts', 'utf8');

describe('PM frequency validation contract', () => {
  it('recognizes only supported schedule frequencies', () => {
    expect(isPmFrequencyType('monthly')).toBe(true);
    expect(isPmFrequencyType('custom_hours')).toBe(true);
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
    expect(collection).toContain('frequencyValue: normalizedFrequencyValue');
  });

  it('applies the same validation to schedule edits', () => {
    expect(detail).toContain('!isPmFrequencyType(body.frequencyType)');
    expect(detail).toContain('Number.isInteger(normalizedFrequencyValue)');
    expect(detail).toContain('updateData.frequencyValue = normalizedFrequencyValue');
  });

  it('preserves zero lead days, defaults blank create input to three, and rejects invalid create values', () => {
    expect(collection).toContain('const normalizedLeadDays');
    expect(collection).toContain("leadDays === ''");
    expect(collection).toContain('? 3');
    expect(collection).toContain('Number.isInteger(normalizedLeadDays)');
    expect(collection).toContain('normalizedLeadDays < 0');
    expect(collection).toContain('Lead days must be a non-negative whole number');
    expect(collection).toContain('leadDays: normalizedLeadDays');
    expect(collection).not.toContain('leadDays: leadDays || 3');
  });

  it('applies the same non-negative whole-number lead-days contract to schedule edits', () => {
    expect(detail).toContain('body.leadDays !== undefined');
    expect(detail).toContain('Number.isInteger(normalizedLeadDays)');
    expect(detail).toContain('normalizedLeadDays < 0');
    expect(detail).toContain('Lead days must be a non-negative whole number');
    expect(detail).toContain('updateData.leadDays = normalizedLeadDays');
  });
});
