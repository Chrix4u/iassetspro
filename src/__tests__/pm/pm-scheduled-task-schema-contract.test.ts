import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const schema = readFileSync(resolve(process.cwd(), 'prisma/schema.prisma'), 'utf8');
const migrationPath = resolve(
  process.cwd(),
  'prisma/migrations/20261025013000_add_pm_schedule_tasks/migration.sql',
);

function modelSource(name: string): string {
  const start = schema.indexOf(`model ${name} {`);
  expect(start, `model ${name} must exist`).toBeGreaterThanOrEqual(0);
  const nextModel = schema.indexOf('\nmodel ', start + 1);
  return schema.slice(start, nextModel === -1 ? undefined : nextModel);
}

describe('PM scheduled task schema contract', () => {
  it('stores per-task planning without moving Task Master identity onto the schedule', () => {
    const schedule = modelSource('PmSchedule');
    const task = modelSource('PmTask');
    const scheduledTask = modelSource('PmScheduleTask');

    expect(schedule).toMatch(/\btasks\s+PmScheduleTask\[\]/);
    expect(task).toMatch(/\bscheduleTasks\s+PmScheduleTask\[\]/);
    expect(scheduledTask).toMatch(/\bscheduleId\s+String\b/);
    expect(scheduledTask).toMatch(/\bpmTaskId\s+String\b/);
    expect(scheduledTask).toContain('@@unique([scheduleId, pmTaskId])');
    expect(scheduledTask).toMatch(/\bsortOrder\s+Int\b/);
  });

  it('persists the independent TBM UBM CBM and equipment-state planning fields', () => {
    const scheduledTask = modelSource('PmScheduleTask');
    for (const field of [
      'maintenanceMode', 'equipmentState', 'estimatedMinutes', 'leadDays',
      'frequencyInterval', 'frequencyUnit', 'meterName', 'nextDueReading',
      'conditionSourceType', 'conditionSourceId', 'conditionMetric',
      'conditionOperator', 'conditionThreshold', 'conditionThresholdMax',
      'conditionUnit', 'evaluationCadenceMinutes', 'lastCompletedAt',
      'nextDueDate', 'isActive',
    ]) {
      expect(scheduledTask, `${field} must be persisted`).toMatch(new RegExp(`\\b${field}\\s+`));
    }
    expect(scheduledTask).toContain('@@index([scheduleId, isActive, sortOrder])');
    expect(scheduledTask).toContain('@@index([maintenanceMode, isActive, nextDueDate])');
    expect(scheduledTask).toContain('@@index([meterName, isActive])');
    expect(scheduledTask).toContain('@@map("pm_schedule_tasks")');
  });

  it('ships an additive migration that creates only the new scheduled-task table and indexes', () => {
    expect(existsSync(migrationPath)).toBe(true);
    const migration = readFileSync(migrationPath, 'utf8');

    expect(migration).toContain('CREATE TABLE "pm_schedule_tasks"');
    expect(migration).toContain('REFERENCES "pm_schedules"("id")');
    expect(migration).toContain('REFERENCES "pm_tasks"("id")');
    expect(migration).toContain('pm_schedule_tasks_scheduleId_pmTaskId_key');
    expect(migration).not.toMatch(/UPDATE\s+"pm_schedules"/i);
    expect(migration).not.toMatch(/DELETE\s+FROM\s+"pm_schedules"/i);
    expect(migration).not.toMatch(/DROP\s+(TABLE|COLUMN).*pm_schedules/i);
  });
});
