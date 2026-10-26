import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const schema = readFileSync(resolve(process.cwd(), 'prisma/schema.prisma'), 'utf8');
const migrationPath = resolve(
  process.cwd(),
  'prisma/migrations/20261026014500_add_pm_task_generation_provenance/migration.sql',
);

function modelSource(name: string): string {
  const start = schema.indexOf(`model ${name} {`);
  expect(start, `model ${name} must exist`).toBeGreaterThanOrEqual(0);
  const nextModel = schema.indexOf('\nmodel ', start + 1);
  return schema.slice(start, nextModel === -1 ? undefined : nextModel);
}

describe('PM task-level generation provenance schema contract', () => {
  it('stores nullable evaluation and generation provenance on each Scheduled Task', () => {
    const scheduledTask = modelSource('PmScheduleTask');

    expect(scheduledTask).toMatch(/\blastEvaluatedAt\s+DateTime\?/);
    expect(scheduledTask).toMatch(/\blastGeneratedAt\s+DateTime\?/);
    expect(scheduledTask).toMatch(/\blastGeneratedCycleKey\s+String\?/);
    expect(scheduledTask).toMatch(/\btaskExecutions\s+WorkOrderTaskExecution\[\]/);
    expect(scheduledTask).toContain('@@index([scheduleId, isActive, lastGeneratedCycleKey])');
  });

  it('links WO task snapshots back to Scheduled Tasks without making history depend on them', () => {
    const execution = modelSource('WorkOrderTaskExecution');

    expect(execution).toMatch(/\bpmScheduleTaskId\s+String\?/);
    expect(execution).toMatch(/\bpmDueCycleKey\s+String\?/);
    expect(execution).toMatch(/\bpmPlanningSnapshot\s+String\?\s+@db\.Text/);
    expect(execution).toMatch(
      /\bpmScheduleTask\s+PmScheduleTask\?\s+@relation\(fields:\s*\[pmScheduleTaskId\],\s*references:\s*\[id\],\s*onDelete:\s*SetNull\)/,
    );
    expect(execution).toContain('@@index([pmScheduleTaskId, pmDueCycleKey])');
  });

  it('ships an additive migration with nullable provenance and no production data rewrite', () => {
    expect(existsSync(migrationPath)).toBe(true);
    const migration = readFileSync(migrationPath, 'utf8');

    expect(migration).toContain('ALTER TABLE "pm_schedule_tasks"');
    expect(migration).toContain('ADD COLUMN "lastEvaluatedAt" TIMESTAMP(3)');
    expect(migration).toContain('ADD COLUMN "lastGeneratedAt" TIMESTAMP(3)');
    expect(migration).toContain('ADD COLUMN "lastGeneratedCycleKey" TEXT');
    expect(migration).toContain('ALTER TABLE "wo_task_executions"');
    expect(migration).toContain('ADD COLUMN "pmScheduleTaskId" TEXT');
    expect(migration).toContain('ADD COLUMN "pmDueCycleKey" TEXT');
    expect(migration).toContain('ADD COLUMN "pmPlanningSnapshot" TEXT');
    expect(migration).toContain('ON DELETE SET NULL ON UPDATE CASCADE');
    expect(migration).not.toMatch(/^\s*UPDATE\s+/im);
    expect(migration).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(migration).not.toMatch(/\bDROP\s+(TABLE|COLUMN)\b/i);
  });
});
