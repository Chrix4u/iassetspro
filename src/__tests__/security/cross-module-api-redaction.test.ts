import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

describe('cross-module API redaction contracts', () => {
  const woList = read('src/app/api/work-orders/route.ts');
  const woDetail = read('src/app/api/work-orders/[id]/route.ts');
  const mrDetail = read('src/app/api/maintenance-requests/[id]/route.ts');
  const conditionApi = read('src/app/api/component-registry/[id]/condition/route.ts');
  const kpiApi = read('src/app/api/reporting/kpis/route.ts');

  it('redacts disabled modules from work-order list payloads', () => {
    expect(woList).toContain("getUnavailableOperationalModules([");
    expect(woList).toContain("'maintenance_requests'");
    expect(woList).toContain("'pm_schedules'");
    expect(woList).toContain("'assets'");
    expect(woList).toContain('redacted.maintenanceRequest = null');
    expect(woList).toContain('redacted.pmSchedule = null');
    expect(woList).toContain('redacted.assetId = null');
    expect(woList).toContain('workOrderComponents: 0');
  });

  it('redacts unavailable embedded resources from work-order detail payloads', () => {
    expect(woDetail).toContain("'repairs'");
    expect(woDetail).toContain("'inventory'");
    expect(woDetail).toContain("'tools'");
    expect(woDetail).toContain('redacted.repairMaterialRequests = []');
    expect(woDetail).toContain('redacted.repairToolRequests = []');
    expect(woDetail).toContain("redacted.suggestedParts = '[]'");
    expect(woDetail).toContain("redacted.suggestedTools = '[]'");
    expect(woDetail).toContain('redacted.workOrderComponents = []');
  });

  it('redacts Asset and Work Order embeds from maintenance-request details', () => {
    expect(mrDetail).toContain("getUnavailableOperationalModules([");
    expect(mrDetail).toContain("'assets'");
    expect(mrDetail).toContain("'work_orders'");
    expect(mrDetail).toContain('redacted.asset = null');
    expect(mrDetail).toContain('redacted.assetId = null');
    expect(mrDetail).toContain('redacted.workOrder = null');
    expect(mrDetail).toContain('redacted.workOrderId = null');
  });

  it('uses Condition Monitoring RBAC instead of Digital Twin RBAC', () => {
    expect(conditionApi).toContain("hasPermission(session, 'condition_monitoring.view')");
    expect(conditionApi).toContain("hasPermission(session, 'condition_monitoring.manage')");
    expect(conditionApi).not.toContain("hasPermission(session, 'digital_twin.view')");
    expect(conditionApi).not.toContain("hasPermission(session, 'digital_twin.manage')");
  });

  it('gates KPI metrics by the modules their calculations actually read', () => {
    expect(kpiApi).toContain("dashboard: ['kpi_dashboard', 'oee', 'work_orders', 'failure_analysis', 'pm_schedules']");
    expect(kpiApi).toContain("oee: ['oee', 'work_orders']");
    expect(kpiApi).toContain("reliability: ['failure_analysis', 'work_orders', 'pm_schedules']");
    expect(kpiApi).toContain("backlog: ['work_orders']");
    expect(kpiApi).toContain('getUnavailableOperationalModules(requiredModules)');
  });
});
