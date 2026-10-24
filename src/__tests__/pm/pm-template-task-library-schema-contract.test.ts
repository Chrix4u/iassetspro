import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const schema = readFileSync(resolve(process.cwd(), 'prisma/schema.prisma'), 'utf8');
const migrationPath = resolve(
  process.cwd(),
  'prisma/migrations/20261022173500_link_pm_templates_to_task_library/migration.sql',
);

function modelSource(name: string): string {
  const start = schema.indexOf(`model ${name} {`);
  expect(start, `model ${name} must exist`).toBeGreaterThanOrEqual(0);
  const nextModel = schema.indexOf('\nmodel ', start + 1);
  return schema.slice(start, nextModel === -1 ? undefined : nextModel);
}

describe('PM template Task Library schema contract', () => {
  it('adds nullable plant ownership to PM templates without making legacy templates invalid', () => {
    const plant = modelSource('Plant');
    const template = modelSource('PmTemplate');

    expect(template).toMatch(/\bplantId\s+String\?/);
    expect(template).toMatch(
      /\bplant\s+Plant\?\s+@relation\(fields:\s*\[plantId\],\s*references:\s*\[id\],\s*onDelete:\s*SetNull\)/,
    );
    expect(plant).toMatch(/\bpmTemplates\s+PmTemplate\[\]/);
  });

  it('links template associations to Task Masters while retaining nullable legacy rows', () => {
    const task = modelSource('PmTask');
    const association = modelSource('PmTemplateTask');

    expect(association).toMatch(/\bpmTaskId\s+String\?/);
    expect(association).toMatch(
      /\bpmTask\s+PmTask\?\s+@relation\(fields:\s*\[pmTaskId\],\s*references:\s*\[id\],\s*onDelete:\s*SetNull\)/,
    );
    expect(association).toContain('@@unique([templateId, pmTaskId])');
    expect(task).toMatch(/\btemplateTasks\s+PmTemplateTask\[\]/);
  });

  it('ships an additive deterministic legacy backfill migration', () => {
    expect(existsSync(migrationPath)).toBe(true);
    const migration = readFileSync(migrationPath, 'utf8');

    expect(migration).toContain('ALTER TABLE "pm_templates" ADD COLUMN "plantId" TEXT');
    expect(migration).toContain('ALTER TABLE "pm_template_tasks" ADD COLUMN "pmTaskId" TEXT');
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "pm_template_tasks_templateId_pmTaskId_key" ON "pm_template_tasks"("templateId", "pmTaskId")',
    );
    expect(migration).toMatch(/COUNT\(DISTINCT a\."plantId"\)\s*=\s*1/);
    expect(migration).toMatch(/UPDATE "pm_templates" pt[\s\S]*SET "plantId" = sp\."plantId"/);
    expect(migration).toContain(
      `LOWER(BTRIM(pt."category")) IN ('mechanical', 'electrical', 'plumbing', 'lubrication')`,
    );
    expect(migration).toContain(`'legacy-pm-task-' || pmt."id"`);
    expect(migration).toMatch(/MAX\(t\."taskNumber"\)/);
    expect(migration).toMatch(/ROW_NUMBER\(\) OVER \([\s\S]*PARTITION BY e\."plantId"[\s\S]*e\."templateId"[\s\S]*e\."sortOrder"[\s\S]*e\."taskNumber"[\s\S]*e\."associationId"/);
    expect(migration).toMatch(/UPDATE "pm_template_tasks" pmt[\s\S]*SET "pmTaskId" = i\."pmTaskId"/);
  });

  it('does not rewrite existing Task Numbers or guess unsupported legacy disciplines', () => {
    expect(existsSync(migrationPath)).toBe(true);
    const migration = readFileSync(migrationPath, 'utf8');

    expect(migration).not.toMatch(/UPDATE\s+"pm_tasks"[\s\S]*SET\s+"taskNumber"/i);
    expect(migration).not.toMatch(/LOWER\(BTRIM\(pt\."category"\)\).*controls/i);
    expect(migration).not.toMatch(/LOWER\(BTRIM\(pt\."category"\)\).*instrumentation/i);
    expect(migration).not.toMatch(/LOWER\(BTRIM\(pt\."category"\)\).*process/i);
    expect(migration).not.toMatch(/LOWER\(BTRIM\(pt\."category"\)\).*production/i);
    expect(migration).not.toMatch(/LOWER\(BTRIM\(pt\."category"\)\).*safety/i);
  });
});
