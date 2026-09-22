/**
 * Scenario M — Assigned technician can cancel pending material/tool requests
 * created from planner recommendations and return them to recommendation state.
 */
import { test, expect, type BrowserContext } from '@playwright/test';
import { authenticateAs, navigateToWODetail } from './helpers/auth';
import {
  getToken,
  approveMR,
  convertMR,
  lookupUserByKey,
  lookupAssetId,
  lookupPlantId,
  lookupToolId,
  apiCall,
} from './helpers/api';

test('UAT-13: technician cancels pending recommended resource requests from WO details', async ({ browser }) => {
  const context: BrowserContext = await browser.newContext();
  const plannerToken = await getToken('planner');
  const requesterToken = await getToken('requester');
  const supervisorToken = await getToken('supervisor');
  const storeToken = await getToken('storekeeper');
  const technicianToken = await getToken('tech_single');

  const techUserId = await lookupUserByKey(plannerToken, 'tech_single');
  const supervisorUserId = await lookupUserByKey(plannerToken, 'supervisor');
  const assetId = await lookupAssetId(plannerToken, 'UAT-PUMP-001');
  const plantId = await lookupPlantId(plannerToken, 'PLANT-A');
  const toolId = await lookupToolId(plannerToken, 'UAT-CAL-VALID');

  const inventoryPath = '/api/inventory?search=' + encodeURIComponent('UAT-BRG-6205')
    + '&plantId=' + encodeURIComponent(plantId);
  const { status: inventoryStatus, data: inventoryResponse } = await apiCall(
    storeToken,
    'GET',
    inventoryPath,
  );
  expect(inventoryStatus).toBe(200);
  expect(inventoryResponse.success).toBe(true);

  const inventoryItems = Array.isArray(inventoryResponse.data) ? inventoryResponse.data : [];
  const material = inventoryItems.find((item: any) => item.itemCode === 'UAT-BRG-6205');
  expect(material).toBeTruthy();

  const { status: createStatus, data: createResponse } = await apiCall(
    requesterToken,
    'POST',
    '/api/maintenance-requests',
    {
      title: 'UAT-Pending-Resource-Cancel',
      description: 'Submitted planner recommendations must be cancellable while pending.',
      assetId,
      priority: 'medium',
      plantId,
      supervisorId: supervisorUserId,
    },
  );
  expect(createStatus).toBe(201);
  expect(createResponse.success).toBe(true);

  const mrId = createResponse.data.id as string;
  const approved = await approveMR(supervisorToken, mrId);
  expect(approved.status).toBe('approved');

  const wo = await convertMR(plannerToken, mrId, {
    assignedTo: techUserId,
    assignedSupervisorId: supervisorUserId,
    assignmentType: 'direct',
    tradeActivity: 'mechanical',
    workOrderType: 'corrective',
    priority: 'medium',
    requiredParts: [{ itemId: material.id, quantity: 2 }],
    requiredTools: [{ toolId, quantity: 1 }],
  });
  expect(wo.id).toBeTruthy();

  const { status: submitStatus, data: submitResponse } = await apiCall(
    technicianToken,
    'PUT',
    '/api/work-orders/' + wo.id + '/suggested-items',
    { action: 'submit_recommendations' },
  );
  expect(submitStatus).toBe(200);
  expect(submitResponse.success).toBe(true);
  expect(Number(submitResponse.data.materialCount)).toBe(1);
  expect(Number(submitResponse.data.toolCount)).toBe(1);

  const { status: detailStatus, data: detailResponse } = await apiCall(
    technicianToken,
    'GET',
    '/api/work-orders/' + wo.id,
  );
  expect(detailStatus).toBe(200);
  expect(detailResponse.success).toBe(true);

  const materialRequest = (detailResponse.data.repairMaterialRequests as Array<any>).find(
    (row) =>
      row.itemId === material.id
      && row.source === 'technician_from_planner_recommendation'
      && row.status === 'pending',
  );
  const toolRequest = (detailResponse.data.repairToolRequests as Array<any>).find(
    (row) =>
      row.toolId === toolId
      && row.source === 'technician_from_planner_recommendation'
      && row.status === 'pending',
  );
  expect(materialRequest).toBeTruthy();
  expect(toolRequest).toBeTruthy();

  // Exercise the actual technician WO confirmation flow, not only the DELETE APIs.
  await authenticateAs(context, 'tech_single');
  const page = await context.newPage();
  await navigateToWODetail(page, wo.id);

  const materialRow = page.getByText(material.name, { exact: true }).first()
    .locator('xpath=ancestor::div[contains(@class,"rounded-lg")][1]');
  await expect(materialRow).toBeVisible({ timeout: 15_000 });
  await materialRow.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByText('Cancel pending request?', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Yes, Cancel Request' }).click();
  await expect(page.getByText('Material request cancelled', { exact: true })).toBeVisible({ timeout: 10_000 });

  const toolName = toolRequest.toolName
    || toolRequest.items?.[0]?.toolName
    || toolRequest.items?.[0]?.tool?.name
    || 'UAT-CAL-VALID';
  const toolRow = page.getByText(toolName, { exact: true }).first()
    .locator('xpath=ancestor::div[contains(@class,"rounded-lg")][1]');
  await expect(toolRow).toBeVisible({ timeout: 15_000 });
  await toolRow.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByText('Cancel pending request?', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Yes, Cancel Request' }).click();
  await expect(page.getByText('Tool request cancelled', { exact: true })).toBeVisible({ timeout: 10_000 });

  const { status: suggestedStatus, data: suggestedResponse } = await apiCall(
    technicianToken,
    'GET',
    '/api/work-orders/' + wo.id + '/suggested-items',
  );
  expect(suggestedStatus).toBe(200);
  expect(suggestedResponse.success).toBe(true);

  const suggestedPart = (suggestedResponse.data.suggestedParts as Array<any>).find(
    (row) => row.itemId === material.id,
  );
  const suggestedTool = (suggestedResponse.data.suggestedTools as Array<any>).find(
    (row) => row.toolId === toolId,
  );
  expect(suggestedPart).toBeTruthy();
  expect(suggestedPart.pipelineStatus).toBe('suggested');
  expect(suggestedTool).toBeTruthy();
  expect(suggestedTool.pipelineStatus).toBe('suggested');

  const { status: restoredStatus, data: restoredResponse } = await apiCall(
    technicianToken,
    'GET',
    '/api/work-orders/' + wo.id,
  );
  expect(restoredStatus).toBe(200);
  const restoredMaterial = (restoredResponse.data.materials as Array<any>).find(
    (row) => row.itemId === material.id,
  );
  expect(restoredMaterial).toBeTruthy();
  expect(restoredMaterial.status).toBe('planned');

  await page.close();
  await context.close();
});
