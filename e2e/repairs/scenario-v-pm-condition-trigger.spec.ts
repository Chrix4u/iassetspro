import { test, expect } from '@playwright/test';
import { authenticateAs } from './helpers/auth';
import { apiCall, getToken, lookupAssetId, lookupPlantId, lookupUserByKey } from './helpers/api';

test('UAT-21: planner-authored condition trigger fires once per recovery edge', async ({ page, context }) => {
  const suffix = Date.now().toString().slice(-7);
  const scheduleTitle = `UAT Condition PM ${suffix}`;
  const setupWoTitle = `UAT Condition Reading Source ${suffix}`;
  const plannerToken = await getToken('planner');
  const technicianToken = await getToken('tech_single');
  const technicianId = await lookupUserByKey(plannerToken, 'tech_single');
  const supervisorId = await lookupUserByKey(plannerToken, 'supervisor');
  const assetId = await lookupAssetId(plannerToken, 'UAT-PUMP-001');
  const plantId = await lookupPlantId(plannerToken, 'PLANT-A');

  let componentId = '';
  let setupWoId = '';
  let scheduleId = '';
  let triggerId = '';
  const generatedWoIds: string[] = [];

  try {
    const componentLookup = await apiCall(
      plannerToken,
      'GET',
      `/api/component-registry?assetId=${encodeURIComponent(assetId)}&search=${encodeURIComponent('UAT-PUMP-BRG-DE')}`,
    );
    expect(componentLookup.status).toBe(200);
    const component = (componentLookup.data.data as any[]).find((row) => row.componentCode === 'UAT-PUMP-BRG-DE');
    expect(component?.id).toBeTruthy();
    componentId = String(component.id);

    // Create one isolated execution WO so all condition readings are recorded by
    // a legitimate assigned technician through the production measurement API.
    const setupWo = await apiCall(plannerToken, 'POST', '/api/work-orders', {
      title: setupWoTitle,
      description: 'UAT source work order for PM condition-trigger readings.',
      type: 'corrective',
      priority: 'low',
      assetId,
      assetName: 'UAT Test Pump',
      plantId,
      assignedTo: technicianId,
      teamLeaderId: technicianId,
      assignedSupervisorId: supervisorId,
      assignmentType: 'direct',
      teamMembers: [{ userId: technicianId, role: 'team_leader' }],
      componentIds: [componentId],
    });
    expect(setupWo.status).toBe(201);
    setupWoId = String(setupWo.data.data?.id || '');
    expect(setupWoId).toBeTruthy();

    const initialReading = await apiCall(technicianToken, 'POST', `/api/work-orders/${setupWoId}/measurements`, {
      componentId,
      parameterKey: 'vibration',
      value: 3,
    });
    expect(initialReading.status).toBe(201);
    expect(initialReading.data.data.parameterKey).toBe('vibration');
    expect(initialReading.data.data.unit).toBe('mm/s');
    expect(Number(initialReading.data.data.value)).toBe(3);

    // The schedule is deterministic setup; the condition trigger itself is authored
    // below through the real planner browser UI.
    const scheduleCreate = await apiCall(plannerToken, 'POST', '/api/pm-schedules', {
      title: scheduleTitle,
      description: 'UAT direct condition-trigger schedule.',
      assetId,
      componentId,
      frequencyType: 'monthly',
      frequencyValue: 1,
      nextDueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      estimatedDuration: 1,
      priority: 'high',
      assignedToId: technicianId,
      autoGenerateWO: true,
      leadDays: 0,
    });
    expect(scheduleCreate.status).toBe(201);
    scheduleId = String(scheduleCreate.data.data?.id || '');
    expect(scheduleId).toBeTruthy();
    expect(scheduleCreate.data.data?.componentId).toBe(componentId);

    await authenticateAs(context, 'planner');
    await page.goto('/#/pm-triggers');
    await expect(page.getByRole('heading', { name: 'PM Triggers', exact: true })).toBeVisible({ timeout: 20_000 });
    await page.getByRole('button', { name: 'New Trigger', exact: true }).click();
    await expect(page.getByText('Create PM Trigger', { exact: true })).toBeVisible();

    const scheduleLabel = page.locator('label').filter({ hasText: /^PM Schedule \*/ }).first();
    await scheduleLabel.locator('..').getByRole('combobox').click();
    await page.getByPlaceholder('Search by schedule title or asset...').fill(scheduleTitle);
    await page.getByText(`${scheduleTitle} — UAT Test Pump [UAT-PUMP-001]`, { exact: true }).click();

    await page.getByRole('button', { name: 'Condition', exact: true }).click();
    const sourceLabel = page.locator('label').filter({ hasText: /^Authoritative condition source \*/ }).first();
    const sourceCombobox = sourceLabel.locator('..').getByRole('combobox');
    await expect(sourceCombobox).toBeEnabled({ timeout: 10_000 });
    await sourceCombobox.click();
    const vibrationOption = page.getByRole('option').filter({ hasText: /UAT-PUMP-BRG-DE.*vibration.*3.*mm\/s/i }).first();
    await expect(vibrationOption).toBeVisible({ timeout: 10_000 });
    await vibrationOption.click();
    await expect(sourceLabel.locator('..')).toContainText('Current: 3 mm/s');

    await page.getByPlaceholder('e.g. 85').fill('5');
    const createTriggerResponse = page.waitForResponse((response) =>
      response.url().includes('/api/pm-triggers') && response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Create Trigger', exact: true }).click();
    expect((await createTriggerResponse).status()).toBe(201);

    const triggerList = await apiCall(plannerToken, 'GET', `/api/pm-triggers?scheduleId=${encodeURIComponent(scheduleId)}`);
    expect(triggerList.status).toBe(200);
    const trigger = (triggerList.data.data as any[]).find((row) => row.scheduleId === scheduleId && row.triggerType === 'condition');
    expect(trigger?.id).toBeTruthy();
    triggerId = String(trigger.id);
    const triggerConfig = JSON.parse(trigger.triggerConfig || '{}');
    expect(triggerConfig.sourceType).toBe('component_condition');
    expect(triggerConfig.componentId).toBe(componentId);
    expect(triggerConfig.metric).toBe('vibration');
    expect(Number(triggerConfig.value)).toBe(5);
    expect(triggerConfig.operator).toBe('>');

    await page.getByPlaceholder('Search by schedule, asset, department...').fill(scheduleTitle);
    await expect(page.getByText(scheduleTitle, { exact: true })).toBeVisible({ timeout: 10_000 });

    // The trigger snapshots the current 3 mm/s reading, so no work order exists yet.
    const baselineEval = await apiCall(plannerToken, 'POST', '/api/pm-triggers/evaluate', { triggerId });
    expect(baselineEval.status).toBe(200);
    expect((baselineEval.data.data.results as any[]).some((row) => row.triggerId === triggerId && row.skipped === false)).toBe(false);

    // First crossing: 6 > 5 generates exactly one targeted preventive WO.
    const alarmReading = await apiCall(technicianToken, 'POST', `/api/work-orders/${setupWoId}/measurements`, {
      componentId,
      parameterKey: 'vibration',
      value: 6,
    });
    expect(alarmReading.status).toBe(201);

    const firstEval = await apiCall(plannerToken, 'POST', '/api/pm-triggers/evaluate', { triggerId });
    expect(firstEval.status).toBe(200);
    const firstGenerated = (firstEval.data.data.results as any[]).find((row) => row.triggerId === triggerId && row.skipped === false);
    expect(firstGenerated?.workOrderId).toBeTruthy();
    const firstWoId = String(firstGenerated.workOrderId);
    generatedWoIds.push(firstWoId);

    const firstWo = await apiCall(plannerToken, 'GET', `/api/work-orders/${firstWoId}`);
    expect(firstWo.status).toBe(200);
    expect(firstWo.data.data.type).toBe('preventive');
    expect(firstWo.data.data.pmSchedule?.id ?? firstWo.data.data.pmScheduleId).toBe(scheduleId);
    expect((firstWo.data.data.workOrderComponents as any[] | undefined)?.some((link) => link.componentRegistry?.id === componentId)).toBe(true);

    // A new reading that is still above threshold must not create another WO.
    expect((await apiCall(technicianToken, 'POST', `/api/work-orders/${setupWoId}/measurements`, {
      componentId,
      parameterKey: 'vibration',
      value: 6.2,
    })).status).toBe(201);
    const persistentEval = await apiCall(plannerToken, 'POST', '/api/pm-triggers/evaluate', { triggerId });
    expect(persistentEval.status).toBe(200);
    const persistent = (persistentEval.data.data.results as any[]).find((row) => row.triggerId === triggerId);
    expect(persistent?.skipped).toBe(true);
    expect(String(persistent?.reason || '')).toMatch(/waiting for recovery|existing PM work order/i);

    // Recovery rearms the condition edge.
    expect((await apiCall(technicianToken, 'POST', `/api/work-orders/${setupWoId}/measurements`, {
      componentId,
      parameterKey: 'vibration',
      value: 3.5,
    })).status).toBe(201);
    const recoveryEval = await apiCall(plannerToken, 'POST', '/api/pm-triggers/evaluate', { triggerId });
    expect(recoveryEval.status).toBe(200);
    const recovery = (recoveryEval.data.data.results as any[]).find((row) => row.triggerId === triggerId);
    expect(recovery?.skipped).toBe(true);
    expect(String(recovery?.reason || '')).toMatch(/within configured boundary/i);

    // Remove the first open-cycle blocker, then a new crossing must fire again.
    const cancelFirst = await apiCall(plannerToken, 'POST', `/api/work-orders/${firstWoId}/cancel`, {
      reason: 'UAT-21 condition recovery edge proof',
    });
    expect(cancelFirst.status).toBe(200);

    expect((await apiCall(technicianToken, 'POST', `/api/work-orders/${setupWoId}/measurements`, {
      componentId,
      parameterKey: 'vibration',
      value: 6.5,
    })).status).toBe(201);
    const secondEval = await apiCall(plannerToken, 'POST', '/api/pm-triggers/evaluate', { triggerId });
    expect(secondEval.status).toBe(200);
    const secondGenerated = (secondEval.data.data.results as any[]).find((row) => row.triggerId === triggerId && row.skipped === false);
    expect(secondGenerated?.workOrderId).toBeTruthy();
    expect(String(secondGenerated.workOrderId)).not.toBe(firstWoId);
    generatedWoIds.push(String(secondGenerated.workOrderId));
  } finally {
    for (const woId of generatedWoIds.reverse()) {
      const state = await apiCall(plannerToken, 'GET', `/api/work-orders/${woId}`);
      if (state.status === 200 && !['closed', 'cancelled'].includes(state.data.data.status)) {
        await apiCall(plannerToken, 'POST', `/api/work-orders/${woId}/cancel`, { reason: 'UAT-21 cleanup' });
      }
    }
    if (triggerId) await apiCall(plannerToken, 'DELETE', `/api/pm-triggers/${triggerId}`);
    if (scheduleId) await apiCall(plannerToken, 'PUT', `/api/pm-schedules/${scheduleId}`, { isActive: false });
    if (setupWoId) {
      const setupState = await apiCall(plannerToken, 'GET', `/api/work-orders/${setupWoId}`);
      if (setupState.status === 200 && !['closed', 'cancelled'].includes(setupState.data.data.status)) {
        await apiCall(plannerToken, 'POST', `/api/work-orders/${setupWoId}/cancel`, { reason: 'UAT-21 cleanup' });
      }
    }
    await context.close().catch(() => undefined);
  }
});
