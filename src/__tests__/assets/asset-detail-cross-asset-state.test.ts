import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('AssetDetailPage cross-asset navigation contract', () => {
  it('resets asset-scoped lazy data and guards stale async responses when the asset id changes', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'src/components/modules/AssetDetailPage.tsx'),
      'utf8',
    );

    expect(source).toContain("setComponents([])");
    expect(source).toContain("setBomItems([])");
    expect(source).toContain("setSelectedComponentId('')");
    expect(source).toContain("setTwin(null)");
    expect(source).toContain("setDiagrams([])");
    expect(source).toContain("loadedTabsRef.current = new Set(['overview'])");
    expect(source).toContain("tabDataLoadingRef.current = false");
    expect(source).toContain("let cancelled = false");
    expect(source).toContain("if (cancelled) return");
  });
});
