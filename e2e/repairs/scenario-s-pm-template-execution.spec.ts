import { test, expect } from '@playwright/test';
import { authenticateAs, navigateToWODetail, switchUser } from './helpers/auth';
import {
  apiCall,
  assignWO,
  completeWO,
  getToken,
  getWO,
  logTime,
  lookupAssetId,
  lookupUserByKey,
  startWO,
} from './helpers/api';

test('UAT-19: Planner PM template → generated WO → technician checklist → close', async ({ page, context }) => {
  const suffix = Date.now().toString().slice(-7);
  const templateTitle = `UAT PM Execution Template ${suffix}`;
  const scheduleTitle = `UAT PM Execution Schedule ${suffix}`;
  const taskDescriptions = [
    `Inspect pump bearing seals ${suffix}`,
    `Measure pump bearing vibration ${suffix}`,
    `Lubricate pump bearing ${suffix}`,
  ];

  const plannerToken = await getToken('planner');
  const technicianToken = await getToken('tech_single');
  const supervisorToken = await getToken('supervisor');
  const assetId = await lookupAssetId(plannerToken, 'UAT-PUMP-001');
  const technicianId = await lookupUserByKey(plannerToken, 'tech_single');
  const supervisorId = await lookupUserByKey(plannerToken, 'supervisor');

  // Planner creates the reusable template through the real UI.
  await authenticateAs(context, 'planner');
  await page.goto('/#/pm-templates');
  await expect(page.getByRole('heading', { name: 'PM Templates', exact: true })).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: /New Template/i }).click();
  await page.getByPlaceholder('e.g., Monthly Motor Inspection').fill(templateTitle);
  await page.getByPlaceholder('Describe the maintenance activities...').fill('Browser-created PM execution template.');
  await page.getByPlaceholder('1.5').fill('1');
  const createTemplateResponse = page.waitForResponse((response) => response.url().includes('/api/pm-templates') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Create Template', exact: true }).click();
  expect((await createTemplateResponse).status()).toBe(201);
  await expect(page.getByText(templateTitle, { exact: true })).toBeVisible({ timeout: 20_000 });

  const templateList = await apiCall(plannerToken, 'GET', `/api/pm-templates?search=${encodeURIComponent(templateTitle)}`);
  expect(templateList.status).toBe(200);
  const template = (templateList.data.data as any[]).find((row) => row.title === templateTitle);
  expect(template?.id).toBeTruthy();

  // Edit the browser-created template and add a real checklist through the UI.
  const templateRow = page.getByRole('row').filter({ hasText: templateTitle });
  await templateRow.hover();
  await templateRow.getByRole('button').last().click();
  await page.getByRole('menuitem', { name: /Edit/i }).click();
  await expect(page.getByText('Edit PM Template', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /Task Checklist/i }).click();

  for (const description of taskDescriptions) {
    await page.getByPlaceholder('Task description *').fill(description);
    await page.getByPlaceholder('Est. minutes').fill('10');
    const addTaskResponse = page.waitForResponse((response) => response.url().includes(`/api/pm-templates/${template.id}/tasks`) && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'Add Task to Checklist', exact: true }).click();
    expect((await addTaskResponse).status()).toBe(201);
    await expect(page.getByText(description, { exact: true })).toBeVisible({ timeout: 10_000 });
  }
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();

  const templateState = await apiCall(plannerToken, 'GET', `/api/pm-templates/${template.id}`);
  expect(templateState.status).toBe(200);
  expect(templateState.data.data?.tasks).toHaveLength(3);

  // Planner creates a schedule through the real UI and links the template to the seeded UAT pump.
  await page.goto('/#/pm-schedules');
  await expect(page.getByRole('main').getByRole('heading', { name: 'PM Schedules', exact: true })).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: /New Schedule/i }).click();
  await page.getByPlaceholder('e.g., Monthly Motor Inspection').fill(scheduleTitle);

  const templateLabel = page.locator('label').filter({ hasText: /^PM Template$/ }).first();
  await templateLabel.locator('..').getByRole('combobox').click();
  await page.getByPlaceholder('Search PM templates...').fill(templateTitle);
  await page.getByText(`${templateTitle} · 3 tasks`, { exact: true }).click();

  const assetLabel = page.locator('label').filter({ hasText: /^Asset/ }).first();
  await assetLabel.locator('..').getByRole('combobox').click();
  await page.getByPlaceholder('Search assets by name or tag...').fill('UAT-PUMP-001');
  await page.getByText('UAT Test Pump [UAT-PUMP-001]', { exact: true }).click();

  const durationLabel = page.locator('label').filter({ hasText: /Est\. Duration/ }).first();
  await durationLabel.locator('..').locator('input').fill('1');
  const createScheduleResponse = page.waitForResponse((response) => response.url().includes('/api/pm-schedules') && response.request().method() === 'POST');
  await page.getByRole('button', { name: /Create Schedule/i }).click();
  expect((await createScheduleResponse).status()).toBe(201);
  await expect(page.getByText(scheduleTitle, { exact: true })).toBeVisible({ timeout: 20_000 });

  const schedules = await apiCall(plannerToken, 'GET', `/api/pm-schedules?assetId=${encodeURIComponent(assetId)}`);
  expect(schedules.status).toBe(200);
  const schedule = (schedules.data.data as any[]).find((row) => row.title === scheduleTitle);
  expect(schedule?.id).toBeTruthy();
  expect(schedule?.templateId).toBe(template.id);

  // Force only this schedule due, then run the real PM generation engine.
  const forcedDueDate = new Date(Date.now() - 60_000).toISOString();
  const dueUpdate = await apiCall(plannerToken, 'PUT', `/api/pm-schedules/${schedule.id}`, {
    nextDueDate: forcedDueDate,
    autoGenerateWO: true,
    leadDays: 0,
    isActive: true,
  });
  expect(dueUpdate.status).toBe(200);
  const generation = await apiCall(plannerToken, 'POST', '/api/pm-schedules/check-due', {});
  expect(generation.status).toBe(200);
  const generated = (generation.data.data?.results as any[] | undefined)?.find((row) => row.scheduleId === schedule.id && row.skipped === false);
  expect(generated?.workOrderId).toBeTruthy();
  const woId = String(generated.workOrderId);

  await assignWO(plannerToken, woId, {
    assignedTo: technicianId,
    assignedSupervisorId: supervisorId,
    teamLeaderId: technicianId,
    teamMembers: [{ userId: technicianId, role: 'team_leader' }],
  });
  await startWO(technicianToken, woId);
  let timerStopped = false;

  try {
    // Before the UI checklist is completed, server readiness must show a task blocker.
    const readinessBefore = await apiCall(technicianToken, 'GET', `/api/work-orders/${woId}/readiness`);
    expect(readinessBefore.status).toBe(200);
    expect(JSON.stringify(readinessBefore.data)).toMatch(/task checklist|task.*incomplete/i);

    // Technician executes the auto-materialized PM checklist from the real WO lifecycle page.
    await authenticateAs(context, 'tech_single');
    await navigateToWODetail(page, woId);
    await page.getByRole('button', { name: 'Go to Execution' }).click();

    const taskStateBefore = await apiCall(technicianToken, 'GET', `/api/work-orders/${woId}/tasks`);
    expect(taskStateBefore.status).toBe(200);
    expect((taskStateBefore.data.data as any[]).map((task) => task.description)).toEqual(taskDescriptions);

    const materializedTasks = taskStateBefore.data.data as any[];
    await expect(page.getByRole('button', { name: 'Done', exact: true })).toHaveCount(3, { timeout: 10_000 });
    for (const description of taskDescriptions) {
      const task = materializedTasks.find((row) => row.description === description);
      expect(task?.id).toBeTruthy();

      const taskRow = page.getByText(description, { exact: false }).locator('..').locator('..');
      const doneButton = taskRow.getByRole('button', { name: 'Done', exact: true });
      await expect(doneButton).toBeVisible({ timeout: 10_000 });

      const toggleResponse = page.waitForResponse((response) =>
        response.url().includes(`/api/work-orders/${woId}/tasks/${task.id}`)
        && ['PATCH', 'PUT'].includes(response.request().method()),
      );
      await doneButton.click();
      expect((await toggleResponse).status()).toBe(200);

      await expect.poll(async () => {
        const state = await apiCall(technicianToken, 'GET', `/api/work-orders/${woId}/tasks`);
        const current = (state.data.data as any[]).find((row) => row.id === task.id);
        return current?.status;
      }, { timeout: 10_000 }).toBe('completed');
    }
    const taskStateAfter = await apiCall(technicianToken, 'GET', `/api/work-orders/${woId}/tasks`);
    expect(taskStateAfter.status).toBe(200);
    expect(taskStateAfter.data.data).toHaveLength(3);
    expect((taskStateAfter.data.data as any[]).every((task) => task.status === 'completed')).toBe(true);

    const readinessAfter = await apiCall(technicianToken, 'GET', `/api/work-orders/${woId}/readiness`);
    expect(readinessAfter.status).toBe(200);
    expect(JSON.stringify(readinessAfter.data)).not.toMatch(/task checklist.*incomplete/i);

    // Close the live timer, record deterministic labor, complete, verify and close.
    const stop = await apiCall(technicianToken, 'POST', `/api/work-orders/${woId}/time-logs/stop`, {});
    expect(stop.status).toBe(200);
    timerStopped = true;
    await logTime(technicianToken, woId, { action: 'start', manualHours: 1, notes: 'PM checklist execution labor' });
    await completeWO(technicianToken, woId, 'PM checklist completed and equipment condition verified.');
    const completed = await getWO(technicianToken, woId);
    expect(completed.status).toBe('completed');

    // PM cadence must NOT advance at technician completion. The irreversible
    // recurring-schedule boundary is planner close after supervisor approval.
    const scheduleAfterCompletion = await apiCall(plannerToken, 'GET', `/api/pm-schedules/${schedule.id}`);
    expect(scheduleAfterCompletion.status).toBe(200);
    expect(scheduleAfterCompletion.data.data?.lastCompletedDate).toBeNull();
    expect(new Date(scheduleAfterCompletion.data.data?.nextDueDate).getTime()).toBe(new Date(forcedDueDate).getTime());

    const openCompletionInUi = async (userKey: 'supervisor' | 'planner') => {
      await switchUser(page, context, userKey);
      await page.goto('/#/repairs-completion');
      await expect(page.getByRole('heading', { name: 'Work Order Completion & Closure', exact: true })).toBeVisible({ timeout: 20_000 });
      await page.getByRole('main').getByRole('combobox').click();
      await page.getByPlaceholder('Search by WO number or title...').fill(completed.woNumber);
      await page.getByText(`${completed.woNumber} — ${completed.title}`, { exact: true }).click();
      await expect(page.getByText(`${completed.woNumber} — ${completed.title}`, { exact: true })).toBeVisible({ timeout: 15_000 });
    };

    // Supervisor approves from the real Completion & Closure screen.
    await openCompletionInUi('supervisor');
    const supervisorApproveResponse = page.waitForResponse((response) =>
      response.url().includes(`/api/repairs/completion/${woId}`)
      && response.request().method() === 'POST'
      && response.request().postDataJSON()?.action === 'supervisor_approve',
    );
    await page.getByRole('button', { name: 'Supervisor Approve', exact: true }).click();
    expect((await supervisorApproveResponse).status()).toBe(200);
    await expect(page.getByText(/^APPROVED$/i).first()).toBeVisible({ timeout: 15_000 });

    // Supervisor approval is still reversible/reworkable; PM cadence must remain unchanged.
    const scheduleAfterVerification = await apiCall(plannerToken, 'GET', `/api/pm-schedules/${schedule.id}`);
    expect(scheduleAfterVerification.status).toBe(200);
    expect(scheduleAfterVerification.data.data?.lastCompletedDate).toBeNull();
    expect(new Date(scheduleAfterVerification.data.data?.nextDueDate).getTime()).toBe(new Date(forcedDueDate).getTime());

    // Assigned planner performs the irreversible final close from the real UI.
    await openCompletionInUi('planner');
    await page.getByText('Closure Notes', { exact: true }).locator('..').locator('textarea').fill('PM cycle verified and approved for recurring schedule advancement.');
    const plannerCloseResponse = page.waitForResponse((response) =>
      response.url().includes(`/api/repairs/completion/${woId}`)
      && response.request().method() === 'POST'
      && response.request().postDataJSON()?.action === 'planner_close',
    );
    await page.getByRole('button', { name: 'Planner Close WO', exact: true }).click();
    expect((await plannerCloseResponse).status()).toBe(200);

    const closed = await getWO(plannerToken, woId);
    expect(closed.status).toBe('closed');
    expect(closed.pmSchedule?.id).toBe(schedule.id);

    await expect.poll(async () => {
      const state = await apiCall(plannerToken, 'GET', `/api/pm-schedules/${schedule.id}`);
      return state.data.data?.lastCompletedDate || null;
    }, { timeout: 10_000 }).not.toBeNull();

    const scheduleAfterClose = await apiCall(plannerToken, 'GET', `/api/pm-schedules/${schedule.id}`);
    expect(scheduleAfterClose.status).toBe(200);
    const lastCompletedDate = new Date(scheduleAfterClose.data.data.lastCompletedDate);
    const nextDueDate = new Date(scheduleAfterClose.data.data.nextDueDate);
    expect(lastCompletedDate.getTime()).toBeGreaterThan(new Date(forcedDueDate).getTime());
    expect(nextDueDate.getTime()).toBeGreaterThan(lastCompletedDate.getTime());
    expect(nextDueDate.getTime()).toBeGreaterThan(new Date(forcedDueDate).getTime());

    // Once the cycle is closed and advanced, the generation engine must not create
    // another open WO for the already-completed due cycle.
    const postCloseGeneration = await apiCall(plannerToken, 'POST', '/api/pm-schedules/check-due', {});
    expect(postCloseGeneration.status).toBe(200);
    const duplicateCycle = (postCloseGeneration.data.data?.results as any[] | undefined)?.find(
      (row) => row.scheduleId === schedule.id && row.skipped === false,
    );
    expect(duplicateCycle).toBeUndefined();
  } finally {
    if (!timerStopped) {
      await apiCall(technicianToken, 'POST', `/api/work-orders/${woId}/time-logs/stop`, {});
    }
  }
});
