import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('production permission seeding', () => {
  const source = readFileSync('prisma/seed-permissions-only.ts', 'utf8');

  it('rebuilds only predefined role grants, retaining custom-role mappings', () => {
    expect(source).toContain('const managedRoleIds = Object.values(createdRoles)');
    expect(source).toMatch(/rolePermission\.deleteMany\(\{\s*where: \{ roleId: \{ in: managedRoleIds \} \}/);
    expect(source).not.toContain('rolePermission.deleteMany()');
  });

  it('also preserves custom-role grants when a full developer seed is run', () => {
    const fullSeed = readFileSync('prisma/seed.ts', 'utf8');
    expect(fullSeed).toContain('const managedRoleIds = Object.values(createdRoles)');
    expect(fullSeed).toMatch(/rolePermission\.deleteMany\(\{\s*where: \{ roleId: \{ in: managedRoleIds \} \}/);
    expect(fullSeed).not.toMatch(/rolePermission\.deleteMany\(\s*\{\s*\}\s*\)/);
  });

  it('verifies managed roles and mappings without rejecting legitimate custom roles', () => {
    expect(source).toContain('seededRolesDb === roleDefinitions.length');
    expect(source).toContain('seededRoleMappingsDb === expectedSeededMappings');
    expect(source).toContain('totalPerms >= createdCount');
    expect(source).toContain('additional roles preserved');
  });
});
