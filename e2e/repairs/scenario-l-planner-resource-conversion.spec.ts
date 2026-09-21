/**
 * Scenario L — Planner resources survive MR → WO conversion
 * Regression for the production issue where a planner-selected spare part
 * disappeared from Work Order Details while the selected tool remained visible.
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

test('UAT-12: planner-selected material and tool both appear on converted WO details', async ({ browser }) => {
  const context: BrowserContext = await browser.newContext();

  try {
    const plannerToken = await getToken('planner');
    const requesterToken = await getToken('requester');
    const supervisorToken = await getToken('supervisor');
    const storeToken = await getToken('storekeeper');

    const techUserId = await lookupUserByKey(plannerToken, 'tech_single');
    const supervisorUserId = await lookupUserByKey(plannerToken, 'supervisor');
    const assetId = await lookupAssetId(plannerToken, 'UAT-PUMP-001');
    const plantId = await lookupPlantId(plannerToken, 'PLANT-A');
    const toolId = await lookupToolId(plannerToken, 'UAT-CAL-VALID');

    const inventoryPath = '/api/inventory?search=' + encodeURIComponent('UAT-BRG-6205') + '&plantId=' + encodeURIComponent(plantId);
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
        title: 'UAT-Planner-Resource-Conversion',
        description: 'Planner-selected material and tool must both survive MR conversion.',
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

    const { status: detailStatus, data: detailResponse } = await apiCall(
      plannerToken,
      'GET',
      '/api/work-orders/' + wo.id,
    );
    expect(detailStatus).toBe(200);
    expect(detailResponse.success).toBe(true);

    const detail = detailResponse.data;
    const plannedMaterial = (detail.materials as Array<any>).find(
      (item) => item.itemId === material.id && item.status === 'planned',
    );
    expect(plannedMaterial).toBeTruthy();
    expect(Number(plannedMaterial.quantity)).toBe(2);

    const visibleMaterial = (detail.repairMaterialRequests as Array<any>).find(
      (item) => item.itemId === material.id && item.source === 'planner_suggested',
    );
    expect(visibleMaterial).toBeTruthy();
    expect(Number(visibleMaterial.quantityRequested)).toBe(2);
    expect(['planned', 'pending']).toContain(visibleMaterial.status);

    const visibleTool = (detail.repairToolRequests as Array<any>).find(
      (item) => item.toolId === toolId && item.source === 'planner_suggested',
    );
    expect(visibleTool).toBeTruthy();
    expect(visibleTool.status).toBe('pending');

    const { status: suggestedStatus, data: suggestedResponse } = await apiCall(
      plannerToken,
      'GET',
      '/api/work-orders/' + wo.id + '/suggested-items',
    );
    expect(suggestedStatus).toBe(200);
    expect(suggestedResponse.success).toBe(true);

    const suggestedPart = (suggestedResponse.data.suggestedParts as Array<any>).find(
      (item) => item.itemId === material.id,
    );
    expect(suggestedPart).toBeTruthy();
    expect(suggestedPart.itemName).toBe(material.name);
    expect(Number(suggestedPart.quantity)).toBe(2);

    const suggestedTool = (suggestedResponse.data.suggestedTools as Array<any>).find(
      (item) => item.toolId === toolId,
    );
    expect(suggestedTool).toBeTruthy();
    expect(Number(suggestedTool.quantity)).toBe(1);

    // User-visible regression check: open the actual WO details page and prove
    // both planner-selected resources render. The original defect showed the
    // tool while the material disappeared.
    await authenticateAs(context, 'planner');
    const page = await context.newPage();
    await navigateToWODetail(page, wo.id);
    await expect(page.getByText(material.name, { exact: false }).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/UAT-CAL-VALID/i).first()).toBeVisible({ timeout: 20_000 });
    await page.close();
  } finally {
    await context.close();
  }
});