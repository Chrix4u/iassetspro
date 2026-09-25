import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const read = (path: string) => fs.readFileSync(path, 'utf8');

describe('RWOP analytics and report permission boundaries', () => {
  const pageAccess = read('src/lib/page-access.ts');
  const kpi = read('src/app/api/repairs/kpi/route.ts');
  const reconciliation = read('src/app/api/repairs/material-requests/reconciliation-report/route.ts');
  const detailed = read('src/app/api/repairs/reports/detailed/route.ts');
  const reports = read('src/app/api/repairs/reports/route.ts');

  it('hides Repairs Analytics unless the actor has the dashboard capability', () => {
    expect(pageAccess).toContain("'repairs-analytics': ['work_orders.dashboard']");
    expect(pageAccess).not.toContain("'repairs-analytics': ['work_orders.view', 'work_orders.view_own']");
  });

  it('uses the same dashboard permission on the KPI and reconciliation APIs', () => {
    expect(kpi).toContain("hasPermission(session, 'work_orders.dashboard')");
    expect(reconciliation).toContain("hasPermission(session, 'work_orders.dashboard')");
    expect(kpi).not.toContain("hasRole(session, 'maintenance_manager')");
  });

  it('keeps Repairs Reports pages behind reports.view rather than generic work-order access', () => {
    expect(pageAccess).toContain("'repairs-reports': ['reports.view']");
    expect(pageAccess).toContain("'repairs-detail-report': ['reports.view']");
    expect(reports).toContain("hasPermission(session, 'reports.view')");
    expect(reports).not.toContain("hasRole(session, 'maintenance_manager')");
  });

  it('uses Ghana cedi labels for specialized Repairs PDF cost metrics', () => {
    expect(reports).toContain('GHS ${data.summary.totalMaterialCost.toLocaleString()}');
    expect(reports).toContain('GHS ${data.summary.totalProductionLoss.toLocaleString()}');
    expect(reports).toContain('GHS ${data.summary.totalRepairCost.toLocaleString()}');
    expect(reports).not.toContain('`${data.summary.totalMaterialCost.toLocaleString()}`');
  });

  it('requires reports.export for PDF generation on the standard Repairs report route', () => {
    expect(reports).toContain("format === 'pdf'");
    expect(reports).toContain("hasPermission(session, 'reports.export')");
    expect(reports).toContain('Insufficient permissions: reports.export required');
  });

  it('requires report view permission for detailed repair reports', () => {
    expect(detailed).toContain("hasPermission(session, 'reports.view')");
    expect(detailed).toContain('Insufficient permissions: reports.view required');
  });

  it('requires report export permission before detailed XLSX generation', () => {
    expect(detailed).toContain("format === 'xlsx'");
    expect(detailed).toContain("hasPermission(session, 'reports.export')");
    expect(detailed).toContain('Insufficient permissions: reports.export required');
  });
});
