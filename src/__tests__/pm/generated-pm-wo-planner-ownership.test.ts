import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8');

describe('auto-generated PM work order accountable planner ownership', () => {
  it('time-based due generation inherits the PM schedule creator as planner', () => {
    const source = read('src/app/api/pm-schedules/check-due/route.ts');
    expect(source).toContain('plannerId: schedule.createdById');
  });

  it('meter-trigger generation inherits the PM schedule creator as planner', () => {
    const source = read('src/services/pm/meterTriggerEngine.ts');
    expect(source).toContain('plannerId: schedule.createdById');
  });

  it('condition/production-trigger generation inherits the PM schedule creator as planner', () => {
    const source = read('src/services/pm/conditionProductionTriggerEngine.ts');
    expect(source).toContain('plannerId: schedule.createdById');
  });
});
