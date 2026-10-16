import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const assetPages = fs.readFileSync('src/components/modules/AssetPages.tsx', 'utf8');

describe('asset register structured Functional Location presentation', () => {
  it('searches structured location code and breadcrumb alongside asset identity', () => {
    expect(assetPages).toContain('a.functionalLocation?.locationCode?.toLowerCase().includes(q)');
    expect(assetPages).toContain('a.functionalLocation?.path?.toLowerCase().includes(q)');
  });

  it('prefers the coded structured path in the register location column with legacy fallback', () => {
    expect(assetPages).toContain('Installed At');
    expect(assetPages).toContain("a.functionalLocation?.pathCode || a.location || '-'");
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
