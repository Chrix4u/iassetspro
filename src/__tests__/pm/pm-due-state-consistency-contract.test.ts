import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isAutoCalculableFrequency } from '@/lib/pm-utils';

const listRoute = fs.readFileSync('src/app/api/pm-schedules/route.ts', 'utf8');
const detailRoute = fs.readFileSync('src/app/api/pm-schedules/[id]/route.ts', 'utf8');
const pmAnalytics = fs.readFileSync('src/app/api/pm-analytics/route.ts', 'utf8');
const dashboardStats = fs.readFileSync('src/app/api/dashboard/stats/route.ts', 'utf8');
const generalAnalytics = fs.readFileSync('src/app/api/analytics/route.ts', 'utf8');
const maintenancePage = fs.readFileSync('src/components/modules/MaintenancePages.tsx', 'utf8');
const calendarPage = fs.readFileSync('src/components/modules/PmCalendarPage.tsx', 'utf8');

describe('PM due-state consistency contract', () => {
  it('classifies only Meter PM as usage based while legacy custom-hours normalizes to calendar hours', () => {
    expect(isAutoCalculableFrequency('meter')).toBe(false);
    expect(isAutoCalculableFrequency('meter_based')).toBe(false);
    expect(isAutoCalculableFrequency('custom_hours')).toBe(true);
    expect(isAutoCalculableFrequency('time_day')).toBe(true);
    expect(isAutoCalculableFrequency('monthly')).toBe(true);
  });

  it('canonicalizes usage-based schedule dates to null on create and update', () => {
    expect(listRoute).toContain("calendarFrequency?.frequencyType === 'time_day'");
    expect(listRoute).toContain('nextDueDate: canonicalNextDueDate');
    expect(detailRoute).toContain("canonicalFrequencyForUpdate.frequencyType === 'meter'");
    expect(detailRoute).toContain('updateData.nextDueDate = null');
    expect(detailRoute).toContain('lockedProspectiveFrequencyType');
  });

  it('makes the PM schedule dueSoon filter calendar-only and future-only', () => {
    expect(listRoute).toContain("where.frequencyType = { notIn: ['meter', 'meter_based'] };");
    expect(listRoute).toContain('nextDueDate = { gte: now, lte: weekFromNow }');
  });

  it('keeps PM analytics and dashboard date KPIs calendar-only', () => {
    expect(pmAnalytics.match(/frequencyType: \{ notIn: \['meter', 'meter_based'\] \}/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(dashboardStats.match(/frequencyType: \{ notIn: \['meter', 'meter_based'\] \}/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(generalAnalytics).toContain("frequencyType: { notIn: ['meter', 'meter_based'] }");
  });

  it('uses the same timestamp boundary as the dueSoon API on the PM schedules page', () => {
    expect(maintenancePage).toContain('return due >= now && due <= week;');
    expect(maintenancePage).toContain('return new Date(d) < new Date();');
    expect(maintenancePage).not.toContain('now.setHours(0, 0, 0, 0);');
  });

  it('hides calendar date controls and local calendar counts for usage schedules', () => {
    expect(maintenancePage).toContain("const formUsesCalendarCadence = formFreqType === 'time_day'");
    expect(maintenancePage).toContain('{formUsesCalendarCadence && (');
    expect(maintenancePage).toContain('isAutoCalculableFrequency(s.frequencyType) && isDueSoon(s.nextDueDate)');
    expect(maintenancePage).toContain('isAutoCalculableFrequency(s.frequencyType) && isOverdue(s.nextDueDate)');
    expect(calendarPage).toContain('isAutoCalculableFrequency(s.frequencyType)');
    expect(calendarPage).toContain('isAutoCalculableFrequency(schedule.frequencyType)');
  });
});
