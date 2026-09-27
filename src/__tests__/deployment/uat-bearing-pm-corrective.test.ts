import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = fs.readFileSync(
  'prisma/migrations/20260927174500_ensure_uat_bearing_pm/migration.sql',
  'utf8',
);

describe('corrective RP-01 bearing PM commissioning', () => {
  it('is keyed to the canonical schedule instead of requiring an empty PM table', () => {
    expect(migration).toContain("WHERE \"id\" = 'uat_pm_bearing_500h'");
    expect(migration).not.toContain('SELECT COUNT(*) INTO v_pm_count FROM "pm_schedules"');
  });

  it('preserves unrelated schedules and targets the exact bearing part', () => {
    expect(migration).toContain("'uat_part_bearing_ds'");
    expect(migration).toContain("'uat_pm_bearing_500h'");
    expect(migration).toContain("'meter_based'");
    expect(migration).toContain("'uat_tech_single','tech1'");
  });

  it('still provisions inspection and lubrication intelligence', () => {
    expect(migration).toContain('INSERT INTO "component_inspection_points"');
    expect(migration).toContain('INSERT INTO "component_lubrication_schedules"');
    expect(migration).toContain("'uat_lube_bearing_500h'");
  });
});
