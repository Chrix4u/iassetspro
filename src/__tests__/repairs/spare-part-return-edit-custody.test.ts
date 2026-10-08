import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const route = fs.readFileSync('src/app/api/repairs/spare-part-returns/[id]/route.ts', 'utf8');

describe('spare-part return edit custody', () => {
  it('does not let an edit change quantity after material custody was accounted', () => {
    expect(route).toContain('if (body.quantity !== undefined && existing.materialRequestId)');
    expect(route).toContain('Quantity cannot be changed after material custody has been accounted');
  });

  it('still validates a manually-created return quantity before it can later credit stock', () => {
    expect(route).toContain("const nextQuantity = Number(updateData.quantity)");
    expect(route).toContain("!Number.isFinite(nextQuantity) || nextQuantity <= 0");
    expect(route).toContain("quantity must be greater than zero");
    expect(route).toContain('updateData.quantity = nextQuantity');
  });

  it('preserves the material request component as authoritative during edits', () => {
    expect(route).toContain("materialRequest: { select: { componentRegistryId: true } }");
    expect(route).toContain('existing.materialRequest?.componentRegistryId');
    expect(route).toContain('nextComponentId !== existing.materialRequest.componentRegistryId');
    expect(route).toContain('Component does not match the linked material request');
  });
});
