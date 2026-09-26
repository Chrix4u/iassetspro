import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = fs.readFileSync('src/components/modules/AssetDetailPage.tsx', 'utf8');

describe('asset installed-parts lifecycle UI', () => {
  it('loads installed parts and replacement history for the selected component', () => {
    expect(source).toContain('/installed-parts');
    expect(source).toContain('/replacements');
    expect(source).toContain('Installed Parts & Replacement History');
    expect(source).toContain('Currently Installed');
    expect(source).toContain('Installed-Part History');
    expect(source).toContain('Replacement Records');
  });

  it('keeps commissioning records separate from store stock issue and return', () => {
    expect(source).toContain("sourceType: 'commissioning'");
    expect(source).toContain('Store issue/return quantities remain controlled by work-order material reconciliation');
  });

  it('records removal through the installed-part lifecycle endpoint', () => {
    expect(source).toContain('handleRemoveInstalledPart');
    expect(source).toContain('removalReason');
    expect(source).toContain("status: 'removed'");
  });
});
