import { test, expect } from '@playwright/test';
import { authenticateAs } from './helpers/auth';

/**
 * Viewport regression against the real PM Planning page and UI components.
 * Mock only report/worksheet API payloads to keep the responsive assertions
 * deterministic. Runs against disposable CI Repairs UAT, never production.
 */
test('UAT-mobile: PM inspection rows and risk reports fit a 390px phone viewport', async ({ page, context }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await authenticateAs(context, 'planner');

  const longMachine = 'Centrifugal Water Pump P-01 UI UAT for production';
  const taskDescription = 'Inspect the impeller housing and record any abnormal rubbing, cracks or vibration.';
  const summary = {
    maturedCycles: 6, completed: 0, openOverdue: 6, missed: 0,
    completionCompliancePct: 0, machinesWithMaturedCycles: 2,
    machinesWithOpenOverdue: 2,
  };
  const dept = (name: string) => ({
    departmentId: name === 'Production' ? 'production' : null,
    departmentName: name, machineCount: 1, maturedCycles: 3, completed: 0,
    openOverdue: 3, missed: 0, completionCompliancePct: 0,
    oldestOpenOverdueMinutes: 24 * 60,
  });

  await page.route((url) => url.pathname === '/api/pm-assignments/compliance/portfolio', async (route) => {
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          window: { days: 30, start: '2026-10-08T00:00:00Z', end: '2026-11-08T00:00:00Z' },
          summary,
          departments: [dept('Unassigned'), dept('Production')],
          machines: [{
            assetId: 'uat-mobile-asset', assetName: longMachine, assetTag: 'AST-202609-0001',
            departmentId: null, departmentName: 'Unassigned',
            maturedCycles: 5, completed: 0, openOverdue: 5, missed: 0,
            completionCompliancePct: 0, oldestOpenOverdueMinutes: 24 * 60,
          }],
          oldestOpenOverdue: [{
            identity: 'uat-mobile-cycle', assetId: 'uat-mobile-asset',
            assetName: longMachine, assetTag: 'AST-202609-0001',
            departmentId: null, departmentName: 'Unassigned',
            taskNumber: 2, description: taskDescription,
            pmType: 'tbm', maintenanceMode: 'running',
            dueAt: '2026-11-01T09:00:00Z', outcome: 'overdue_open',
            delayMinutes: 24 * 60, workOrderNumber: 'WO-UAT-MOBILE',
            workOrderStatus: 'draft',
          }],
        },
      }),
    });
  });
  await page.route((url) => url.pathname === '/api/pm-inspections/scheduled', async (route) => {
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        success: true, data: [{
          id: 'uat-mobile-inspection-task',
          asset: { id: 'uat-mobile-asset', name: longMachine, assetTag: 'AST-202609-0001' },
          component: { id: 'uat-mobile-impeller', name: 'Impeller', componentCode: 'P01-CMP-IMPELLER' },
          pmTask: { taskNumber: 2, description: taskDescription, taskType: 'inspect' },
          pmType: 'tbm', basis: 'calendar', nextDueDate: '2026-11-01T09:00:00Z',
          nextDueReading: null, currentReading: null, meterUnit: null,
          equipmentState: 'running', dueState: 'overdue',
        }],
      }),
    });
  });
  await page.route((url) => url.pathname === '/api/pm-inspections', async (route) => {
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        success: true, data: [],
        pagination: { page: 1, limit: 50, total: 0, totalPages: 1 },
      }),
    });
  });

  await page.goto('/#/pm-schedules');
  await expect(page.getByRole('heading', { name: 'PM Planning', exact: true })).toBeVisible({ timeout: 25_000 });
  const row = page.getByTestId('pm-scheduled-compact-row');
  await expect(row).toHaveCount(1, { timeout: 20_000 });
  await expect(row.getByRole('button', { name: 'View', exact: true })).toBeVisible();
  await expect(row).toContainText('Impeller');
  await expect(row).not.toContainText(taskDescription);

  for (const testId of [
    'pm-scheduled-compact-row',
    'pm-department-risk-mobile',
    'pm-machine-risk-mobile',
    'pm-oldest-overdue-mobile',
  ]) {
    const element = page.getByTestId(testId).first();
    await expect(element).toBeVisible({ timeout: 25_000 });
    const bounds = await element.boundingBox();
    expect(bounds, testId).not.toBeNull();
    expect(bounds!.x, testId).toBeGreaterThanOrEqual(-1);
    expect(bounds!.x + bounds!.width, testId).toBeLessThanOrEqual(391);
    const hasHorizontalOverflow = await element.evaluate((node) => node.scrollWidth > node.clientWidth + 2);
    expect(hasHorizontalOverflow, `${testId} must not overflow horizontally`).toBe(false);
  }

  await row.getByRole('button', { name: 'View', exact: true }).click();
  const details = page.getByRole('dialog').last();
  await expect(details).toContainText(taskDescription);
  await expect(details).toContainText('P01-CMP-IMPELLER');
  await expect(details.getByRole('button', { name: 'Configure Check' })).toBeVisible();
});
