import { test, expect } from '@playwright/test';
import { authenticateAs } from './helpers/auth';
import { expectFailure, getToken, lookupPlantId } from './helpers/api';

test.describe('Repairs Reports & Analytics', () => {
  test('renders graphical and tabular lifecycle reporting with export actions', async ({ page, context }) => {
    await authenticateAs(context, 'planner');
    await page.goto('/');
    await expect(page.getByText('UAT Planner', { exact: true }).first()).toBeVisible({ timeout: 20_000 });

    await page.route('**/api/reports/maintenance?**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            summary: {
              totalWOs: 3,
              completedWOs: 1,
              completionRate: 33.3,
              avgCompletionHours: 8.5,
              totalCost: 1250,
              overdueWOs: 0,
              slaComplianceRate: 100,
              openWOs: 2,
            },
            woByType: [
              { type: 'corrective', count: 2 },
              { type: 'preventive', count: 1 },
            ],
            woByStatus: [
              { status: 'closed', count: 1 },
              { status: 'in_progress', count: 2 },
            ],
            backlogAging: {
              totalOpen: 2,
              overdueOpen: 1,
              avgOpenAgeDays: 4.5,
              oldestOpenDays: 7,
              buckets: [{ bucket: '4-7 days', count: 2 }],
            },
            responseAndSla: {
              avgResponseHours: 1.5,
              avgEmergencyResponseHours: 0.75,
              avgPlannerClosureLagHours: 2,
              slaComplianceRate: 100,
              slaBreachedWOs: 0,
              overdueOpen: 1,
            },
            monthlyOperationalTrends: [
              { month: '2026-09', opened: 3, completed: 1, closed: 1, emergency: 1, totalCost: 1250, downtimeMinutes: 180, productionLoss: 500 },
            ],
            assetReliability: [
              { assetId: 'asset-1', assetName: 'Main Conveyor', assetTag: 'CONV-01', criticality: 'high', failureCount: 2, repeatFailure: true, mtbfDays: 12, mttrHours: 4.5, downtimeMinutes: 180, productionLoss: 500, totalCost: 900 },
            ],
            costAnalysis: {
              recordedMaintenanceCost: 1250,
              laborCost: 400,
              materialCost: 700,
              toolUsageCost: 50,
              damagedToolRepairCost: 25,
              sparePartRefurbishmentCost: 75,
              downtimeProductionLoss: 500,
              trackedEconomicImpact: 1850,
              avgRecordedCostPerWo: 416.67,
            },
            resourceFlow: {
              materials: { totalRequests: 4, pendingRequests: 1, issuedRequests: 3, pendingReconciliation: 1, avgIssueHours: 2.5, wasteCost: 20, returnValue: 60 },
              tools: { totalRequests: 3, pendingRequests: 0, issuedRequests: 3, outstandingCustody: 1, returnedRequests: 2, avgIssueHours: 1.25 },
              assistance: { totalRequests: 2, pending: 1, approved: 1, rejected: 0, cancelled: 0, avgReviewHours: 0.5 },
              handovers: { total: 1, pending: 0, confirmed: 1 },
            },
            returnsAndDamage: {
              spareParts: { totalReturns: 2, pending: 1, returnedToStore: 1, disposed: 0, refurbishmentNeeded: 1, refurbishmentCost: 75 },
              damagedTools: { totalReports: 1, openReports: 1, repaired: 0, writtenOff: 0, criticalDamage: 1, repairCost: 25 },
            },
            closureCompliance: {
              eligibleWOs: 1,
              compliantWOs: 1,
              complianceRate: 100,
              missingRca: 0,
              awaitingSupervisorApproval: 0,
              awaitingPlannerClosure: 0,
              reworkWOs: 0,
              totalReworkInstances: 0,
            },
            exceptionWatchlist: [
              { id: 'wo-report-002', woNumber: 'WO-REPORT-002', title: 'Pump seal leakage', assetName: 'Process Pump', priority: 'critical', status: 'in_progress', ageDays: 4.5, pendingMaterials: 1, outstandingTools: 1, pendingAssistance: 1, pendingHandovers: 0, downtimeMinutes: 180, riskLevel: 'high', reasons: ['Critical priority', '1 material request(s) pending'] },
            ],
            recentWorkOrders: [
              {
                id: 'wo-report-001',
                woNumber: 'WO-REPORT-001',
                title: 'Conveyor bearing noise',
                type: 'corrective',
                priority: 'high',
                status: 'closed',
                totalCost: 850,
              },
              {
                id: 'wo-report-002',
                woNumber: 'WO-REPORT-002',
                title: 'Pump seal leakage',
                type: 'corrective',
                priority: 'critical',
                status: 'in_progress',
                totalCost: 400,
              },
            ],
          },
        }),
      });
    });

    await page.evaluate(() => {
      const state = { eam_nav: true, page: 'repairs-reports', params: {} };
      window.history.pushState(state, '', '#/repairs-reports');
      window.dispatchEvent(new PopStateEvent('popstate', { state }));
    });

    await expect(page.getByRole('heading', { name: 'Repairs / RWOP Reporting' })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('Plant-isolated maintenance reporting, analytics and audit-ready exports')).toBeVisible();
    await expect(page.getByText('Total WOs', { exact: true })).toBeVisible();
    await expect(page.getByText('WO-REPORT-001')).toBeVisible();
    await expect(page.getByText('Conveyor bearing noise')).toBeVisible();
    await expect(page.locator('.recharts-wrapper').first()).toBeVisible();
    await expect(page.getByText('Backlog, Aging & Response')).toBeVisible();
    await expect(page.getByText('Cost & Economic Impact')).toBeVisible();
    await expect(page.getByText('Asset Reliability & Repeat Failures')).toBeVisible();
    await expect(page.getByText('Closure & RCA Compliance')).toBeVisible();
    await expect(page.getByText('Management Exception Watchlist')).toBeVisible();
    await expect(page.getByText('Main Conveyor')).toBeVisible();
    await expect(page.getByText('Tracked economic impact')).toBeVisible();

    await expect(page.getByRole('button', { name: 'PDF' })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Excel' })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'CSV' })).toBeEnabled();

    await page.getByRole('tab', { name: /Report Library/i }).click();
    await expect(page.getByText('Repairs Report Library')).toBeVisible();
    await expect(page.getByText('Daily / Weekly Repairs Operations')).toBeVisible();
    await expect(page.getByText('Asset Repair History')).toBeVisible();
    await expect(page.getByText('Department / Cost-Center Cost')).toBeVisible();
    await expect(page.getByText('Technician Timesheet / Labor')).toBeVisible();
    await expect(page.getByText('Downtime & Production Loss')).toBeVisible();
    await expect(page.getByText('Failure / RCA Analysis')).toBeVisible();
  });

  test('enforces report RBAC and plant scope for data and PDF export', async () => {
    const plannerAToken = await getToken('planner_plant_a');
    const technicianAToken = await getToken('plant_a_user');
    const systemPlannerToken = await getToken('planner');
    const plantBId = await lookupPlantId(systemPlannerToken, 'PLANT-B');

    for (const path of [
      `/api/repairs/reports?type=lifecycle&plantId=${encodeURIComponent(plantBId)}`,
      `/api/repairs/reports?type=lifecycle&plantId=${encodeURIComponent(plantBId)}&format=pdf`,
    ]) {
      const blocked = await expectFailure(plannerAToken, 'GET', path);
      expect(blocked.status).toBe(403);
      expect(blocked.data.success).toBe(false);
    }

    const roleBlocked = await expectFailure(technicianAToken, 'GET', '/api/repairs/reports?type=lifecycle');
    expect(roleBlocked.status).toBe(403);
    expect(roleBlocked.data.success).toBe(false);
  });
});
