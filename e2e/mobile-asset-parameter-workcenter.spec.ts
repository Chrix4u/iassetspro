import { test, expect, type Page, type APIRequestContext } from '@playwright/test';

const requireIsolatedUat = () => {
  test.skip(process.env.CI !== 'true'
    || !process.env.DATABASE_URL?.includes('/platform_e2e?schema=public')
    || process.env.PLAYWRIGHT_BASE_URL !== 'http://127.0.0.1:3000',
  'Only run destructive work-center checks on the isolated seeded platform CI database');
};

async function loginAsIsolatedAdmin(page: Page, request: APIRequestContext) {
  const login = await request.post('/api/auth/login', { data: { username: 'admin', password: 'admin123' } });
  expect(login.status()).toBe(200);
  const session = await login.json();
  expect(session.success).toBe(true);
  await page.goto('/');
  await page.evaluate((token: string) => localStorage.setItem('eam_token', token), session.data.token);
  await page.reload();
}

test('mobile machine parameter form keeps minimum and maximum on one row', async ({ page, request }) => {
  requireIsolatedUat();
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAsIsolatedAdmin(page, request);
  await page.goto('/#/assets-machines');
  await expect(page.getByRole('heading', { name: 'Asset Register' })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Add Asset', exact: true }).click();
  const form = page.getByTestId('asset-create-form');
  await expect(form).toBeVisible();
  await form.getByRole('button', { name: 'Add parameter' }).click();
  const parameters = form.getByTestId('commissioning-parameters');
  const minimum = parameters.getByText('Minimum', { exact: true }).locator('..').locator('input');
  const maximum = parameters.getByText('Maximum', { exact: true }).locator('..').locator('input');
  await expect(minimum).toBeVisible();
  await expect(maximum).toBeVisible();
  const [min, max] = await Promise.all([minimum.boundingBox(), maximum.boundingBox()]);
  expect(min).not.toBeNull();
  expect(max).not.toBeNull();
  expect(Math.abs(min!.y - max!.y), 'Minimum and Maximum input tops must align').toBeLessThanOrEqual(3);
  expect(max!.x, 'Maximum must appear to the right of Minimum').toBeGreaterThan(min!.x);
  expect(max!.x + max!.width, 'Both inputs must fit the phone viewport').toBeLessThanOrEqual(391);
  await expect(form.getByText('OEM reference')).toBeVisible();
  // Do not submit or modify production/CI asset records.
});

test('isolated mobile Work Center can be created, viewed, edited and deactivated', async ({ page, request }) => {
  requireIsolatedUat();
  test.setTimeout(140_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAsIsolatedAdmin(page, request);
  await page.goto('/#/production-work-centers');
  await expect(page.getByRole('heading', { name: 'Work Centers' })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'New Work Center' }).click();
  const modal = page.getByRole('dialog');
  const name = 'Mobile WC UAT ' + Date.now();
  const updatedName = name + ' Updated';
  const form = page.getByTestId('work-center-form');
  await expect(form).toBeVisible();
  await form.getByPlaceholder('Work center name').fill(name);
  await form.getByPlaceholder('0', { exact: true }).fill('25');
  await modal.getByRole('button', { name: 'Create Work Center' }).click();
  await expect(modal).toBeHidden({ timeout: 20_000 });
  const search = page.getByPlaceholder('Search work centers...');
  await search.fill(name);
  await expect(page.getByRole('cell', { name, exact: true })).toBeVisible({ timeout: 15_000 });

  await page.getByRole('button', { name: 'Actions for ' + name }).click();
  await page.getByRole('menuitem', { name: 'View' }).click();
  const details = page.getByTestId('work-center-details');
  await expect(details).toContainText(name);
  await expect(details).toContainText('25 units/hour');

  await modal.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(form).toBeVisible();
  await form.getByPlaceholder('Work center name').fill(updatedName);
  await form.getByPlaceholder('0', { exact: true }).fill('35');
  await modal.getByRole('button', { name: 'Save Changes' }).click();
  await expect(modal).toBeHidden({ timeout: 20_000 });
  await expect(page.getByRole('cell', { name: updatedName, exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('35 units/hour')).toBeVisible();

  await page.getByRole('button', { name: 'Actions for ' + updatedName }).click();
  page.once('dialog', async dialog => { await dialog.accept(); });
  await page.getByRole('menuitem', { name: 'Deactivate' }).click();
  await expect(page.getByRole('cell', { name: updatedName, exact: true })).toHaveCount(0, { timeout: 15_000 });
});

test('hierarchy builder preserves input focus and keeps creation visible on short screens', async ({ page, request }) => {
  requireIsolatedUat();
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1366, height: 650 });
  await loginAsIsolatedAdmin(page, request);
  await page.goto('/#/assets-hierarchy');
  await expect(page.getByRole('heading', { name: 'Asset & Location Hierarchy' })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'New hierarchy system' }).click();
  const dialog = page.getByTestId('hierarchy-system-dialog');
  const body = dialog.getByTestId('hierarchy-system-body');
  const create = dialog.getByRole('button', { name: 'Create hierarchy system', exact: true });
  await expect(dialog).toBeVisible();
  const label = dialog.getByRole('textbox', { name: 'Level 3 label', exact: true });
  await label.fill('');
  await label.pressSequentially('Department', { delay: 25 });
  await expect(label).toHaveValue('Department');
  await expect(label).toBeFocused();
  const prefix = dialog.getByRole('textbox', { name: 'Level 3 prefix', exact: true });
  await prefix.fill('');
  await prefix.pressSequentially('DEP', { delay: 25 });
  await expect(prefix).toHaveValue('DEP');
  await expect(prefix).toBeFocused();
  await dialog.getByRole('button', { name: 'Move level 3 down' }).click();
  await expect(dialog.getByRole('textbox', { name: 'Level 4 label', exact: true })).toHaveValue('Department');
  await dialog.getByRole('button', { name: 'Level', exact: true }).click();
  await expect(dialog.getByTestId('hierarchy-level-row')).toHaveCount(6);
  await dialog.getByRole('button', { name: 'Remove level 6' }).click();
  await expect(dialog.getByTestId('hierarchy-level-row')).toHaveCount(5);

  for (const viewport of [{ width: 1366, height: 650 }, { width: 390, height: 600 }]) {
    await page.setViewportSize(viewport);
    await expect(create).toBeInViewport({ ratio: 1 });
    // Resizing a Radix portal can trigger a transient layout/animation frame.
    // Require the settled dialog to fit on both axes, not just its footer.
    await expect.poll(async () => {
      const bounds = await dialog.boundingBox();
      return Boolean(bounds
        && bounds.width <= Math.min(761, viewport.width - 30)
        && bounds.x >= 0
        && bounds.x + bounds.width <= viewport.width + 1
        && bounds.y >= 0
        && bounds.y + bounds.height <= viewport.height + 1);
    }, { message: 'The complete hierarchy dialog must fit the viewport' }).toBe(true);
    await body.evaluate(node => { node.scrollTop = node.scrollHeight; });
    await expect(create).toBeInViewport({ ratio: 1 });
    expect(await body.evaluate(node => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(2);
  }

  // Create only in the disposable platform E2E database. Never modify live hierarchy data.
  const uniqueCode = 'UAT-HIER-' + Date.now();
  await dialog.getByPlaceholder('e.g. Primary Plant Structure').fill(uniqueCode);
  await dialog.getByPlaceholder('PRIMARY', { exact: true }).fill(uniqueCode);
  const primary = dialog.getByRole('switch', { name: 'Primary system', exact: true });
  if (await primary.getAttribute('aria-checked') === 'true') await primary.click();
  const saved = page.waitForResponse(response => response.url().endsWith('/api/hierarchy-systems') && response.request().method() === 'POST');
  await create.click();
  const response = await saved;
  expect(response.status()).toBe(201);
  const payload = response.request().postDataJSON();
  expect(payload.isPrimary).toBe(false);
  expect(payload.levels[3]).toMatchObject({ label: 'Department', codePrefix: 'DEP' });
  expect(payload.levels.every((level: Record<string, unknown>) => !('draftId' in level))).toBe(true);
  await expect(dialog).toBeHidden({ timeout: 15_000 });
});
