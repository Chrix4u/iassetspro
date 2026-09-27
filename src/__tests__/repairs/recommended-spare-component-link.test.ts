import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = fs.readFileSync('src/app/api/work-orders/[id]/suggested-items/route.ts', 'utf8');

describe('planner-recommended spare component linkage', () => {
  it('preserves an explicit componentRegistryId when present', () => {
    expect(source).toContain("typeof part.componentRegistryId === 'string'");
  });

  it('infers the work-order component from ComponentSparePart inventory linkage', () => {
    expect(source).toContain('tx.workOrderComponent.findFirst');
    expect(source).toContain('sparePartLinks');
    expect(source).toContain('inventoryItemId: item.id');
  });

  it('persists componentRegistryId on the technician material request', () => {
    expect(source).toContain('componentRegistryId,');
    expect(source).toContain('tx.repairMaterialRequest.create');
  });
});
