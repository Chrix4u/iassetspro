import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const inventory = readFileSync('src/app/api/inventory/route.ts', 'utf8');
const tools = readFileSync('src/app/api/tools/route.ts', 'utf8');

describe('inventory/tool resource query shapes', () => {
  it('keeps Inventory lookup select separate from workspace include', () => {
    expect(inventory).toContain('const items = isLookup');
    expect(inventory).toContain('? await db.inventoryItem.findMany({');
    expect(inventory).toContain(': await db.inventoryItem.findMany({');
    expect(inventory).not.toContain('...(isLookup');
    expect(inventory).toContain('unitOfMeasure: true');
  });

  it('keeps Tool lookup select separate from registry includes', () => {
    expect(tools).toContain('const toolsPromise = isLookup');
    expect(tools).toContain('? db.tool.findMany({');
    expect(tools).toContain(': db.tool.findMany({');
    expect(tools).not.toContain('...(isLookup');
    expect(tools).toContain('assignedToId: true');
  });

  it('preserves canonical plant scoping for both resources', () => {
    expect(inventory).toContain('Object.assign(where, getPlantFilterWhere(plantScope))');
    expect(tools).toContain('Object.assign(where, plantFilter)');
  });
});
