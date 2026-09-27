import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = fs.readFileSync(
  'prisma/migrations/20260927125000_ensure_canonical_uat_organization/migration.sql',
  'utf8',
);

describe('canonical UAT organization repair', () => {
  it('is scoped to the staging database and canonical plant', () => {
    expect(migration).toContain("current_database() <> 'lightworld_iassetspro_db'");
    expect(migration).toContain("WHERE \"code\" = 'TEMA-UAT-01'");
  });

  it('preserves existing plants and only creates the canonical plant when missing', () => {
    expect(migration).toContain('IF v_plant_id IS NULL THEN');
    expect(migration).not.toContain('DELETE FROM "plants"');
    expect(migration).not.toContain('TRUNCATE');
  });

  it('ensures the departments required by machine commissioning', () => {
    expect(migration).toContain("'Production','PROD'");
    expect(migration).toContain("'Maintenance','MAINT'");
    expect(migration).toContain("'Warehouse & Logistics','WHL'");
  });

  it('idempotently grants existing users access to the canonical UAT plant', () => {
    expect(migration).toContain('INSERT INTO "user_plants"');
    expect(migration).toContain('WHERE NOT EXISTS');
  });
});
