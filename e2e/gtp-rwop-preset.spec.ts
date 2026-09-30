import { test, expect } from '@playwright/test';

test('GTP workbook preset reproduces full imported history', async ({ page }) => {
  await page.goto('/');
  await page.getByPlaceholder('Enter your username').fill('admin');
  await page.getByPlaceholder('Enter your password').fill('admin123');
  await page.locator('button[type="submit"]').click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 20000 });

  await page.goto('/reports/rwop');
  await expect(page.getByText('Report Filters')).toBeVisible({ timeout: 20000 });

  const preset = page.getByRole('button', { name: 'GTP Workbook · 2,807' });
  await expect(preset).toBeVisible();
  await preset.click();

  await expect(page.getByText('GTP Workbook Graph Parity')).toBeVisible({ timeout: 30000 });
  await expect(page.getByText('411 breakdown(s)')).toBeVisible({ timeout: 30000 });

  const totalCard = page.locator('div').filter({ hasText: /^Total WOs2807$/ }).first();
  await expect(totalCard).toBeVisible({ timeout: 30000 });

  await expect(page.getByText('GTP Repairs UAT Plant (GTP-UAT)')).toBeVisible();
  await expect(page.getByRole('combobox').filter({ hasText: 'All Maintenance' })).toBeVisible();

  const body = await page.textContent('body');
  expect(body).toContain('Machine repair downtime per week');
  expect(body).toContain('Machine breakdown occurrence per machine');
  expect(body).toContain('Machine breakdown per week');
  expect(body).toContain('Response to repair per week');
  expect(body).toContain('Response time to repair per machine');
});