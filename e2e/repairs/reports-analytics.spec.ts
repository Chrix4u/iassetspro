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

    // Use a real deep-link reload instead of dispatching popstate manually.
    // The app intentionally guards browser history; synthetic popstate can race
    // that guard and leave the Zustand route on Dashboard even while the URL
    // reads #/repairs-reports.
    await page.goto('/#/repairs-reports');

    await expect(page.getByRole('heading', { name: 'Repairs / RWOP Reporting' })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('Plant-isolated maintenance reporting, analytics and audit-ready exports')).toBeVisible();
    await expect(page.getByText('Total WOs', { exact: true })).toBeVisible();
    await expect(page.getByText('WO-REPORT-001')).toBeVisible();
    await expect(page.getByText('Conveyor bearing noise')).toBeVisible();
    await expect(page.locator('.recharts-wrapper').first()).toBeVisible();

    await expect(page.getByRole('button', { name: 'PDF' })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Excel' })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'CSV' })).toBeEnabled();
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
