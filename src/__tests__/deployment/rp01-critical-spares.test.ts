import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = fs.readFileSync(
  'prisma/migrations/20260927181000_rp01_critical_spares/migration.sql',
  'utf8',
);

describe('RP-01 critical spare commissioning', () => {
  it('stocks critical replaceable parts without clearing existing inventory', () => {
    for (const code of ['BRG-SKF-6316-C3','BRG-SKF-NU316-ECP','BRG-SKF-22220-E','BRG-SKF-6309-2RS','FLT-F7-600','KIT-GRACO-1050-PTFE','FLT-FESTO-MS6','ELC-XB5-AS844']) {
      expect(migration).toContain(code);
    }
    expect(migration).not.toContain('DELETE FROM "inventory_items"');
  });

  it('links deep parts to inventory and maintenance tools', () => {
    expect(migration).toContain('INSERT INTO "component_spare_parts"');
    expect(migration).toContain("'uat_part_motor_de_bearing'");
    expect(migration).toContain("'uat_part_exfan_brg'");
    expect(migration).toContain('INSERT INTO "component_tool_requirements"');
    expect(migration).toContain("'uat_tool_bearing_puller'");
    expect(migration).toContain("'uat_tool_dial_indicator'");
  });

  it('records auditable opening stock movements idempotently', () => {
    expect(migration).toContain('RP-01 deep commissioning opening balance');
    expect(migration).toContain('NOT EXISTS');
    expect(migration).toContain('uat_stage_deep_spares');
  });
});
