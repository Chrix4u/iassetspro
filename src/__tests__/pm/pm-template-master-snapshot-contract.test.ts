import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const templateDetail = fs.readFileSync('src/app/api/pm-templates/[id]/route.ts', 'utf8');
const scheduleDetail = fs.readFileSync('src/app/api/pm-schedules/[id]/route.ts', 'utf8');
const due = fs.readFileSync('src/app/api/pm-schedules/check-due/route.ts', 'utf8');
const meter = fs.readFileSync('src/services/pm/meterTriggerEngine.ts', 'utf8');
const signals = fs.readFileSync('src/services/pm/conditionProductionTriggerEngine.ts', 'utf8');
const materializer = fs.readFileSync('src/services/pm/materializePmTemplateTasks.service.ts', 'utf8');

const taskSources = [templateDetail, scheduleDetail, due, meter, signals];
const generatorSources = [due, meter, signals];

describe('PM template master snapshot contract', () => {
  it('loads Task Master data on every future-facing template task query using sequence-first ordering', () => {
    for (const source of taskSources) {
      expect(source).toContain('pmTask');
      expect(source).toContain("sortOrder: 'asc'");
      expect(source).toContain("taskNumber: 'asc'");
      expect(source).toContain("id: 'asc'");
    }
  });

  it('resolves master-linked tasks before exposing template/schedule reads or generating future work orders', () => {
    expect(templateDetail).toContain('resolvePmTemplateTasks');
    expect(scheduleDetail).toContain('resolvePmTemplateTasks');
    for (const source of generatorSources) expect(source).toContain('resolvePmTemplateTasks');
  });

  it('materializes resolved descriptions as immutable WO execution snapshots using sequence rather than master number', () => {
    expect(materializer).toContain('ResolvedPmTemplateTask');
    expect(materializer).toContain('taskNumber: task.sequence');
    expect(materializer).toContain('description: task.description');
    expect(materializer).toContain('taskType: task.compatibilityActionType');
    expect(materializer).not.toContain('pmTask.update');
    expect(materializer).not.toContain('pmTemplateTask.update');
  });

  it('uses stable Task Master identity in generator comments with a legacy fallback', () => {
    for (const source of generatorSources) {
      expect(source).toContain('formatResolvedPmTemplateTaskComment');
    }
  });
});
