import { test, expect } from '@playwright/test';
import { authenticateAs } from './helpers/auth';

/**
 * Real-browser regression for the planner backlog counter.
 * Uses a deterministic mocked read-only API response, never production data.
 * All other app/auth requests still pass through the disposable Repairs UAT.
 */
test('UAT-planner: PM drafts awaiting planner count is visible before opening the filter', async ({ page, context }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await authenticateAs(context, 'planner');

  let previewCountRequests = 0;
  await page.route((url) =>
    url.pathname === '/api/work-orders' && url.searchParams.get('pmPlannerState') === 'unassigned',
  async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get('limit') === '1') previewCountRequests += 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: [],
        pagination: {
          page: Number(url.searchParams.get('page') || '1'),
          limit: Number(url.searchParams.get('limit') || '50'),
          total: 10,
          totalPages: Number(url.searchParams.get('limit')) === 1 ? 10 : 1,
        },
      }),
    });
  });

  await page.goto('/#/maintenance-work-orders');
  await expect(page.getByRole('heading', { name: 'Work Orders', exact: true }))
    .toBeVisible({ timeout: 25_000 });

  const backlogButton = page.getByRole('button', { name: 'PM drafts awaiting planner (10)' });
  await expect(backlogButton).toBeVisible({ timeout: 20_000 });
  await expect(backlogButton).toHaveAttribute('aria-pressed', 'false');
  expect(previewCountRequests, 'preview must request the normal scoped API with limit=1')
    .toBeGreaterThan(0);

  await backlogButton.click();
  await expect(backlogButton).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('Page 1 of 1 · 10 PM drafts awaiting planner')).toBeVisible();
  const bounds = await backlogButton.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(-1);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(391);
});
