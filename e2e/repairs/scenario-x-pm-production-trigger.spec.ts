import { test, expect } from '@playwright/test';
import { authenticateAs } from './helpers/auth';
import { apiCall, getToken, lookupAssetId, lookupPlantId, lookupUserByKey } from './helpers/api';

test('UAT-23: production-count PM uses authoritative work-center output and cancellation rearms', async ({ page, context }) => {
  const suffix = Date.now().toString().slice(-7);
  const scheduleTitle = `UAT Production PM ${suffix}`;
  const workCenterName = `UAT PM Output Center ${suffix}`;
  const plannerToken = await getToken('planner');
  const plantBPlannerToken = await getToken('planner_plant_b');
  const productionToken = await getToken('production_manager');
  const technicianId = await lookupUserByKey(plannerToken, 'tech_single');
  const assetId = await lookupAssetId(plannerToken, 'UAT-PUMP-001');
  const plantId = await lookupPlantId(plannerToken, 'PLANT-A');

  let workCenterId = '';
  let scheduleId = '';
  let triggerId = '';
  const generatedWoIds: string[] = [];

  const recordCompletedOutput = async (qty: number, label: string) => {
    const created = await apiCall(productionToken, 'POST', '/api/production-orders', {
      title: `UAT PM Output ${label} ${suffix}`,
      description: 'Production output used to prove production-count PM triggering.',
      status: 'in_progress',
      priority: 'medium',
      productName: 'UAT Pump Product',
      quantity: qty,
      workCenterId,
      plantId,
    });
    expect(created.status).toBe(201);
    const orderId = String(created.data.data?.id || '');
    expect(orderId).toBeTruthy();

    const completed = await apiCall(productionToken, 'POST', `/api/production-orders/${orderId}/complete`, {
      completedQty: qty,
      notes: `UAT production-count PM output ${label}`,
    });
    expect(completed.status).toBe(200);
    expect(Number(completed.data.data?.completedQty)).toBe(qty);
    return orderId;
  };

  try {
    const workCenter = await apiCall(productionToken, 'POST', '/api/work-centers', {
      name: workCenterName,
      description: 'Dedicated UAT production-count PM source.',
      type: 'production',
      status: 'active',
      capacity: 500,
      capacityUnit: 'units/hour',
    });
    expect(workCenter.status).toBe(201);
    workCenterId = String(workCenter.data.data?.id || '');
    expect(workCenterId).toBeTruthy();

    // Establish an authoritative 100-unit baseline before the PM trigger is authored.
    await recordCompletedOutput(100, 'baseline');

    const scheduleCreate = await apiCall(plannerToken, 'POST', '/api/pm-schedules', {
      title: scheduleTitle,
      description: 'UAT production-count trigger schedule.',
      assetId,
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

    // Planner authors the production-count trigger through the real PM Triggers UI.
    await authenticateAs(context, 'planner');
    await page.goto('/#/pm-triggers');
    await expect(page.getByRole('main').getByRole('heading', { name: 'PM Triggers', exact: true })).toBeVisible({ timeout: 20_000 });
    await page.getByRole('button', { name: 'New Trigger', exact: true }).click();
    await expect(page.getByText('Create PM Trigger', { exact: true })).toBeVisible();

    const scheduleLabel = page.locator('label').filter({ hasText: /^PM Schedule \*/ }).first();
    await scheduleLabel.locator('..').getByRole('combobox').click();
    await page.getByPlaceholder('Search by schedule title or asset...').fill(scheduleTitle);
    const scheduleOption = page.getByRole('option', { name: `${scheduleTitle} — UAT Test Pump [UAT-PUMP-001]`, exact: true });
    await expect(scheduleOption).toBeVisible({ timeout: 10_000 });
    await scheduleOption.click();

    await page.getByRole('button', { name: 'Production Count', exact: true }).click();
    const sourceLabel = page.locator('label').filter({ hasText: /^Authoritative production source \*/ }).first();
    const sourceCombobox = sourceLabel.locator('..').getByRole('combobox');
    await expect(sourceCombobox).toBeEnabled({ timeout: 10_000 });
    await sourceCombobox.click();
    const sourceOption = page.getByRole('option').filter({ hasText: new RegExp(`${workCenterName}.*100 completed units`, 'i') }).first();
    await expect(sourceOption).toBeVisible({ timeout: 10_000 });
    await sourceOption.click();
    await expect(sourceLabel.locator('..')).toContainText('Current: 100 completed units');

    await page.getByPlaceholder('e.g. 5000').fill('50');
    const createTriggerResponse = page.waitForResponse((response) =>
      response.url().includes('/api/pm-triggers') && response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Create Trigger', exact: true }).click();
    expect((await createTriggerResponse).status()).toBe(201);

    const triggerList = await apiCall(plannerToken, 'GET', `/api/pm-triggers?scheduleId=${encodeURIComponent(scheduleId)}`);
    expect(triggerList.status).toBe(200);
    const trigger = (triggerList.data.data as any[]).find((row) => row.scheduleId === scheduleId && row.triggerType === 'production_count');
    expect(trigger?.id).toBeTruthy();
    triggerId = String(trigger.id);
    expect(Number(trigger.triggerValue)).toBe(50);
    const triggerConfig = JSON.parse(trigger.triggerConfig || '{}');
    expect(triggerConfig.sourceType).toBe('work_center_output');
    expect(triggerConfig.workCenterId).toBe(workCenterId);
    expect(Number(triggerConfig.baselineCount)).toBe(100);

    await page.getByPlaceholder('Search by schedule, asset, department...').fill(scheduleTitle);
    const triggerCard = page.getByRole('main').locator('[data-slot="card"]').filter({ hasText: scheduleTitle });
    await expect(triggerCard).toBeVisible({ timeout: 10_000 });
    await expect(triggerCard.getByText('Production Count', { exact: true })).toBeVisible();

    // 149 total units remains below the 150-unit threshold.
    await recordCompletedOutput(49, 'below-threshold');
    const belowEval = await apiCall(plannerToken, 'POST', '/api/pm-triggers/evaluate', {});
    expect(belowEval.status).toBe(200);
    const below = (belowEval.data.data.results as any[]).find((row) => row.triggerId === triggerId);
    expect(below?.skipped).toBe(true);
    expect(String(below?.reason || '')).toMatch(/threshold not reached/i);
    expect(Number(below?.current)).toBe(149);

    // Cross exactly to 150. A Plant-B-only planner must not generate Plant-A PM.
    await recordCompletedOutput(1, 'threshold-crossing');
    const crossPlantEval = await apiCall(plantBPlannerToken, 'POST', '/api/pm-triggers/evaluate', {});
    expect(crossPlantEval.status).toBe(200);
    expect((crossPlantEval.data.data.results as any[]).some((row) => row.triggerId === triggerId && row.skipped === false)).toBe(false);

    const firstEval = await apiCall(plannerToken, 'POST', '/api/pm-triggers/evaluate', {});
    expect(firstEval.status).toBe(200);
    const firstGenerated = (firstEval.data.data.results as any[]).find((row) => row.triggerId === triggerId && row.skipped === false);
    expect(firstGenerated?.workOrderId).toBeTruthy();
    expect(Number(firstGenerated?.current)).toBe(150);
    const firstWoId = String(firstGenerated.workOrderId);
    generatedWoIds.push(firstWoId);

    const firstWo = await apiCall(plannerToken, 'GET', `/api/work-orders/${firstWoId}`);
    expect(firstWo.status).toBe(200);
    expect(firstWo.data.data.type).toBe('preventive');
    expect(firstWo.data.data.pmSchedule?.id ?? firstWo.data.data.pmScheduleId).toBe(scheduleId);
    expect(String(firstWo.data.data.description || '')).toMatch(/production-count preventive maintenance/i);

    // Re-evaluating the same aggregate cannot create a duplicate PM work order.
    const duplicateEval = await apiCall(plannerToken, 'POST', '/api/pm-triggers/evaluate', {});
    expect(duplicateEval.status).toBe(200);
    expect((duplicateEval.data.data.results as any[]).some((row) => row.triggerId === triggerId && row.skipped === false)).toBe(false);

    // Cancelling the generated WO restores the previous 100-unit baseline.
    const cancelFirst = await apiCall(plannerToken, 'POST', `/api/work-orders/${firstWoId}/cancel`, {
      reason: 'UAT-23 production-count cancellation rearm proof',
    });
    expect(cancelFirst.status).toBe(200);
    expect(cancelFirst.data.cancellation?.pmTriggerRearmed).toBe(true);

    const rearmedTrigger = await apiCall(plannerToken, 'GET', `/api/pm-triggers?scheduleId=${encodeURIComponent(scheduleId)}`);
    const rearmed = (rearmedTrigger.data.data as any[]).find((row) => row.id === triggerId);
    expect(Number(JSON.parse(rearmed.triggerConfig || '{}').baselineCount)).toBe(100);

    // The still-due 150-unit source must now generate a replacement WO.
    const replacementEval = await apiCall(plannerToken, 'POST', '/api/pm-triggers/evaluate', {});
    expect(replacementEval.status).toBe(200);
    const replacement = (replacementEval.data.data.results as any[]).find((row) => row.triggerId === triggerId && row.skipped === false);
    expect(replacement?.workOrderId).toBeTruthy();
    expect(String(replacement.workOrderId)).not.toBe(firstWoId);
    generatedWoIds.push(String(replacement.workOrderId));
  } finally {
    for (const woId of generatedWoIds.reverse()) {
      const state = await apiCall(plannerToken, 'GET', `/api/work-orders/${woId}`);
      if (state.status === 200 && !['closed', 'cancelled'].includes(state.data.data.status)) {
        await apiCall(plannerToken, 'POST', `/api/work-orders/${woId}/cancel`, { reason: 'UAT-23 cleanup' });
      }
    }
    if (triggerId) await apiCall(plannerToken, 'DELETE', `/api/pm-triggers/${triggerId}`);
    if (scheduleId) await apiCall(plannerToken, 'PUT', `/api/pm-schedules/${scheduleId}`, { isActive: false });
    await context.close().catch(() => undefined);
  }
});
