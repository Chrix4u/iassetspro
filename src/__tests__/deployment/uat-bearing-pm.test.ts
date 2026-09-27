import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = fs.readFileSync(
  'prisma/migrations/20260927140000_uat_bearing_pm/migration.sql',
  'utf8',
);

describe('UAT bearing PM commissioning migration', () => {
  it('targets the exact commissioned bearing and depends on stage 3', () => {
    expect(migration).toContain("uat_part_bearing_ds");
    expect(migration).toContain("uat_inv_bearing_22218e");
    expect(migration).toContain("current_database() <> 'lightworld_iassetspro_db'");
  });

  it('creates a meter-based component PM with automatic work-order generation configured', () => {
    expect(migration).toContain('RP-01 Drive-Side Bearing 500h PM');
    expect(migration).toContain("'meter_based'");
    expect(migration).toContain("'meter'");
    expect(migration).toContain('"baselineHours":12500');
    expect(migration).toContain('true,\n    true,\n    1');
  });

  it('creates inspection and lubrication intelligence at component level', () => {
    expect(migration).toContain('Bearing Temperature');
    expect(migration).toContain('Bearing Vibration');
    expect(migration).toContain('component_inspection_points');
    expect(migration).toContain('component_lubrication_schedules');
    expect(migration).toContain('EP2 Bearing Grease');
  });

  it('does not pre-create a work order', () => {
    expect(migration).not.toContain('INSERT INTO "work_orders"');
  });
});
