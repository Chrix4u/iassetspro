import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const cron = fs.readFileSync('src/app/api/pm-schedules/check-due-cron/route.ts', 'utf8');

describe('PM overdue calendar-frequency contract', () => {
  it('does not classify meter or custom-hour PM schedules as date-overdue', () => {
    expect(cron).toContain("frequencyType: { notIn: ['meter_based', 'custom_hours'] }");
  });
});
