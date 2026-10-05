import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const route = readFileSync('src/app/api/assets/route.ts', 'utf8');

describe('asset create contract', () => {
  it('connects required Prisma relations without optional wrappers', () => {
    expect(route).toContain('category: { connect: { id: categoryId } }');
    expect(route).toContain('plant: { connect: { id: plantId } }');
    expect(route).not.toContain('const categoryConnect =');
    expect(route).not.toContain('const plantConnect =');
  });

  it('prevents cross-plant parent hierarchies', () => {
    expect(route).toContain('if (parent.plantId !== plantId)');
    expect(route).toContain('Parent asset must belong to the same plant');
  });

  it('prevents cross-plant department assignment', () => {
    expect(route).toContain('db.department.findUnique');
    expect(route).toContain('if (department.plantId !== plantId)');
    expect(route).toContain('Department must belong to the same plant');
  });
});
