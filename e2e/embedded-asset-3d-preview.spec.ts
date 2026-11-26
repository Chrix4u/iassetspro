import { test, expect } from '@playwright/test';

test('asset 3D preview reserves anatomy and canvas space at all pane widths', async ({ page, request, context }) => {
  test.skip(process.env.CI !== 'true' || !process.env.DATABASE_URL?.includes('/platform_e2e?schema=public')
    || process.env.PLAYWRIGHT_BASE_URL !== 'http://127.0.0.1:3000', 'Isolated platform CI only');
  test.setTimeout(120_000);
  const login = await request.post('/api/auth/login', { data: { username: 'admin', password: 'admin123' } });
  expect(login.status()).toBe(200);
  const session = await login.json();
  const token = session.data.token;
  const headers = { Authorization: `Bearer ${token}` };
  const assets = await request.get('/api/assets?limit=100', { headers });
  const twins = await request.get('/api/digital-twins?limit=100', { headers });
  expect(assets.status()).toBe(200);
  expect(twins.status()).toBe(200);
  const used = new Set((await twins.json()).data.map((t: { assetId: string }) => t.assetId));
  const asset = (await assets.json()).data.find((a: { id: string }) => !used.has(a.id));
  expect(asset?.id).toBeTruthy();
  await context.addInitScript((tok) => localStorage.setItem('eam_token', tok), token);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto(`/#/asset-detail?id=${encodeURIComponent(asset.id)}`);
  await page.getByRole('tab', { name: 'Visual Explorer', exact: true }).click({ timeout: 30_000 });
  await page.getByRole('tab', { name: '3D Model', exact: true }).click();
  await page.getByRole('button', { name: 'Preview example pump', exact: true }).click({ timeout: 30_000 });
  const viewer = page.getByTestId('embedded-3d-viewer');
  const tree = viewer.getByTestId('embedded-3d-tree-region');
  const canvas = viewer.getByTestId('embedded-3d-canvas-region').locator('canvas');
  await expect(viewer.getByText('Original illustrative CAD anatomy', { exact: true })).toBeVisible({ timeout: 45_000 });
  await expect(canvas).toBeVisible();
  for (const width of [1920, 1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(async () => {
      const a = await tree.boundingBox();
      const b = await canvas.boundingBox();
      if (!a || !b) return false;
      const horizontal = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
      const vertical = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
      return (horizontal <= 1 || vertical <= 1) && b.width > 180 && b.height > 200;
    }, { message: 'The anatomy panel must not intersect the rendered canvas' }).toBe(true);
    const before = (await tree.boundingBox())!;
    await viewer.getByRole('button', { name: 'Collapse CAD anatomy tree' }).click();
    await expect(viewer.getByRole('button', { name: 'Expand CAD anatomy tree' })).toBeVisible();
    const after = (await tree.boundingBox())!;
    expect(after.width * after.height).toBeLessThan(before.width * before.height);
    await expect(canvas).toBeVisible();
    await viewer.getByRole('button', { name: 'Expand CAD anatomy tree' }).click();
    await expect(viewer.getByPlaceholder('Search nodes...')).toBeVisible();
  }
});
