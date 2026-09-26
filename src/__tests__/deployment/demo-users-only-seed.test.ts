import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => fs.readFileSync(path, 'utf8');

describe('demo users only seed', () => {
  it('keeps demo identity seeding separate from operational demo data', () => {
    const seed = read('prisma/seed-demo-users-only.ts');

    for (const username of [
      'admin',
      'pm.temafactory',
      'planner1',
      'supervisor1',
      'tech1',
      'operator1',
      'manager1',
      'maint_mgr1',
      'prod_mgr1',
      'inv_mgr1',
      'store1',
      'qual_mgr1',
      'safety1',
      'hr1',
      'iot1',
      'viewer1',
      'toolshop1',
    ]) {
      expect(seed).toContain(`username: '${username}'`);
    }

    expect(seed).toContain('await db.user.upsert');
    expect(seed).toContain('await db.userRole.upsert');
    expect(seed).not.toContain('db.userPlant.upsert');
    expect(seed).not.toContain('db.plant.create');
    expect(seed).not.toContain('db.department.create');
    expect(seed).not.toContain('db.asset.create');
    expect(seed).not.toContain('db.workOrder.create');
    expect(seed).not.toContain('db.inventoryItem.create');
  });
});
