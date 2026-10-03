import fs from 'node:fs';
import { test, expect } from '@playwright/test';

function platformAdminPassword(): string {
  const seed = fs.readFileSync('prisma/seed-demo-users-only.ts', 'utf8');
  const match = seed.match(/const ADMIN_PASSWORD = '([^']+)'/);
  if (!match?.[1]) throw new Error('Platform admin fixture password not found');
  return match[1];
}

test('hash-only navigation updates rendered SPA content', async ({ page }) => {
  await page.goto('/');
  await page.getByPlaceholder('Enter your username').fill('admin');
  await page.getByPlaceholder('Enter your password').fill(platformAdminPassword());
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible({ timeout: 20_000 });

  await page.evaluate(() => {
    window.location.hash = '#/assets-machines';
  });

  await expect(page).toHaveURL(/#\/assets-machines$/);
  await expect(page.getByRole('heading', { name: 'Asset Register', exact: true })).toBeVisible({ timeout: 15_000 });
});
