import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = fs.readFileSync(
  'prisma/migrations/20260927133000_uat_store_spares_tools/migration.sql',
  'utf8',
);

describe('UAT store/spares/tools commissioning migration', () => {
  it('is scoped to the target database and commissioned machine hierarchy', () => {
    expect(migration).toContain("current_database() <> 'lightworld_iassetspro_db'");
    expect(migration).toContain("WHERE \"code\" = 'TEMA-UAT-01'");
    expect(migration).toContain("uat_asset_rotary_printer_01");
    expect(migration).toContain("uat_part_bearing_ds");
  });

  it('creates a consistent opening inventory baseline with stock movements', () => {
    expect(migration).toContain('Main Spare Parts Store');
    expect(migration).toContain('BRG-SKF-22218-E');
    expect(migration).toContain('LUB-EP2-400G');
    expect(migration).toContain('INSERT INTO "stock_movements"');
    expect(migration).toContain('Clean UAT opening balance');
  });

  it('creates component-linked spare and tool requirements', () => {
    expect(migration).toContain('INSERT INTO "component_spare_parts"');
    expect(migration).toContain('uat_csp_bearing_ds');
    expect(migration).toContain('INSERT INTO "component_tool_requirements"');
    expect(migration).toContain('TL-UAT-001');
    expect(migration).toContain('TL-UAT-002');
    expect(migration).toContain('TL-UAT-003');
  });

  it('does not pre-create PM, requests, or work orders', () => {
    expect(migration).not.toContain('INSERT INTO "pm_schedules"');
    expect(migration).not.toContain('INSERT INTO "maintenance_requests"');
    expect(migration).not.toContain('INSERT INTO "work_orders"');
  });
});
