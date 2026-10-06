import { test, expect, type Page } from '@playwright/test';
import { authenticateAs } from './helpers/auth';
import {
  apiCall,
  approveMR,
  convertMR,
  createMR,
  getToken,
  lookupPlantId,
  lookupUserByKey,
} from './helpers/api';

async function chooseSearchable(page: Page, comboboxName: RegExp, searchPlaceholder: RegExp, optionText: string) {
  await page.getByRole('combobox', { name: comboboxName }).click();
  const search = page.getByPlaceholder(searchPlaceholder);
  await expect(search).toBeVisible();
  await search.fill(optionText);
  await page.getByRole('option').filter({ hasText: optionText }).first().click();
}

test('UAT-16: purchased tools replenish inventory, commission once, and reusable spares return after refurbishment', async ({ browser }) => {
  test.setTimeout(120_000);

  const inventoryToken = await getToken('inventory_manager');
  const requesterToken = await getToken('requester');
  const supervisorToken = await getToken('supervisor');
  const plannerToken = await getToken('planner');
  const plantId = await lookupPlantId(inventoryToken, 'PLANT-A');
  const suffix = `${Date.now()}`.slice(-8);
  const supplierName = `UAT Procurement Supplier ${suffix}`;
  const supplierCode = `UAT-SUP-${suffix}`;
  const toolCode = `UAT-TL-${suffix}`;
  const toolName = `UAT Purchased Torque Tool ${suffix}`;
  const reusableCode = `UAT-RET-${suffix}`;
  const reusableName = `UAT Reusable Bearing ${suffix}`;

  const supplierResp = await apiCall(inventoryToken, 'POST', '/api/suppliers', {
    name: supplierName,
    code: supplierCode,
    contactPerson: 'UAT Store Buyer',
    email: `uat-${suffix}@example.test`,
    country: 'Ghana',
  });
  expect(supplierResp.status).toBe(201);
  expect(supplierResp.data.success).toBe(true);

  const toolItemResp = await apiCall(inventoryToken, 'POST', '/api/inventory', {
    itemCode: toolCode,
    name: toolName,
    category: 'tool',
    unitOfMeasure: 'each',
    currentStock: 0,
    minStockLevel: 0,
    unitCost: 250,
    plantId,
  });
  expect(toolItemResp.status).toBe(201);
  const toolItem = toolItemResp.data.data;

  const reusableItemResp = await apiCall(inventoryToken, 'POST', '/api/inventory', {
    itemCode: reusableCode,
    name: reusableName,
    category: 'spare_part',
    unitOfMeasure: 'each',
    currentStock: 0,
    minStockLevel: 0,
    unitCost: 120,
    plantId,
  });
  expect(reusableItemResp.status).toBe(201);
  const reusableItem = reusableItemResp.data.data;

  const inventoryContext = await browser.newContext();
  await authenticateAs(inventoryContext, 'inventory_manager');
  const inventoryPage = await inventoryContext.newPage();

  await test.step('Inventory manager creates and approves a PO through the frontend', async () => {
    await inventoryPage.goto('/#/inventory-purchase-orders');
    await expect(inventoryPage.getByRole('heading', { name: 'Purchase Orders' })).toBeVisible();
    await inventoryPage.getByRole('button', { name: /New PO/i }).click();
    const dialog = inventoryPage.getByRole('dialog');
    await chooseSearchable(inventoryPage, /Select supplier/i, /Search suppliers/i, supplierName);

    const priorityField = dialog.getByText('Priority *').locator('..');
    await priorityField.getByRole('combobox').click();
    await inventoryPage.getByRole('option', { name: 'High', exact: true }).click();

    await dialog.getByRole('button', { name: /Add Item/i }).click();
    await chooseSearchable(inventoryPage, /Select item/i, /Search items/i, toolCode);

    const quantityInput = dialog.locator('input[type="number"]').first();
    await quantityInput.fill('2');
    await inventoryPage.getByRole('button', { name: 'Create PO' }).click();
    await expect(inventoryPage.getByText('Purchase order created successfully')).toBeVisible();

    const row = inventoryPage.locator('tbody tr').filter({ hasText: supplierName }).first();
    await expect(row).toBeVisible();
    await row.getByRole('button', { name: 'Approve' }).click();
    await expect(row.getByText('APPROVED')).toBeVisible();
  });

  await test.step('Receiving the approved PO increases usable inventory through the frontend', async () => {
    await inventoryPage.goto('/#/inventory-receiving');
    await expect(inventoryPage.getByRole('main').getByRole('heading', { name: 'Receiving', level: 1 })).toBeVisible();
    await inventoryPage.getByRole('button', { name: /New GRN/i }).click();
    await chooseSearchable(inventoryPage, /Select PO item/i, /Search PO or item/i, toolCode);
    const receiptDialog = inventoryPage.getByRole('dialog');
    await receiptDialog.locator('input[type="number"]').first().fill('2');
    const receiptResponsePromise = inventoryPage.waitForResponse((response) =>
      response.request().method() === 'POST' && /\/api\/purchase-orders\/[^/]+\/receive(?:\?|$)/.test(response.url()),
    );
    await inventoryPage.getByRole('button', { name: 'Receive Items' }).click();
    const receiptResponse = await receiptResponsePromise;
    const receiptBody = await receiptResponse.json().catch(() => null);
    expect(receiptResponse.status(), `GRN receive failed: ${JSON.stringify(receiptBody)}`).toBe(200);
    await expect(inventoryPage.getByText('Items received and usable inventory updated')).toBeVisible();

    const stock = await apiCall(inventoryToken, 'GET', `/api/inventory?search=${encodeURIComponent(toolCode)}&plantId=${encodeURIComponent(plantId)}`);
    expect(stock.status).toBe(200);
    expect(stock.data.data.find((row: any) => row.id === toolItem.id)?.currentStock).toBe(2);
  });

  await test.step('Commissioning removes inventory stock exactly once and creates reusable tool custody', async () => {
    await inventoryPage.goto('/#/inventory');
    await expect(inventoryPage.getByRole('main').getByRole('heading', { name: 'Inventory', level: 1, exact: true })).toBeVisible();
    await inventoryPage.getByPlaceholder('Search inventory...').fill(toolCode);
    const row = inventoryPage.locator('tbody tr').filter({ hasText: toolCode }).first();
    await expect(row).toBeVisible();
    await row.locator('button').last().click();
    await inventoryPage.getByText('Commission to Tools').click();
    await expect(inventoryPage.getByText('Commission Purchased Tools')).toBeVisible();
    const commissionDialog = inventoryPage.getByRole('dialog');
    await commissionDialog.locator('input[type="number"]').fill('1');
    const commissionResponsePromise = inventoryPage.waitForResponse((response) =>
      response.request().method() === 'POST' && /\/api\/inventory\/[^/]+\/commission-tools(?:\?|$)/.test(response.url()),
    );
    await inventoryPage.getByRole('button', { name: 'Commission to Tool Registry' }).click();
    const commissionResponse = await commissionResponsePromise;
    const commissionBody = await commissionResponse.json().catch(() => null);
    expect(commissionResponse.status(), `Tool commissioning failed: ${JSON.stringify(commissionBody)}`).toBe(201);
    await expect(inventoryPage.getByText(/commissioned to the Tool Registry/i)).toBeVisible();

    const stock = await apiCall(inventoryToken, 'GET', `/api/inventory?search=${encodeURIComponent(toolCode)}&plantId=${encodeURIComponent(plantId)}`);
    expect(stock.status).toBe(200);
    expect(stock.data.data.find((item: any) => item.id === toolItem.id)?.currentStock).toBe(1);
  });

  let returnId = '';
  await test.step('Create a deterministic repair return linked to a real work order', async () => {
    const mr = await createMR(requesterToken, {
      title: `UAT reusable-return ${suffix}`,
      description: 'Browser UAT for reusable spare refurbishment and store return.',
      priority: 'medium',
      plantId,
    });
    await approveMR(supervisorToken, mr.id);
    const technicianId = await lookupUserByKey(plannerToken, 'tech_single');
    const wo = await convertMR(plannerToken, mr.id, {
      assignedTo: technicianId,
      assignmentType: 'direct',
      tradeActivity: 'Mechanical',
      workOrderType: 'corrective',
      priority: 'medium',
    });
    const created = await apiCall(supervisorToken, 'POST', '/api/repairs/spare-part-returns', {
      workOrderId: wo.id,
      itemId: reusableItem.id,
      itemName: reusableName,
      quantity: 1,
      conditionOnReturn: 'worn',
      refurbishmentNeeded: true,
      isConsumed: false,
    });
    expect(created.status).toBe(201);
    returnId = created.data.data.id;
  });

  const supervisorContext = await browser.newContext();
  await authenticateAs(supervisorContext, 'supervisor');
  const supervisorPage = await supervisorContext.newPage();

  await test.step('Supervisor inspects, starts and completes refurbishment through the frontend', async () => {
    await supervisorPage.goto('/#/repairs-spare-part-returns');
    await expect(supervisorPage.getByRole('heading', { name: 'Spare Part Returns' })).toBeVisible();
    await supervisorPage.getByPlaceholder('Search parts...').fill(reusableName);
    let row = supervisorPage.locator('tbody tr').filter({ hasText: reusableName }).first();
    await expect(row).toBeVisible();
    await row.getByRole('button', { name: /Inspect/i }).click();
    const inspectDialog = supervisorPage.getByRole('dialog');
    await expect(inspectDialog.locator('#refurbNeeded')).toBeChecked();
    await inspectDialog.getByRole('button', { name: 'Submit Inspection' }).click();

    row = supervisorPage.locator('tbody tr').filter({ hasText: reusableName }).first();
    await expect(row.getByRole('button', { name: /Start Refurb/i })).toBeVisible();
    await row.getByRole('button', { name: /Start Refurb/i }).click();
    await expect(row.getByRole('button', { name: /Complete/i })).toBeVisible();
    await row.getByRole('button', { name: /Complete/i }).click();
    await expect(row.getByText(/Refurbished/i)).toBeVisible();
  });

  await test.step('Store custody returns the refurbished spare and credits stock exactly once', async () => {
    await inventoryPage.goto('/#/repairs-spare-part-returns');
    await inventoryPage.getByPlaceholder('Search parts...').fill(reusableName);
    const row = inventoryPage.locator('tbody tr').filter({ hasText: reusableName }).first();
    await expect(row.getByRole('button', { name: /To Store/i })).toBeVisible();
    await row.getByRole('button', { name: /To Store/i }).click();
    await expect(row.getByText(/Returned To Store/i)).toBeVisible();

    const stock = await apiCall(inventoryToken, 'GET', `/api/inventory?search=${encodeURIComponent(reusableCode)}&plantId=${encodeURIComponent(plantId)}`);
    expect(stock.status).toBe(200);
    expect(stock.data.data.find((item: any) => item.id === reusableItem.id)?.currentStock).toBe(1);

    const secondReturn = await apiCall(inventoryToken, 'POST', `/api/repairs/spare-part-returns/${returnId}`, { action: 'return_to_store' });
    expect([400, 409]).toContain(secondReturn.status);
    const stockAfterRetry = await apiCall(inventoryToken, 'GET', `/api/inventory?search=${encodeURIComponent(reusableCode)}&plantId=${encodeURIComponent(plantId)}`);
    expect(stockAfterRetry.data.data.find((item: any) => item.id === reusableItem.id)?.currentStock).toBe(1);
  });

  await supervisorContext.close();
  await inventoryContext.close();
});
