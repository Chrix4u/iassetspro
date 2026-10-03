import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('enterprise report asset/component drill-through contract', () => {
  it('navigates machine rows to asset detail and component rows to focused visual explorer', () => {
    const reports = fs.readFileSync(
      path.join(process.cwd(), 'src/components/modules/EnterpriseReports.tsx'),
      'utf8',
    );
    const detail = fs.readFileSync(
      path.join(process.cwd(), 'src/components/modules/AssetDetailPage.tsx'),
      'utf8',
    );
    const enterpriseApi = fs.readFileSync(
      path.join(process.cwd(), 'src/app/api/reports/enterprise/route.ts'),
      'utf8',
    );

    expect(reports).toContain("useNavigationStore");
    expect(reports).toContain("navigate('asset-detail', { id: asset.assetId })");
    expect(reports).toContain("navigate('asset-detail', { id: a.assetId })");
    expect(reports).toContain("navigate('asset-detail', { id: c.assetId, componentId: c.componentId })");

    expect(detail).toContain("pageParams?.componentId");
    expect(detail).toContain("pageParams.id !== id");
    expect(detail).toContain("setVisualFocusId(pageParams.componentId)");
    expect(detail).toContain("setActiveTab('visual-explorer')");

    expect(enterpriseApi).toContain("select: { id: true, name: true, assetTag: true }");
    expect(enterpriseApi).toContain("assetId: comp.asset?.id || wo.assetId || ''");
    expect(enterpriseApi).toContain("assetId: c.assetId");
  });
});
