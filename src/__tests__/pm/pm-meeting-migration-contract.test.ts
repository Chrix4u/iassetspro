import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('PM full migration deployment contract', () => {
  it('backfills AssetMeter definitions and links readings in the deployable SQL migration', () => {
    const file = resolve(process.cwd(), 'prisma/migrations/20261027202500_asset_meters/migration.sql');
    const sql = readFileSync(file, 'utf8');
    expect(sql).toContain('INSERT INTO "asset_meters"');
    expect(sql).toMatch(/DISTINCT ON \("assetId", "meterName", "unit"\)/);
    expect(sql).toContain('UPDATE "meter_readings"');
    expect(sql).toContain('UPDATE "pm_schedule_tasks"');
    expect(sql).toContain("'standstill'");
  });

  it('ships a rerunnable migration command for verification/repair', () => {
    const script = resolve(process.cwd(), 'scripts/migrate-pm-direct-assignments.ts');
    expect(existsSync(script)).toBe(true);
    if (!existsSync(script)) return;
    const source = readFileSync(script, 'utf8');
    expect(source).toContain('backfillPmMeetingMigration');
    expect(source).toContain('$disconnect');
  });
});
