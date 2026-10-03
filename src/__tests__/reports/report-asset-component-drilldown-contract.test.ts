import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('enterprise report asset/component drilldown contract', () => {
  it('carries asset identity for component costs and routes reports into focused asset detail', () => {
    const apiRoute = fs.readFileSync(
      path.join(process.cwd(), 'src/app/api/reports/enterprise/route.ts'),
      'utf8',
    );
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

    expect(apiRoute).toContain("asset: { select: { id: true, name: true, assetTag: true } }");
    expect(apiRoute).toContain("assetId: comp.asset?.id || wo.assetId || ''");
    expect(apiRoute).toContain("assetId: c.assetId");

    expect(reports).toContain("useNavigationStore");
    expect(reports).toContain("openAsset");
    expect(reports).toContain("componentId, tab: 'visual-explorer'");
    expect(reports).toContain("openAsset(c.assetId, c.componentId)");

    expect(assets).toContain("initialComponentId={pageParams?.componentId || null}");
    expect(assets).toContain("initialTab={pageParams?.tab || 'overview'}");
    expect(detail).toContain("initialComponentId = null");
    expect(detail).toContain("initialTab = 'overview'");
  });
});
