import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = fs.readFileSync('src/components/modules/AssetDetailPage.tsx', 'utf8');

describe('Asset Digital Twin embedded viewer', () => {
  it('renders the interactive viewer inside the asset detail tab', () => {
    expect(source).toContain("import { DigitalTwinViewer } from '@/components/digital-twin/DigitalTwinViewer'");
    expect(source).toContain('<DigitalTwinViewer');
    expect(source).toContain('assetId={asset.id}');
    expect(source).toContain('twinId={twin.id}');
    expect(source).toContain('twinName={twin.name}');
    expect(source).toContain('height="460px"');
    expect(source).toContain('showToolbar');
  });

  it('advertises in-place 3D and engineering projections', () => {
    expect(source).toContain('Interactive Digital Twin');
    expect(source).toContain('front, top and side engineering projections');
  });
});
