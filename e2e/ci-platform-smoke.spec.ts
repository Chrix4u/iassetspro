import { test, expect, type APIRequestContext, type BrowserContext } from '@playwright/test';

async function loginAsSeededAdmin(request: APIRequestContext): Promise<{ token: string; body: any }> {
  const response = await request.post('/api/auth/login', {
    data: {
      username: 'admin',
      password: 'admin123',
    },
  });

  expect(response.status()).toBe(200);

  const body = await response.json();
  expect(body.success).toBe(true);
  expect(body.data?.user?.username).toBe('admin');
  expect(body.data?.user?.status).toBe('active');
  expect(typeof body.data?.token).toBe('string');
  expect(body.data.token.length).toBeGreaterThan(10);

  return { token: body.data.token as string, body };
}

async function injectAuth(context: BrowserContext, token: string): Promise<void> {
  await context.addInitScript((tok) => {
    localStorage.setItem('eam_token', tok);
  }, token);
}

test.describe('CI platform fixture smoke', () => {
  test('seeded administrator authenticates against the production artifact', async ({ request }) => {
    const { body } = await loginAsSeededAdmin(request);
    expect(Array.isArray(body.data?.permissions)).toBe(true);
    expect(body.data.permissions.length).toBeGreaterThan(0);
  });

  test('seeded administrator can create a digital twin and open the 3D viewer canvas', async ({ request, context, page }) => {
    const { token } = await loginAsSeededAdmin(request);
    const headers = { Authorization: `Bearer ${token}` };

    const assetsResponse = await request.get('/api/assets?limit=20', { headers });
    expect(assetsResponse.status()).toBe(200);
    const assetsBody = await assetsResponse.json();
    const assets = Array.isArray(assetsBody.data) ? assetsBody.data : [];
    expect(assets.length).toBeGreaterThan(0);

    const twinsResponse = await request.get('/api/digital-twins?limit=100', { headers });
    expect(twinsResponse.status()).toBe(200);
    const twinsBody = await twinsResponse.json();
    const usedAssetIds = new Set(
      (Array.isArray(twinsBody.data) ? twinsBody.data : []).map((twin: { assetId: string }) => twin.assetId),
    );
    const asset = assets.find((candidate: { id: string }) => !usedAssetIds.has(candidate.id));
    expect(asset?.id).toBeTruthy();

    const twinName = `CI Digital Twin ${Date.now()}`;
    const createResponse = await request.post('/api/digital-twins', {
      headers,
      data: {
        assetId: asset.id,
        name: twinName,
        description: 'Temporary platform E2E digital twin fixture',
        type: 'other',
        healthScore: 92,
        parameters: { rpm: 1450, temperature: 62 },
      },
    });
    expect(createResponse.status()).toBe(201);
    const createBody = await createResponse.json();
    const twinId = createBody.data?.id as string;
    expect(twinId).toBeTruthy();

    try {
      await injectAuth(context, token);
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto('/#/assets-digital-twin');

      await expect(page.getByText('Digital Twin', { exact: true }).first()).toBeVisible({ timeout: 30_000 });
      await expect(page.getByText(twinName, { exact: true })).toBeVisible({ timeout: 30_000 });

      const card = page.locator('[data-slot="card"]').filter({ hasText: twinName }).first();
      if (await card.count()) {
        await card.click();
      } else {
        await page.getByText(twinName, { exact: true }).click();
      }

      await expect(page.getByText(new RegExp(`${twinName}.*3D Viewer`))).toBeVisible({ timeout: 30_000 });
      await expect(page.getByRole('button', { name: /Back to Twins/i })).toBeVisible();
      await expect(page.locator('canvas')).toBeVisible({ timeout: 30_000 });
      await expect(page.locator('body')).not.toContainText(/Application Error|Something went wrong/i);
    } finally {
      const deleteResponse = await request.delete(`/api/digital-twins/${twinId}`, { headers });
      expect([200, 404]).toContain(deleteResponse.status());
    }
  });
});
