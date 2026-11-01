import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const cron = fs.readFileSync('src/app/api/pm-schedules/check-due-cron/route.ts', 'utf8');
const calendar = fs.readFileSync('src/components/modules/PmCalendarPage.tsx', 'utf8');

describe('PM overdue calendar-frequency contract', () => {
  it('excludes Meter schedules but keeps Time/Day hours in calendar overdue logic', () => {
    expect(cron).toContain("frequencyType: { notIn: ['meter', 'meter_based'] }");
  });

  it('gives calendar navigation explicit accessible names for the active view', () => {
    expect(calendar).toContain('aria-label={view === "month" ? "Previous month" : "Previous week"}');
    expect(calendar).toContain('aria-label={view === "month" ? "Next month" : "Next week"}');
  });
});
