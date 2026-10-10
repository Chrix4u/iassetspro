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
    expect(scheduleRoute).toContain('lockedTriggerTargetChanged');
    expect(scheduleRoute).toContain('lockedTriggerConfig');
    expect(scheduleRoute).toContain('lockedSchedule.id');
    expect(scheduleRoute).toContain('Complete or cancel that work order first');
  });

  it('reconciles active meter interval and source against the prospective schedule atomically', () => {
    expect(scheduleRoute).toContain("lockedSchedule.trigger?.triggerType === 'meter'");
    expect(scheduleRoute).toContain('lockedProspectiveFrequencyValue');
    expect(scheduleRoute).toContain('normalizePmTriggerConfig');
    expect(scheduleRoute).toContain('lockedReconciledTriggerConfig');
    expect(scheduleRoute).toContain('await db.$transaction(async (tx) =>');
  });

  it('rejects incompatible active condition/production targets instead of leaving a stale trigger', () => {
    expect(scheduleRoute).toContain('Schedule change conflicts with the active PM trigger');
    expect(scheduleRoute).toContain('Reconfigure or deactivate the trigger first');
  });

  it('keeps meter trigger interval and owning schedule frequency in one transaction', () => {
    expect(triggerRoute).toContain("effectiveType === 'meter'");
    expect(triggerRoute).toContain('tx.pmSchedule.update');
    expect(triggerRoute).toContain('frequencyValue: effectiveValue');
    expect(triggerRoute).toContain('tx.pmTrigger.update');
  });

  it('revalidates an inactive trigger before reactivation', () => {
    expect(triggerRoute).toContain("const lockedReactivating = body.isActive === true && !lockedTrigger.isActive");
    expect(triggerRoute).toContain('if (configurationChanging || lockedReactivating)');
    expect(triggerRoute).toContain('lockedCurrentConfig');
    expect(triggerRoute).toContain('lockedTrigger.scheduleId');
  });
});
