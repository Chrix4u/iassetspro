import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const createRoute = fs.readFileSync('src/app/api/assets/route.ts', 'utf8');
const detailRoute = fs.readFileSync('src/app/api/assets/[id]/route.ts', 'utf8');
const assetPages = fs.readFileSync('src/components/modules/AssetPages.tsx', 'utf8');

describe('asset tag contract', () => {
  it('preserves the user-entered asset tag on create and rejects duplicates', () => {
    expect(createRoute).toContain('assetTag: requestedAssetTag');
    expect(createRoute).toContain("String(requestedAssetTag || '').trim() || await generateAssetTag()");
    expect(createRoute).toContain("error: 'Asset tag already exists'");
  });

  it('allows controlled asset tag updates with uniqueness validation', () => {
    expect(detailRoute).toContain("'name', 'assetTag', 'description'");
    expect(detailRoute).toContain("error: 'Asset tag cannot be empty'");
    expect(detailRoute).toContain("assetTag: normalizedAssetTag, id: { not: id }");
  });

  it('keeps the asset register form explicit about entering the equipment code', () => {
    expect(assetPages).toContain('Asset Tag *');
    expect(assetPages).toContain('if (!form.name || !form.assetTag)');
  });
});

[executed on device: vps.lightworldtech.com (76d866a1-0f6b-4a34-8bb9-99801c5b1b24)]