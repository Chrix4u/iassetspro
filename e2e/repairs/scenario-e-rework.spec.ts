/**
 * Scenario E — Rework Flow
 *
 * Tests: complete WO → supervisor requests rework →
 * WO returns to in_progress → second completion → verify → close.
 */
import { test, expect, type BrowserContext } from '@playwright/test';
import {
  authenticateAs,
  navigateToWODetail,
  expectWODetailStatus,
} from './helpers/auth';
import {
  getToken,
  createMR,
  approveMR,
  convertMR,
  startWO,
  logTime,
  completeWO,
  verifyWO,
  closeWO,
  requestRework,
  getWO,
  getMR,
  lookupUserByKey,
  lookupAssetId,
  lookupPlantId,
  apiCall,
} from './helpers/api';

test('UAT-05: Scenario E — Rework Flow', async ({ browser }) => {
  const context: BrowserContext = await browser.newContext();

  let mrId: string;
  let woId: string;
  let assetId: string;
  let plantId: string;
  let techSingleUserId: string;
  let supervisorUserId: string;

  try {
    const plannerToken = await getToken('planner');
    techSingleUserId = await lookupUserByKey(plannerToken, 'tech_single');
    supervisorUserId = await lookupUserByKey(plannerToken, 'supervisor');
    assetId = await lookupAssetId(plannerToken, 'UAT-PUMP-001');
    plantId = await lookupPlantId(plannerToken, 'PLANT-A');

    await test.step('E1: Create, start, and complete WO (first time)', async () => {
      const reqToken = await getToken('requester');
      const mr = await createMR(reqToken, {
        title: 'UAT-Rework-Bearing-Alignment',
        description: 'Bearing alignment issue. Vibration above threshold.',
        assetId,
        priority: 'high',
        plantId,
      });
      mrId = mr.id;
      expect(mrId).toBeTruthy();

      const supToken = await getToken('supervisor');
      await approveMR(supToken, mrId);
      let fetched = await getMR(supToken, mrId);
      expect(fetched.status).toBe('approved');

      const planToken = await getToken('planner');
      const wo = await convertMR(planToken, mrId, {
        assignedTo: techSingleUserId,
        assignedSupervisorId: supervisorUserId,
        tradeActivity: 'mechanical',
        workOrderType: 'corrective',
      });
      woId = wo.id;
      expect(woId).toBeTruthy();

      const techToken = await getToken('tech_single');
      await startWO(techToken, woId);
      fetched = await getWO(techToken, woId);
      expect(fetched.status).toBe('in_progress');

      const stopped = await apiCall(techToken, 'POST', `/api/work-orders/${woId}/time-logs/stop`, {});
      expect(stopped.status).toBe(200);
      expect(stopped.data.success).toBe(true);

      await logTime(techToken, woId, {
        action: 'start',
        manualHours: 3,
        notes: 'Initial bearing replacement done.',
      });

      const completed = await completeWO(techToken, woId, 'Bearing replaced. Initial completion.');
      expect(completed).toBeTruthy();

      const fetchedWO = await getWO(techToken, woId);
      expect(fetchedWO.status).toBe('completed');
      expect(fetchedWO.actualHours).toBeGreaterThanOrEqual(3);

      await authenticateAs(context, 'tech_single');
      const page = await context.newPage();
      await navigateToWODetail(page, woId);
      await expectWODetailStatus(page, 'completed');
      await page.close();
    });

    await test.step('E2: Supervisor requests rework', async () => {
      const token = await getToken('supervisor');
      const result = await requestRework(token, woId, 'Vibration still above acceptable levels. Check bearing alignment.');
      expect(result).toBeTruthy();

      const fetched = await getWO(token, woId);
      expect(fetched.status).toBe('in_progress');

      await authenticateAs(context, 'supervisor');
      const page = await context.newPage();
      await navigateToWODetail(page, woId);
      await expectWODetailStatus(page, 'in_progress');
      await page.close();
    });

    await test.step('E3: Technician re-completes after rework', async () => {
      const token = await getToken('tech_single');
      let fetched = await getWO(token, woId);
      expect(fetched.status).toBe('in_progress');

      await logTime(token, woId, {
        action: 'start',
        manualHours: 2,
        notes: 'Bearing realigned and shimmed.',
      });

      const completed = await completeWO(token, woId, 'Rework complete. Bearing realigned and shimmed. Vibration now 0.3mm/s.');
      expect(completed).toBeTruthy();

      fetched = await getWO(token, woId);
      expect(fetched.status).toBe('completed');
      expect(fetched.actualHours).toBeGreaterThanOrEqual(5);
    });

    await test.step('E4: Supervisor verifies rework completion', async () => {
      const token = await getToken('supervisor');
      const result = await verifyWO(token, woId, 5);
      expect(result).toBeTruthy();
      const fetched = await getWO(token, woId);
      expect(fetched.status).toBe('verified');
    });

    await test.step('E5: Planner closes WO after rework', async () => {
      const token = await getToken('planner');
      const result = await closeWO(token, woId);
      expect(result).toBeTruthy();

      const fetched = await getWO(token, woId);
      expect(fetched.status).toBe('closed');
      expect(fetched.isLocked).toBe(true);

      await authenticateAs(context, 'planner');
      const page = await context.newPage();
      await navigateToWODetail(page, woId);
      await expectWODetailStatus(page, 'closed');
      await page.close();
    });
  } finally {
    await context.close();
  }
});
