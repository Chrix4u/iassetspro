import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = fs.readFileSync(
  'prisma/migrations/20260927054000_commission_clean_uat_baseline/migration.sql',
  'utf8',
);

describe('clean UAT commissioning migration', () => {
  it('is guarded so empty CI databases are untouched', () => {
    expect(migration).toContain('EXISTS (SELECT 1 FROM "users")');
    expect(migration).toContain('NOT EXISTS (SELECT 1 FROM "plants")');
    expect(migration).toContain('"clean_uat_precondition"');
  });

  it('commissions only organization/access baseline data', () => {
    expect(migration).toContain('INSERT INTO "plants"');
    expect(migration).toContain('INSERT INTO "departments"');
    expect(migration).toContain('INSERT INTO "user_plants"');

    for (const forbidden of [
      'INSERT INTO "assets"',
      'INSERT INTO "inventory_items"',
      'INSERT INTO "tools"',
      'INSERT INTO "work_orders"',
      'INSERT INTO "maintenance_requests"',
      'INSERT INTO "pm_schedules"',
      'INSERT INTO "installed_spare_parts"',
    ]) {
      expect(migration).not.toContain(forbidden);
    }
  });

  it('makes the commissioned plant primary for preserved demo users', () => {
    expect(migration).toContain('"isPrimary" = FALSE');
    expect(migration).toContain('"isPrimary" = TRUE');
    expect(migration).toContain("'admin'");
    expect(migration).toContain("'write'");
  });
});
