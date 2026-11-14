import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { calculateProductionPmProgress } from '@/lib/production-pm-progress';

const file = (path: string) => readFileSync(path, 'utf8');
const api = file('src/app/api/production-surveys/pm-progress/route.ts');
const page = file('src/components/modules/ProductionSurveyPage.tsx');
const legacyEngine = file('src/services/pm/meterTriggerEngine.ts');
const taskEngine = file('src/services/pm/pmScheduledTaskDueEngine.ts');

describe('production output to meter PM progress', () => {
  it('never invents output or a due state for a machine with no approved reading', () => {
    expect(calculateProductionPmProgress({ current: null, nextDue: 5000, interval: 5000 })).toEqual({
      state: 'awaiting_reading', currentValue: null, nextDueReading: 5000,
      remaining: null, progressPercent: null,
    });
  });
  it('shows remaining quantities before the 5000-tonne PM threshold', () => {
    expect(calculateProductionPmProgress({ current: 1200, nextDue: 5000, interval: 5000 })).toMatchObject({
      state: 'upcoming', remaining: 3800, progressPercent: 24,
    });
    expect(calculateProductionPmProgress({ current: 4800, nextDue: 5000, interval: 5000 })).toMatchObject({
      state: 'approaching', remaining: 200, progressPercent: 96,
    });
  });
  it('shows threshold reached at exactly 5000 and when a later shift crosses it', () => {
    for (const current of [5000, 5800]) {
      expect(calculateProductionPmProgress({ current, nextDue: 5000, interval: 5000 })).toMatchObject({
        state: 'due', remaining: 0, progressPercent: 100,
      });
    }
  });
  it('shows the next recurrence threshold separately from the prior completed cycle', () => {
    expect(calculateProductionPmProgress({ current: 5400, nextDue: 10000, interval: 5000 })).toMatchObject({
      state: 'upcoming', remaining: 4600, progressPercent: 8,
    });
  });
  it('handles a valid zero baseline and missing interval without dividing by zero', () => {
    expect(calculateProductionPmProgress({ current: 0, nextDue: 5000, interval: 5000 })).toMatchObject({
      state: 'upcoming', remaining: 5000, progressPercent: 0,
    });
    expect(calculateProductionPmProgress({ current: 7, nextDue: 10, interval: null })).toMatchObject({
      state: 'upcoming', remaining: 3, progressPercent: null,
    });
  });
  it('rejects invalid or non-finite threshold values', () => {
    for (const nextDue of [Number.NaN, Number.POSITIVE_INFINITY, -1]) {
      expect(() => calculateProductionPmProgress({ current: 0, nextDue, interval: 5000 })).toThrow();
    }
  });
  it('scopes PM threshold data to an authorized asset and excludes non-production meters', () => {
    expect(api).toContain("hasPermission(session, 'production_surveys.view')");
    expect(api).toContain('canAccessPlantStrict(scope, asset.plantId)');
    expect(api).toContain('allowedProductionMeter(meter.meterType)');
    expect(api).toContain('db.assetMeter.findMany');
    expect(api).toContain('db.pmScheduleTask.findMany');
    expect(api).toContain('db.pmSchedule.findMany');
    expect(api).not.toMatch(/\b(?:db|tx)\.[A-Za-z]+\.(?:create|update|delete|upsert)\(/);
  });
  it('reuses exactly the source values that the two PM engines evaluate', () => {
    expect(taskEngine).toContain('meter?.currentValue');
    expect(taskEngine).toContain('nextDueReading');
    expect(legacyEngine).toContain('tx.meterReading.findFirst');
    expect(legacyEngine).toContain('baselineValue');
    expect(api).toContain('task.assetMeterId ? Number(meter.currentValue) : reading ? Number(reading.value) : null');
    expect(api).toContain('const current = latest ? Number(latest.value) : null');
    expect(api).toContain('Number(baseline) + interval');
  });
  it('renders PM thresholds without claiming that a work order has been generated', () => {
    expect(page).toContain('data-testid="production-pm-progress"');
    expect(page).toContain('data-testid="production-pm-threshold"');
    expect(page).toContain('remaining before this PM threshold');
    expect(page).toContain('A due meter reading does not prove that a PM work order');
    expect(page).toContain('await loadPmProgress();');
    expect(page).toContain("pmProgress.thresholds.map(item=>");
  });
});
