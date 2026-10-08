/**
 * Scenario Q — Purchased spare/material → repair custody (UAT-17)
 *
 * Proves the browser bridge that was previously missing from Repairs UAT:
 * purchase/receive a spare part → stock top-up → assigned technician requests it
 * from the WO resource card → supervisor approval → store reservation/pick/issue.
 *
 * Accounting invariant: store approval reserves/decrements usable inventory once;
 * physical issue of already-reserved stock must not decrement inventory again.
 */
import { test, expect, type Page } from '@playwright/test';
import { authenticateAs, navigateToWODetail } from './helpers/auth';
import {
  apiCall,
  approveMR,
  convertMR,
  createMR,
  getToken,
  lookupAssetId,
  lookupPlantId,
  lookupUserByKey,
  startWO,
} from './helpers/api';

async function chooseSearchable(page: Page, comboboxName: RegExp, searchPlaceholder: RegExp, optionText: string) {
  await page.getByRole('combobox', { name: comboboxName }).click();
  const search = page.getByPlaceholder(searchPlaceholder);
  await expect(search).toBeVisible();
  await search.fill(optionText);
  await page.getByRole('option').filter({ hasText: optionText }).first().click();
}

function waitForMaterialAction(page: Page, materialRequestId: string, action: string) {
  return page.waitForResponse((response) => {
    if (response.request().method() !== 'POST' || !response.url().endsWith(`/api/repairs/material-requests/${materialRequestId}`)) return false;
    try {
      const body = response.request().postDataJSON() as { action?: string } | null;
      return body?.action === action;
    } catch {
      return false;
    }
  });
}

async function inventoryStock(token: string, plantId: string, itemCode: string, itemId: string) {
  const response = await apiCall(
    token,
    'GET',
    `/api/inventory?search=${encodeURIComponent(itemCode)}&plantId=${encodeURIComponent(plantId)}`,
  );
  expect(response.status).toBe(200);
  const item = (response.data.data as Array<any>).find((row: any) => row.id === itemId);
  expect(item, `Inventory item ${itemCode} should be visible in store stock`).toBeTruthy();
  return Number(item.currentStock);
}

