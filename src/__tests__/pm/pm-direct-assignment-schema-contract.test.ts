import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const schema = readFileSync(resolve(process.cwd(), 'prisma/schema.prisma'), 'utf8');
const migrationPath = resolve(process.cwd(), 'prisma/migrations/20261027201500_pm_direct_assignment_foundation/migration.sql');

function modelSource(name: string): string {
  const start = schema.indexOf(`model ${name} {`);
  expect(start, `model ${name} must exist`).toBeGreaterThanOrEqual(0);
  const nextModel = schema.indexOf('\nmodel ', start + 1);
  return schema.slice(start, nextModel === -1 ? undefined : nextModel);
}

describe('direct PM assignment schema foundation', () => {
  it('makes PmScheduleTask directly target the machine and maintainable node while retaining nullable legacy schedule provenance', () => {
    const task = modelSource('PmScheduleTask');
    expect(task).toMatch(/\bscheduleId\s+String\?/);
    expect(task).toMatch(/\bassetId\s+String\b/);
    expect(task).toMatch(/\bcomponentId\s+String\?/);
    expect(task).toMatch(/\bpmType\s+String\b/);
    expect(task).toMatch(/\bactivityMode\s+String\b/);
    expect(task).toMatch(/\bbasis\s+String\?/);
    expect(task).toMatch(/\bassetMeterId\s+String\?/);
    expect(task).toMatch(/\basset\s+Asset\s+@relation\("PmAssignmentAsset"/);
    expect(task).toMatch(/\bcomponent\s+ComponentRegistry\?/);
    expect(task).toContain('@@index([assetId, isActive])');
    expect(task).toContain('@@index([componentId, isActive])');
  });

  it('adds direct assignment reverse relations without replacing either hierarchy tree', () => {
    expect(modelSource('Asset')).toMatch(/\bpmAssignments\s+PmScheduleTask\[\]\s+@relation\("PmAssignmentAsset"\)/);
    expect(modelSource('ComponentRegistry')).toMatch(/\bpmAssignments\s+PmScheduleTask\[\]/);
    expect(modelSource('FunctionalLocation')).toContain('AssetFunctionalLocationAssignment[]');
    expect(modelSource('ComponentRegistry')).toContain('@relation("ComponentHierarchy"');
  });

  it('ships an additive migration with no destructive PM schedule removal', () => {
    expect(existsSync(migrationPath)).toBe(true);
    const migration = readFileSync(migrationPath, 'utf8');
    expect(migration).toContain('ALTER TABLE "pm_schedule_tasks"');
    expect(migration).toContain('ADD COLUMN "assetId"');
    expect(migration).toContain('ADD COLUMN "componentId"');
    expect(migration).toContain('ADD COLUMN "pmType"');
    expect(migration).not.toMatch(/DROP\s+TABLE\s+"pm_schedules"/i);
  });
});
