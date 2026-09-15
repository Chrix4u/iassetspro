/**
 * Scenario B — Multi-Technician WO Flow
 *
 * Tests team assignment with leader + assistant,
 * capability checks (only leader can complete),
 * assistant completion restriction, and full lifecycle.
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
  getMR,
  getCapabilities,
  lookupUserByKey,
  lookupAssetId,
  lookupPlantId,
  expectFailure,
  apiCall,
} from './helpers/api';

test('UAT-02: Scenario B — Multi-Tech Team Flow', async ({ browser }) => {
  const context: BrowserContext = await browser.newContext();

  let mrId: string;
  let woId: string;
  let assetId: string;
  let plantId: string;
  let techLeaderUserId: string;
  let techAssistantUserId: string;

  try {
    const plannerToken = await getToken('planner');
    techLeaderUserId = await lookupUserByKey(plannerToken, 'tech_leader');
    techAssistantUserId = await lookupUserByKey(plannerToken, 'tech_assistant');
    assetId = await lookupAssetId(plannerToken, 'UAT-PUMP-001');
    plantId = await lookupPlantId(plannerToken, 'PLANT-A');

    await test.step('B1: Create MR, approve, convert with multi-tech team', async () => {
      const reqToken = await getToken('requester');
      const mr = await createMR(reqToken, {
        title: 'UAT-MultiTech-Motor-Overhaul',
        description: 'Motor running hot, high current draw. Needs mechanical and electrical inspection.',
        assetId,
        priority: 'medium',
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
        assignedTo: techLeaderUserId,
        teamLeaderId: techLeaderUserId,
        teamMembers: [
          { userId: techLeaderUserId, role: 'team_leader' },
          { userId: techAssistantUserId, role: 'assistant' },
        ],
        tradeActivity: 'mechanical',
        workOrderType: 'corrective',
      });

      woId = wo.id;
      expect(woId).toBeTruthy();

      const fetchedWO = await getWO(planToken, woId);
      expect(fetchedWO.status).toBe('assigned');
      expect(fetchedWO.assignedTo).toBe(techLeaderUserId);
      expect(fetchedWO.teamLeaderId).toBe(techLeaderUserId);
    });

    await test.step('B2: Only team leader has canSubmitCompletion capability', async () => {
      const leaderToken = await getToken('tech_leader');
      await startWO(leaderToken, woId);

      // Completion authority becomes available only after the leader closes
      // the live execution timer, preventing unaccounted concurrent labor.
      const stopped = await apiCall(leaderToken, 'POST', `/api/work-orders/${woId}/time-logs/stop`, {});
      expect(stopped.status).toBe(200);
      expect(stopped.data.success).toBe(true);

      const leaderCaps = await getCapabilities(leaderToken, woId);
      expect(leaderCaps.canSubmitCompletion).toBe(true);
      expect(leaderCaps.isTeamLeader).toBe(true);

      const assistToken = await getToken('tech_assistant');
      const assistCaps = await getCapabilities(assistToken, woId);
      expect(assistCaps.canSubmitCompletion).toBe(false);
      expect(assistCaps.isTeamMember).toBe(true);
    });

    await test.step('B3: Assistant cannot submit final completion', async () => {
      const token = await getToken('tech_assistant');
      const { status, data } = await expectFailure(token, 'POST', `/api/work-orders/${woId}/complete`, {
        notes: 'Should not work',
      });
      expect(status).toBeGreaterThanOrEqual(400);
      expect(data.success).toBe(false);
    });

    await test.step('B4: Team leader completes the WO with deterministic labor', async () => {
      const token = await getToken('tech_leader');

      // Closing a zero-cost WO is intentionally blocked. Record deterministic
      // labor effort so B tests team governance rather than incomplete costing.
      const labor = await logTime(token, woId, {
        action: 'start',
        manualHours: 1,
        notes: 'Motor overhaul and final functional test',
      });
      expect(labor.id).toBeTruthy();

      const result = await completeWO(token, woId, 'Motor rewound and tested. All connections verified.');
      expect(result).toBeTruthy();

      const fetched = await getWO(token, woId);
      expect(fetched.status).toBe('completed');
      expect(Number(fetched.actualHours)).toBeGreaterThanOrEqual(1);
      expect(Number(fetched.totalCost)).toBeGreaterThan(0);

      await authenticateAs(context, 'tech_leader');
      const page = await context.newPage();
      await navigateToWODetail(page, woId);
      await expect(page.locator('body')).toContainText('COMPLETED', { timeout: 10_000 });
      await page.close();
    });

    await test.step('B5: Supervisor verifies multi-tech WO', async () => {
      const token = await getToken('supervisor');
      const result = await verifyWO(token, woId, 5);
      expect(result).toBeTruthy();
      const fetched = await getWO(token, woId);
      expect(fetched.status).toBe('verified');
    });

    await test.step('B6: Planner closes multi-tech WO', async () => {
      const token = await getToken('planner');
      const result = await closeWO(token, woId);
      expect(result).toBeTruthy();
      const fetched = await getWO(token, woId);
      expect(fetched.status).toBe('closed');
      expect(fetched.isLocked).toBe(true);
    });
  } finally {
    await context.close();
  }
});
