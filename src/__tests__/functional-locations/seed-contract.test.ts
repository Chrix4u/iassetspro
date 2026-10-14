import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const permissionSeed = read('prisma/seed-permissions-only.ts');
const fullSeed = read('prisma/seed-all.ts');
const referenceSeed = read('prisma/seed-reference-data.ts');

describe('functional location seed contract', () => {
  it('defines identical hierarchy permission modules in both maintained permission sources', () => {
    for (const source of [permissionSeed, fullSeed]) {
      expect(source).toContain("'assets.hierarchy': ['view', 'manage']");
      expect(source).toContain("'assets.functional_locations': ['view', 'manage', 'assign']");
      expect(source).toContain('`${moduleName}.${action}`');
    }
  });

  it('keeps hierarchy-system configuration admin-only while granting operational location rights deliberately', () => {
    for (const source of [permissionSeed, fullSeed]) {
      expect(source).toMatch(/plant_manager:[\s\S]*?'assets\.hierarchy\.view'/);
      expect(source).toMatch(/plant_manager:[\s\S]*?'assets\.functional_locations\.view'/);
      expect(source).toMatch(/plant_manager:[\s\S]*?'assets\.functional_locations\.manage'/);
      expect(source).toMatch(/plant_manager:[\s\S]*?'assets\.functional_locations\.assign'/);
      expect(source).not.toMatch(/plant_manager:[\s\S]*?'assets\.hierarchy\.manage'[\s\S]*?\],\s*maintenance_manager:/);

      expect(source).toMatch(/maintenance_manager:[\s\S]*?'assets\.hierarchy\.view'/);
      expect(source).toMatch(/maintenance_manager:[\s\S]*?'assets\.functional_locations\.view'/);
      expect(source).toMatch(/maintenance_manager:[\s\S]*?'assets\.functional_locations\.assign'/);

      expect(source).toMatch(/maintenance_planner:[\s\S]*?'assets\.hierarchy\.view'/);
      expect(source).toMatch(/maintenance_planner:[\s\S]*?'assets\.functional_locations\.view'/);
      expect(source).toMatch(/maintenance_planner:[\s\S]*?'assets\.functional_locations\.assign'/);

      expect(source).toMatch(/maintenance_supervisor:[\s\S]*?'assets\.hierarchy\.view'/);
      expect(source).toMatch(/maintenance_supervisor:[\s\S]*?'assets\.functional_locations\.view'/);

      expect(source).toMatch(/viewer:[\s\S]*?'assets\.hierarchy\.view'/);
      expect(source).toMatch(/viewer:[\s\S]*?'assets\.functional_locations\.view'/);
    }
  });

  it('creates the starter hierarchy only when no hierarchy systems exist', () => {
    expect(referenceSeed).toContain('db.hierarchySystem.count');
    expect(referenceSeed).toMatch(/hierarchySystemCount\s*===\s*0/);
    expect(referenceSeed).toContain("name: 'Primary Functional Location'");
    expect(referenceSeed).toContain("code: 'PRIMARY'");
    expect(referenceSeed).toContain("codeMode: 'mixed'");
    expect(referenceSeed).toContain("codeSeparator: '-'");
    expect(referenceSeed).toContain("label: 'Company'");
    expect(referenceSeed).toContain("label: 'Site / Plant'");
    expect(referenceSeed).toContain("label: 'Area'");
    expect(referenceSeed).toContain("label: 'Line / System'");
    expect(referenceSeed).toContain("label: 'Functional Location'");
    expect(referenceSeed).toContain('allowAssetAssignment: true');
  });

  it('never resets or deletes customer hierarchy systems during reference refresh', () => {
    expect(referenceSeed).not.toMatch(/hierarchySystem\.(delete|deleteMany)/);
    expect(referenceSeed).not.toMatch(/hierarchyLevel\.(delete|deleteMany)/);
    expect(referenceSeed).not.toMatch(/hierarchySystem\.updateMany[\s\S]*isPrimary/);
  });
});
