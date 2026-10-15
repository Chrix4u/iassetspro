import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

function read(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

describe('historical maintenance location search and reporting', () => {
  const mrRoute = read('src/app/api/maintenance-requests/route.ts');
  const woRoute = read('src/app/api/work-orders/route.ts');
  const maintenanceReport = read('src/app/api/reports/maintenance/route.ts');
  const workOrderReport = read('src/app/api/work-orders/reports/route.ts');
  const printRoute = read('src/app/api/work-orders/[id]/print/route.ts');
  const closedPackRoute = read('src/app/api/work-orders/[id]/closed-pack/route.ts');
  const detailPdf = read('src/lib/generate-wo-detail-pdf.ts');
  const closedPackPdf = read('src/lib/generate-closed-wo-pack.ts');

  it('searches frozen location name, code and path in MR and WO lists without replacing live search', () => {
    for (const route of [mrRoute, woRoute]) {
      expect(route).toContain('functionalLocationNameSnapshot');
      expect(route).toContain('functionalLocationCodeSnapshot');
      expect(route).toContain('functionalLocationPathSnapshot');
      expect(route).toContain('functionalLocationPathCodeSnapshot');
      expect(route).toContain('findAssetIdsByLiveLocationSearch(search)');
    }
  });

  it('filters historical reports by frozen subtree and only uses current assignments for unsnapshotted rows', () => {
    for (const report of [maintenanceReport, workOrderReport]) {
      expect(report).toContain('getFunctionalLocationSubtreeIds');
      expect(report).toContain('functionalLocationIdSnapshot: { in: locationIds }');
      expect(report).toContain('functionalLocationSourceSnapshot: null');
      expect(report).toContain('functionalLocationIdSnapshot: null');
      expect(report).toContain('assetId: { in: currentLocationAssetIds }');
    }
  });

  it('resolves report output snapshot-first while retaining live fallback for old rows', () => {
    for (const report of [maintenanceReport, workOrderReport]) {
      expect(report).toContain('getMaintenanceLocationSnapshot');
      expect(report).toContain('functionalLocationCode: maintenanceLocation?.locationCode ?? null');
      expect(report).toContain('functionalLocationPath: maintenanceLocation?.path || preferredLocation');
      expect(report).toContain('functionalLocationPathCode: maintenanceLocation?.pathCode || preferredLocation');
    }
  });

  it('passes frozen maintenance location into normal WO print and Closed WO Pack data', () => {
    for (const route of [printRoute, closedPackRoute]) {
      expect(route).toContain('getMaintenanceLocationSnapshot');
      expect(route).toContain('maintenanceLocation');
    }
    expect(detailPdf).toContain("['Maintenance Location:'");
    expect(detailPdf).toContain("['Location Code:'");
    expect(closedPackPdf).toContain("['Maintenance Location:'");
    expect(closedPackPdf).toContain("['Location Code:'");
  });
});
