/**
 * Scenario Z — Receiving quality hold and disposition (UAT-25)
 *
 * Proves that damaged/defective purchase receipts never become usable stock
 * until an explicit quality disposition releases them. Also proves that a
 * supplier return reopens the PO quantity so replacement goods can be received.
 */
import { test, expect, type Page } from '@playwright/test';
import { authenticateAs } from './helpers/auth';
import { apiCall, getToken, lookupPlantId } from './helpers/api';

async function chooseSearchable(page: Page, comboboxName: RegExp, searchPlaceholder: RegExp, optionText: string) {
  await page.getByRole('combobox', { name: comboboxName }).click();
  const search = page.getByPlaceholder(searchPlaceholder);
  await expect(search).toBeVisible();
  await search.fill(optionText);
  await page.getByRole('option').filter({ hasText: optionText }).first().click();
}

async function inventoryStock(token: string, plantId: string, itemCode: string, itemId: string) {
  const response = await apiCall(
    token,
    'GET',
    `/api/inventory?search=${encodeURIComponent(itemCode)}&plantId=${encodeURIComponent(plantId)}`,
  );
  expect(response.status).toBe(200);
  const item = (response.data.data as Array<any>).find((row: any) => row.id === itemId);
  expect(item, `Inventory item ${itemCode} should remain queryable`).toBeTruthy();
  return Number(item.currentStock);
}

async function createSupplierAndItem(token: string, plantId: string, suffix: string, label: string) {
  const supplierName = `UAT ${label} Supplier ${suffix}`;
  const supplierCode = `UAT-${label.toUpperCase()}-SUP-${suffix}`;
  const itemCode = `UAT-${label.toUpperCase()}-${suffix}`;
  const itemName = `UAT ${label} Receipt ${suffix}`;

  const supplier = await apiCall(token, 'POST', '/api/suppliers', {
    name: supplierName,
    code: supplierCode,
    contactPerson: 'UAT Quality Buyer',
    email: `uat-${label.toLowerCase()}-${suffix}@example.test`,
    country: 'Ghana',
  });
  expect(supplier.status).toBe(201);
  expect(supplier.data.success).toBe(true);

  const itemResponse = await apiCall(token, 'POST', '/api/inventory', {
    itemCode,
    name: itemName,
    category: 'spare_part',
    unitOfMeasure: 'each',
    currentStock: 0,
    minStockLevel: 0,
    unitCost: 95,
    plantId,
  });
  expect(itemResponse.status).toBe(201);
  expect(itemResponse.data.success).toBe(true);

  return { supplierName, itemCode, itemName, item: itemResponse.data.data };
}

async function createAndApprovePo(page: Page, supplierName: string, itemCode: string, quantity: number) {
  await page.goto('/#/inventory-purchase-orders');
  await expect(page.getByRole('main').getByRole('heading', { name: 'Purchase Orders', level: 1 })).toBeVisible();
  await page.getByRole('button', { name: /New PO/i }).click();
  const dialog = page.getByRole('dialog');
  await chooseSearchable(page, /Select supplier/i, /Search suppliers/i, supplierName);

  const priorityField = dialog.getByText('Priority *').locator('..');
  await priorityField.getByRole('combobox').click();
  await page.getByRole('option', { name: 'High', exact: true }).click();

  await dialog.getByRole('button', { name: /Add Item/i }).click();
  await chooseSearchable(page, /Select item/i, /Search items/i, itemCode);
  await dialog.locator('input[type="number"]').first().fill(String(quantity));
  await page.getByRole('button', { name: 'Create PO' }).click();
  await expect(page.getByText('Purchase order created successfully')).toBeVisible();

  const row = page.locator('tbody tr').filter({ hasText: supplierName }).first();
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'Approve' }).click();
  await expect(row.getByText('APPROVED')).toBeVisible();
}

