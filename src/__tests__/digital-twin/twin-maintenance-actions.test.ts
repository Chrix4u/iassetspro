import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const panel = fs.readFileSync(
  'src/components/digital-twin/ComponentInfoPanel.tsx',
  'utf8',
);
const maintenance = fs.readFileSync(
  'src/components/modules/MaintenancePages.tsx',
  'utf8',
);
const assetDetail = fs.readFileSync(
  'src/components/modules/AssetDetailPage.tsx',
  'utf8',
);

describe('digital twin maintenance actions', () => {
  it('uses real EAM navigation for twin quick actions', () => {
    expect(panel).toContain(
      "navigate('maintenance-work-orders', { create: 'true', assetId })",
    );
    expect(panel).toContain(
      "navigate('maintenance-requests', { create: 'true', assetId })",
    );
    expect(panel).toContain(
      "navigate('asset-detail', { id: assetId, tab: 'diagrams' })",
    );
    expect(panel).toContain(
      "navigate('maintenance-work-orders', { id: String(wo.id) })",
    );
  });

  it('does not present fabricated spare-stock or tool-availability data', () => {
    expect(panel).not.toContain('Bearing Assembly');
    expect(panel).not.toContain('Seal Kit - Primary');
    expect(panel).not.toContain('Torque Wrench (50-200 Nm)');
    expect(panel).not.toContain('Vibration Analyzer');
    expect(panel).toContain('does not invent stock or availability');
  });

  it('opens create forms from navigation parameters with the selected asset prefilled', () => {
    expect(maintenance).toContain("pageParams?.create === 'true'");
    expect(maintenance).toContain("pageParams.create === 'true'");
    expect(
      maintenance.match(/initialAssetId=\{pageParams\?\.assetId\}/g)?.length,
    ).toBe(2);
    expect(maintenance).toContain(
      'const [assetId, setAssetId] = useState(initialAssetId);',
    );
    expect(maintenance).toContain('assetId: initialAssetId');
  });

  it('shows the embedded twin info panel and supports direct tab deep links', () => {
    expect(assetDetail).toContain('showInfoPanel');
    expect(assetDetail).not.toContain('showInfoPanel={false}');
    expect(assetDetail).toContain('const requestedTab = pageParams.tab');
    expect(assetDetail).toContain('setActiveTab(requestedTab)');
  });
});
