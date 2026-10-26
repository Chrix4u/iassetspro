import { test, expect } from '@playwright/test';
import { authenticateAs, navigateToWODetail, switchUser } from './helpers/auth';
import {
  apiCall,
  apiCallWithPlant,
  assignWO,
  completeWO,
  getToken,
  getWO,
  logTime,
  lookupAssetId,
  lookupPlantId,
  lookupUserByKey,
  startWO,
} from './helpers/api';

test('UAT-19: Planner PM template → generated WO → technician checklist → close', async ({ page, context }) => {
  const suffix = Date.now().toString().slice(-7);
  const templateTitle = `UAT PM Execution Template ${suffix}`;
  const scheduleTitle = `UAT PM Execution Schedule ${suffix}`;
  const templateTaskDescriptions = [
    `Inspect pump bearing seals ${suffix}`,
    `Measure pump bearing vibration ${suffix}`,
    `Lubricate pump bearing ${suffix}`,
  ];
  const scheduleOnlyTask = `Record pump discharge pressure ${suffix}`;
  const taskDescriptions = [...templateTaskDescriptions, scheduleOnlyTask];

  const plannerToken = await getToken('planner');
  const technicianToken = await getToken('tech_single');
  const supervisorToken = await getToken('supervisor');
  const assetId = await lookupAssetId(plannerToken, 'UAT-PUMP-001');
  const plantId = await lookupPlantId(plannerToken, 'PLANT-A');
  const technicianId = await lookupUserByKey(plannerToken, 'tech_single');
  const supervisorId = await lookupUserByKey(plannerToken, 'supervisor');

  // Planner creates the reusable template through the real UI.
  await authenticateAs(context, 'planner');
  await page.goto('/');
  await page.evaluate((selectedPlantId) => localStorage.setItem('user_plant_id', selectedPlantId), plantId);
  await page.goto('/#/pm-templates');
  await expect(page.getByRole('heading', { name: 'PM Templates', exact: true })).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: /New Template/i }).click();
  await page.getByPlaceholder('e.g., Monthly Motor Inspection').fill(templateTitle);
  await page.getByPlaceholder('Describe the maintenance activities...').fill('Browser-created PM execution template.');
  await page.getByPlaceholder('1.5').fill('1');
  const createTemplateResponse = page.waitForResponse((response) => response.url().includes('/api/pm-templates') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Create Template', exact: true }).click();
  expect((await createTemplateResponse).status()).toBe(201);
  await expect(page.getByText('Edit PM Template', { exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('Task Library Checklist', { exact: true })).toBeVisible({ timeout: 20_000 });

  const templateList = await apiCallWithPlant(plannerToken, 'GET', `/api/pm-templates?search=${encodeURIComponent(templateTitle)}`, plantId);
  expect(templateList.status).toBe(200);
  const template = (templateList.data.data as any[]).find((row) => row.title === templateTitle);
  expect(template?.id).toBeTruthy();

  // Creation intentionally transitions directly into Edit mode with the Task
  // Library checklist expanded. Create real Task Masters through that UI and
  // let the template editor link each returned master through the association API.
  for (const description of templateTaskDescriptions) {
    await page.getByRole('button', { name: 'Add New Task', exact: true }).click();
    await expect(page.getByText('Add PM Task', { exact: true })).toBeVisible();
    await page.getByPlaceholder('e.g. Lubricate drive-end bearing').fill(description);
    const createTaskResponse = page.waitForResponse((response) =>
      response.url().includes('/api/pm-tasks')
      && !response.url().includes('/bulk')
      && response.request().method() === 'POST',
    );
    const linkTaskResponse = page.waitForResponse((response) =>
      response.url().includes(`/api/pm-templates/${template.id}/tasks`)
      && response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Create Task', exact: true }).click();
    expect((await createTaskResponse).status()).toBe(201);
    expect((await linkTaskResponse).status()).toBe(201);
    await expect(page.getByText(description, { exact: true })).toBeVisible({ timeout: 10_000 });
  }
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();

  const templateState = await apiCallWithPlant(plannerToken, 'GET', `/api/pm-templates/${template.id}`, plantId);
  expect(templateState.status).toBe(200);
  expect(templateState.data.data?.tasks).toHaveLength(3);

  // New browser-authored schedules are task-level in slice 3 and deliberately cannot
  // enter the legacy generation engine. This scenario validates legacy generation and
  // schedule-owned checklist snapshots, so seed that compatibility schedule through
  // the still-supported API path while keeping template/task creation above in the UI.
  const createSchedule = await apiCall(plannerToken, 'POST', '/api/pm-schedules', {
    title: scheduleTitle,
    assetId,
    frequencyType: 'time_day',
    frequencyValue: 1,
    frequencyUnit: 'months',
    nextDueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    estimatedDuration: 1,
    priority: 'medium',
    autoGenerateWO: true,
    leadDays: 3,
    inlineTasks: [
      { description: templateTaskDescriptions[0], taskType: 'inspect', estimatedMinutes: 15 },
      { description: templateTaskDescriptions[1], taskType: 'measure', estimatedMinutes: 15 },
      { description: templateTaskDescriptions[2], taskType: 'lubricate', estimatedMinutes: 15 },
      { description: scheduleOnlyTask, taskType: 'record', estimatedMinutes: 15 },
    ],
  });
  expect(createSchedule.status).toBe(201);

  const schedules = await apiCall(plannerToken, 'GET', `/api/pm-schedules?assetId=${encodeURIComponent(assetId)}`);
  expect(schedules.status).toBe(200);
  const schedule = (schedules.data.data as any[]).find((row) => row.title === scheduleTitle);
  expect(schedule?.id).toBeTruthy();
  expect(schedule?.templateId).toBeTruthy();
  expect(schedule?.templateId).not.toBe(template.id);

  const savedSchedule = await apiCall(plannerToken, 'GET', `/api/pm-schedules/${schedule.id}`);
  expect(savedSchedule.status).toBe(200);
  expect(savedSchedule.data.data?.template?.category).toBe('schedule_snapshot');
  expect((savedSchedule.data.data?.template?.tasks as any[]).map((task) => task.description)).toEqual(taskDescriptions);

  // The reusable source template remains unchanged at three tasks.
  const reusableTemplateAfterScheduleSave = await apiCall(plannerToken, 'GET', `/api/pm-templates/${template.id}`);
  expect(reusableTemplateAfterScheduleSave.status).toBe(200);
  expect((reusableTemplateAfterScheduleSave.data.data?.tasks as any[]).map((task) => task.description)).toEqual(templateTaskDescriptions);

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
    await expect(page.getByRole('button', { name: 'Done', exact: true })).toHaveCount(4, { timeout: 10_000 });
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
    expect(taskStateAfter.data.data).toHaveLength(4);
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
      await expect(page.getByRole('combobox', { name: 'Search work orders' })).toContainText(completed.woNumber, { timeout: 15_000 });
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
