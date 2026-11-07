import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8');

describe('auto-generated PM work order accountable planner ownership', () => {
  const cases = [
    { label: 'time-based due generation', file: 'src/app/api/pm-schedules/check-due/route.ts' },
    { label: 'meter-trigger generation', file: 'src/services/pm/meterTriggerEngine.ts' },
    { label: 'legacy condition/production-trigger generation', file: 'src/services/pm/conditionProductionTriggerEngine.ts' },
  ];

  for (const { label, file } of cases) {
    it(`${label} resolves a current plant-qualified planner instead of trusting schedule authorship`, () => {
      const source = read(file);
      expect(source).toContain("import { resolvePmGeneratedWorkOrderPlanner } from '@/services/pm/resolvePmGeneratedWorkOrderPlanner.service'");
      expect(source).toContain('const plannerId = await resolvePmGeneratedWorkOrderPlanner(tx, schedule.asset.plantId, schedule.createdById)');
      expect(source).toContain('plannerId,');
      expect(source).not.toContain('plannerId: schedule.createdById,');
    });
  }
});
