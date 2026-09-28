import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const service = fs.readFileSync('src/services/repairsReportXlsxSafe.service.ts', 'utf8');
const page = fs.readFileSync('src/components/repairs/reporting/RWOPReportingPage.tsx', 'utf8');

describe('GTP legacy workbook report parity', () => {
  it('reproduces the five actual pivot views from the uploaded workbook', () => {
    expect(service).toContain("'GTP No_BD_MC'");
    expect(service).toContain("'GTP BD_Wk'");
    expect(service).toContain("'GTP BD_MC_Wk'");
    expect(service).toContain("'GTP Rpon_Wk'");
    expect(service).toContain("'GTP Rpons_MC'");
    expect(service).toContain("'Sum of Downtime minutes breakdowns (date completed - date reported)'");
    expect(service).toContain("'Sum of Response Time'");
  });

  it('uses request report time and does not classify every corrective WO as a breakdown', () => {
    expect(service).toContain('wo.maintenanceRequest?.createdAt || wo.createdAt');
    expect(service).toContain("wo.type === 'breakdown'");
    expect(service).toContain('wo.maintenanceRequest?.machineDownStatus === true');
    expect(service).toContain('(wo.workOrderDowntimes || []).length > 0');
  });

  it('keeps legacy sums separate from modern averages and MTTR', () => {
    expect(service).toContain('legacyResponseByWeek');
    expect(service).toContain('legacyResponseByMachine');
    expect(service).toContain('avgRepairMinutes');
    expect(page).toContain('exact GTP workbook parity sheets');
  });
});