import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = fs.readFileSync(
  'prisma/migrations/20260927130000_uat_first_machine_hierarchy/migration.sql',
  'utf8',
);

// Stage-2 contract: validate the migration remains isolated from downstream UAT stages.
describe('UAT first machine hierarchy migration', () => {
  it('is scoped to the designated staging database and commissioned plant', () => {
    expect(migration).toContain("current_database() <> 'lightworld_iassetspro_db'");
    expect(migration).toContain("WHERE \"code\" = 'TEMA-UAT-01'");
    expect(migration).toContain('requires plant TEMA-UAT-01');
    expect(migration).toContain('IF v_asset_count <> 0');
  });

  it('creates one machine and the required deep hierarchy levels', () => {
    expect(migration).toContain('Rotary Printing Machine RP-01');
    expect(migration).toContain("'assembly'");
    expect(migration).toContain("'subassembly'");
    expect(migration).toContain("'component'");
    expect(migration).toContain("'part'");
    expect(migration).toContain('RP01-ASM-PRINT');
    expect(migration).toContain('RP01-SUB-IMPCYL');
    expect(migration).toContain('RP01-CMP-BH-DS');
    expect(migration).toContain('RP01-PRT-BRG-DS');
  });

  it('does not pre-seed downstream workflow records', () => {
    expect(migration).not.toContain('INSERT INTO "inventory_items"');
    expect(migration).not.toContain('INSERT INTO "work_orders"');
    expect(migration).not.toContain('INSERT INTO "maintenance_requests"');
    expect(migration).not.toContain('INSERT INTO "pm_schedules"');
  });
});
