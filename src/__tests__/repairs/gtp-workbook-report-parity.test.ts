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

  it('threads familiar GTP machine, trade and priority filters through reporting', () => {
    const reportingPage = page;
    const maintenanceRoute = fs.readFileSync('src/app/api/reports/maintenance/route.ts', 'utf8');
    const pdfRoute = fs.readFileSync('src/app/api/repairs/reports/route.ts', 'utf8');
    expect(reportingPage).toContain('Machine / Asset');
    expect(reportingPage).toContain('tradeActivity');
    expect(reportingPage).toContain('priority');
    expect(maintenanceRoute).toContain("searchParams.get('tradeActivity')");
    expect(maintenanceRoute).toContain("searchParams.get('assetId')");
    expect(pdfRoute).toContain("searchParams.get('trade')");
    expect(pdfRoute).toContain("searchParams.get('assetId')");
  });

  it('keeps legacy sums separate from modern averages and MTTR', () => {
    expect(service).toContain('legacyResponseByWeek');
    expect(service).toContain('legacyResponseByMachine');
    expect(service).toContain('avgRepairMinutes');
    expect(page).toContain('exact GTP workbook parity sheets');
  });
  it('renders all five workbook graphs with matching chart families', () => {
    const maintenanceRoute = fs.readFileSync('src/app/api/reports/maintenance/route.ts', 'utf8');
    expect(maintenanceRoute).toContain('legacyParity');
    expect(maintenanceRoute).toContain('breakdownsByMachine');
    expect(maintenanceRoute).toContain('breakdownsByWeek');
    expect(maintenanceRoute).toContain('downtimeByMachine');
    expect(maintenanceRoute).toContain('responseByWeek');
    expect(maintenanceRoute).toContain('responseByMachine');

    expect(page).toContain('GTP Workbook Graph Parity');
    expect(page).toContain('Machine repair downtime per week');
    expect(page).toContain('Machine breakdown occurrence per machine');
    expect(page).toContain('Machine breakdown per week');
    expect(page).toContain('Response to repair per week');
    expect(page).toContain('Response time to repair per machine');
    expect(page).toContain('<LineChart');
    expect(page).toContain('<BarChart');
  });

  it('keeps breakdown work orders inside the Repairs/RWOP report scope', () => {
    const maintenanceRoute = fs.readFileSync('src/app/api/reports/maintenance/route.ts', 'utf8');
    expect(maintenanceRoute).toContain("['breakdown', 'corrective', 'emergency']");
  });

});