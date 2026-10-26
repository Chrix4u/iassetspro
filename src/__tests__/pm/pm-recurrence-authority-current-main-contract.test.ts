import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const schema = readFileSync(resolve(root, 'prisma/schema.prisma'), 'utf8');
const createRoute = readFileSync(resolve(root, 'src/app/api/pm-schedules/route.ts'), 'utf8');
const updateRoute = readFileSync(resolve(root, 'src/app/api/pm-schedules/[id]/route.ts'), 'utf8');
const checkDueRoute = readFileSync(resolve(root, 'src/app/api/pm-schedules/check-due/route.ts'), 'utf8');
const taskGeneration = readFileSync(resolve(root, 'src/services/pm/pmScheduledTaskGeneration.service.ts'), 'utf8');
const migrationPath = resolve(
  root,
  'prisma/migrations/20261026173000_pm_recurrence_authority_compatibility/migration.sql',
);
const migration = existsSync(migrationPath) ? readFileSync(migrationPath, 'utf8') : '';

describe('PM recurrence authority current-main compatibility contract', () => {
  it('persists an explicit legacy-header/task recurrence authority on PM schedules', () => {
    expect(schema).toMatch(/recurrenceAuthority\s+String\s+@default\("legacy_header"\)/);
    expect(schema).toContain('@@index([recurrenceAuthority, isActive])');
  });

  it('makes explicit Scheduled Tasks authoritative on create while preserving legacy creation', () => {
    expect(createRoute).toContain("recurrenceAuthority: scheduledTasksProvided ? 'task' : 'legacy_header'");
  });

  it('uses persisted authority instead of task-row presence when editing or cutting over a schedule', () => {
    expect(updateRoute).toContain("const existingHasTaskAuthority = existing.recurrenceAuthority === 'task'");
    expect(updateRoute).toContain("recurrenceAuthority: 'task'");
    expect(updateRoute).not.toContain('const existingHasScheduledTasks = existing.tasks.length > 0');
  });

  it('restricts task-level generation to task-authority schedules', () => {
    expect(taskGeneration).toContain("recurrenceAuthority: 'task'");
    expect(taskGeneration).toContain("schedule.recurrenceAuthority !== 'task'");
  });

  it('keeps legacy-authority schedules on the header generator even when shadow tasks exist', () => {
    expect(checkDueRoute).toContain("recurrenceAuthority: 'legacy_header'");
    expect(checkDueRoute).not.toContain('tasks: { none: {} }');
  });

  it('classifies pre-migration task schedules independently of autoGenerateWO before creating legacy shadows', () => {
    expect(existsSync(migrationPath)).toBe(true);
    expect(migration).toContain('ADD COLUMN "recurrenceAuthority" TEXT NOT NULL DEFAULT \'legacy_header\'');
    expect(migration).toContain('s."nextDueDate" IS NULL');
    expect(migration).toContain('FROM "pm_schedule_tasks" existing');
    expect(migration).not.toContain('s."autoGenerateWO" = false');
    expect(migration).toContain('s."recurrenceAuthority" = \'legacy_header\'');
    expect(migration).toContain('ON CONFLICT ("scheduleId", "pmTaskId") DO NOTHING');
  });
});
