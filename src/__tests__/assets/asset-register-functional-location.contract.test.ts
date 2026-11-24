import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const assetPages = fs.readFileSync('src/components/modules/AssetPages.tsx', 'utf8');

describe('asset register structured Functional Location presentation', () => {
  it('searches structured location code and breadcrumb alongside asset identity', () => {
    expect(assetPages).toContain('a.functionalLocation?.locationCode?.toLowerCase().includes(q)');
    expect(assetPages).toContain('a.functionalLocation?.path?.toLowerCase().includes(q)');
  });

  it('keeps the long location hierarchy out of the list table without removing the assigned path', () => {
    const listStart = assetPages.indexOf('<Card className="border-0 shadow-sm dark:bg-card overflow-hidden">');
    const listEnd = assetPages.indexOf('<ResponsiveDialog', listStart);
    const list = assetPages.slice(listStart, listEnd);
    expect(listStart).toBeGreaterThan(-1);
    expect(listEnd).toBeGreaterThan(listStart);
    expect(list).not.toContain('<TableHead className="hidden lg:table-cell">Installed At</TableHead>');
    expect(list).not.toContain('a.functionalLocation?.pathCode');
    expect(assetPages).toContain('functionalLocationId');
  });

  it('exports the filtered register with Location Code and Asset Path under the asset export permission', () => {
    expect(assetPages).toContain("hasPermission('assets.export') || isAdmin()");
    expect(assetPages).toContain('handleExportCsv');
    expect(assetPages).toContain("'Location Code'");
    expect(assetPages).toContain("'Asset Path'");
    expect(assetPages).toContain('a.functionalLocation?.locationCode');
    expect(assetPages).toContain('a.functionalLocation?.path');
    expect(assetPages).toContain('Export CSV');
  });
});
