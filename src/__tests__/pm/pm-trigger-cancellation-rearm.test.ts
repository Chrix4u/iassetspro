import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildRearmedTriggerConfig } from '@/services/pm/triggerCancellationRearm.service';

const meterEngine = fs.readFileSync('src/services/pm/meterTriggerEngine.ts', 'utf8');
const signalEngine = fs.readFileSync('src/services/pm/conditionProductionTriggerEngine.ts', 'utf8');
const cancelRoute = fs.readFileSync('src/app/api/work-orders/[id]/cancel/route.ts', 'utf8');

describe('PM runtime trigger cancellation re-arm', () => {
  it('restores the exact pre-generation meter baseline', () => {
    const next = buildRearmedTriggerConfig('meter', {
      baselineHours: 13500,
      lastGeneratedWorkOrderId: 'wo-1',
      lastGeneratedPreviousBaselineHours: 12500,
      unit: 'hours',
    }, 'wo-1');
    expect(next).toMatchObject({ baselineHours: 12500, unit: 'hours' });
    expect(next).not.toHaveProperty('lastGeneratedWorkOrderId');
    expect(next).not.toHaveProperty('lastGeneratedPreviousBaselineHours');
  });

  it('restores the exact pre-generation production baseline', () => {
    const next = buildRearmedTriggerConfig('production_count', {
      baselineCount: 15000,
      lastGeneratedWorkOrderId: 'wo-2',
      lastGeneratedPreviousBaselineCount: 10000,
    }, 'wo-2');
    expect(next).toMatchObject({ baselineCount: 10000 });
    expect(next).not.toHaveProperty('lastGeneratedWorkOrderId');
  });

  it('re-arms a cancelled condition event so the same bad reading can be evaluated again', () => {
    const next = buildRearmedTriggerConfig('condition', {
      lastReadingId: 'reading-bad',
      lastConditionMatched: true,
      lastGeneratedWorkOrderId: 'wo-3',
      lastGeneratedPreviousReadingId: 'reading-good',
      lastGeneratedPreviousConditionMatched: false,
    }, 'wo-3');
    expect(next).toMatchObject({
      lastReadingId: 'reading-good',
      lastConditionMatched: false,
    });
  });

  it('refuses to roll back a trigger for a different work order', () => {
    expect(buildRearmedTriggerConfig('meter', {
      baselineHours: 13000,
      lastGeneratedWorkOrderId: 'wo-newer',
      lastGeneratedPreviousBaselineHours: 12500,
    }, 'wo-old')).toBeNull();
  });

  it('persists exact rollback markers at runtime generation and consumes them in canonical cancellation', () => {
    expect(meterEngine).toContain('lastGeneratedWorkOrderId: wo.id');
    expect(meterEngine).toContain('lastGeneratedPreviousBaselineHours: baseline');
    expect(signalEngine).toContain('lastGeneratedPreviousBaselineCount: Number(config.baselineCount)');
    expect(signalEngine).toContain('lastGeneratedPreviousReadingId: config.lastReadingId ?? null');
    expect(cancelRoute).toContain('rearmRuntimePmTriggerAfterCancellation(tx');
    expect(cancelRoute).toContain('pmTriggerRearmed: outcome.pmTriggerRearm.rearmed');
  });
});
