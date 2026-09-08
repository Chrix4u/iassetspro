import { test, expect } from '@playwright/test';
import { authenticateAs } from './helpers/auth';

test.describe('Repairs Reports & Analytics', () => {
  test('renders graphical and tabular lifecycle reporting with export actions', async ({ page, context }) => {
    // Authenticate through the stable API helper, then navigate inside the SPA.
    // A hard reload directly onto a protected hash route can race the auth-store
    // hydration/permission guard and redirect to Dashboard before /api/auth/me
    // has restored the persisted permission set.
    await authenticateAs(context, 'planner');
    await page.goto('/');
    await expect(page.getByText('UAT Planner', { exact: true }).first()).toBeVisible({ timeout: 20_000 });

    await page.route('**/api/repairs/reports?**', async (route) => {
      const url = new URL(route.request().url());
      if (url.searchParams.get('format') === 'pdf') {
        await route.fulfill({
          status: 200,
          contentType: 'application/pdf',
          body: '%PDF-1.4\n% Repairs report browser probe\n',
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            totalRequests: 3,
            convertedToWo: 2,
            closed: 1,
            avgTurnaroundHours: 8.5,
            avgStageDurations: {
              mr_supervisor_review: 1.25,
              mr_approved: 2,
              wo_created: 3.5,
              wo_closed: 8.5,
            },
            entries: [
              {
                mrNumber: 'MR-REPORT-001',
                mrTitle: 'Conveyor bearing noise',
                priority: 'high',
                status: 'converted',
                woNumber: 'WO-REPORT-001',
                woStatus: 'closed',
                totalTurnaroundHours: 8.5,
              },
              {
                mrNumber: 'MR-REPORT-002',
                mrTitle: 'Pump seal leakage',
                priority: 'critical',
                status: 'approved',
                woNumber: 'WO-REPORT-002',
                woStatus: 'in_progress',
                totalTurnaroundHours: null,
              },
            ],
          },
        }),
      });
    });

    // Use the application's own navigation action instead of performing a
    // second document load. This exercises the same route users select from
    // the Reports menu and avoids testing an unrelated auth-hydration race.
    await page.getByRole('button', { name: /^Reports$/ }).click();
    await page.getByRole('button', { name: /^Repair Lifecycle$/ }).click();

    await expect(page.getByRole('heading', { name: 'Repairs Reports & Analytics' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Tabular and graphical maintenance intelligence')).toBeVisible();

    await page.getByRole('button', { name: /Generate$/ }).click();

    await expect(page.getByText('Maintenance Requests')).toBeVisible();
    await expect(page.getByText('MR-REPORT-001')).toBeVisible();
    await expect(page.getByText('Conveyor bearing noise')).toBeVisible();
    await expect(page.locator('.recharts-wrapper').first()).toBeVisible();

    await expect(page.getByRole('button', { name: 'PDF' })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Excel' })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'CSV' })).toBeEnabled();

    await page.getByPlaceholder('Filter the table...').fill('Pump seal');
    await expect(page.getByText('Pump seal leakage')).toBeVisible();
    await expect(page.getByText('Conveyor bearing noise')).toHaveCount(0);
  });
});
