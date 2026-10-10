import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const meter = fs.readFileSync('src/services/pm/meterTriggerEngine.ts', 'utf8');
const signal = fs.readFileSync('src/services/pm/conditionProductionTriggerEngine.ts', 'utf8');
const due = fs.readFileSync('src/app/api/pm-schedules/check-due/route.ts', 'utf8');
const triggerRoute = fs.readFileSync('src/app/api/pm-triggers/[id]/route.ts', 'utf8');
const scheduleRoute = fs.readFileSync('src/app/api/pm-schedules/[id]/route.ts', 'utf8');
const config = fs.readFileSync('src/services/pm/triggerConfig.service.ts', 'utf8');

describe('PM schedule/generation shared lifecycle lock contract', () => {
  it('serializes every generator on the owning PM schedule before cycle-specific locks', () => {
    expect(meter).toContain('select: { id: true, scheduleId: true }');
    expect(meter).toContain('await lockPmScheduleLifecycle(tx, candidate.scheduleId)');
    expect(meter.indexOf('lockPmScheduleLifecycle(tx, candidate.scheduleId)')).toBeLessThan(meter.indexOf('iassetspro:pm-meter:${candidate.id}'));

    expect(signal).toContain('select: { id: true, scheduleId: true }');
    expect(signal).toContain('await lockPmScheduleLifecycle(tx, candidate.scheduleId)');
    expect(signal.indexOf('lockPmScheduleLifecycle(tx, candidate.scheduleId)')).toBeLessThan(signal.indexOf('iassetspro:pm-signal:${candidate.id}'));

    expect(due).toContain('await lockPmScheduleLifecycle(tx, candidate.id)');
    expect(due.indexOf('lockPmScheduleLifecycle(tx, candidate.id)')).toBeLessThan(due.indexOf('iassetspro:pm-due:${candidate.id}'));
  });

  it('supports transaction-scoped open-work lookups after acquiring the schedule lock', () => {
    expect(config).toContain('client: WorkOrderLookupClient = db');
    expect(config).toContain('client.workOrder.findUnique');

    expect(triggerRoute).toContain('await lockPmScheduleLifecycle(tx, existing.scheduleId)');
    expect(triggerRoute).toContain('findOpenRuntimeGeneratedWorkOrder(currentConfig, existing.scheduleId, tx)');

    expect(scheduleRoute).toContain('await lockPmScheduleLifecycle(tx, id)');
    expect(scheduleRoute).toContain('findOpenRuntimeGeneratedWorkOrder(existingTriggerConfig, existing.id, tx)');
  });
});
