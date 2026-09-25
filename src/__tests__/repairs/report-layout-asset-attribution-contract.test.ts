import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const pdf = fs.readFileSync('src/lib/generate-report-pdf.ts', 'utf8');
const repairRoute = fs.readFileSync('src/app/api/repairs/reports/route.ts', 'utf8');
const maintenanceRoute = fs.readFileSync('src/app/api/reports/maintenance/route.ts', 'utf8');
const reportPage = fs.readFileSync('src/components/modules/ReportPages.tsx', 'utf8');

describe('report layout and asset attribution contract', () => {
  it('renders reports explicitly as A4 portrait with four-up summary cards and fit-based table pagination', () => {
    expect(pdf).toContain("size: 'A4'");
    expect(pdf).toContain("layout: 'portrait'");
    expect(pdf).toContain('const CARDS_PER_ROW = 4');
    expect(pdf).not.toContain('TABLE_MAX_ROWS_PER_PAGE');
  });

  it('prints a human-readable plant label instead of the plant UUID', () => {
    expect(repairRoute).toContain('await db.plant.findUnique');
    expect(repairRoute).toContain("...(plantLabel && { plant: plantLabel })");
    expect(repairRoute).not.toContain("...(plantId && { plantId })");
  });

  it('uses canonical asset names and carries material-to-asset attribution into report data', () => {
    expect(maintenanceRoute).toContain("asset?.name || (wo.assetName && wo.assetName !== 'Unassigned'");
    expect(maintenanceRoute).toContain('assets: Set<string>');
    expect(maintenanceRoute).toContain("assets: [...m.assets].sort()");
    expect(reportPage).toContain('Assets / Machines');
    expect(reportPage).toContain('(mat.assets || []).join');
  });
});
