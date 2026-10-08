import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const route = fs.readFileSync('src/app/api/repairs/spare-part-returns/route.ts', 'utf8');

describe('spare-part return component integrity', () => {
  it('rejects a component that is not on the linked work order asset', () => {
    expect(route).toContain("select: { id: true, assetId: true }");
    expect(route).toContain('assetId: true');
    expect(route).toContain('woNumber: true');
    expect(route).toContain('plantId: true');
    expect(route).toContain('component.assetId !== wo.assetId');
    expect(route).toContain('Component belongs to a different asset than the work order');
  });
});
