/**
 * Scenario C — Supervisor Delegation Assignment Flow
 *
 * Tests the delegation pattern where the planner assigns the WO to
 * the supervisor (via_supervisor), who then assigns the technician.
 */
import { test, expect, type BrowserContext } from '@playwright/test';
import { authenticateAs, navigateToWODetail, expectWODetailStatus } from './helpers/auth';
import {
  getToken,
  createMR,
  approveMR,
  convertMR,
  assignWO,
  acceptWOAssignment,
  startWO,
  getWO,
  getMR,
  getCapabilities,
  lookupUserByKey,
  lookupAssetId,
  lookupPlantId,
  apiCall,
} from './helpers/api';

test('UAT-03: Scenario C — Supervisor Delegation Flow', async ({ browser }) => {
  const context: BrowserContext = await browser.newContext();

  let mrId: string;
  let woId: string;
  let assetId: string;
  let plantId: string;
  let supervisorUserId: string;
  let techSingleUserId: string;

  try {
    const plannerToken = await getToken('planner');
    supervisorUserId = await lookupUserByKey(plannerToken, 'supervisor');
    techSingleUserId = await lookupUserByKey(plannerToken, 'tech_single');
    assetId = await lookupAssetId(plannerToken, 'UAT-PUMP-001');
    plantId = await lookupPlantId(plannerToken, 'PLANT-A');

    await test.step('C1: Planner delegates WO to supervisor via via_supervisor assignment', async () => {
      const reqToken = await getToken('requester');
      const mr = await createMR(reqToken, {
        title: 'UAT-SupervisorDelegation-Valve-Repair',
        description: 'Control valve not opening fully. Needs on-site inspection and repair.',
        assetId,
        priority: 'high',
        plantId,
      });
      mrId = mr.id;
      expect(mrId).toBeTruthy();

      let fetched = await getMR(reqToken, mrId);
      expect(fetched.status).toBe('pending');

      const supToken = await getToken('supervisor');
      const approved = await approveMR(supToken, mrId);
      expect(approved.status).toBe('approved');

      fetched = await getMR(supToken, mrId);
      expect(fetched.status).toBe('approved');

      const planToken = await getToken('planner');
      const wo = await convertMR(planToken, mrId, {
        assignmentType: 'via_supervisor',
        assignedSupervisorId: supervisorUserId,
        tradeActivity: 'mechanical',
        workOrderType: 'corrective',
      });

      woId = wo.id;
      expect(woId).toBeTruthy();

      const fetchedWO = await getWO(planToken, woId);
      expect(fetchedWO.status).toBe('approved');
      expect(fetchedWO.assignedSupervisorId).toBe(supervisorUserId);
      expect(fetchedWO.assignmentType).toBe('via_supervisor');
    });

    await test.step('C2: Supervisor assigns technician to delegated WO', async () => {
      const token = await getToken('supervisor');
      const result = await assignWO(token, woId, {
        assignedTo: techSingleUserId,
        assignmentType: 'direct',
      });
      expect(result).toBeTruthy();

      const fetched = await getWO(token, woId);
      expect(fetched.status).toBe('assigned');
      expect(fetched.assignedTo).toBe(techSingleUserId);
    });

    await test.step('C3: Technician can start the supervisor-assigned WO', async () => {
      const token = await getToken('tech_single');
      await acceptWOAssignment(token, woId);

      const caps = await getCapabilities(token, woId);
      expect(caps.canStart).toBe(true);

      const result = await startWO(token, woId);
      expect(result).toBeTruthy();

      const fetched = await getWO(token, woId);
      expect(fetched.status).toBe('in_progress');

      await authenticateAs(context, 'tech_single');
      const page = await context.newPage();
      await navigateToWODetail(page, woId);
      await expectWODetailStatus(page, 'in_progress');
      await page.close();

      // Scenario C proves assignment/start only. Close its live execution timer
      // so later scenarios are not contaminated by an intentionally unfinished WO.
      const stopped = await apiCall(token, 'POST', `/api/work-orders/${woId}/time-logs/stop`, {});
      expect(stopped.status).toBe(200);
      expect(stopped.data.success).toBe(true);
    });
  } finally {
    await context.close();
  }
});
