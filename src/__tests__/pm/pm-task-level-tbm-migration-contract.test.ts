import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const migrationPath = 'prisma/migrations/20261026020000_task_level_tbm_authority_backfill/migration.sql';
const exists = fs.existsSync(migrationPath);
const sql = exists ? fs.readFileSync(migrationPath, 'utf8') : '';

describe('task-level TBM authority/backfill migration contract', () => {
  it('adds legacy-header recurrence authority and its scan index', () => {
    expect(exists).toBe(true);
    expect(sql).toContain('ADD COLUMN "recurrenceAuthority" TEXT NOT NULL DEFAULT \'legacy_header\'');
    expect(sql).toContain('CREATE INDEX "pm_schedules_recurrenceAuthority_isActive_idx"');
  });

  it('marks pre-existing slice-3 task-level schedules before legacy backfill', () => {
    expect(sql).toContain('SET "recurrenceAuthority" = \'task\'');
    expect(sql).toContain('s."autoGenerateWO" = false');
    expect(sql).toContain('s."nextDueDate" IS NULL');
    expect(sql).toMatch(/EXISTS\s*\([\s\S]*FROM "pm_schedule_tasks"/);
  });

  it('backfills only deterministic legacy calendar schedules with valid task masters', () => {
    expect(sql).toContain('INSERT INTO "pm_schedule_tasks"');
    expect(sql).toContain('s."recurrenceAuthority" = \'legacy_header\'');
    expect(sql).toContain('s."nextDueDate" IS NOT NULL');
    expect(sql).toContain('pmt."isActive" = true');
    expect(sql).toContain('pmt."pmTaskId" IS NOT NULL');
    expect(sql).toContain('pt."isActive" = true');
    expect(sql).toContain('pt."plantId" = s."plantId"');
    expect(sql).toMatch(/NOT EXISTS\s*\([\s\S]*existing\."scheduleId" = s\."id"/);
  });

  it('maps legacy aliases and canonical task-level TBM units without hour/minute or meter conversion', () => {
    expect(sql).toContain("WHEN s.\"frequencyType\" = 'biweekly' THEN s.\"frequencyValue\" * 2");
    expect(sql).toContain("WHEN s.\"frequencyType\" = 'quarterly' THEN s.\"frequencyValue\" * 3");
    expect(sql).toContain("WHEN s.\"frequencyType\" = 'semiannual' THEN s.\"frequencyValue\" * 6");
    expect(sql).toContain("s.\"frequencyUnit\" IN ('days', 'weeks', 'months', 'years')");
    expect(sql).toContain("s.\"frequencyType\" IN ('daily', 'weekly', 'biweekly', 'monthly', 'quarterly', 'semiannual', 'annual', 'annually', 'yearly', 'custom', 'custom_days')");
    expect(sql).not.toContain("'custom_hours'");
    expect(sql).not.toContain("'meter_based'");
  });

  it('copies safe schedule/template state into deterministic TBM shadow rows', () => {
    expect(sql).toContain("'tbm'");
    expect(sql).toContain("'stopped'");
    expect(sql).toContain('COALESCE(pmt."estimatedMinutes", 0)');
    expect(sql).toContain('s."leadDays"');
    expect(sql).toContain('s."lastCompletedDate"');
    expect(sql).toContain('s."nextDueDate"');
    expect(sql).toContain("'legacy-tbm-' || s.\"id\" || '-' || pmt.\"id\"");
    expect(sql).toContain('ON CONFLICT ("scheduleId", "pmTaskId") DO NOTHING');
  });
});
