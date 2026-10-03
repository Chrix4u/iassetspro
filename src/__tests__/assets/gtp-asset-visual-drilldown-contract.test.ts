import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('GTP asset visual drilldown contract', () => {
  it('lets the asset component register focus the exact hierarchy node in Visual Explorer', () => {
    const assetDetail = fs.readFileSync(
      path.join(process.cwd(), 'src/components/modules/AssetDetailPage.tsx'),
      'utf8',
    );
    const explorer = fs.readFileSync(
      path.join(process.cwd(), 'src/components/digital-twin/MachineVisualExplorer.tsx'),
      'utf8',
    );

    expect(assetDetail).toContain("const [visualFocusId, setVisualFocusId] = useState<string | null>(null)");
    expect(assetDetail).toContain("setVisualFocusId(c.id)");
    expect(assetDetail).toContain("setActiveTab('visual-explorer')");
    expect(assetDetail).toContain("initialComponentId={visualFocusId}");
    expect(assetDetail).toContain("componentDepth(c)");
    expect(assetDetail).toContain("↳");

    expect(explorer).toContain("initialComponentId = null");
    expect(explorer).toContain("useState<string | null>(initialComponentId)");
    expect(explorer).toContain("setSelectedId(initialComponentId)");
  });
});
