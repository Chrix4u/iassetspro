import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8');

describe('worker and user directory plant/privacy boundaries', () => {
  const workersApi = read('src/app/api/workers/route.ts');
  const usersApi = read('src/app/api/users/route.ts');

  it('plant-scopes worker candidates even when the caller omits plantId', () => {
    expect(workersApi).toContain("getPlantScope, canAccessPlant");
    expect(workersApi).toContain('const plantScope = await getPlantScope(request, session)');
    expect(workersApi).toContain('plantScope.accessiblePlantIds');
    expect(workersApi).toContain("where.plantAccess = { some: { plantId: plantScope.plantId } }");
    expect(workersApi).toContain("return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 })");
  });

  it('keeps full user-directory access administrative while allowing safe role lookups', () => {
    expect(usersApi).toContain("if (!role && !admin)");
    expect(usersApi).toContain("where.status = 'active'");
    expect(usersApi).toContain('const plantScope = await getPlantScope(request, session)');
    expect(usersApi).toContain('plantScope.accessiblePlantIds');
    expect(usersApi).toContain("technician: ['maintenance_technician']");
    expect(usersApi).toContain("supervisor: ['maintenance_supervisor', 'maintenance_manager', 'plant_manager']");
    expect(usersApi).toContain("const targetRoleSlugs = roleSlugAliases[role] || [role]");
  });

  it('does not expose contact or authentication-secret fields in non-admin assignment lookup projection', () => {
    const lookupStart = usersApi.indexOf('const lookupUsers = await db.user.findMany');
    const adminStart = usersApi.indexOf('const include: Record<string, unknown>');
    expect(lookupStart).toBeGreaterThan(-1);
    expect(adminStart).toBeGreaterThan(lookupStart);
    const lookupSection = usersApi.slice(lookupStart, adminStart);
    expect(lookupSection).not.toContain('email: true');
    expect(lookupSection).not.toContain('phone: true');
    expect(lookupSection).not.toContain('resetToken: true');
    expect(lookupSection).not.toContain('resetTokenExpires: true');
    expect(lookupSection).toContain('fullName: true');
    expect(lookupSection).toContain('staffId: true');
    expect(lookupSection).toContain('primaryTrade: true');
    expect(lookupSection).toContain('take: 100');
  });

  it('rejects unknown worker role filters instead of broadening the directory', () => {
    expect(workersApi).toContain("const allowedRoles = new Set(['all', 'technician', 'supervisor'])");
    expect(workersApi).toContain("error: 'Invalid worker role filter'");
    expect(workersApi).toContain('{ status: 400 }');
  });

  it('keeps operational assignment pickers off the unrestricted user-management directory', () => {
    const maintenanceUi = read('src/components/modules/MaintenancePages.tsx');
    expect(maintenanceUi).not.toContain("api.get('/api/users?limit=100')");
    expect(maintenanceUi).toContain("api.get('/api/workers?role=all')");
    expect(maintenanceUi).toContain("api.get('/api/workers?role=technician')");
  });

  it('redacts password and password-reset secrets from administrative directory output', () => {
    expect(usersApi).toContain('passwordHash: _passwordHash');
    expect(usersApi).toContain('resetToken: _resetToken');
    expect(usersApi).toContain('resetTokenExpires: _resetTokenExpires');
  });
});
