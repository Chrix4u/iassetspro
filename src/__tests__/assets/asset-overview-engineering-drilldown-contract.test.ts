import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('asset overview engineering drilldown contract', () => {
  it('separates BOM, component registry, and visual exploration entry points', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'src/components/modules/AssetDetailPage.tsx'),
      'utf8',
    );

    expect(source).toContain('Bill of materials');
    expect(source).toContain("setActiveTab('components')");
    expect(source).toContain('registered node(s)');
    expect(source).toContain("setActiveTab('visual-explorer')");
    expect(source).toContain('2D, exploded & hierarchy drilldown');
  });
});