async function receiveDefective(page: Page, itemCode: string, itemName: string, quantity: number) {
  await page.goto('/#/inventory-receiving');
  await expect(page.getByRole('main').getByRole('heading', { name: 'Receiving', level: 1 })).toBeVisible();
  await page.getByRole('button', { name: /New GRN/i }).click();
  await chooseSearchable(page, /Select PO item/i, /Search PO or item/i, itemCode);
  const dialog = page.getByRole('dialog');
  await dialog.locator('input[type="number"]').first().fill(String(quantity));

  const conditionField = dialog.getByText('Condition').locator('..');
  await conditionField.getByRole('combobox').click();
  await page.getByRole('option', { name: 'Defective', exact: true }).click();

  const responsePromise = page.waitForResponse((response) =>
    response.request().method() === 'POST' && /\/api\/purchase-orders\/[^/]+\/receive(?:\?|$)/.test(response.url()),
  );
  await page.getByRole('button', { name: 'Receive Items' }).click();
  const response = await responsePromise;
  const body = await response.json().catch(() => null);
  expect(response.status(), `Defective GRN failed: ${JSON.stringify(body)}`).toBe(200);
  expect(body?.receipt?.stockCredited).toBe(false);
  expect(body?.receipt?.custodyStatus).toBe('quarantined');
  await expect(page.getByText('Items received as defective; usable stock was not increased')).toBeVisible();

  const row = page.locator('tbody tr').filter({ hasText: itemName }).first();
  await expect(row).toBeVisible();
  await expect(row.getByText('DEFECTIVE')).toBeVisible();
  await expect(row.getByText('Quarantined')).toBeVisible();
  return row;
}

