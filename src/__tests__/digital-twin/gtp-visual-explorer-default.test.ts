import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('GTP Visual Explorer default mode contract', () => {
  it('opens on an immediately useful engineering view when no realistic asset image exists', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'src/components/digital-twin/MachineVisualExplorer.tsx'),
      'utf8',
    );
    const assetDetail = fs.readFileSync(
      path.join(process.cwd(), 'src/components/modules/AssetDetailPage.tsx'),
      'utf8',
    );

    expect(source).toContain("useState(asset.imageUrl ? 'realistic' : 'diagram')");
    expect(source).toContain("setMode(asset.imageUrl ? 'realistic' : 'diagram')");
    expect(source).toContain("value="diagram"");
    expect(source).toContain("EngineeringSchematic");
    expect(assetDetail).toContain("<p className=\"text-xs font-medium\">Visual Explorer</p>");
    expect(assetDetail).toContain("setActiveTab('visual-explorer')");
    expect(assetDetail).toContain("api.post('/api/ai/generate-3d'");
    expect(assetDetail).toContain("provider3d: 'programmatic'");
    expect(assetDetail).toContain("'Generate 3D Twin'");
    expect(assetDetail).toContain("'Regenerate 3D Model'");
  });
});
