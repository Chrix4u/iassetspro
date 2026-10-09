/**
 * Scenario S — PM Full Lifecycle (PM-UAT-01)
 *
 * Browser-first PM proof:
 * planner creates template + checklist in UI → planner creates schedule in UI
 * → real PM generator creates accountable draft WO → planner assigns it
 * → technician executes generated checklist in UI → completion → supervisor verify
 * → planner close advances schedule cadence.
 */
import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import {
  authenticateAs,
  navigateToWODetail,
  expectWODetailStatus,
} from './helpers/auth';
import {
  getToken,
  lookupUserByKey,
  lookupAssetId,
  apiCall,
  assignWO,
  acceptWOAssignment,
  startWO,
  completeWO,
  verifyWO,
  closeWO,
  getWO,
} from './helpers/api';

async function chooseAsyncOption(page: Page, triggerText: string | RegExp, searchPlaceholder: string, query: string, expected: RegExp) {
  const trigger = page.getByRole('combobox', { name: triggerText }).last();
  await expect(trigger).toBeVisible({ timeout: 15_000 });
  await expect(trigger).toBeEnabled({ timeout: 15_000 });
  await trigger.click();
  const search = page.getByPlaceholder(searchPlaceholder).last();
  await expect(search).toBeVisible({ timeout: 10_000 });
  await search.fill(query);
  await expect(page.getByText(expected).last()).toBeVisible({ timeout: 10_000 });
  // AsyncSearchableSelect may replace option nodes when fetch results settle.
  // Keyboard selection avoids clicking a detached option node.
  await search.press('Enter');
}

