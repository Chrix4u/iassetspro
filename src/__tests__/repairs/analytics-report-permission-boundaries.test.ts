import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const read = (path: string) => fs.readFileSync(path, 'utf8');

describe('RWOP analytics and report permission boundaries', () => {
  const pageAccess = read('src/lib/page-access.ts');
  const kpi = read('src/app/api/repairs/kpi/route.ts');
  const reconciliation = read('src/app/api/repairs/material-requests/reconciliation-report/route.ts');
  const detailed = read('src/app/api/repairs/reports/detailed/route.ts');

  it('hides Repairs Analytics unless the actor has the dashboard capability', () => {
    expect(pageAccess).toContain("'repairs-analytics': ['work_orders.dashboard']");
    expect(pageAccess).not.toContain("'repairs-analytics': ['work_orders.view', 'work_orders.view_own']");
  });

  it('uses the same dashboard permission on the KPI and reconciliation APIs', () => {
    expect(kpi).toContain("hasPermission(session, 'work_orders.dashboard')");
    expect(reconciliation).toContain("hasPermission(session, 'work_orders.dashboard')");
    expect(kpi).not.toContain("hasRole(session, 'maintenance_manager')");
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
