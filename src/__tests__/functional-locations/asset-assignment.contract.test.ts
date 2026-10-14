import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const read = (path: string) => {
  const full = resolve(root, path);
  expect(existsSync(full), `${path} must exist`).toBe(true);
  return existsSync(full) ? readFileSync(full, 'utf8') : '';
};

describe('asset ↔ functional-location assignment contract', () => {
  it('stores append-only assignment history without deleting legacy location fields', () => {
    const schema = read('prisma/schema.prisma');
    expect(schema).toContain('model AssetFunctionalLocationAssignment');
    expect(schema).toMatch(/assetId\s+String/);
    expect(schema).toMatch(/hierarchySystemId\s+String/);
    expect(schema).toMatch(/functionalLocationId\s+String/);
    expect(schema).toMatch(/assignedAt\s+DateTime/);
    expect(schema).toMatch(/endedAt\s+DateTime\?/);
    expect(schema).toMatch(/assignedById\s+String\?/);
    expect(schema).toMatch(/endedById\s+String\?/);
    expect(schema).toContain('functionalLocationAssignments AssetFunctionalLocationAssignment[]');
    expect(schema).toMatch(/asset\s+Asset\s+@relation\(fields: \[assetId\], references: \[id\], onDelete: Restrict\)/);

    for (const legacyField of ['location', 'building', 'floor', 'area']) {
      expect(schema).toMatch(new RegExp(`\\b${legacyField}\\s+String\\?`));
    }
  });

  it('enforces one current assignment per asset and hierarchy system at the database layer', () => {
    const migrationDir = resolve(root, 'prisma/migrations');
    const migrationNames = existsSync(migrationDir)
      ? readdirSync(migrationDir).filter((name) => name.includes('asset_functional_location'))
      : [];
    expect(migrationNames.length).toBeGreaterThan(0);
    const migration = read(`prisma/migrations/${migrationNames.sort().at(-1)}/migration.sql`);
    expect(migration).toMatch(/CREATE UNIQUE INDEX[\s\S]*assetId[\s\S]*hierarchySystemId[\s\S]*WHERE\s+"endedAt"\s+IS\s+NULL/i);
    expect(migration).toMatch(/assetId_fkey[\s\S]*REFERENCES "assets"\("id"\) ON DELETE RESTRICT/i);
  });

  it('relocates transactionally, preserves history, validates eligibility and audits the write', () => {
    const source = read('src/lib/functional-location/asset-assignment.ts');
    expect(source).toContain('export async function assignAssetToFunctionalLocation');
    expect(source).toContain('db.$transaction');
    expect(source).toContain('allowAssetAssignment');
    expect(source).toMatch(/plantId/);
    expect(source).toContain('endedAt');
    expect(source).toContain('assetFunctionalLocationAssignment.create');
    expect(source).toContain('tx.auditLog.create');
    expect(source).toMatch(/relocat|assign/i);
  });

  it('keeps same-location assignment idempotent', () => {
    const source = read('src/lib/functional-location/asset-assignment.ts');
    expect(source).toMatch(/current.*functionalLocationId[\s\S]*functionalLocationId/);
    expect(source).toMatch(/return current/);
  });

  it('exposes plant-scoped GET and assignment POST APIs with dedicated RBAC', () => {
    const source = read('src/app/api/assets/[id]/functional-locations/route.ts');
    expect(source).toContain('getSession');
    expect(source).toContain('getPlantScope');
    expect(source).toContain('canAccessPlant');
    expect(source).toMatch(/assets\.functional_locations\.view/);
    expect(source).toMatch(/assets\.functional_locations\.assign/);
    expect(source).toContain('assignAssetToFunctionalLocation');
    expect(source).toContain('getAssetFunctionalLocationAssignments');
  });
});