async function disposition(page: Page, itemName: string, actionLabel: string, note: string) {
  let row = page.locator('tbody tr').filter({ hasText: itemName }).first();
  await row.getByRole('button', { name: 'Disposition' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Receiving Disposition')).toBeVisible();
  await dialog.getByRole('combobox').click();
  await page.getByRole('option', { name: actionLabel, exact: true }).click();
  await dialog.getByPlaceholder(/Inspection result, supplier return reference/i).fill(note);

  const responsePromise = page.waitForResponse((response) =>
    response.request().method() === 'POST' && /\/api\/receiving-records\/[^/]+\/disposition(?:\?|$)/.test(response.url()),
  );
  await dialog.getByRole('button', { name: 'Confirm Disposition' }).click();
  const response = await responsePromise;
  const body = await response.json().catch(() => null);
  expect(response.status(), `Disposition failed: ${JSON.stringify(body)}`).toBe(200);

  row = page.locator('tbody tr').filter({ hasText: itemName }).first();
  await expect(row).toBeVisible();
  return { response, body, row };
}

test('UAT-25: defective receipts stay quarantined until repair release; supplier returns reopen PO capacity', async ({ browser }) => {
  test.setTimeout(180_000);

  const inventoryToken = await getToken('inventory_manager');
  const plantId = await lookupPlantId(inventoryToken, 'PLANT-A');
  const suffix = `${Date.now()}`.slice(-8);

  const repairCase = await createSupplierAndItem(inventoryToken, plantId, suffix, 'QH-REPAIR');
  const supplierReturnCase = await createSupplierAndItem(inventoryToken, plantId, suffix, 'QH-RETURN');
  expect(await inventoryStock(inventoryToken, plantId, repairCase.itemCode, repairCase.item.id)).toBe(0);
  expect(await inventoryStock(inventoryToken, plantId, supplierReturnCase.itemCode, supplierReturnCase.item.id)).toBe(0);

  const context = await browser.newContext();
  await authenticateAs(context, 'inventory_manager');
  const page = await context.newPage();

  await test.step('Defective receipt is quarantined and does not increase usable inventory', async () => {
    await createAndApprovePo(page, repairCase.supplierName, repairCase.itemCode, 2);
    await receiveDefective(page, repairCase.itemCode, repairCase.itemName, 2);
    expect(await inventoryStock(inventoryToken, plantId, repairCase.itemCode, repairCase.item.id)).toBe(0);
  });

  await test.step('Quarantined receipt can enter repair custody without changing stock', async () => {
    const result = await disposition(page, repairCase.itemName, 'Send for Repair / Refurbishment', 'Sent to approved refurbishment vendor');
    expect(result.body?.stockCredited).toBe(false);
    await expect(result.row.getByText('In Repair')).toBeVisible();
    await expect(result.row.getByText('Sent for repair')).toBeVisible();
    expect(await inventoryStock(inventoryToken, plantId, repairCase.itemCode, repairCase.item.id)).toBe(0);
  });

  await test.step('Refurbished receipt is credited to usable inventory exactly when released', async () => {
    const result = await disposition(page, repairCase.itemName, 'Return Refurbished Item to Stock', 'QC passed after refurbishment');
    expect(result.body?.stockCredited).toBe(true);
    await expect(result.row.getByText('Stocked')).toBeVisible();
    await expect(result.row.getByText('Returned from repair')).toBeVisible();
    await expect(result.row.getByRole('button', { name: 'Disposition' })).toHaveCount(0);
    expect(await inventoryStock(inventoryToken, plantId, repairCase.itemCode, repairCase.item.id)).toBe(2);
  });

  await test.step('Supplier return keeps stock at zero and reopens the PO for replacement delivery', async () => {
    await createAndApprovePo(page, supplierReturnCase.supplierName, supplierReturnCase.itemCode, 1);
    await receiveDefective(page, supplierReturnCase.itemCode, supplierReturnCase.itemName, 1);
    expect(await inventoryStock(inventoryToken, plantId, supplierReturnCase.itemCode, supplierReturnCase.item.id)).toBe(0);

    const result = await disposition(page, supplierReturnCase.itemName, 'Return to Supplier', 'Supplier return authorization UAT-RMA');
    expect(result.body?.stockCredited).toBe(false);
    expect(result.body?.poStatus).toBe('approved');
    await expect(page.getByText('Returned to supplier; PO reopened for replacement receipt')).toBeVisible();
    await expect(result.row.getByText('Supplier Return')).toBeVisible();
    expect(await inventoryStock(inventoryToken, plantId, supplierReturnCase.itemCode, supplierReturnCase.item.id)).toBe(0);

    await page.getByRole('button', { name: /New GRN/i }).click();
    await page.getByRole('combobox', { name: /Select PO item/i }).click();
    const search = page.getByPlaceholder(/Search PO or item/i);
    await search.fill(supplierReturnCase.itemCode);
    const replacementOption = page.getByRole('option').filter({ hasText: supplierReturnCase.itemCode }).first();
    await expect(replacementOption).toBeVisible();
    await expect(replacementOption).toContainText('remaining 1');
    await replacementOption.click();

    const replacementDialog = page.getByRole('dialog');
    await replacementDialog.locator('input[type="number"]').first().fill('1');
    const replacementResponsePromise = page.waitForResponse((response) =>
      response.request().method() === 'POST' && /\/api\/purchase-orders\/[^/]+\/receive(?:\?|$)/.test(response.url()),
    );
    await replacementDialog.getByRole('button', { name: 'Receive Items' }).click();
    const replacementResponse = await replacementResponsePromise;
    const replacementBody = await replacementResponse.json().catch(() => null);
    expect(replacementResponse.status(), `Replacement GRN failed: ${JSON.stringify(replacementBody)}`).toBe(200);
    expect(replacementBody?.receipt?.stockCredited).toBe(true);
    expect(replacementBody?.receipt?.custodyStatus).toBe('stocked');
    await expect(page.getByText('Items received and usable inventory updated')).toBeVisible();
    expect(await inventoryStock(inventoryToken, plantId, supplierReturnCase.itemCode, supplierReturnCase.item.id)).toBe(1);
  });

  await context.close();
});
