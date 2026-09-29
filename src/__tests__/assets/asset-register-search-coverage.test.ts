import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const assetPages = fs.readFileSync('src/components/modules/AssetPages.tsx', 'utf8');

describe('asset register full-scope search coverage', () => {
  it('does not silently limit client-side search to the API default first page', () => {
    expect(assetPages).toContain("'?limit=500'");
    expect(assetPages).toContain("'?topLevelOnly=true&limit=500'");
  });

  it('keeps the register search client-side only after loading the complete scoped set', () => {
    expect(assetPages).toContain('const filteredAssets = useMemo');
    expect(assetPages).toContain('a.name.toLowerCase().includes(q)');
    expect(assetPages).toContain('a.assetTag.toLowerCase().includes(q)');
  });
});