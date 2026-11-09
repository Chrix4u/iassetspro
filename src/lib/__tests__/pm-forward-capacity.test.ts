import { describe, expect, it } from 'vitest';
import { buildPmForwardPlan, pmCapacityForWeek, type PmForwardTask } from '@/lib/pm-forward-capacity';

const now = new Date('2026-11-09T12:00:00.000Z');
const core: PmForwardTask = {
  id: 'pm-1', assetId: 'asset-1', assetName: 'Mercerizer C314', assetCode: 'C314',
  assetCriticality: 'critical', assetStatus: 'operational', plantId: 'plant-1', plantName: 'Plant A',
  componentId: 'bearing-1', componentName: 'Drive-end bearing', componentCode: 'C314-21-02',
  taskNumber: 8, description: 'Check vibration', activityMode: 'inspection', equipmentState: 'running',
  basis: 'calendar', dueAt: '2026-11-08T10:00:00.000Z',
  nextDueReading: null, meterValue: null, meterUnit: null, meterName: null,
  meterLastReadingAt: null, estimatedMinutes: 120, openWorkOrder: null,
};
const withChanges = (id: string, changes: Partial<PmForwardTask>): PmForwardTask => ({
  ...core, id, ...changes,
});
describe('enterprise PM forward capacity planning', () => {
  it('counts overdue critical maintenance once in the immediate backlog', () => {
    const plan = buildPmForwardPlan([core], 30, now);
    expect(plan.summary).toMatchObject({
      totalAssignments: 1, dueTasks: 1, overdueCalendar: 1, highOrCriticalDue: 1,
      knownMinutes: 120, awaitingWorkOrder: 1,
    });
    expect(plan.weeks[0]).toMatchObject({ taskCount: 1, knownMinutes: 120, criticalTasks: 1 });
    expect(plan.rows[0]).toMatchObject({ status: 'overdue', weekIndex: 0 });
  });
  it('places future calendar tasks into the correct seven-day buckets without duplicating cycles', () => {
    const tasks = [
      withChanges('today', { dueAt: '2026-11-09T13:00:00Z' }),
      withChanges('week2', { dueAt: '2026-11-18T09:00:00Z' }),
      withChanges('after30', { dueAt: '2026-12-15T09:00:00Z' }),
    ];
    const plan = buildPmForwardPlan(tasks, 30, now);
    expect(plan.weeks[0].taskCount).toBe(1);
    expect(plan.weeks[1].taskCount).toBe(1);
    expect(plan.summary.dueTasks).toBe(2);
    expect(plan.rows.find(t => t.id === 'after30')?.status).toBe('later');
    expect(plan.weeks.reduce((sum, bucket) => sum + bucket.taskCount, 0)).toBe(2);
  });
  it('uses actual meter readings only; does not predict a future date from run hours', () => {
    const tasks = [
      withChanges('due', { basis: 'meter', dueAt: null, nextDueReading: 3000, meterValue: 3002 }),
      withChanges('future', { basis: 'meter', dueAt: null, nextDueReading: 3000, meterValue: 2900 }),
      withChanges('no-reading', { basis: 'meter', dueAt: null, nextDueReading: 3000, meterValue: null }),
      withChanges('no-threshold', { basis: 'meter', dueAt: null, nextDueReading: null, meterValue: 5000 }),
    ];
    const plan = buildPmForwardPlan(tasks, 90, now);
    expect(plan.summary).toMatchObject({ dueTasks: 1, meterDueNow: 1, meterWithoutLiveValue: 2 });
    expect(plan.rows.find(x=>x.id==='future')?.status).toBe('later');
    expect(plan.rows.find(x=>x.id==='no-reading')?.status).toBe('needs_meter');
  });
  it('does not treat absent, zero or negative estimates as zero-effort jobs', () => {
    const tasks = [
      withChanges('missing', { estimatedMinutes: null }),
      withChanges('zero', { estimatedMinutes: 0 }),
      withChanges('negative', { estimatedMinutes: -60 }),
      withChanges('known', { estimatedMinutes: 180 }),
    ];
    const plan = buildPmForwardPlan(tasks, 7, now);
    expect(plan.summary).toMatchObject({ unestimatedDueTasks: 3, knownMinutes: 180, dueTasks: 4 });
    expect(plan.weeks[0].unknownEffortTasks).toBe(3);
  });
  it('separates tasks already in open work orders instead of double counting workload', () => {
    const plan = buildPmForwardPlan([
      withChanges('committed', { openWorkOrder: {id:'wo-1',woNumber:'WO-1',status:'planned'} }),
      withChanges('not-committed', { openWorkOrder: null }),
    ], 7, now);
    expect(plan.summary).toMatchObject({ dueTasks: 2, linkedOpenWorkOrders: 1, awaitingWorkOrder: 1 });
    expect(plan.summary.knownMinutes).toBe(240);
    expect(plan.weeks[0].committedTasks).toBe(1);
  });
  it('flags unsupported legacy frequency and calendar assignments lacking a due date', () => {
    const plan = buildPmForwardPlan([
      withChanges('old', { basis: 'legacy_review' }),
      withChanges('no-date', { dueAt: null }),
    ], 30, now);
    expect(plan.summary).toMatchObject({ legacyFrequencyForReview: 1, calendarWithoutDate: 1, dueTasks: 0 });
    expect(plan.rows.map(x=>x.status)).toContain('legacy_review');
    expect(plan.rows.map(x=>x.status)).toContain('needs_calendar_date');
  });
  it('sorts risks by urgency and criticality, not database entry order', () => {
    const plan = buildPmForwardPlan([
      withChanges('medium', {assetCriticality:'medium'}),
      withChanges('later', {dueAt:'2027-01-01T00:00:00Z'}),
      withChanges('critical', {assetCriticality:'critical'}),
    ], 30, now);
    expect(plan.rows.slice(0,2).map(x=>x.id)).toEqual(['critical','medium']);
    expect(plan.rows[2].id).toBe('later');
  });
  it('calculates five-day crews as a scenario only, with 80% productive hours', () => {
    const week = { from:'2026-11-09', through:'2026-11-15', knownMinutes: 2400 };
    expect(pmCapacityForWeek(week, { crews: 2, hoursPerShift: 8, workingDaysPerWeek: 5, productivePercent: 80 }))
      .toMatchObject({ availableHours: 64, demandHours: 40, loadPercent: 63, overCapacity: false });
  });
  it('flags overloaded weekly scenarios and refuses to claim utilization with zero capacity', () => {
    const week = { from:'2026-11-09', through:'2026-11-15', knownMinutes: 6000 };
    expect(pmCapacityForWeek(week,{ crews:1,hoursPerShift:8,workingDaysPerWeek:5,productivePercent:80 }))
      .toMatchObject({ availableHours:32, demandHours:100, overCapacity:true });
    expect(pmCapacityForWeek(week,{ crews:0,hoursPerShift:8,workingDaysPerWeek:5,productivePercent:80 }))
      .toMatchObject({ availableHours:0, loadPercent:null, overCapacity:true });
  });
  it('does not count non-calendar legacy tasks as a third selectable schedule mode', () => {
    const plan = buildPmForwardPlan([withChanges('legacy',{basis:'legacy_review'})],90,now);
    expect(plan.summary.legacyFrequencyForReview).toBe(1);
    expect(plan.summary.dueTasks).toBe(0);
    expect(plan.weeks.every(x=>x.knownMinutes===0)).toBe(true);
  });
});
