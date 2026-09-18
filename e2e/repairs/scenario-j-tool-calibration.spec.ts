/**
 * Scenario J — Tool Calibration Enforcement (UAT-06)
 *
 * Tests real calibration checks using one deterministic WO:
 * - valid calibration issues successfully
 * - expired/failed calibration issues nothing and leaves request approved
 * - technician cannot self-issue a tool.
 */
import { test, expect } from '@playwright/test';
import {
  getToken,
  createMR,
  approveMR,
  convertMR,
  assignWO,
  startWO,
  getWO,
  lookupUserByKey,
  lookupAssetId,
  lookupPlantId,
  lookupToolId,
  apiCall,
} from './helpers/api';

test('UAT-06: Scenario J — Tool Calibration Enforcement', async () => {
  const plannerToken = await getToken('planner');
  const techUserId = await lookupUserByKey(plannerToken, 'tech_single');
  const supervisorUserId = await lookupUserByKey(plannerToken, 'supervisor');
  const assetId = await lookupAssetId(plannerToken, 'UAT-PUMP-001');
  const plantId = await lookupPlantId(plannerToken, 'PLANT-A');

  const validToolId = await lookupToolId(plannerToken, 'UAT-CAL-VALID');
  const expiredToolId = await lookupToolId(plannerToken, 'UAT-CAL-EXPIRED');
  const failedToolId = await lookupToolId(plannerToken, 'UAT-CAL-FAILED');

  let woId = '';

  await test.step('J1: Create one deterministic in-progress WO', async () => {
    const requesterToken = await getToken('requester');
    const supervisorToken = await getToken('supervisor');
    const techToken = await getToken('tech_single');

    const mr = await createMR(requesterToken, {
      title: 'UAT-ToolCal-Scenario-J',
      description: 'WO for testing tool calibration enforcement.',
      assetId,
      priority: 'high',
      plantId,
    });

    await approveMR(supervisorToken, mr.id);
    const wo = await convertMR(plannerToken, mr.id, {
      assignedTo: techUserId,
      assignedSupervisorId: supervisorUserId,
      tradeActivity: 'mechanical',
      workOrderType: 'corrective',
      priority: 'high',
    });
    woId = wo.id;
    expect(woId).toBeTruthy();

    await assignWO(plannerToken, woId, { assignedTo: techUserId, assignedSupervisorId: supervisorUserId });
    await startWO(techToken, woId);

    const fetched = await getWO(techToken, woId);
    expect(fetched.status).toBe('in_progress');
  });

  const techToken = await getToken('tech_single');
  const supervisorToken = await getToken('supervisor');
  const storekeeperToken = await getToken('storekeeper');

  async function createAndApproveToolRequest(toolId: string) {
    const { status: crStatus, data: crData } = await apiCall(
      techToken,
      'POST',
      '/api/repairs/tool-requests',
      {
        workOrderId: woId,
        reason: `Calibration test for tool ${toolId.slice(0, 8)}`,
        urgency: 'normal',
        items: [{
          toolId,
          toolName: `Cal test ${toolId.slice(0, 8)}`,
          quantityRequested: 1,
        }],
      },
    );
    expect(crStatus).toBe(201);
    expect(crData.success).toBe(true);
    const trId = crData.data.id;
    const itemId = crData.data.items[0].id;
    expect(trId).toBeTruthy();
    expect(itemId).toBeTruthy();

    const { status: saStatus, data: saData } = await apiCall(
      supervisorToken,
      'POST',
      `/api/repairs/tool-requests/${trId}`,
      { action: 'supervisor_approve' },
    );
    expect(saStatus).toBe(200);
    expect(saData.data.status).toBe('supervisor_approved');

    const { status: skStatus, data: skData } = await apiCall(
      storekeeperToken,
      'POST',
      `/api/repairs/tool-requests/${trId}`,
      { action: 'storekeeper_approve' },
    );
    expect(skStatus).toBe(200);
    expect(skData.data.status).toBe('storekeeper_approved');

    return { trId, itemId };
  }

  async function getToolTransactions(toolId: string) {
    const { status, data } = await apiCall(
      plannerToken,
      'GET',
      `/api/tools/${toolId}/transactions`,
    );
    expect(status).toBe(200);
    return data;
  }

  await test.step('J2: Valid calibration issues successfully', async () => {
    const { trId, itemId } = await createAndApproveToolRequest(validToolId);

    const { status: issueStatus, data: issueData } = await apiCall(
      storekeeperToken,
      'POST',
      `/api/repairs/tool-requests/${trId}`,
      {
        action: 'issue',
        issuedItems: [{ itemId, quantityIssued: 1 }],
      },
    );
    expect(issueStatus).toBe(200);
    expect(issueData.success).toBe(true);

    const warnings = issueData.warnings as string[] | undefined;
    if (warnings) expect(warnings.some((w) => w.toLowerCase().includes('blocked'))).toBe(false);

    const { data: fetched } = await apiCall(techToken, 'GET', `/api/repairs/tool-requests/${trId}`);
    expect(fetched.data.status).toBe('issued');
    const issuedItem = fetched.data.items.find((i: any) => i.id === itemId);
    expect(issuedItem.quantityIssued).toBeGreaterThanOrEqual(1);

    const txData = await getToolTransactions(validToolId);
    const checkouts = (txData.data as Array<{ type: string }>).filter((tx) => tx.type === 'checkout');
    expect(checkouts.length).toBeGreaterThanOrEqual(1);
  });

  await test.step('J3: Expired calibration blocks issue without changing request to issued', async () => {
    const { trId, itemId } = await createAndApproveToolRequest(expiredToolId);

    const { status: issueStatus, data: issueData } = await apiCall(
      storekeeperToken,
      'POST',
      `/api/repairs/tool-requests/${trId}`,
      {
        action: 'issue',
        issuedItems: [{ itemId, quantityIssued: 1 }],
      },
    );
    expect(issueStatus).toBe(200);
    expect(issueData.success).toBe(true);
    const warnings = issueData.warnings as string[];
    expect(warnings.some((w) => /calibration|blocked/i.test(w))).toBe(true);

    const { data: fetched } = await apiCall(techToken, 'GET', `/api/repairs/tool-requests/${trId}`);
    expect(fetched.data.status).toBe('storekeeper_approved');
    const blockedItem = fetched.data.items.find((i: any) => i.id === itemId);
    expect(blockedItem.quantityIssued ?? 0).toBe(0);
    expect(blockedItem.availabilityStatus).toBe('unavailable');

    const txData = await getToolTransactions(expiredToolId);
    expect(txData.pagination.total).toBe(0);
  });

  await test.step('J4: Failed calibration blocks issue without checkout', async () => {
    const { trId, itemId } = await createAndApproveToolRequest(failedToolId);

    const { status: issueStatus, data: issueData } = await apiCall(
      storekeeperToken,
      'POST',
      `/api/repairs/tool-requests/${trId}`,
      {
        action: 'issue',
        issuedItems: [{ itemId, quantityIssued: 1 }],
      },
    );
    expect(issueStatus).toBe(200);
    expect(issueData.success).toBe(true);
    const warnings = issueData.warnings as string[];
    expect(warnings.some((w) => /calibration|blocked/i.test(w))).toBe(true);

    const { data: fetched } = await apiCall(techToken, 'GET', `/api/repairs/tool-requests/${trId}`);
    expect(fetched.data.status).toBe('storekeeper_approved');
    const blockedItem = fetched.data.items.find((i: any) => i.id === itemId);
    expect(blockedItem.quantityIssued ?? 0).toBe(0);

    const txData = await getToolTransactions(failedToolId);
    expect(txData.pagination.total).toBe(0);
  });

  await test.step('J5: Technician cannot self-issue an approved tool request', async () => {
    const { trId, itemId } = await createAndApproveToolRequest(expiredToolId);

    const { status: issueStatus, data: issueData } = await apiCall(
      techToken,
      'POST',
      `/api/repairs/tool-requests/${trId}`,
      {
        action: 'issue',
        issuedItems: [{ itemId, quantityIssued: 1 }],
      },
    );
    expect(issueStatus).toBe(403);
    expect(issueData.success).toBe(false);

    const { data: fetched } = await apiCall(techToken, 'GET', `/api/repairs/tool-requests/${trId}`);
    expect(fetched.data.status).toBe('storekeeper_approved');
    const item = fetched.data.items.find((i: any) => i.id === itemId);
    expect(item.quantityIssued ?? 0).toBe(0);
  });

  await test.step('J6: Close the live execution timer so later scenarios start cleanly', async () => {
    const stopped = await apiCall(
      techToken,
      'POST',
      `/api/work-orders/${woId}/time-logs/stop`,
      {},
    );
    expect(stopped.status).toBe(200);
    expect(stopped.data.success).toBe(true);
    expect(stopped.data.data.closedTimers).toBeGreaterThanOrEqual(1);
  });
});