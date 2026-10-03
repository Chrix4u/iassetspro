import { test, expect } from '@playwright/test';
import { authenticateAs } from './helpers/auth';
import { apiCall, getToken, lookupAssetId } from './helpers/api';

test('Frontend creates component-targeted work order and preserves hierarchy links', async ({ page, context }) => {
  const plannerToken = await getToken('planner');
  const assetId = await lookupAssetId(plannerToken, 'UAT-PUMP-001');

  const componentsResp = await apiCall(
    plannerToken,
    'GET',
    `/api/component-registry?assetId=${encodeURIComponent(assetId)}&limit=200`,
  );
  expect(componentsResp.status).toBe(200);
  const components = componentsResp.data.data as Array<{
    id: string;
    componentCode: string;
    name: string;
    componentType: string;
    parentId?: string | null;
  }>;

  const assembly = components.find((item) => item.componentType === 'assembly');
  const part = components.find((item) => item.componentType === 'part' && item.parentId === assembly?.id);
  expect(assembly, 'UAT asset must have an assembly').toBeTruthy();
  expect(part, 'UAT asset must have a child part under the selected assembly').toBeTruthy();

  const suffix = Date.now().toString().slice(-7);
  const title = `UAT Frontend Component WO ${suffix}`;

  await authenticateAs(context, 'planner');
  await page.goto('/#/maintenance-work-orders');
  await expect(page.getByRole('heading', { name: 'Work Orders', exact: true })).toBeVisible({ timeout: 20_000 });

  await page.getByRole('button', { name: /New Work Order/i }).click();
  await expect(page.getByText('Create Work Order', { exact: true }).first()).toBeVisible();

  await page.getByPlaceholder('Work order title').fill(title);

  await page.getByText('Select asset...', { exact: true }).click();
  const assetSearch = page.getByPlaceholder('Search assets by name or tag...');
  await expect(assetSearch).toBeVisible();
  await assetSearch.fill('UAT-PUMP-001');
  await page.getByText('UAT Test Pump [UAT-PUMP-001]', { exact: true }).click();

  await expect(page.getByText('Components / Parts (optional)', { exact: true })).toBeVisible({ timeout: 15_000 });
  const assemblyLabel = page.locator('label').filter({ hasText: assembly!.componentCode }).first();
  const partLabel = page.locator('label').filter({ hasText: part!.componentCode }).first();
  await expect(assemblyLabel).toBeVisible();
  await expect(partLabel).toBeVisible();
  await assemblyLabel.getByRole('checkbox').click();
  await partLabel.getByRole('checkbox').click();
  await expect(page.getByText('2 component(s) selected', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Create WO', exact: true }).click();
  await expect(page.getByText('Work order created', { exact: true })).toBeVisible({ timeout: 20_000 });

  const searchResp = await apiCall(
    plannerToken,
    'GET',
    `/api/work-orders?search=${encodeURIComponent(title)}&limit=20`,
  );
  expect(searchResp.status).toBe(200);
  const rows = Array.isArray(searchResp.data.data) ? searchResp.data.data : [];
  const created = rows.find((row: any) => row.title === title);
  expect(created?.id).toBeTruthy();

  const linkedResp = await apiCall(plannerToken, 'GET', `/api/work-orders/${created.id}/components`);
  expect(linkedResp.status).toBe(200);
  const linkedRows = Array.isArray(linkedResp.data.data) ? linkedResp.data.data : [];
  const linkedIds = linkedRows.map((row: any) => row.componentRegistryId || row.component?.id || row.id);
  expect(linkedIds).toContain(assembly!.id);
  expect(linkedIds).toContain(part!.id);

  // Component maintenance history is a digital-twin read surface, not a general
  // planner surface. Preserve that permission boundary while still proving the
  // work order itself retains both hierarchy links.
  const assemblyHistory = await apiCall(plannerToken, 'GET', `/api/component-registry/${assembly!.id}/maintenance`);
  const partHistory = await apiCall(plannerToken, 'GET', `/api/component-registry/${part!.id}/maintenance`);
  expect(assemblyHistory.status).toBe(403);
  expect(partHistory.status).toBe(403);
});
