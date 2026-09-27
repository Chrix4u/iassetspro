import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { evaluateMeterThreshold } from '@/services/pm/meterTriggerEngine';

describe('meter PM trigger engine', () => {
  it('does not trigger before the interval is reached', () => {
    expect(evaluateMeterThreshold(12999, 12500, 500)).toMatchObject({ due: false, crossedThreshold: null });
  });

  it('triggers exactly at threshold', () => {
    expect(evaluateMeterThreshold(13000, 12500, 500)).toMatchObject({ due: true, crossedThreshold: 13000 });
  });

  it('advances to the latest crossed threshold when readings jump', () => {
    expect(evaluateMeterThreshold(13620, 12500, 500)).toMatchObject({ due: true, crossedThreshold: 13500 });
  });

  it('has a protected evaluator route and restores RP-01 meter semantics', () => {
    const route = fs.readFileSync('src/app/api/pm-triggers/evaluate/route.ts', 'utf8');
    const scheduleRoute = fs.readFileSync('src/app/api/pm-schedules/route.ts', 'utf8');
    const checkDue = fs.readFileSync('src/app/api/pm-schedules/check-due/route.ts', 'utf8');
    const checkDueCron = fs.readFileSync('src/app/api/pm-schedules/check-due-cron/route.ts', 'utf8');
    const migration = fs.readFileSync('prisma/migrations/20260927223000_restore_rp01_meter_pm/migration.sql', 'utf8');
    expect(route).toContain('x-pm-cron-secret');
    expect(route).toContain('evaluateMeterPmTriggers');
    expect(migration).toContain('"frequencyType"=\'meter_based\'');
    expect(migration).toContain('"triggerType"=\'meter\'');
  });
});