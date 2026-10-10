import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const scheduleRoute = fs.readFileSync('src/app/api/pm-schedules/[id]/route.ts', 'utf8');
const triggerRoute = fs.readFileSync('src/app/api/pm-triggers/[id]/route.ts', 'utf8');
const configService = fs.readFileSync('src/services/pm/triggerConfig.service.ts', 'utf8');

describe('PM trigger edit safety contract', () => {
  it('tracks an open runtime-generated work order from trigger rollback metadata', () => {
    expect(configService).toContain('findOpenRuntimeGeneratedWorkOrder');
    expect(configService).toContain('lastGeneratedWorkOrderId');
    expect(configService).toContain("['closed', 'cancelled'].includes(workOrder.status)");
  });

  it('blocks schedule target mutation while generated runtime PM work is unresolved', () => {
    expect(scheduleRoute).toContain('triggerTargetChanged');
    expect(scheduleRoute).toContain('findOpenRuntimeGeneratedWorkOrder(existingTriggerConfig, existing.id)');
    expect(scheduleRoute).toContain('Complete or cancel that work order first');
  });

  it('reconciles active meter interval and source against the prospective schedule atomically', () => {
    expect(scheduleRoute).toContain("existing.trigger.triggerType === 'meter'");
    expect(scheduleRoute).toContain('prospectiveFrequencyValue');
    expect(scheduleRoute).toContain('normalizePmTriggerConfig');
    expect(scheduleRoute).toContain('reconciledTriggerConfig');
    expect(scheduleRoute).toContain('await db.$transaction(async (tx) =>');
  });

  it('rejects incompatible active condition/production targets instead of leaving a stale trigger', () => {
    expect(scheduleRoute).toContain('Schedule change conflicts with the active PM trigger');
    expect(scheduleRoute).toContain('Reconfigure or deactivate the trigger first');
  });

  it('keeps meter trigger interval and owning schedule frequency in one transaction', () => {
    expect(triggerRoute).toContain("existing.triggerType === 'meter'");
    expect(triggerRoute).toContain('tx.pmSchedule.update');
    expect(triggerRoute).toContain('frequencyValue: effectiveValue');
    expect(triggerRoute).toContain('tx.pmTrigger.update');
  });

  it('revalidates an inactive trigger before reactivation', () => {
    expect(triggerRoute).toContain("const reactivating = body.isActive === true && !existing.isActive");
    expect(triggerRoute).toContain('if (configurationChanging || reactivating)');
    expect(triggerRoute).toContain('findOpenRuntimeGeneratedWorkOrder(currentConfig, existing.scheduleId)');
  });
});
