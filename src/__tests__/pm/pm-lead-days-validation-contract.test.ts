import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const collection = fs.readFileSync('src/app/api/pm-schedules/route.ts', 'utf8');
const detail = fs.readFileSync('src/app/api/pm-schedules/[id]/route.ts', 'utf8');

describe('PM schedule lead-days validation contract', () => {
  it('preserves zero lead days and rejects invalid values on create', () => {
    expect(collection).toContain('Lead days must be a non-negative whole number');
    expect(collection).toContain("const effectiveLeadDays = !scheduledTasksProvided && calendarFrequency?.frequencyType === 'time_day' ? normalizedLeadDays : 0");
    expect(collection).toContain('scheduledTasksProvided ? false : (autoGenerateWO !== undefined ? autoGenerateWO : true)');
    expect(collection).toContain('leadDays: effectiveLeadDays');
    expect(collection).not.toContain('leadDays: leadDays || 3');
  });

  it('applies the same normalized validation to schedule edits', () => {
    expect(detail).toContain('Lead days must be a non-negative whole number');
    expect(detail).toContain('updateData.leadDays = normalizedLeadDays');
  });
});
