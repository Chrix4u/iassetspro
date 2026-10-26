import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const route = readFileSync(resolve(process.cwd(), 'src/app/api/pm-schedules/check-due/route.ts'), 'utf8');

describe('PM task-level generation API integration contract', () => {
  it('delegates task-level generation to the dedicated engine using the canonical automation actor', () => {
    expect(route).toContain("import { generateDueScheduledTaskWorkOrders } from '@/services/pm/pmScheduledTaskGeneration.service'");
    expect(route).toContain('const scheduledTaskGeneration = await generateDueScheduledTaskWorkOrders({');
    expect(route).toContain('actorId: automationActorId');
    expect(route).toContain('plantIds: manualTaskLevelPlantIds(plantScope)');
  });

  it('keeps task-authority schedules out of the legacy header-cadence generator even when legacy shadows exist', () => {
    expect(route).toContain("recurrenceAuthority: 'legacy_header'");
    expect(route).not.toContain('tasks: { none: {} }');
    expect(route).toContain('autoGenerateWO: true');
    expect(route).toContain('nextDueDate: { not: null }');
  });

  it('maps manual task-level discovery to the same plant boundary as legacy generation', () => {
    expect(route).toContain('function manualTaskLevelPlantIds');
    expect(route).toContain('if (!plantScope || plantScope.isSystemWide) return undefined');
    expect(route).toContain('if (plantScope.isScoped && plantScope.plantId) return [plantScope.plantId]');
    expect(route).toContain('plantScope.accessiblePlantIds');
  });

  it('preserves the legacy response shape while exposing and counting both engines', () => {
    expect(route).toContain('const legacyScheduleGeneration = {');
    expect(route).toContain('checked: dueSchedules.length');
    expect(route).toContain('checked: legacyScheduleGeneration.checked + scheduledTaskGeneration.checked');
    expect(route).toContain('generated: legacyScheduleGeneration.generated + scheduledTaskGeneration.generated');
    expect(route).toContain('results: [...legacyScheduleGeneration.results, ...scheduledTaskGeneration.results]');
    expect(route).toContain('legacySchedule: legacyScheduleGeneration');
    expect(route).toContain('scheduledTasks: scheduledTaskGeneration');
  });
});
