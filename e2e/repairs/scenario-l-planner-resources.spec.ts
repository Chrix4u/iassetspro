/**
 * Scenario L — Planner Resources Survive MR → WO Conversion (UAT-12)
 *
 * Regression coverage for planner-selected spare parts/tools during MR conversion.
 * Both resources must be visible on the resulting WO detail data immediately.
 */
import { test, expect } from '@playwright/test';
import {
  getToken,
  approveMR,
  convertMR,
  getWO,
  lookupUserByKey,
  lookupAssetId,
  lookupPlantId,
  lookupToolId,
  apiCall,
} from './helpers/api';

test('UAT-12: planner-selected material and tool appear on converted WO details', async () => {
  const plannerToken = await getToken('planner');
  const requesterToken = await getToken('requester');
  const supervisorToken = await getToken('supervisor');
  const storeToken = await getToken('storekeeper');

  const techUserId = await lookupUserByKey(plannerToken, 'tech_single');
  const supervisorUserId = await lookupUserByKey(plannerToken, 'supervisor');
  const assetId = await lookupAssetId(plannerToken, 'UAT-PUMP-001');
  const plantId = await lookupPlantId(plannerToken, 'PLANT-A');
  const toolId = await lookupToolId(plannerToken, 'UAT-CAL-VALID');

  const { status: inventoryStatus, data: inventoryData } = await apiCall(
    storeToken,
    'GET',
    `/api/inventory?search=${encodeURIComponent('UAT-BRG-6205')}&plantId=${encodeURIComponent(plantId)}`,
  );
  expect(inventoryStatus).toBe(200);
  const material = (inventoryData.data as Array<any>).find((item) => item.itemCode === 'UAT-BRG-6205');
  expect(material).toBeTruthy();

  const { status: createStatus, data: createData } = await apiCall(
    requesterToken,
    'POST',
    '/api/maintenance-requests',
    {
      title: 'UAT-Planner-Resource-Conversion',
      description: 'Regression: planner-selected part and tool must survive MR conversion.',
      assetId,
      priority: 'medium',
      plantId,
      supervisorId: supervisorUserId,
    },
  );
  expect(createStatus).toBe(201);
  const mrId = createData.data.id as string;
  expect(mrId).toBeTruthy();

  const approved = await approveMR(supervisorToken, mrId);
  expect(approved.status).toBe('approved');

  const wo = await convertMR(plannerToken, mrId, {
    assignedTo: techUserId,
    assignedSupervisorId: supervisorUserId,
    tradeActivity: 'mechanical',
    workOrderType: 'corrective',
    priority: 'medium',
    requiredParts: [{ itemId: material.id, quantity: 2 }],
    requiredTools: [{ toolId, quantity: 1 }],
  });

  expect(wo.id).toBeTruthy();

  const detail = await getWO(plannerToken, wo.id);

  const plannedMaterial = (detail.materials as Array<any>).find(
    (item) => item.itemId === material.id && item.status === 'planned',
  );
  expect(plannedMaterial).toBeTruthy();
  expect(Number(plannedMaterial.quantity)).toBe(2);

  const canonicalMaterial = (detail.repairMaterialRequests as Array<any>).find(
    (item) => item.itemId === material.id && item.source === 'planner_suggested',
  );
  expect(canonicalMaterial).toBeTruthy();
  expect(canonicalMaterial.status).toBe('pending');
  expect(Number(canonicalMaterial.quantityRequested)).toBe(2);

  const canonicalTool = (detail.repairToolRequests as Array<any>).find(
    (item) => item.toolId === toolId && item.source === 'planner_suggested',
  );
  expect(canonicalTool).toBeTruthy();
  expect(canonicalTool.status).toBe('pending');

  const { status: suggestedStatus, data: suggestedData } = await apiCall(
    plannerToken,
    'GET',
    `/api/work-orders/${wo.id}/suggested-items`,
  );
  expect(suggestedStatus).toBe(200);
  expect(suggestedData.success).toBe(true);

  const suggestedPart = (suggestedData.data.suggestedParts as Array<any>).find(
    (item) => item.itemId === material.id,
  );
  expect(suggestedPart).toBeTruthy();
  expect(suggestedPart.itemName).toBe(material.name);
  expect(Number(suggestedPart.quantity)).toBe(2);
  expect(suggestedPart.pipelineStatus).toBe('pending');

  const suggestedTool = (suggestedData.data.suggestedTools as Array<any>).find(
    (item) => item.toolId === toolId,
  );
  expect(suggestedTool).toBeTruthy();
  expect(Number(suggestedTool.quantity)).toBe(1);
  expect(suggestedTool.pipelineStatus).toBe('pending');
});