test('PM-UAT-01: browser template/schedule → generated WO → checklist → close advances cadence', async ({ browser }) => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const templateTitle = `PM UAT Full Lifecycle ${suffix}`;
  const scheduleTitle = `PM UAT Schedule ${suffix}`;
  const taskOne = `Inspect pump bearing condition ${suffix}`;
  const taskTwo = `Record vibration reading ${suffix}`;

  const plannerToken = await getToken('planner');
  const supervisorToken = await getToken('supervisor');
  const techToken = await getToken('tech_single');
  const plannerUserId = await lookupUserByKey(plannerToken, 'planner');
  const supervisorUserId = await lookupUserByKey(plannerToken, 'supervisor');
  const techUserId = await lookupUserByKey(plannerToken, 'tech_single');
  const assetId = await lookupAssetId(plannerToken, 'UAT-PUMP-001');

  let templateId = '';
  let scheduleId = '';
  let woId = '';
  let dueCycle = '';
  let technicianStarted = false;

  const plannerContext: BrowserContext = await browser.newContext();
  const techContext: BrowserContext = await browser.newContext();

  try {
    await authenticateAs(plannerContext, 'planner');
    const plannerPage = await plannerContext.newPage();

    await test.step('S1: Planner creates PM template through UI', async () => {
      await plannerPage.goto('/#/pm-templates');
      await expect(plannerPage.getByRole('heading', { name: 'PM Templates' })).toBeVisible({ timeout: 20_000 });
      await plannerPage.getByRole('button', { name: /New Template/i }).click();

      await plannerPage.getByPlaceholder('e.g., Monthly Motor Inspection').fill(templateTitle);
      await plannerPage.getByPlaceholder('Describe the maintenance activities...').fill('End-to-end PM UAT template');
      await plannerPage.getByPlaceholder('1.5').fill('1');

      const createResponsePromise = plannerPage.waitForResponse((response) =>
        response.url().includes('/api/pm-templates')
        && response.request().method() === 'POST'
        && response.status() === 201,
      );
      await plannerPage.getByRole('button', { name: 'Create Template' }).click();
      const createResponse = await createResponsePromise;
      const createBody = await createResponse.json();
      templateId = String(createBody?.data?.id || '');
      expect(templateId).toBeTruthy();
      await expect(plannerPage.getByRole('row').filter({ hasText: templateTitle })).toBeVisible({ timeout: 15_000 });
    });

    await test.step('S2: Planner edits template and authors checklist through UI', async () => {
      const row = plannerPage.getByRole('row').filter({ hasText: templateTitle });
      await row.hover();
      await row.getByRole('button').last().click();
      await plannerPage.getByRole('menuitem', { name: /^Edit$/ }).click();
      await expect(plannerPage.getByText('Edit PM Template')).toBeVisible({ timeout: 10_000 });

      await plannerPage.getByRole('button', { name: /Task Checklist/i }).click();
      const taskInput = plannerPage.getByPlaceholder('Task description *');
      await expect(taskInput).toBeVisible({ timeout: 10_000 });

      for (const [description, minutes] of [[taskOne, '10'], [taskTwo, '5']] as const) {
        await taskInput.fill(description);
        await plannerPage.getByPlaceholder('Est. minutes').fill(minutes);
        const taskResponsePromise = plannerPage.waitForResponse((response) =>
          response.url().includes(`/api/pm-templates/${templateId}/tasks`)
          && response.request().method() === 'POST'
          && response.status() === 201,
        );
        await plannerPage.getByRole('button', { name: 'Add Task to Checklist' }).click();
        await taskResponsePromise;
        await expect(plannerPage.getByText(description)).toBeVisible({ timeout: 10_000 });
      }

      // Close via the normal edit action so the list refreshes through the UI path.
      await plannerPage.getByRole('button', { name: 'Update Template' }).click();
      await expect(plannerPage.getByRole('row').filter({ hasText: templateTitle }).getByRole('cell').nth(3)).toHaveText('2', { timeout: 15_000 });
    });

    await test.step('S3: Planner creates assigned monthly PM schedule through UI', async () => {
      await plannerPage.goto('/#/pm-schedules');
      await expect(plannerPage.getByText('PM Schedules').first()).toBeVisible({ timeout: 20_000 });
      await plannerPage.getByRole('button', { name: /New Schedule/i }).click();
      await plannerPage.getByPlaceholder('e.g., Monthly Motor Inspection').fill(scheduleTitle);

      await chooseAsyncOption(
        plannerPage,
        /Optional — select PM template/i,
        'Search PM templates...',
        templateTitle,
        new RegExp(templateTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
      );
      await chooseAsyncOption(
        plannerPage,
        /Select asset/i,
        'Search assets by name or tag...',
        'UAT-PUMP-001',
        /UAT Test Pump.*UAT-PUMP-001/i,
      );
      await chooseAsyncOption(
        plannerPage,
        /Select technician/i,
        'Search technicians...',
        'UAT Tech Single',
        /UAT Tech Single/i,
      );

      const scheduleResponsePromise = plannerPage.waitForResponse((response) =>
        response.url().includes('/api/pm-schedules')
        && response.request().method() === 'POST'
        && response.status() === 201,
      );
      await plannerPage.getByRole('button', { name: 'Create Schedule' }).click();
      const scheduleResponse = await scheduleResponsePromise;
      const scheduleBody = await scheduleResponse.json();
      scheduleId = String(scheduleBody?.data?.id || '');
      expect(scheduleId).toBeTruthy();
      expect(scheduleBody.data.templateId).toBe(templateId);
      expect(scheduleBody.data.assetId).toBe(assetId);
      expect(scheduleBody.data.assignedToId).toBe(techUserId);
      expect(scheduleBody.data.createdById).toBe(plannerUserId);
    });

    await test.step('S4: Force due, generate real preventive draft, and prove accountable planner ownership', async () => {
      const forcedDue = new Date(Date.now() - 60_000).toISOString();
      const { status: forceStatus, data: forceBody } = await apiCall(
        plannerToken,
        'PUT',
        `/api/pm-schedules/${scheduleId}`,
        { nextDueDate: forcedDue, leadDays: 0, autoGenerateWO: true },
      );
      expect(forceStatus).toBe(200);
      expect(forceBody.success).toBe(true);
      dueCycle = new Date(forceBody.data.nextDueDate).toISOString();

      const { status: generationStatus, data: generationBody } = await apiCall(
        plannerToken,
        'POST',
        '/api/pm-schedules/check-due',
        {},
      );
      expect(generationStatus).toBe(200);
      expect(generationBody.success).toBe(true);
      const result = (generationBody.data.results as Array<any>).find((entry) => entry.scheduleId === scheduleId);
      expect(result).toBeTruthy();
      expect(result.skipped).toBe(false);
      woId = String(result.workOrderId || '');
      expect(woId).toBeTruthy();

      const generated = await getWO(plannerToken, woId);
      expect(generated.type).toBe('preventive');
      expect(generated.status).toBe('draft');
      expect(generated.pmScheduleId).toBe(scheduleId);
      expect(generated.plannerId).toBe(plannerUserId);
      expect(generated.assignedTo).toBe(techUserId);

      const { status: checklistStatus, data: checklistBody } = await apiCall(
        plannerToken,
        'GET',
        `/api/work-orders/${woId}/tasks`,
      );
      expect(checklistStatus).toBe(200);
      const checklist = Array.isArray(checklistBody.data) ? checklistBody.data : checklistBody.data?.tasks;
      expect(checklist).toHaveLength(2);
      expect(checklist.map((task: any) => task.description)).toEqual(expect.arrayContaining([taskOne, taskTwo]));

      const { status: scheduleStatus, data: scheduleBeforeAssign } = await apiCall(
        plannerToken,
        'GET',
        `/api/pm-schedules/${scheduleId}`,
      );
      expect(scheduleStatus).toBe(200);
      expect(new Date(scheduleBeforeAssign.data.nextDueDate).toISOString()).toBe(dueCycle);
      expect(scheduleBeforeAssign.data.lastCompletedDate).toBeNull();
    });

    await test.step('S5: Schedule creator can legitimately assign the generated draft', async () => {
      const assigned = await assignWO(plannerToken, woId, {
        assignedTo: techUserId,
        assignedSupervisorId: supervisorUserId,
        assignmentType: 'direct',
      });
      expect(assigned.status).toBe('assigned');
      const fetched = await getWO(plannerToken, woId);
      expect(fetched.status).toBe('assigned');
      expect(fetched.plannerId).toBe(plannerUserId);
      expect(fetched.assignedTo).toBe(techUserId);
      expect(fetched.assignedSupervisorId).toBe(supervisorUserId);
    });

    await test.step('S6: Technician starts generated PM WO and completes copied checklist in UI', async () => {
      await acceptWOAssignment(techToken, woId);
      await startWO(techToken, woId);
      technicianStarted = true;

      await authenticateAs(techContext, 'tech_single');
      const techPage = await techContext.newPage();
      await navigateToWODetail(techPage, woId);
      await expectWODetailStatus(techPage, 'in_progress');
      await expect(techPage.getByText(/^Task Checklist \d+\/\d+ · \d+%$/)).toBeVisible({ timeout: 15_000 });
      await expect(techPage.getByText(taskOne)).toBeVisible();
      await expect(techPage.getByText(taskTwo)).toBeVisible();

      const completeAll = techPage.getByRole('button', { name: /Complete All/i });
      await expect(completeAll).toBeVisible({ timeout: 10_000 });
      await completeAll.click();
      await expect(techPage.getByText(/100% done.*2\/2 completed/i)).toBeVisible({ timeout: 15_000 });
      await techPage.close();

      // Completion must not be blocked by the live timer started with the WO.
      const { status: stopStatus, data: stopBody } = await apiCall(
        techToken,
        'POST',
        `/api/work-orders/${woId}/time-logs/stop`,
        {},
      );
      expect(stopStatus).toBe(200);
      expect(stopBody.success).toBe(true);
      technicianStarted = false;
    });

    await test.step('S7: Complete → verify → planner close advances PM cadence only at closure', async () => {
      await completeWO(techToken, woId, 'PM UAT checklist completed');
      expect((await getWO(plannerToken, woId)).status).toBe('completed');

      const { data: beforeVerify } = await apiCall(plannerToken, 'GET', `/api/pm-schedules/${scheduleId}`);
      expect(new Date(beforeVerify.data.nextDueDate).toISOString()).toBe(dueCycle);
      expect(beforeVerify.data.lastCompletedDate).toBeNull();

      await verifyWO(supervisorToken, woId, 5);
      expect((await getWO(plannerToken, woId)).status).toBe('verified');
      const { data: beforeClose } = await apiCall(plannerToken, 'GET', `/api/pm-schedules/${scheduleId}`);
      expect(new Date(beforeClose.data.nextDueDate).toISOString()).toBe(dueCycle);
      expect(beforeClose.data.lastCompletedDate).toBeNull();

      await closeWO(plannerToken, woId);
      expect((await getWO(plannerToken, woId)).status).toBe('closed');

      const { status: afterCloseStatus, data: afterClose } = await apiCall(plannerToken, 'GET', `/api/pm-schedules/${scheduleId}`);
      expect(afterCloseStatus).toBe(200);
      expect(afterClose.data.lastCompletedDate).toBeTruthy();
      expect(new Date(afterClose.data.nextDueDate).getTime()).toBeGreaterThan(new Date(dueCycle).getTime());
    });
  } finally {
    if (technicianStarted && woId) {
      await apiCall(techToken, 'POST', `/api/work-orders/${woId}/time-logs/stop`, {}).catch(() => undefined);
    }
    if (scheduleId) {
      await apiCall(plannerToken, 'PUT', `/api/pm-schedules/${scheduleId}`, { isActive: false }).catch(() => undefined);
    }
    await plannerContext.close();
    await techContext.close();
  }
});
