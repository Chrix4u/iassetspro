import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const route = readFileSync(resolve(process.cwd(), 'src/app/api/pm-schedules/check-due/route.ts'), 'utf8');

describe('PM check-due direct assignment automation contract', () => {
  it('runs schedule-less direct PM generation with the same automation actor and plant scope', () => {
    expect(route).toContain("import { generateDueDirectPmAssignmentWorkOrders } from '@/services/pm/pmBundling.service'");
    expect(route).toContain('const directAssignmentGeneration = await generateDueDirectPmAssignmentWorkOrders(db as never, {');
    expect(route).toContain('actorId: automationActorId');
    expect(route).toContain('plantIds: manualTaskLevelPlantIds(plantScope)');
  });

  it('includes direct PM counts and engine detail in the canonical response', () => {
    expect(route).toContain('legacyScheduleGeneration.checked + scheduledTaskGeneration.checked + directAssignmentGeneration.checked');
    expect(route).toContain('legacyScheduleGeneration.generated + scheduledTaskGeneration.generated + directAssignmentGeneration.generated');
    expect(route).toContain('legacyScheduleGeneration.skipped + scheduledTaskGeneration.skipped + directAssignmentGeneration.skipped');
    expect(route).toContain('directAssignments: directAssignmentGeneration');
  });
});
