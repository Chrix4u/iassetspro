import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const read = (path: string) => {
  const full = resolve(root, path);
  expect(existsSync(full), `${path} must exist`).toBe(true);
  return existsSync(full) ? readFileSync(full, 'utf8') : '';
};

describe('functional location API security contract', () => {
  it('seeds dedicated hierarchy and functional-location permissions', () => {
    const permissionSeed = read('prisma/seed-permissions-only.ts');
    const fullSeed = read('prisma/seed-all.ts');

    for (const source of [permissionSeed, fullSeed]) {
      expect(source).toContain("'assets.hierarchy': ['view', 'manage']");
      expect(source).toContain("'assets.functional_locations': ['view', 'manage', 'assign']");
      expect(source).toContain('`${moduleName}.${action}`');
    }
  });

  it('protects hierarchy-system mutations with authenticated RBAC and audit logging', () => {
    const source = read('src/app/api/hierarchy-systems/route.ts');
    expect(source).toContain('getSession');
    expect(source).toMatch(/assets\.hierarchy\.view/);
    expect(source).toMatch(/assets\.hierarchy\.manage/);
    expect(source).toContain('db.auditLog.create');
  });

  it('fails functional-location access closed through the existing plant-scope contract', () => {
    const source = read('src/app/api/functional-locations/route.ts');
    expect(source).toContain('getPlantScope');
    expect(source).toMatch(/denyAccess/);
    expect(source).toContain('canAccessPlant');
    expect(source).toMatch(/assets\.functional_locations\.view/);
    expect(source).toMatch(/assets\.functional_locations\.manage/);
    expect(source).toContain('db.auditLog.create');
  });

  it('routes guarded moves through plant scope and the hierarchy service', () => {
    const source = read('src/app/api/functional-locations/[id]/move/route.ts');
    expect(source).toContain('getPlantScope');
    expect(source).toContain('canAccessPlant');
    expect(source).toContain('moveFunctionalLocation');
    expect(source).toMatch(/assets\.functional_locations\.manage/);
    expect(source).toContain('db.auditLog.create');
  });

  it('provides a plant-scoped breadcrumb path endpoint', () => {
    const source = read('src/app/api/functional-locations/[id]/path/route.ts');
    expect(source).toContain('getPlantScope');
    expect(source).toContain('canAccessPlant');
    expect(source).toContain('getFunctionalLocationPath');
    expect(source).toMatch(/assets\.functional_locations\.view/);
  });
});
