/**
 * Scenario G — Resource Blocking/Reconciliation (UAT-07)
 *
 * Proves that outstanding issued tools block canonical WO completion and that
 * the blocker disappears only after technician return + store confirmation.
 */
import { test, expect, type BrowserContext } from '@playwright/test';
import {
  getToken,
  createMR,
  approveMR,
  convertMR,
  startWO,
  logTime,
  getWO,
  completeWO,
  lookupUserByKey,
  lookupAssetId,
  lookupPlantId,
  apiCall,
  expectFailure,
} from './helpers/api';
import { authenticateAs, navigateToWODetail, expectWODetailStatus } from './helpers/auth';

test('UAT-07: Scenario G — Resource Blockers on Completion', async ({ browser }) => {
  const context: BrowserContext = await browser.newContext();

  let woId: string;
  let assetId: string;
  let plantId: string;
  let techSingleUserId: string;
  let supervisorUserId: string;
  let toolRequestId: string;

  try {
    const plannerToken = await getToken('planner');
    techSingleUserId = await lookupUserByKey(plannerToken, 'tech_single');
    supervisorUserId = await lookupUserByKey(plannerToken, 'supervisor');
    assetId = await lookupAssetId(plannerToken, 'UAT-PUMP-001');
    plantId = await lookupPlantId(plannerToken, 'PLANT-A');

    await test.step('G1: Create WO, record labor, and issue tool request', async () => {
      const requesterToken = await getToken('requester');
      const supervisorToken = await getToken('supervisor');
      const planToken = await getToken('planner');
      const techToken = await getToken('tech_single');

      const mr = await createMR(requesterToken, {
        title: 'UAT-ResourceBlocker-Pump-Repair',
        description: 'Pump seal replacement requiring special tools.',
        assetId,
        priority: 'high',
        plantId,
      });

      await approveMR(supervisorToken, mr.id);
      const wo = await convertMR(planToken, mr.id, {
        assignedTo: techSingleUserId,
        assignedSupervisorId: supervisorUserId,
        tradeActivity: 'mechanical',
        workOrderType: 'corrective',
        priority: 'high',
      });
      woId = wo.id;
      expect(woId).toBeTruthy();

      await startWO(techToken, woId);
      expect((await getWO(techToken, woId)).status).toBe('in_progress');

      // Stop the real running timer first. The subsequent one-hour entry is a
      // deterministic manual labor record, not a second live session.
      const stopped = await apiCall(techToken, 'POST', `/api/work-orders/${woId}/time-logs/stop`, {});
      expect(stopped.status).toBe(200);
      expect(stopped.data.success).toBe(true);

      const labor = await logTime(techToken, woId, {
        action: 'start',
        manualHours: 1,
        notes: 'Disassembly and seal replacement work',
      });
      expect(labor.id).toBeTruthy();

      const { status: trStatus, data: trData } = await apiCall(
        techToken,
        'POST',
        '/api/repairs/tool-requests',
        {
          workOrderId: woId,
          reason: 'Need a torque wrench for seal installation',
          urgency: 'normal',
          items: [{ toolName: 'UAT Test Torque Wrench', quantityRequested: 1 }],
        },
      );
      expect(trStatus).toBe(201);
      expect(trData.success).toBe(true);
      toolRequestId = trData.data.id;
      expect(toolRequestId).toBeTruthy();

      const { status: saStatus, data: saData } = await apiCall(
        supervisorToken,
        'POST',
        `/api/repairs/tool-requests/${toolRequestId}`,
        { action: 'supervisor_approve' },
      );
      expect(saStatus).toBe(200);
      expect(saData.data.status).toBe('supervisor_approved');

      const storekeeperToken = await getToken('storekeeper');
      const { status: skStatus, data: skData } = await apiCall(
        storekeeperToken,
        'POST',
        `/api/repairs/tool-requests/${toolRequestId}`,
        { action: 'storekeeper_approve' },
      );
      expect(skStatus).toBe(200);
      expect(skData.data.status).toBe('storekeeper_approved');

      const requestItemId = trData.data.items[0].id;
      const { status: issueStatus, data: issueData } = await apiCall(
        storekeeperToken,
        'POST',
        `/api/repairs/tool-requests/${toolRequestId}`,
        {
          action: 'issue',
          issuedItems: [{ itemId: requestItemId, quantityIssued: 1 }],
        },
      );
      expect(issueStatus).toBe(200);
      expect(issueData.data.status).toBe('issued');
    });

    await test.step('G2: Outstanding issued tool blocks canonical completion', async () => {
      const techToken = await getToken('tech_single');
      const { status, data } = await expectFailure(
        techToken,
        'POST',
        `/api/work-orders/${woId}/complete`,
        { notes: 'Should be blocked while tool remains issued' },
      );

      expect(status).toBe(422);
      expect(data.success).toBe(false);
      expect(data.blockers).toBeDefined();
      const blocker = data.blockers.find((item: { code: string }) => item.code === 'TOOLS_ISSUED');
      expect(blocker).toBeDefined();
      expect((await getWO(techToken, woId)).status).toBe('in_progress');
    });

    await test.step('G3: Technician returns tool, store confirms, completion succeeds', async () => {
      const techToken = await getToken('tech_single');
      const storekeeperToken = await getToken('storekeeper');

      const { status: fetchStatus, data: trData } = await apiCall(
        techToken,
        'GET',
        `/api/repairs/tool-requests/${toolRequestId}`,
      );
      expect(fetchStatus).toBe(200);
      const actualItemId = trData.data.items?.[0]?.id;
      expect(actualItemId).toBeTruthy();

      const { status: retStatus, data: retData } = await apiCall(
        techToken,
        'POST',
        `/api/repairs/tool-requests/${toolRequestId}`,
        {
          action: 'return',
          returnedItems: [{
            itemId: actualItemId,
            quantityReturned: 1,
            conditionAtReturn: 'good',
          }],
        },
      );
      expect(retStatus).toBe(200);
      expect(retData.data.status).toBe('pending_return');

      const { status: confirmStatus, data: confirmData } = await apiCall(
        storekeeperToken,
        'POST',
        `/api/repairs/tool-requests/${toolRequestId}`,
        { action: 'storekeeper_confirm_return' },
      );
      expect(confirmStatus).toBe(200);
      expect(confirmData.data.status).toBe('returned');

      const result = await completeWO(techToken, woId, 'Seal replaced. All tools returned.');
      expect(result).toBeTruthy();
      expect((await getWO(techToken, woId)).status).toBe('completed');

      await authenticateAs(context, 'tech_single');
      const page = await context.newPage();
      await navigateToWODetail(page, woId);
      await expectWODetailStatus(page, 'completed');
      await page.close();
    });
  } finally {
    await context.close();
  }
});
