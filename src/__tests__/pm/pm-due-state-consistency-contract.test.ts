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
const mobileAi = fs.readFileSync('src/services/mobile/mobileAI.service.ts', 'utf8');

describe('PM due-state consistency contract', () => {
  it('classifies meter/custom-hour PM as usage based rather than calendar based', () => {
    expect(isAutoCalculableFrequency('meter_based')).toBe(false);
    expect(isAutoCalculableFrequency('custom_hours')).toBe(false);
    expect(isAutoCalculableFrequency('monthly')).toBe(true);
  });

  it('canonicalizes usage-based schedule dates to null on create and update', () => {
    expect(listRoute).toContain('isAutoCalculableFrequency');
    expect(listRoute).toContain('const canonicalNextDueDate = isAutoCalculableFrequency(frequencyType)');
    expect(listRoute).toContain('nextDueDate: canonicalNextDueDate');
    expect(detailRoute).toContain('isAutoCalculableFrequency');
    expect(detailRoute).toContain('updateData.nextDueDate = null');
  });

  it('makes the PM schedule dueSoon filter calendar-only and future-only', () => {
    expect(listRoute).toContain("where.frequencyType = { notIn: ['meter_based', 'custom_hours'] };");
    expect(listRoute).toContain('nextDueDate = { gte: now, lte: weekFromNow }');
  });

  it('keeps PM analytics and dashboard date KPIs calendar-only', () => {
    expect(pmAnalytics.match(/frequencyType: \{ notIn: \['meter_based', 'custom_hours'\] \}/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(dashboardStats.match(/frequencyType: \{ notIn: \['meter_based', 'custom_hours'\] \}/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(generalAnalytics).toContain("frequencyType: { notIn: ['meter_based', 'custom_hours'] }");
  });

  it('does not surface usage-based PM as calendar overdue in mobile recommendations', () => {
    expect(mobileAi).toContain("frequencyType: { notIn: ['meter_based', 'custom_hours'] }");
  });

  it('uses the same timestamp boundary as the dueSoon API on the PM schedules page', () => {
    expect(maintenancePage).toContain('return due >= now && due <= week;');
    expect(maintenancePage).toContain('return new Date(d) < new Date();');
    expect(maintenancePage).not.toContain('now.setHours(0, 0, 0, 0);');
  });

  it('hides calendar date controls and local calendar counts for usage schedules', () => {
    expect(maintenancePage).toContain("const formUsesCalendarCadence = isAutoCalculableFrequency(formFreqType)");
    expect(maintenancePage).toContain('{formUsesCalendarCadence && (');
    expect(maintenancePage).toContain('isAutoCalculableFrequency(s.frequencyType) && isDueSoon(s.nextDueDate)');
    expect(maintenancePage).toContain('isAutoCalculableFrequency(s.frequencyType) && isOverdue(s.nextDueDate)');
    expect(calendarPage).toContain('isAutoCalculableFrequency(s.frequencyType)');
    expect(calendarPage).toContain('isAutoCalculableFrequency(schedule.frequencyType)');
  });
});
