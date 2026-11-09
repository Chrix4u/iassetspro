import { describe, expect, it } from 'vitest';
import { projectFixedCalendarRepeats, type PmFixedRecurrenceTask } from '@/lib/pm-fixed-recurrence-scenario';

const now = new Date('2026-11-09T08:00:00.000Z');
const task: PmFixedRecurrenceTask = {
  id: 'pm-1', assetId: 'asset-1', assetName: 'Mercerizer C314', assetCode: 'C314',
  assetCriticality: 'critical', assetStatus: 'operational', plantId: 'plant-1',
  plantName: 'Ghana Plant', componentId: null, componentName: null, componentCode: null,
  taskNumber: 4, description: 'Bearing inspection', activityMode: 'inspection',
  equipmentState: 'running', basis: 'calendar', dueAt: '2026-11-10T10:00:00.000Z',
  recurrenceBasis: 'fixed_schedule', frequencyInterval: 1, frequencyUnit: 'weeks',
  recurrenceAnchorDate: '2026-10-27T10:00:00.000Z',
  nextDueReading: null, meterValue: null, meterUnit: null, meterName: null,
  meterLastReadingAt: null, estimatedMinutes: 45, openWorkOrder: null,
};
const change=(updates: Partial<PmFixedRecurrenceTask>): PmFixedRecurrenceTask => ({...task,...updates});

describe('fixed-calendar PM recurring workload modelling', () => {
  it('excludes the already known next due and counts only future repeats', () => {
    const forecast=projectFixedCalendarRepeats([task],30,now);
    expect(forecast.summary.additionalOccurrences).toBe(4);
    expect(forecast.summary.estimatedMinutes).toBe(4*45);
    expect(forecast.weeks.map(w=>w.additionalOccurrences)).toEqual([0,1,1,1,1]);
    expect(forecast.summary.eligibleFixedCalendarTasks).toBe(1);
  });
  it('does not invent a recurring obligation inside a seven-day horizon with none', () => {
    const forecast=projectFixedCalendarRepeats([task],7,now);
    expect(forecast.summary.additionalOccurrences).toBe(0);
    expect(forecast.weeks).toHaveLength(1);
  });
  it('excludes after-completion cycles, which depend on when the WO closes', () => {
    const forecast=projectFixedCalendarRepeats([
      change({recurrenceBasis:'after_completion'}),
    ],90,now);
    expect(forecast.summary).toMatchObject({
      additionalOccurrences:0, afterCompletionExcluded:1,eligibleFixedCalendarTasks:0,
    });
  });
  it('never models a future meter usage date without actual usage data', () => {
    const forecast=projectFixedCalendarRepeats([
      change({basis:'meter',recurrenceBasis:'fixed_schedule',nextDueReading:3000,meterValue:2960}),
    ],90,now);
    expect(forecast.summary).toMatchObject({meterExcluded:1,additionalOccurrences:0});
  });
  it('does not assume the next cycle of an already overdue unclosed inspection', () => {
    const forecast=projectFixedCalendarRepeats([
      change({dueAt:'2026-11-01T10:00:00Z'}),
    ],90,now);
    expect(forecast.summary).toMatchObject({
      overdueAwaitingCompletion:1,additionalOccurrences:0,
    });
  });
  it('uses the fixed original anchor for month-end clamping', () => {
    const at=new Date('2026-02-27T08:00:00Z');
    const forecast=projectFixedCalendarRepeats([change({
      dueAt:'2026-02-28T10:00:00Z',frequencyUnit:'months',frequencyInterval:1,
      recurrenceAnchorDate:'2026-01-31T10:00:00Z',
    })],90,at);
    expect(forecast.summary.additionalOccurrences).toBe(2); // March 31, April 30
    expect(forecast.summary.estimatedMinutes).toBe(90);
  });
  it('counts yearly repeats only when they fall inside the horizon', () => {
    const forecast=projectFixedCalendarRepeats([change({
      frequencyInterval:1,frequencyUnit:'years',
    })],90,now);
    expect(forecast.summary.additionalOccurrences).toBe(0);
  });
  it('does not turn absent, zero or noninteger recurrence into a calendar scenario', () => {
    const forecast=projectFixedCalendarRepeats([
      change({id:'missing',frequencyUnit:null}),
      change({id:'zero',frequencyInterval:0}),
      change({id:'fraction',frequencyInterval:1.5}),
      change({id:'absent',dueAt:null}),
    ],90,now);
    expect(forecast.summary.missingOrUnsupportedInterval).toBe(4);
    expect(forecast.summary.additionalOccurrences).toBe(0);
  });
  it('makes unknown labour estimates visible rather than silently treating as zero', () => {
    const forecast=projectFixedCalendarRepeats([
      change({estimatedMinutes:null}),
      change({id:'negative',estimatedMinutes:-10}),
    ],30,now);
    expect(forecast.summary.additionalOccurrences).toBe(8);
    expect(forecast.summary.estimatedMinutes).toBe(0);
    expect(forecast.summary.unestimatedOccurrences).toBe(8);
  });
  it('handles minute-scale recurrence through arithmetic buckets, not millions of iterations', () => {
    const forecast=projectFixedCalendarRepeats([change({
      frequencyUnit:'minutes',frequencyInterval:1,
      dueAt:'2026-11-09T09:00:00Z',
    })],7,now);
    expect(forecast.summary.additionalOccurrences).toBeGreaterThan(9000);
    expect(forecast.summary.limited).toBe(false);
  });
  it('never invents repeats if the first due occurs after the selected horizon', () => {
    const forecast=projectFixedCalendarRepeats([change({
      dueAt:'2027-01-01T10:00:00Z',
    })],30,now);
    expect(forecast.summary.additionalOccurrences).toBe(0);
    expect(forecast.summary.eligibleFixedCalendarTasks).toBe(0);
  });
  it('preserves criticality without changing real due dates or linked WOs', () => {
    const input=[change({openWorkOrder:{id:'wo1',woNumber:'WO-1',status:'planned'}})];
    const before=JSON.stringify(input);
    const forecast=projectFixedCalendarRepeats(input,30,now);
    expect(JSON.stringify(input)).toBe(before);
    expect(forecast.weeks.reduce((s,w)=>s+w.highCriticalOccurrences,0)).toBe(4);
  });
});
