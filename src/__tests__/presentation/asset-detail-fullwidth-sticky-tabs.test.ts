import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('asset detail full viewport layout', () => {
  it('uses a full-width sheet and keeps only the tab bar sticky', () => {
    const assets = fs.readFileSync('src/components/modules/AssetPages.tsx', 'utf8');
    const detail = fs.readFileSync('src/components/modules/AssetDetailPage.tsx', 'utf8');

    expect(assets).toContain('!w-screen !max-w-none');
    expect(assets).toContain('h-dvh overflow-y-auto overflow-x-hidden p-0 gap-0');

    expect(detail).toContain('sticky top-0 z-30');
    expect(detail).toContain('bg-background/95 backdrop-blur');
    expect(detail).not.toContain('max-h-[calc(100vh-14rem)]');
    expect(detail).not.toContain("import { ScrollArea } from '@/components/ui/scroll-area'");
  });
});
