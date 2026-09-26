import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const read = (path: string) => fs.readFileSync(path, 'utf8');

describe('demo user staging contract', () => {
  it('keeps demo identities separate from operational demo data', () => {
    const seed = read('prisma/seed-demo-users.ts');

    expect(seed).toContain("username: 'admin'");
    expect(seed).toContain("username: 'planner1'");
    expect(seed).toContain("username: 'supervisor1'");
    expect(seed).toContain("username: 'tech1'");
    expect(seed).toContain("username: 'store1'");
    expect(seed).toContain("username: 'toolshop1'");

    expect(seed).toContain('DEMO_ADMIN_PASSWORD');
    expect(seed).toContain('DEMO_USER_PASSWORD');
    expect(seed).not.toContain('admin123');
    expect(seed).not.toContain('password123');

    expect(seed).not.toContain('db.plant.create');
    expect(seed).not.toContain('db.plant.upsert');
    expect(seed).not.toContain('db.asset.create');
    expect(seed).not.toContain('db.workOrder.create');
    expect(seed).not.toContain('db.inventoryItem.create');
    expect(seed).not.toContain('db.tool.create');
    expect(seed).not.toContain('db.userPlant.create');
    expect(seed).not.toContain('db.userPlant.upsert');
  });

  it('does not reset passwords for demo identities that already exist', () => {
    const seed = read('prisma/seed-demo-users.ts');

    expect(seed).toContain('const existing = await db.user.findUnique');
    expect(seed).toContain('? await db.user.update');
    expect(seed).toContain('data: commonData');
    expect(seed).toContain(': await db.user.create');
    expect(seed).toContain('passwordHash: definition.passwordKind ===');
    expect(seed).toContain('const commonData = {');
    expect(seed).not.toContain('const commonData = { passwordHash');
  });

  it('only activates demo reconciliation from a protected server credential file', () => {
    const deploy = read('scripts/deploy-production-artifact-core.sh');

    expect(deploy).toContain('IASSETSPRO_DEMO_USERS_ENV:-/home/lightworld/shared/iassetspro/demo-users.env');
    expect(deploy).toContain('demo user credential file must have mode 600');
    expect(deploy).toContain('bun --env-file=.env run prisma/seed-demo-users.ts');
    expect(deploy).toContain('unset DEMO_ADMIN_PASSWORD DEMO_USER_PASSWORD');
  });

  it('packages the demo seed and hashing runtime into the immutable release artifact', () => {
    const ci = read('.github/workflows/ci.yml');

    expect(ci).toContain('prisma/seed-demo-users.ts');
    expect(ci).toContain('BCRYPTJS_VERSION');
    expect(ci).toContain('.release-bundle/node_modules/bcryptjs/package.json');
    expect(ci).toContain("require('./.release-bundle/node_modules/bcryptjs')");
  });
});
