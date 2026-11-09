import { test, expect } from '@playwright/test';
import { authenticateAs } from './helpers/auth';

/** Planner review at 390px, using real app auth and deterministic read-only data. */
test('UAT-PM exceptions: mobile records show inspector, actual readings, abnormal follow-up and filters', async ({ page, context }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await authenticateAs(context, 'planner');

  const requestedFilters: string[] = [];
  await page.route((url) => url.pathname === '/api/pm-inspections', async (route) => {
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ success: true, data: [], pagination: { page: 1, limit: 50, total: 0, totalPages: 0 } }),
    });
  });
  await page.route((url) => url.pathname === '/api/pm-inspections/scheduled', async (route) => {
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ success: true, data: [], pagination: { page: 1, limit: 50, total: 0, totalPages: 0 } }),
    });
  });
  await page.route((url) => url.pathname === '/api/pm-inspections/exceptions', async (route) => {
    const params = new URL(route.request().url()).searchParams;
    requestedFilters.push(params.toString());
    const noWO = params.get('followUp') === 'none';
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: [{
          id: 'inspection-1', result: 'fail', value: '7.9',
          findings: 'Excess vibration during bearing rotation',
          recommendation: 'Inspect bearing and sprocket',
          inspectedAt: '2026-11-09T07:15:00Z',
          equipmentState: 'standstill',
          inspector: { id: 'tech-1', fullName: 'Technician UAT' },
          inspectionPoint: {
            id: 'point-1', name: 'Drive-end vibration',
            inspectionType: 'measurement', parameterKey: 'vibration',
            normalRange: '{"min":0,"max":4.5,"unit":"mm/s"}',
          },
          component: {
            id: 'bearing-1', name: 'Drive-End Bearing', componentCode: 'C314-21-02',
            asset: { id: 'asset-1', name: 'Mercerizer C314', assetTag: 'C314', plantId: 'plant-1', departmentId: 'production' },
          },
          workOrder: noWO ? null : { id: 'wo-1', woNumber: 'WO-UAT-001', status: 'draft' },
        }],
        pagination: { page: 1, limit: 25, total: 1, totalPages: 1 },
      }),
    });
  });

  await page.goto('/#/pm-schedules');
  await expect(page.getByRole('heading', { name: 'PM Planning', exact: true })).toBeVisible({ timeout: 25_000 });
  const worksheet = page.getByTestId('pm-inspection-worksheet');
  await worksheet.getByRole('button', { name: 'Review Exceptions' }).click();
  const review = page.getByTestId('pm-inspection-exceptions');
  await expect(review).toBeVisible({ timeout: 20_000 });
  await expect(review).toContainText('1 matching exceptions');
  await expect(review).toContainText('Mercerizer C314');
  await expect(review).toContainText('C314-21-02');
  await expect(review).toContainText('Drive-end vibration');
  await expect(review).toContainText('7.9 mm/s');
  await expect(review).toContainText('Technician UAT');
  await expect(review).toContainText('WO-UAT-001');
  await expect(review).toContainText('Older records display Unknown');
  await expect(review).toContainText('State: standstill');

  const bounds = await review.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(-1);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(391);
  const overflow = await review.evaluate((node) => node.scrollWidth - node.clientWidth);
  expect(overflow, 'inspection exception review should fit a phone').toBeLessThanOrEqual(2);

  await review.getByRole('combobox', { name: 'Corrective WO' }).click();
  await page.getByRole('option', { name: 'No linked WO' }).click();
  await expect(review).toContainText('No corrective WO linked — planner follow-up needed');
  expect(requestedFilters.some((value) => value.includes('followUp=none'))).toBe(true);
  await review.getByRole('button', { name: 'Back to List' }).click();
  await expect(review).not.toBeVisible();
  await expect(worksheet.getByText('Machine inspection checklist', { exact: true })).toBeVisible();
});
