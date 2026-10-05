import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

describe('reliability optional-asset plant authorization', () => {
  it('guards every explicit degradation asset operation', () => {
    const source = read('src/app/api/reliability/degradation/route.ts');
    expect(source.match(/authorizeAssetPlant\(request, session, assetId\)/g)?.length).toBeGreaterThanOrEqual(3);
    expect(source).toContain('authorizeAssetPlant(request, session, listAssetId)');
  });

  it.each([
    'src/app/api/reliability/rbi/route.ts',
    'src/app/api/reliability/sil/route.ts',
  ])('%s guards optional list asset filters and POST asset IDs', (path) => {
    const source = read(path);
    expect(source).toContain('authorizeAssetPlant(request, session, listAssetId)');
    expect(source).toContain('authorizeAssetPlant(request, session, assetId)');
  });

  it('guards lifecycle views, optional asset filters, POST, and explicit CAPEX plant IDs', () => {
    const source = read('src/app/api/reliability/lifecycle/route.ts');
    expect(source.match(/authorizeAssetPlant\(request, session, assetId\)/g)?.length).toBeGreaterThanOrEqual(4);
    expect(source).toContain('authorizeAssetPlant(request, session, listAssetId)');
    expect(source).toContain('canAccessPlantStrict(assetScope.plantScope, plantId)');
  });
});
