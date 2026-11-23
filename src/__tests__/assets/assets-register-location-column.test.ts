import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const assetsPage = readFileSync('src/components/modules/AssetPages.tsx', 'utf8');
const assetDetails = readFileSync('src/components/modules/AssetDetailPage.tsx', 'utf8');

const tableStart = assetsPage.indexOf('<Card className="border-0 shadow-sm dark:bg-card overflow-hidden">');
const tableEnd = assetsPage.indexOf('<ResponsiveDialog', tableStart);
const assetRegister = assetsPage.slice(tableStart, tableEnd);

describe('Assets register: compact columns and location detail', () => {
  it('removes installation path from the machine list without losing other columns', () => {
    expect(tableStart).toBeGreaterThan(-1);
    expect(tableEnd).toBeGreaterThan(tableStart);
    expect(assetRegister).toContain('<TableHead>Asset Tag</TableHead>');
    expect(assetRegister).toContain('<TableHead>Name</TableHead>');
    expect(assetRegister).toContain('<TableHead>Status</TableHead>');
    expect(assetRegister).toContain('<TableHead className="w-10">Actions</TableHead>');
    expect(assetRegister).not.toContain('<TableHead className="hidden lg:table-cell">Installed At</TableHead>');
    expect(assetRegister).not.toContain('a.functionalLocation?.pathCode');
    expect(assetRegister).toContain('<TableCell colSpan={8}');
  });

  it('retains search, CSV location fields, functional-location assignment and asset-detail path', () => {
    expect(assetsPage).toContain('matchesFunctionalLocation');
    expect(assetsPage).toContain("'Asset Path'");
    expect(assetsPage).toContain('functionalLocationId');
    expect(assetDetails).toContain('Installed At / Asset Path');
    expect(assetDetails).toContain('/api/functional-locations/');
  });
});
