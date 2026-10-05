import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const route = readFileSync('src/app/api/admin/import-data/route.ts', 'utf8');

describe('admin asset/inventory import integrity', () => {
  it('always supplies the required Asset category relation', () => {
    expect(route).toContain('category: { connect: { id: categoryId } }');
    expect(route).toContain('No asset category is available');
    expect(route).not.toContain('category: categoryId ?');
  });

  it('attributes imported assets and inventory to the authenticated admin', () => {
    expect(route).toContain('importAssets(typedRecords, session.userId)');
    expect(route).toContain('importInventory(typedRecords, session.userId)');
    expect(route).toContain('createdBy: { connect: { id: currentUserId } }');
    expect(route).toContain('createdById: currentUserId');
    expect(route).not.toContain("createdById: record.createdById ? String(record.createdById) : ''");
  });

  it('validates imported asset departments against the selected plant', () => {
    expect(route).toContain('if (department.plantId !== plantId)');
    expect(route).toContain('Department must belong to the same plant');
  });

  it('rejects asset and inventory rows whose plant does not exist', () => {
    expect(route.match(/db\.plant\.findUnique\(\{ where: \{ id: plantId \}/g)?.length).toBeGreaterThanOrEqual(2);
    expect(route).toContain('Asset #${i + 1}: Plant not found');
    expect(route).toContain('Inventory #${i + 1}: Plant not found');
  });
});
