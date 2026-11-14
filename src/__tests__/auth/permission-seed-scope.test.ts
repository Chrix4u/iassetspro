import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('production permission seeding', () => {
  const source = readFileSync('prisma/seed-permissions-only.ts', 'utf8');

  it('rebuilds only predefined role grants, retaining custom-role mappings', () => {
    expect(source).toContain('const managedRoleIds = Object.values(createdRoles)');
    expect(source).toMatch(/rolePermission\.deleteMany\(\{\s*where: \{ roleId: \{ in: managedRoleIds \} \}/);
    expect(source).not.toContain('rolePermission.deleteMany()');
  });

  it('verifies managed roles and mappings without rejecting legitimate custom roles', () => {
    expect(source).toContain('seededRolesDb === roleDefinitions.length');
    expect(source).toContain('seededRoleMappingsDb === expectedSeededMappings');
    expect(source).toContain('totalPerms >= createdCount');
    expect(source).toContain('additional roles preserved');
  });
});
