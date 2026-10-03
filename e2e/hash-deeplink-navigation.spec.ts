import { test, expect } from '@playwright/test';
import { authenticateAs } from './repairs/helpers/auth';

test('hash-only navigation updates rendered SPA content', async ({ page, context }) => {
  await authenticateAs(context, 'planner');
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible({ timeout: 20_000 });

  await page.evaluate(() => {
    window.location.hash = '#/maintenance-work-orders';
  });

  await expect(page).toHaveURL(/#\/maintenance-work-orders$/);
  await expect(page.getByText('Work Orders', { exact: true }).first()).toBeVisible({ timeout: 15_000 });
});
