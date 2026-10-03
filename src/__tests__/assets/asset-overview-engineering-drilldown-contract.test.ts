import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('asset overview engineering drilldown', () => {
  it('separates BOM, components and visual explorer shortcuts', () => {
    const source = fs.readFileSync('src/components/modules/AssetDetailPage.tsx', 'utf8');
    expect(source).toContain('Bill of materials');
    expect(source).toContain("setActiveTab('components')");
    expect(source).toContain('registered node(s)');
    expect(source).toContain("setActiveTab('visual-explorer')");
    expect(source).toContain('2D, exploded & hierarchy drilldown');
  });
});
