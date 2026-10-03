import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('GTP report to asset/component drilldown contract', () => {
  it('links report asset rows and component rows back into the exact machine context', () => {
    const reports = fs.readFileSync(
      path.join(process.cwd(), 'src/components/modules/EnterpriseReports.tsx'),
      'utf8',
    );
    const assets = fs.readFileSync(
      path.join(process.cwd(), 'src/components/modules/AssetPages.tsx'),
      'utf8',
    );
    const detail = fs.readFileSync(
      path.join(process.cwd(), 'src/components/modules/AssetDetailPage.tsx'),
      'utf8',
    );
    const enterpriseRoute = fs.readFileSync(
      path.join(process.cwd(), 'src/app/api/reports/enterprise/route.ts'),
      'utf8',
    );

    expect(reports).toContain("navigate('asset-detail', { id: asset.assetId })");
    expect(reports).toContain("navigate('asset-detail', { id: a.assetId })");
    expect(reports).toContain("navigate('asset-detail', { id: c.assetId, componentId: c.componentId, tab: 'visual-explorer' })");

    expect(assets).toContain("initialTab={pageParams?.tab || 'overview'}");
    expect(assets).toContain("initialComponentId={pageParams?.componentId || null}");
    expect(assets).toContain("if (currentPage === 'asset-detail') goBack()");

    expect(detail).toContain("initialTab = 'overview'");
    expect(detail).toContain("initialComponentId = null");
    expect(detail).toContain("setActiveTab(initialTab)");
    expect(detail).toContain("setVisualFocusId(initialComponentId)");

    expect(enterpriseRoute).toContain("assetId: comp.assetId || wo.assetId || ''");
    expect(enterpriseRoute).toContain("assetId: c.assetId || null");
  });
});
