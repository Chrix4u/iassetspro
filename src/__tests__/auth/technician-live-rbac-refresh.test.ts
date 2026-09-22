import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (relativePath: string) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');

describe('technician live RBAC refresh', () => {
  it('refreshes effective authorization for warm and cold sessions', () => {
    const auth = read('src/lib/auth.ts');

    expect(auth).toContain('const AUTHZ_REFRESH_INTERVAL_MS = 5 * 60 * 1000');
    expect(auth).toContain('async function resolveEffectiveAuthorization');
    expect(auth).toContain("user.status !== 'active'");
    expect(auth).toContain('authzCacheAge <= AUTHZ_REFRESH_INTERVAL_MS');
    expect(auth).toContain('const currentAuthorization = await resolveEffectiveAuthorization(dbSession.userId)');
    expect(auth).toContain('roles = currentAuthorization.roles');
    expect(auth).toContain('permissions = currentAuthorization.permissions');
    expect(auth).toContain('if (rolesJson !== dbSession.roles || permissionsJson !== dbSession.permissions)');
  });

  it('preserves user-level direct grant/deny precedence during refresh', () => {
    const auth = read('src/lib/auth.ts');

    expect(auth).toContain('if (directPermission.isGranted) permissionSlugs.add(slug)');
    expect(auth).toContain('else permissionSlugs.delete(slug)');
    expect(auth).toContain("if (roleSlugs.has('admin'))");
  });

  it('repairs only missing baseline technician resource permissions', () => {
    const migration = read(
      'prisma/migrations/20260922150000_reconcile_technician_resource_permissions/migration.sql',
    );

    for (const permission of [
      'tools.view',
      'work_orders.view_own',
      'work_orders.update',
      'work_orders.start',
      'repair_tool_requests.view_own',
      'repair_tool_requests.create',
      'repair_material_requests.view_own',
      'repair_material_requests.create',
    ]) {
      expect(migration).toContain(permission);
    }

    expect(migration).toContain("WHERE r.slug = 'maintenance_technician'");
    expect(migration).toContain('AND rp.id IS NULL');
    expect(migration).not.toContain('DELETE FROM role_permissions');
    expect(migration).not.toContain('TRUNCATE');
  });
});
