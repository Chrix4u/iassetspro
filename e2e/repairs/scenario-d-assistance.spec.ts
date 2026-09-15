/**
 * Scenario D — Assistance Request Flow
 *
 * Tests: technician requests help → supervisor/planner approves →
 * helper joins and logs time → helper appears in team members.
 */
import { test, expect, type BrowserContext } from '@playwright/test';
import {
  authenticateAs,
  navigateToWODetail,
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
  getWO,
  requestAssistance,
  approveAssistanceRequest,
  getTeamMemberRequests,
  lookupUserByKey,
  lookupAssetId,
  lookupPlantId,
  apiCall,
} from './helpers/api';

test('UAT-04: Scenario D — Assistance Request Flow', async ({ browser }) => {
  const context: BrowserContext = await browser.newContext();

  let mrId: string;
  let woId: string;
  let assetId: string;
  let plantId: string;
  let techSingleUserId: string;
  let techAssistantUserId: string;
  let supervisorUserId: string;
  let assistanceReqId: string;

  try {
    const plannerToken = await getToken('planner');
    techSingleUserId = await lookupUserByKey(plannerToken, 'tech_single');
    techAssistantUserId = await lookupUserByKey(plannerToken, 'tech_assistant');
    supervisorUserId = await lookupUserByKey(plannerToken, 'supervisor');
    assetId = await lookupAssetId(plannerToken, 'UAT-PUMP-001');
    plantId = await lookupPlantId(plannerToken, 'PLANT-A');

    await test.step('D1: Create and start WO for assistance scenario', async () => {
      const reqToken = await getToken('requester');
      const mr = await createMR(reqToken, {
        title: 'UAT-Assistance-Pump-Wiring',
        description: 'Pump wiring needs electrical expertise. Mechanical work done.',
        assetId,
        priority: 'high',
        plantId,
      });
      mrId = mr.id;
      expect(mrId).toBeTruthy();

      const supToken = await getToken('supervisor');
      await approveMR(supToken, mrId);

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

      const fetched = await getWO(techToken, woId);
      expect(fetched.status).toBe('in_progress');
    });

    await test.step('D2: Technician requests assistance for electrical expertise', async () => {
      const token = await getToken('tech_single');
      const req = await requestAssistance(token, woId, {
        requestedUserId: techAssistantUserId,
        reason: 'Need electrical expertise for motor wiring check',
        role: 'assistant',
      });

      assistanceReqId = req.id;
      expect(assistanceReqId).toBeTruthy();
      expect(req.status).toBe('pending');

      const requests = await getTeamMemberRequests(token, woId);
      const found = requests.find((r: { id: string }) => r.id === assistanceReqId);
      expect(found).toBeTruthy();
      expect(found.status).toBe('pending');
    });

    await test.step('D3: Planner approves assistance and assigns assistant', async () => {
      const token = await getToken('planner');
      const result = await approveAssistanceRequest(token, woId, assistanceReqId, techAssistantUserId);

      expect(result).toBeTruthy();
      expect(result.status).toBe('approved');

      const fetched = await getWO(token, woId);
      const teamMemberIds = (fetched.teamMembers || []).map((m: { userId: string }) => m.userId);
      expect(teamMemberIds).toContain(techAssistantUserId);
      // Assistance turns the single-tech job into a team job. The original
      // assignee is the deterministic team leader unless one already existed.
      expect(fetched.teamLeaderId).toBe(techSingleUserId);
    });

    await test.step('D4: Assistant logs time on the WO', async () => {
      const token = await getToken('tech_assistant');
      const timeLog = await logTime(token, woId, {
        action: 'start',
        manualHours: 1.5,
        notes: 'Electrical wiring checked. Connections tight.',
      });

      expect(timeLog).toBeTruthy();
      expect(timeLog.id).toBeTruthy();

      const fetched = await getWO(token, woId);
      expect(fetched.actualHours).toBeGreaterThanOrEqual(1.5);
    });

    await test.step('D5: UI shows assistant as team member', async () => {
      await authenticateAs(context, 'tech_single');
      const page = await context.newPage();
      await navigateToWODetail(page, woId);
      await expect(page.locator('body')).toContainText('UAT Tech Assistant', { timeout: 10_000 });
      await page.close();
    });

    await test.step('D6: Complete, verify, and close WO after assistance', async () => {
      const techToken = await getToken('tech_single');

      // The original technician still owns the live timer opened in D1.
      // Explicitly stop it before the team leader submits final completion.
      const stopped = await apiCall(techToken, 'POST', `/api/work-orders/${woId}/time-logs/stop`, {});
      expect(stopped.status).toBe(200);
      expect(stopped.data.success).toBe(true);

      await completeWO(techToken, woId, 'Pump wiring complete. All checks passed.');

      let fetched = await getWO(techToken, woId);
      expect(fetched.status).toBe('completed');

      const supToken = await getToken('supervisor');
      await verifyWO(supToken, woId, 4);

      fetched = await getWO(supToken, woId);
      expect(fetched.status).toBe('verified');

      const planToken = await getToken('planner');
      await closeWO(planToken, woId);

      fetched = await getWO(planToken, woId);
      expect(fetched.status).toBe('closed');
      expect(fetched.isLocked).toBe(true);
    });
  } finally {
    await context.close();
  }
});