test('UAT-17: purchased spare is received, requested from a repair, reserved, picked and issued', async ({ browser }) => {
  test.setTimeout(180_000);

  const inventoryToken = await getToken('inventory_manager');
  const requesterToken = await getToken('requester');
  const supervisorToken = await getToken('supervisor');
  const plannerToken = await getToken('planner');
  const technicianToken = await getToken('tech_single');
  const storeToken = await getToken('storekeeper');

  const plantId = await lookupPlantId(inventoryToken, 'PLANT-A');
  const assetId = await lookupAssetId(plannerToken, 'UAT-PUMP-001');
  const supervisorId = await lookupUserByKey(plannerToken, 'supervisor');
  const technicianId = await lookupUserByKey(plannerToken, 'tech_single');
  const suffix = `${Date.now()}`.slice(-8);
  const supplierName = `UAT Spare Supplier ${suffix}`;
  const supplierCode = `UAT-SP-SUP-${suffix}`;
  const spareCode = `UAT-SP-${suffix}`;
  const spareName = `UAT Purchased Seal Kit ${suffix}`;

  const supplier = await apiCall(inventoryToken, 'POST', '/api/suppliers', {
    name: supplierName,
    code: supplierCode,
    contactPerson: 'UAT Spare Buyer',
    email: `uat-spare-${suffix}@example.test`,
    country: 'Ghana',
  });
  expect(supplier.status).toBe(201);
  expect(supplier.data.success).toBe(true);

  const spareItemResponse = await apiCall(inventoryToken, 'POST', '/api/inventory', {
    itemCode: spareCode,
    name: spareName,
    category: 'spare_part',
    unitOfMeasure: 'each',
    currentStock: 0,
    minStockLevel: 0,
    unitCost: 85,
    plantId,
  });
  expect(spareItemResponse.status).toBe(201);
  const spareItem = spareItemResponse.data.data;
  expect(await inventoryStock(inventoryToken, plantId, spareCode, spareItem.id)).toBe(0);

  const mr = await createMR(requesterToken, {
    title: `UAT purchased spare repair ${suffix}`,
    description: 'Repair requires a newly purchased seal kit to prove procurement-to-repair custody.',
    assetId,
    priority: 'high',
    plantId,
    supervisorId,
  });
  await approveMR(supervisorToken, mr.id);
  const wo = await convertMR(plannerToken, mr.id, {
    assignedTo: technicianId,
    assignedSupervisorId: supervisorId,
    assignmentType: 'direct',
    tradeActivity: 'mechanical',
    workOrderType: 'corrective',
    priority: 'high',
  });
  await startWO(technicianToken, wo.id);
  // The repair must be in progress for resource requests, but this UAT does not
  // need a live labor timer. Close it immediately so a later assertion failure
  // cannot poison Playwright retries with ACTIVE_SESSION_CONFLICT.
  const initialTimerStop = await apiCall(technicianToken, 'POST', `/api/work-orders/${wo.id}/time-logs/stop`, {});
  expect(initialTimerStop.status).toBe(200);

  const inventoryContext = await browser.newContext();
  await authenticateAs(inventoryContext, 'inventory_manager');
  const inventoryPage = await inventoryContext.newPage();

  await test.step('Store buyer creates and approves a spare-part PO through the frontend', async () => {
    await inventoryPage.goto('/#/inventory-purchase-orders');
    await expect(inventoryPage.getByRole('heading', { name: 'Purchase Orders' })).toBeVisible();
    await inventoryPage.getByRole('button', { name: /New PO/i }).click();
    const dialog = inventoryPage.getByRole('dialog');
    await chooseSearchable(inventoryPage, /Select supplier/i, /Search suppliers/i, supplierName);

    const priorityField = dialog.getByText('Priority *').locator('..');
    await priorityField.getByRole('combobox').click();
    await inventoryPage.getByRole('option', { name: 'High', exact: true }).click();

    await dialog.getByRole('button', { name: /Add Item/i }).click();
    await chooseSearchable(inventoryPage, /Select item/i, /Search items/i, spareCode);
    await dialog.locator('input[type="number"]').first().fill('3');
    await inventoryPage.getByRole('button', { name: 'Create PO' }).click();
    await expect(inventoryPage.getByText('Purchase order created successfully')).toBeVisible();

    const row = inventoryPage.locator('tbody tr').filter({ hasText: supplierName }).first();
    await expect(row).toBeVisible();
    await row.getByRole('button', { name: 'Approve' }).click();
    await expect(row.getByText('APPROVED')).toBeVisible();
  });

  await test.step('GRN receiving tops the purchased spare into usable inventory', async () => {
    await inventoryPage.goto('/#/inventory-receiving');
    await expect(inventoryPage.getByRole('main').getByRole('heading', { name: 'Receiving', level: 1 })).toBeVisible();
    await inventoryPage.getByRole('button', { name: /New GRN/i }).click();
    await chooseSearchable(inventoryPage, /Select PO item/i, /Search PO or item/i, spareCode);
    const dialog = inventoryPage.getByRole('dialog');
    await dialog.locator('input[type="number"]').first().fill('3');

    const responsePromise = inventoryPage.waitForResponse((response) =>
      response.request().method() === 'POST' && /\/api\/purchase-orders\/[^/]+\/receive(?:\?|$)/.test(response.url()),
    );
    await inventoryPage.getByRole('button', { name: 'Receive Items' }).click();
    const response = await responsePromise;
    const body = await response.json().catch(() => null);
    expect(response.status(), `GRN receive failed: ${JSON.stringify(body)}`).toBe(200);
    await expect(inventoryPage.getByText('Items received and usable inventory updated')).toBeVisible();
    expect(await inventoryStock(inventoryToken, plantId, spareCode, spareItem.id)).toBe(3);
  });

  const technicianContext = await browser.newContext();
  await authenticateAs(technicianContext, 'tech_single');
  const technicianPage = await technicianContext.newPage();
  let materialRequestId = '';

  await test.step('Assigned technician requests the received spare from the WO Resources card', async () => {
    await navigateToWODetail(technicianPage, wo.id);
    const materialSelector = technicianPage.getByPlaceholder('Search materials or item codes...');
    await expect(materialSelector).toBeVisible({ timeout: 20_000 });
    await materialSelector.click();
    await materialSelector.fill(spareCode);
    await technicianPage.getByRole('option').filter({ hasText: spareCode }).first().click();

    const requestForm = materialSelector.locator('xpath=ancestor::div[contains(concat(" ", normalize-space(@class), " "), " grid ")][1]');
    await requestForm.locator('input[type="number"]').first().fill('2');

    const requestResponsePromise = technicianPage.waitForResponse((response) =>
      response.request().method() === 'POST' && response.url().includes(`/api/work-orders/${wo.id}/materials`),
    );
    await requestForm.getByRole('button', { name: 'Request Material' }).click();
    const requestResponse = await requestResponsePromise;
    const requestBody = await requestResponse.json().catch(() => null);
    expect(requestResponse.status(), `Material request failed: ${JSON.stringify(requestBody)}`).toBe(201);
    materialRequestId = requestBody?.data?.repairMaterialRequest?.id;
    expect(materialRequestId).toBeTruthy();
    await expect(technicianPage.getByText('Material request submitted')).toBeVisible();
  });

  const supervisorContext = await browser.newContext();
  await authenticateAs(supervisorContext, 'supervisor');
  const supervisorPage = await supervisorContext.newPage();

  await test.step('Assigned supervisor approves the technician request through the frontend', async () => {
    await supervisorPage.goto('/#/repairs-material-requests');
    await expect(supervisorPage.getByRole('heading', { name: 'Material Requests' })).toBeVisible();
    await supervisorPage.getByPlaceholder('Search items or WO#...').fill(spareName);
    const row = supervisorPage.locator('tbody tr').filter({ hasText: spareName }).first();
    await expect(row).toBeVisible();
    await row.click();
    await expect(supervisorPage.getByText(`Material Request — ${wo.woNumber}`)).toBeVisible();
    const supervisorApprovalResponsePromise = waitForMaterialAction(supervisorPage, materialRequestId, 'supervisor_approve');
    await supervisorPage.getByRole('button', { name: 'Approve', exact: true }).click();
    expect((await supervisorApprovalResponsePromise).status()).toBe(200);

    const state = await apiCall(supervisorToken, 'GET', `/api/repairs/material-requests/${materialRequestId}`);
    expect(state.status).toBe(200);
    expect(state.data.data.status).toBe('supervisor_approved');
    expect(Number(state.data.data.quantityApproved)).toBe(2);
  });

  const storeContext = await browser.newContext();
  await authenticateAs(storeContext, 'storekeeper');
  const storePage = await storeContext.newPage();
  const materialRow = () => storePage.locator('tbody tr').filter({ hasText: spareName }).first();

  await test.step('Store approval reserves stock once, then Pick and Issue preserve the reserved balance', async () => {
    await storePage.goto('/#/repairs-material-requests');
    await expect(storePage.getByRole('heading', { name: 'Material Requests' })).toBeVisible();
    await storePage.getByPlaceholder('Search items or WO#...').fill(spareName);
    await expect(materialRow()).toBeVisible();

    await materialRow().click();
    const storeApprovalResponsePromise = waitForMaterialAction(storePage, materialRequestId, 'storekeeper_approve');
    await storePage.getByRole('button', { name: 'Store Approve', exact: true }).click();
    expect((await storeApprovalResponsePromise).status()).toBe(200);

    const reserved = await apiCall(storeToken, 'GET', `/api/repairs/material-requests/${materialRequestId}`);
    expect(reserved.status).toBe(200);
    expect(reserved.data.data.status).toBe('storekeeper_approved');
    expect(reserved.data.data.stockReserved).toBe(true);
    expect(await inventoryStock(inventoryToken, plantId, spareCode, spareItem.id)).toBe(1);

    await expect(materialRow()).toContainText('Storekeeper Approved');
    const pickResponsePromise = storePage.waitForResponse((response) =>
      response.request().method() === 'POST' && response.url().endsWith('/api/repairs/material-requests/pick'),
    );
    await materialRow().getByRole('button', { name: 'Pick', exact: true }).click();
    expect((await pickResponsePromise).status()).toBe(200);

    const picked = await apiCall(storeToken, 'GET', `/api/repairs/material-requests/${materialRequestId}`);
    expect(picked.data.data.status).toBe('picking');
    expect(await inventoryStock(inventoryToken, plantId, spareCode, spareItem.id)).toBe(1);

    await expect(materialRow()).toContainText('Picking');
    const issueResponsePromise = waitForMaterialAction(storePage, materialRequestId, 'issue');
    await materialRow().getByRole('button', { name: 'Issue', exact: true }).click();
    expect((await issueResponsePromise).status()).toBe(200);

    const issued = await apiCall(storeToken, 'GET', `/api/repairs/material-requests/${materialRequestId}`);
    expect(issued.status).toBe(200);
    expect(issued.data.data.status).toBe('issued');
    expect(Number(issued.data.data.quantityIssued)).toBe(2);
    expect(await inventoryStock(inventoryToken, plantId, spareCode, spareItem.id)).toBe(1);
    await expect(materialRow()).toContainText('Issued');
  });

  await test.step('Clean up UAT custody without restoring consumed spare stock', async () => {
    const declaration = await apiCall(technicianToken, 'POST', `/api/repairs/material-requests/${materialRequestId}`, {
      action: 'declare_usage',
      consumedQty: 2,
      wastedQty: 0,
      returnQty: 0,
      notes: 'UAT-17 consumed both issued seal kits.',
    });
    expect(declaration.status).toBe(200);

    const reconcile = await apiCall(storeToken, 'POST', '/api/repairs/material-requests/reconcile', {
      id: materialRequestId,
      consumedQty: 2,
      wastedQty: 0,
      notes: 'UAT-17 store reconciliation.',
    });
    expect(reconcile.status).toBe(200);
    expect(reconcile.data.data.materialRequest.status).toBe('closed');
    expect(await inventoryStock(inventoryToken, plantId, spareCode, spareItem.id)).toBe(1);

  });

  await storeContext.close();
  await supervisorContext.close();
  await technicianContext.close();
  await inventoryContext.close();
});
