import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Asset Detail Manage Parts empty-BOM contract', () => {
  it('keeps selected component store linkage visible even when no legacy BOM rows exist', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'src/components/modules/AssetDetailPage.tsx'),
      'utf8',
    );

    expect(source).toContain("setActiveTab('bom')");
    expect(source).toContain(
      'bomItems.length === 0 && bomAsChild.length === 0 && !selectedComponentId',
    );
    expect(source).toContain('id="component-store-linkage"');
  });
});
