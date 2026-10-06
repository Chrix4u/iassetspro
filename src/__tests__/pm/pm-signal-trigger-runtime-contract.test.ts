import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const engine = fs.readFileSync('src/services/pm/conditionProductionTriggerEngine.ts', 'utf8');
const config = fs.readFileSync('src/services/pm/triggerConfig.service.ts', 'utf8');
const sources = fs.readFileSync('src/app/api/pm-triggers/sources/route.ts', 'utf8');
const evaluate = fs.readFileSync('src/app/api/pm-triggers/evaluate/route.ts', 'utf8');
const meter = fs.readFileSync('src/services/pm/meterTriggerEngine.ts', 'utf8');

describe('PM condition and production trigger runtime contract', () => {
  it('discovers sources only after resolving the PM schedule plant boundary', () => {
    expect(sources).toContain('const plantScope = await getPlantScope(request, session)');
    expect(sources).toContain('canAccessPlantStrict(plantScope, schedule.asset.plantId)');
    expect(sources).toContain('componentConditionReading.findMany');
    expect(sources).toContain('iotDevice.findMany');
    expect(sources).toContain('componentRuntimeCounter.findMany');
    expect(sources).toContain('productionOrder.groupBy');
  });

  it('normalizes condition sources to the exact component or schedule asset', () => {
    expect(config).toContain("sourceType === 'component_condition'");
    expect(config).toContain('componentId: schedule.componentId');
    expect(config).toContain('const deviceId = text(input.deviceId)');
    expect(config).toContain('device.assetId !== schedule.assetId');
    expect(config).toContain('device.plantId !== schedule.asset.plantId');
  });

  it('starts production maintenance from the current source baseline', () => {
    expect(config).toContain('baselineCount: sameSource && Number.isFinite(existingBaseline)');
    expect(config).toContain(': Number(counter.value || 0)');
    expect(config).toContain('productionOrder.aggregate');
    expect(config).toContain('const total = Number(aggregate._sum.completedQty || 0);');
    expect(config).toContain(': total');
  });

  it('keeps source selection bound to the exact PM target', () => {
    expect(sources).toContain('if (schedule.componentId)');
    expect(config).toContain("return { error: 'Component-targeted PM must use a condition reading from that component' }");
    expect(config).toContain("return { error: 'Component-targeted PM must use a production counter from that component' }");
    expect(config).toContain('Selected work center has no production history in the PM schedule plant');
  });

  it('preserves accumulated runtime state when an edit keeps the same source and rule', () => {
    expect(config).toContain('options.existingConfig || {}');
    expect(config).toContain('baselineHours: sameSource && Number.isFinite(existingBaseline)');
    expect(config).toContain('baselineCount: sameSource && Number.isFinite(existingBaseline)');
    expect(config).toContain('lastReadingId: sameSource ? (existing.lastReadingId ?? null) : null');
    expect(config).toContain('lastConditionMatched: sameSource ? existing.lastConditionMatched === true : false');
  });

  it('rejects a second competing time-trigger clock', () => {
    expect(config).toContain('Time-based PM is controlled by the PM schedule cadence');
  });

  it('serializes each signal trigger and shares the global PM work-order number lock', () => {
    expect(engine).toContain('`iassetspro:pm-signal:${candidate.id}`');
    expect(engine).toContain('SELECT pg_advisory_xact_lock(hashtext($1))');
    expect(engine).toContain('`iassetspro:pm-wo-number:${prefix}`');
  });

  it('makes condition maintenance edge-triggered instead of repeating while an alarm persists', () => {
    expect(engine).toContain('lastConditionMatched: matched');
    expect(engine).toContain("reason: 'Condition remains matched; waiting for recovery before another event'");
    expect(engine).toContain("reason: 'Condition reading already evaluated'");
  });

  it('advances production baseline only in the successful generation transaction', () => {
    expect(engine).toContain('baselineCount: threshold.crossedThreshold');
    expect(engine).toContain('const existingOpen = await tx.workOrder.findFirst');
    expect(engine).toContain('await tx.pmTrigger.update');
    expect(engine).toContain('await tx.auditLog.create');
  });

  it('preserves exact component linkage and template evidence on generated work orders', () => {
    expect(engine).toContain('await tx.workOrderComponent.upsert');
    expect(engine).toContain('componentRegistryId: component.id');
    expect(engine).toContain('await tx.workOrderComment.create');
    expect(engine).toContain('suggestedParts: JSON.stringify(suggestedParts)');
    expect(engine).toContain('suggestedTools: JSON.stringify(suggestedTools)');
  });

  it('delegates the central evaluator to meter and signal engines', () => {
    expect(evaluate).toContain('evaluateMeterPmTriggers({ plantIds, actorId })');
    expect(evaluate).toContain('evaluateConditionProductionPmTriggers({ plantIds, actorId })');
    expect(evaluate).toContain('generated: meter.generated + signals.generated');
  });

  it('initializes legacy meter baselines instead of replaying historical operating hours', () => {
    expect(meter).toContain("reason: 'Meter baseline initialized'");
    expect(meter).toContain('baselineHours: current');
  });
});
