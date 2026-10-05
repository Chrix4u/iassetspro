import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const route = readFileSync(join(process.cwd(), 'src/app/api/work-orders/route.ts'), 'utf8');

describe('work order planner-suggested part units', () => {
  it('uses InventoryItem.unitOfMeasure as the PostgreSQL fallback', () => {
    expect(route).toContain("unit: part.unit || invItem?.unitOfMeasure || 'each'");
    expect(route.match(/unit: invItem\.unitOfMeasure \|\| 'each'/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it('does not use the removed InventoryItem.unit field', () => {
    expect(route).not.toContain('invItem?.unit ||');
    expect(route).not.toContain('invItem.unit ||');
  });

  it('propagates the resolved unit into repair material requests', () => {
    expect(route).toContain('unit: entry.unit,');
  });
});
