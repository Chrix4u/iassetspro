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

    // Measure each pair in one animation frame. Radix dialogs/sheets animate
    // when their viewport changes; separate boundingBox calls can capture
    // different animation frames and report a false vertical mismatch.
    // The geometry threshold remains strict (3px); poll until layout settles.
    await expect.poll(async () => form.evaluate(node => {
      const inputs = node.querySelectorAll('input');
      const name = inputs[0]?.getBoundingClientRect();
      const tag = inputs[1]?.getBoundingClientRect();
      if (!name || !tag) return false;
      return viewport.width === 390
        ? tag.y > name.y + 8
        : Math.abs(tag.y - name.y) <= 3 && tag.x > name.x;
    }), { message: 'Asset name and tag inputs must align at settled viewport width', timeout: 8000 }).toBe(true);

    await expect.poll(async () => form.evaluate(node => {
      const meterName = node.querySelector<HTMLInputElement>('input[placeholder="Motor run hours"]');
      // Target the input itself. Reconstructing its locator from a Radix Label
      // may resolve the wrong ancestor after the responsive modal remounts.
      const observed = node.querySelector<HTMLInputElement>('input[placeholder="Blank = not yet measured"]');
      if (!meterName || !observed) return false;
      const first = meterName.getBoundingClientRect();
      const second = observed.getBoundingClientRect();
      return viewport.width === 1440
        ? Math.abs(second.y - first.y) <= 3
        : second.y > first.y + 8;
    }), { message: `Machine meter inputs must align at settled ${viewport.width}px viewport width`, timeout: 8000 }).toBe(true);

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
