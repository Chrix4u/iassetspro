import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const route = fs.readFileSync('src/app/api/repairs/spare-part-returns/[id]/route.ts', 'utf8');

describe('spare-part return edit integrity', () => {
  it('keeps component edits on the linked work-order asset', () => {
    expect(route).toContain("workOrder: { select: { plantId: true, assetId: true } }");
    expect(route).toContain("if (updateData.componentId !== undefined)");
    expect(route).toContain("select: { id: true, assetId: true }");
    expect(route).toContain('component.assetId !== existing.workOrder?.assetId');
    expect(route).toContain('Component belongs to a different asset than the work order');
  });

  it('records true pre-edit values in the audit log', () => {
    expect(route).toContain('const oldValues: Record<string, unknown> = {}');
    expect(route).toContain("oldValues[field] = existingRecord[field]");
    expect(route).toContain('oldValues,');
    expect(route).not.toContain('oldValues: { ...updateData }');
  });
});
