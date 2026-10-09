import { test, expect } from '@playwright/test';
import { authenticateAs } from './helpers/auth';
import { apiCall, getToken, lookupAssetId, lookupUserByKey } from './helpers/api';

test('UAT-20: meter PM threshold generates once, respects plant scope, and cancellation rearms', async ({ page, context }) => {
  const suffix = Date.now().toString().slice(-7);
  const componentCode = `UAT-METER-${suffix}`;
  const scheduleTitle = `UAT Meter PM ${suffix}`;
  const plannerToken = await getToken('planner');
  const plantBPlannerToken = await getToken('planner_plant_b');
  const technicianId = await lookupUserByKey(plannerToken, 'tech_single');
  const assetId = await lookupAssetId(plannerToken, 'UAT-PUMP-001');

  let componentId = '';
  let scheduleId = '';
  let triggerId = '';
  const generatedWoIds: string[] = [];

  try {
    // Dedicated component gives the trigger a deterministic 1000h baseline.
    const componentCreate = await apiCall(plannerToken, 'POST', '/api/component-registry', {
      componentCode,
      name: `UAT Meter Bearing ${suffix}`,
      componentType: 'component',
      assetId,
      criticality: 'high',
      operatingHours: 1000,
    });
    expect(componentCreate.status).toBe(201);
    componentId = String(componentCreate.data.data?.id || '');
    expect(componentId).toBeTruthy();

    // Planner authors the actual component meter schedule through the browser.
    await authenticateAs(context, 'planner');
    await page.goto('/#/pm-schedules');
    await expect(page.getByRole('main').getByRole('heading', { name: 'PM Schedules', exact: true })).toBeVisible({ timeout: 20_000 });
    await page.getByRole('button', { name: /New Schedule/i }).click();
    await page.getByPlaceholder('e.g., Monthly Motor Inspection').fill(scheduleTitle);

    const assetLabel = page.locator('label').filter({ hasText: /^Asset/ }).first();
    await assetLabel.locator('..').getByRole('combobox').click();
    await page.getByPlaceholder('Search assets by name or tag...').fill('UAT-PUMP-001');
    await page.getByText('UAT Test Pump [UAT-PUMP-001]', { exact: true }).click();

    const targetLabel = page.locator('label').filter({ hasText: /PM Target/ }).first();
    const targetCombobox = targetLabel.locator('..').getByRole('combobox');
    await expect(targetCombobox).toBeEnabled({ timeout: 10_000 });
    await targetCombobox.click();
    const targetOption = page.getByRole('option').filter({ hasText: componentCode }).first();
    await expect(targetOption).toBeVisible({ timeout: 10_000 });
    await targetOption.click();
    await expect(targetCombobox).toContainText(componentCode);

    const frequencyLabel = page.locator('label').filter({ hasText: /^Frequency Type \*/ }).first();
    await frequencyLabel.locator('..').getByRole('combobox').click();
    await page.getByRole('option', { name: 'Meter Based', exact: true }).click();
    const frequencyValueLabel = page.locator('label').filter({ hasText: /^Frequency Value \*/ }).first();
    await frequencyValueLabel.locator('..').locator('input').fill('100');
    const durationLabel = page.locator('label').filter({ hasText: /Est\. Duration/ }).first();
    await durationLabel.locator('..').locator('input').fill('1');

    const createScheduleResponse = page.waitForResponse((response) =>
      response.url().includes('/api/pm-schedules') && response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: /Create Schedule/i }).click();
    expect((await createScheduleResponse).status()).toBe(201);
    await expect(page.getByText(scheduleTitle, { exact: true })).toBeVisible({ timeout: 20_000 });

    const scheduleState = await apiCall(plannerToken, 'GET', `/api/pm-schedules?assetId=${encodeURIComponent(assetId)}`);
    expect(scheduleState.status).toBe(200);
    const schedule = (scheduleState.data.data as any[]).find((row) => row.title === scheduleTitle);
    expect(schedule?.id).toBeTruthy();
    scheduleId = String(schedule.id);
    expect(schedule.componentId).toBe(componentId);
    expect(schedule.frequencyType).toBe('meter_based');
    expect(Number(schedule.frequencyValue)).toBe(100);

    // Schedule creation must atomically provision one matching meter trigger.
    const triggerList = await apiCall(plannerToken, 'GET', `/api/pm-triggers?scheduleId=${encodeURIComponent(scheduleId)}`);
    expect(triggerList.status).toBe(200);
    const trigger = (triggerList.data.data as any[]).find((row) => row.scheduleId === scheduleId);
    expect(trigger?.id).toBeTruthy();
    triggerId = String(trigger.id);
    expect(trigger.triggerType).toBe('meter');
    expect(Number(trigger.triggerValue)).toBe(100);
    expect(JSON.parse(trigger.triggerConfig || '{}').baselineHours).toBe(1000);

    // The runtime trigger must be visible/editable on the actual PM Triggers page.
    await page.goto('/#/pm-triggers');
    await expect(page.getByRole('heading', { name: 'PM Triggers', exact: true })).toBeVisible({ timeout: 20_000 });
    await page.getByPlaceholder('Search by schedule, asset, department...').fill(scheduleTitle);
    await expect(page.getByText(scheduleTitle, { exact: true })).toBeVisible({ timeout: 15_000 });
    await page.getByTitle('Edit').click();
    await expect(page.getByText('Edit PM Trigger', { exact: true })).toBeVisible();
    await expect(page.getByPlaceholder('e.g. 500')).toHaveValue('100');
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();

    // 1099h is still below the 1100h threshold.
    expect((await apiCall(plannerToken, 'PUT', `/api/component-registry/${componentId}`, { operatingHours: 1099 })).status).toBe(200);
    const belowEvaluation = await apiCall(plannerToken, 'POST', '/api/pm-triggers/evaluate', {});
    expect(belowEvaluation.status).toBe(200);
    const below = (belowEvaluation.data.data.results as any[]).find((row) => row.triggerId === triggerId);
    expect(below?.skipped).toBe(true);
    expect(String(below?.reason || '')).toMatch(/threshold not reached/i);

    // Cross exactly to 1100h. A Plant-B-only planner must not generate Plant-A's PM.
    expect((await apiCall(plannerToken, 'PUT', `/api/component-registry/${componentId}`, { operatingHours: 1100 })).status).toBe(200);
    const crossPlantEvaluation = await apiCall(plantBPlannerToken, 'POST', '/api/pm-triggers/evaluate', {});
    expect(crossPlantEvaluation.status).toBe(200);
    expect((crossPlantEvaluation.data.data.results as any[]).some((row) => row.triggerId === triggerId && row.skipped === false)).toBe(false);

    const firstEvaluation = await apiCall(plannerToken, 'POST', '/api/pm-triggers/evaluate', {});
    expect(firstEvaluation.status).toBe(200);
    const firstGenerated = (firstEvaluation.data.data.results as any[]).find((row) => row.triggerId === triggerId && row.skipped === false);
    expect(firstGenerated?.workOrderId).toBeTruthy();
    expect(Number(firstGenerated?.crossedThreshold)).toBe(1100);
    const firstWoId = String(firstGenerated.workOrderId);
    generatedWoIds.push(firstWoId);

    const firstWo = await apiCall(plannerToken, 'GET', `/api/work-orders/${firstWoId}`);
    expect(firstWo.status).toBe(200);
    expect(firstWo.data.data.type).toBe('preventive');
    expect(firstWo.data.data.pmSchedule?.id ?? firstWo.data.data.pmScheduleId).toBe(scheduleId);
    expect(firstWo.data.data.plannerId).toBeTruthy();
    expect((firstWo.data.data.workOrderComponents as any[] | undefined)?.some((link) => link.componentRegistry?.id === componentId)).toBe(true);

    // Re-evaluating at the same reading cannot create a duplicate PM WO.
    const duplicateEvaluation = await apiCall(plannerToken, 'POST', '/api/pm-triggers/evaluate', {});
    expect(duplicateEvaluation.status).toBe(200);
    expect((duplicateEvaluation.data.data.results as any[]).some((row) => row.triggerId === triggerId && row.skipped === false)).toBe(false);

    // Cancelling a trigger-generated WO rolls back the consumed meter cycle.
    const cancelFirst = await apiCall(plannerToken, 'POST', `/api/work-orders/${firstWoId}/cancel`, {
      reason: 'UAT proves runtime-trigger cancellation rearm',
    });
    expect(cancelFirst.status).toBe(200);
    expect(cancelFirst.data.cancellation?.pmTriggerRearmed).toBe(true);

    // The same still-due 1100h cycle must now generate a replacement WO.
    const rearmedEvaluation = await apiCall(plannerToken, 'POST', '/api/pm-triggers/evaluate', {});
    expect(rearmedEvaluation.status).toBe(200);
    const replacement = (rearmedEvaluation.data.data.results as any[]).find((row) => row.triggerId === triggerId && row.skipped === false);
    expect(replacement?.workOrderId).toBeTruthy();
    expect(String(replacement.workOrderId)).not.toBe(firstWoId);
    generatedWoIds.push(String(replacement.workOrderId));
  } finally {
    for (const woId of generatedWoIds.reverse()) {
      const state = await apiCall(plannerToken, 'GET', `/api/work-orders/${woId}`);
      if (state.status === 200 && !['closed', 'cancelled'].includes(state.data.data.status)) {
        await apiCall(plannerToken, 'POST', `/api/work-orders/${woId}/cancel`, { reason: 'UAT-20 cleanup' });
      }
    }
    if (triggerId) await apiCall(plannerToken, 'DELETE', `/api/pm-triggers/${triggerId}`);
    if (scheduleId) await apiCall(plannerToken, 'PUT', `/api/pm-schedules/${scheduleId}`, { isActive: false });
    await context.close().catch(() => undefined);
  }
});
