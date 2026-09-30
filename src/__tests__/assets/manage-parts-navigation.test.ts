import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const detail = fs.readFileSync('src/components/modules/AssetDetailPage.tsx', 'utf8');

describe('component Manage Parts navigation', () => {
  it('moves from Components to the BOM store-linkage panel', () => {
    expect(detail).toContain("loadComponentSpareParts(c.id);");
    expect(detail).toContain("setActiveTab('bom');");
    expect(detail).toContain("document.getElementById('component-store-linkage')");
  });

  it('gives the target linkage card a stable scroll anchor', () => {
    expect(detail).toContain('id="component-store-linkage"');
    expect(detail).toContain('Component Spare Parts & Store Linkage');
  });
});
