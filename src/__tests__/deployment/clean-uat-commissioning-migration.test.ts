import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = fs.readFileSync(
  'prisma/migrations/20260927061500_commission_clean_uat_organization/migration.sql',
  'utf8',
);
const deploy = fs.readFileSync('scripts/deploy-production-artifact-core.sh', 'utf8');

describe('clean UAT organizational commissioning migration', () => {
  it('runs only for the staging database with existing users and no plant', () => {
    expect(migration).toContain("current_database() = 'lightworld_iassetspro_db'");
    expect(migration).toContain('v_user_count > 0');
    expect(migration).toContain('v_plant_count = 0');
  });

  it('creates only the organizational baseline', () => {
    expect(migration).toContain('Tema Industrial UAT Plant');
    expect(migration).toContain('TEMA-UAT-01');
    expect(migration).toContain('INSERT INTO "departments"');
    expect(migration).toContain('INSERT INTO "user_plants"');
    expect(migration).not.toContain('INSERT INTO "assets"');
    expect(migration).not.toContain('INSERT INTO "inventory_items"');
    expect(migration).not.toContain('INSERT INTO "work_orders"');
  });

  it('leaves normal deployment free of one-time commissioning hooks', () => {
    expect(deploy).not.toContain('commission-clean-uat.ts');
    expect(deploy).not.toContain('One-time clean UAT commissioning');
  });
});
