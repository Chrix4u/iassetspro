import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const hierarchy = fs.readFileSync(
  'prisma/migrations/20260927132500_ensure_uat_rp01_hierarchy/migration.sql',
  'utf8',
);
const store = fs.readFileSync(
  'prisma/migrations/20260927134000_ensure_uat_store_spares_tools/migration.sql',
  'utf8',
);

describe('UAT corrective commissioning migrations', () => {
  it('targets RP-01 instead of requiring an empty asset table', () => {
    expect(hierarchy).toContain("WHERE \"assetTag\" = 'UAT-RP-001'");
    expect(hierarchy).not.toContain('v_asset_count');
    expect(hierarchy).toContain('Rotary Printing Machine RP-01');
  });

  it('retains the full machine-to-part hierarchy', () => {
    expect(hierarchy).toContain("'assembly'");
    expect(hierarchy).toContain("'subassembly'");
    expect(hierarchy).toContain("'component'");
    expect(hierarchy).toContain("'part'");
  });

  it('targets only canonical UAT stock and tools', () => {
    expect(store).toContain("WHERE \"itemCode\" = 'BRG-SKF-22218-E'");
    expect(store).toContain("WHERE \"toolCode\" = 'TL-UAT-001'");
    expect(store).not.toContain('v_inventory_count');
    expect(store).not.toContain('v_tool_count');
  });

  it('preserves unrelated staging inventory and tools', () => {
    expect(store).not.toContain('DELETE FROM "inventory_items"');
    expect(store).not.toContain('DELETE FROM "tools"');
    expect(store).not.toContain('TRUNCATE');
  });
});
