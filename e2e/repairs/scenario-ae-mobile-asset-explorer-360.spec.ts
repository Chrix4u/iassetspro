import { test, expect } from '@playwright/test';
import { authenticateAs } from './helpers/auth';
import { apiCall, getToken, lookupAssetId, lookupPlantId } from './helpers/api';

/**
 * Phone-width regression for the asset explorer screenshots.
 * All writes are confined to the disposable CI Repairs UAT database.
 * This test never changes a live asset or PM schedule.
 */
test('UAT-mobile 360px: hierarchy actions align and diagram fits without an empty 560px tree', async ({ page, context }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 360, height: 780 });

  const plannerToken = await getToken('planner');
  const assetId = await lookupAssetId(plannerToken, 'UAT-PUMP-001');
  const plantId = await lookupPlantId(plannerToken, 'PLANT-A');
  const suffix = Date.now().toString().slice(-8);
  const assemblyCode = `UAT-MOB-ASM-${suffix}`;
  const partCode = `UAT-MOB-PRT-${suffix}`;

  const response = await apiCall(plannerToken, 'POST', '/api/component-registry/bulk', {
    assetId,
    rows: [
      {
        componentCode: assemblyCode,
        name: 'Mobile Regression Pump Assembly',
        componentType: 'assembly',
        criticality: 'medium',
      },
      {
        componentCode: partCode,
        name: 'Mobile Regression Bearing',
        componentType: 'part',
        parentCode: assemblyCode,
        criticality: 'medium',
      },
    ],
  });
  expect(response.status).toBe(200);

  await authenticateAs(context, 'planner');
  await page.goto('/');
  await page.evaluate((id) => localStorage.setItem('user_plant_id', id), plantId);
  await page.goto(`/#/asset-detail?id=${encodeURIComponent(assetId)}`);
  await expect(page.getByText('UAT Test Pump').first()).toBeVisible({ timeout: 20_000 });

  await page.getByRole('tab', { name: /Components/i }).click();
  const commission = page.getByRole('button', { name: 'Commission', exact: true });
  const addItem = page.getByRole('button', { name: 'Add Item', exact: true });
  await expect(commission).toBeVisible({ timeout: 15_000 });
  await expect(addItem).toBeVisible();
  const commissionBox = await commission.boundingBox();
  const addBox = await addItem.boundingBox();
  expect(commissionBox).not.toBeNull();
  expect(addBox).not.toBeNull();
  expect(Math.abs(commissionBox!.y - addBox!.y), 'commission and add actions must share a row').toBeLessThan(3);
  expect(addBox!.x + addBox!.width, 'second action must fit the phone').toBeLessThanOrEqual(361);

  await page.getByRole('tab', { name: 'Visual Explorer', exact: true }).click();
  const hierarchyHeading = page.getByText('Machine hierarchy', { exact: true });
  await expect(hierarchyHeading).toBeVisible({ timeout: 20_000 });
  const hierarchyCard = hierarchyHeading.locator('xpath=../..');
  const hierarchyBox = await hierarchyCard.boundingBox();
  expect(hierarchyBox).not.toBeNull();
  expect(hierarchyBox!.height, 'short hierarchy must not reserve 560px blank space').toBeLessThan(430);

  // Diagram should fit its own viewport, not draw at its previous fixed 900px
  // width. The drill menu is below the schematic rather than covering nodes.
  await page.getByRole('tab', { name: 'Diagram', exact: true }).click();
  const schematic = page.getByRole('img', { name: 'Machine component engineering schematic' });
  await expect(schematic).toBeVisible();
  const schematicBox = await schematic.boundingBox();
  expect(schematicBox).not.toBeNull();
  expect(schematicBox!.x).toBeGreaterThanOrEqual(-1);
  expect(schematicBox!.x + schematicBox!.width).toBeLessThanOrEqual(361);
  expect(schematicBox!.width).toBeGreaterThan(245);

  const overlay = page.getByText('Drill into parts', { exact: true }).locator('xpath=../..');
  await expect(overlay).toBeVisible();
  const overlayBox = await overlay.boundingBox();
  expect(overlayBox).not.toBeNull();
  expect(overlayBox!.x).toBeGreaterThanOrEqual(-1);
  expect(overlayBox!.x + overlayBox!.width).toBeLessThanOrEqual(361);
  expect(overlayBox!.y).toBeGreaterThanOrEqual(schematicBox!.y + schematicBox!.height - 1);
});
