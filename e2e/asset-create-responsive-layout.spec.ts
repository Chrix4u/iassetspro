import { test, expect } from '@playwright/test';

test('isolated UAT: machine creation form opens wider and aligns fields on desktop and mobile', async ({ page, request }) => {
  // Only the isolated, seeded platform database may run this regression.
  test.skip(process.env.CI !== 'true'
      || !process.env.DATABASE_URL?.includes('/platform_e2e?schema=public')
      || process.env.PLAYWRIGHT_BASE_URL !== 'http://127.0.0.1:3000',
    'Run against isolated seeded platform CI database only');
  test.setTimeout(100_000);

  const login = await request.post('/api/auth/login', { data: { username: 'admin', password: 'admin123' } });
  expect(login.status()).toBe(200);
  const session = await login.json();
  expect(session.success).toBe(true);

  await page.goto('/');
  await page.evaluate((token: string) => localStorage.setItem('eam_token', token), session.data.token);
  // Reload so the SPA initializes its auth store from the persisted token.
  // A same-document hash navigation may preserve the unauthenticated store.
  await page.reload();
  await page.goto('/#/assets-machines');
  await expect(page.getByRole('heading', { name: 'Asset Register' })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Add Asset', exact: true }).click();

  const form = page.getByTestId('asset-create-form');
  await expect(form).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('heading', { name: 'Create Asset' })).toBeVisible();

  // Add a real blank meter row so the long "Observed initial reading" label
  // is present; this test never submits or changes the database.
  await form.getByRole('button', { name: 'Add meter' }).click();

  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 850, height: 820 },
    { width: 390, height: 820 },
  ]) {
    await page.setViewportSize(viewport);
    const dialog = page.getByRole('dialog').filter({ has: form });
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    const rect = await dialog.boundingBox();
    expect(rect).not.toBeNull();
    if (viewport.width === 1440) expect(rect!.width).toBeGreaterThan(950);
    expect(rect!.width).toBeLessThanOrEqual(viewport.width + 1);

    const name = await form.locator('input').first().boundingBox();
    const tag = await form.locator('input').nth(1).boundingBox();
    expect(name).not.toBeNull();
    expect(tag).not.toBeNull();
    if (viewport.width === 390) {
      expect(tag!.y).toBeGreaterThan(name!.y + 8);
    } else {
      expect(Math.abs(tag!.y - name!.y)).toBeLessThanOrEqual(3);
      expect(tag!.x).toBeGreaterThan(name!.x);
    }

    const meterName = await form.getByPlaceholder('Motor run hours').boundingBox();
    const observed = await form.getByText('Observed initial reading (optional)', { exact: true })
      .locator('..').locator('input').boundingBox();
    expect(meterName).not.toBeNull();
    expect(observed).not.toBeNull();
    if (viewport.width === 1440) {
      expect(Math.abs(observed!.y - meterName!.y)).toBeLessThanOrEqual(3);
    } else {
      expect(observed!.y).toBeGreaterThan(meterName!.y + 8);
    }

    const scroll = await dialog.evaluate(node => ({
      scrollWidth: node.scrollWidth,
      clientWidth: node.clientWidth,
    }));
    expect(scroll.scrollWidth, 'Modal should never overflow horizontally').toBeLessThanOrEqual(scroll.clientWidth + 3);

    // The save action stays available in the fixed dialog footer after scrolling.
    await form.evaluate(node => node.scrollIntoView({ block: 'end' }));
    await expect(dialog.getByRole('button', { name: 'Create Asset', exact: true })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeVisible();
  }
});
