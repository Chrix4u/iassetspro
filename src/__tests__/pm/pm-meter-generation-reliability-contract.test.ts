import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const engine = fs.readFileSync('src/services/pm/meterTriggerEngine.ts', 'utf8');
const route = fs.readFileSync('src/app/api/pm-triggers/evaluate/route.ts', 'utf8');

describe('PM meter generation reliability contract', () => {
  it('serializes each meter baseline decision before threshold evaluation and creation', () => {
    expect(engine).toContain("`iassetspro:pm-meter:${candidate.id}`");
    expect(engine).toContain("SELECT pg_advisory_xact_lock(hashtext($1))");
    expect(engine).toContain('await tx.pmTrigger.findUnique');
    expect(engine).toContain('const threshold = evaluateMeterThreshold(current, baseline, interval)');
  });

  it('shares monthly work-order number serialization with time-based PM', () => {
    expect(engine).toContain('`iassetspro:pm-wo-number:${prefix}`');
    expect(engine).toContain('await tx.workOrder.findMany');
    expect(engine).toContain('highestNumber + 1');
  });

  it('commits work order, component linkage, baseline advancement and audit atomically', () => {
    expect(engine).toContain('const result = await db.$transaction(async (tx) =>');
    expect(engine).toContain('await tx.workOrder.create');
    expect(engine).toContain('await tx.workOrderComponent.upsert');
    expect(engine).toContain('baselineHours: threshold.crossedThreshold');
    expect(engine).toContain('await tx.pmTrigger.update');
    expect(engine).toContain('await tx.workOrderComment.create');
    expect(engine).toContain('await tx.auditLog.create');
    expect(engine).not.toContain('async function generateWoNumber');
  });

  it('notifies the assignee only after generation commits and treats delivery as non-fatal', () => {
    expect(engine).toContain('await notifyUser(');
    expect(engine).toContain("console.error('[PM Meter Notification Error]'");
    expect(engine).toContain('Generation is already committed');
  });

  it('rechecks manual plant scope after acquiring the trigger lock', () => {
    expect(engine).toContain("options.plantIds && !options.plantIds.includes(schedule.asset.plantId || '')");
    expect(engine).toContain("reason: 'Schedule moved outside caller plant scope'");
  });

  it('attributes trusted cron to the automation actor and manual execution to the initiator', () => {
    expect(route).toContain('resolvePmAutomationActorId(');
    expect(route).toContain('cronAuthorized ? undefined : session?.userId');
    expect(route).toContain('evaluateMeterPmTriggers({ plantIds, actorId })');
    expect(engine).toContain('userId: options.actorId');
  });
});
