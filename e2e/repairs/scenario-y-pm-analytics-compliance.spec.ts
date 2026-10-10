import { test, expect } from '@playwright/test';
import { authenticateAs } from './helpers/auth';
import {
  apiCall,
  assignWO,
  completeWO,
  getToken,
  getWO,
  lookupAssetId,
  lookupUserByKey,
  logTime,
  startWO,
} from './helpers/api';

test('UAT-24: PM compliance analytics reflect real planned-window outcomes across PM surfaces', async ({ page, context }) => {
  const suffix = Date.now().toString().slice(-7);
  const plannerToken = await getToken('planner');
  const technicianToken = await getToken('tech_single');
  const assetId = await lookupAssetId(plannerToken, 'UAT-PUMP-001');
  const technicianId = await lookupUserByKey(plannerToken, 'tech_single');
  const supervisorId = await lookupUserByKey(plannerToken, 'supervisor');

  const baseline = await apiCall(plannerToken, 'GET', '/api/pm-analytics');
  expect(baseline.status).toBe(200);
  const baselineEligible = Number(baseline.data.data?.complianceEvaluatedCount || 0);
  const baselineGenerated = Number(baseline.data.data?.totalGenerated || 0);

  const onTimeDue = new Date(Date.now() + 5 * 60_000);
  const lateDue = new Date(Date.now() - 10 * 60_000);
  const scheduleIds: string[] = [];
  const activeTimers = new Set<string>();

  const createSchedule = async (title: string, nextDueDate: Date, estimatedDuration: number) => {
    const created = await apiCall(plannerToken, 'POST', '/api/pm-schedules', {
      title,
      description: 'Deterministic PM analytics planned-window UAT.',
      assetId,
      frequencyType: 'daily',
      frequencyValue: 1,
      nextDueDate: nextDueDate.toISOString(),
      estimatedDuration,
      priority: 'medium',
      assignedToId: technicianId,
      autoGenerateWO: true,
      leadDays: 1,
    });
    expect(created.status).toBe(201);
    const id = String(created.data.data?.id || '');
    expect(id).toBeTruthy();
    scheduleIds.push(id);
    return id;
  };

  const onTimeScheduleId = await createSchedule(`UAT PM Analytics On Time ${suffix}`, onTimeDue, 1);
  const lateScheduleId = await createSchedule(`UAT PM Analytics Late ${suffix}`, lateDue, 0.01);

  try {
    const generation = await apiCall(plannerToken, 'POST', '/api/pm-schedules/check-due', {});
    expect(generation.status).toBe(200);
    const results = generation.data.data?.results as any[] | undefined;
    const onTimeGenerated = results?.find((row) => row.scheduleId === onTimeScheduleId && row.skipped === false);
    const lateGenerated = results?.find((row) => row.scheduleId === lateScheduleId && row.skipped === false);
    expect(onTimeGenerated?.workOrderId).toBeTruthy();
    expect(lateGenerated?.workOrderId).toBeTruthy();

    const woIds = [String(onTimeGenerated.workOrderId), String(lateGenerated.workOrderId)];
    for (const woId of woIds) {
      await assignWO(plannerToken, woId, {
        assignedTo: technicianId,
        assignedSupervisorId: supervisorId,
        teamLeaderId: technicianId,
        teamMembers: [{ userId: technicianId, role: 'team_leader' }],
      });
      await startWO(technicianToken, woId);
      activeTimers.add(woId);
      const stop = await apiCall(technicianToken, 'POST', `/api/work-orders/${woId}/time-logs/stop`, {});
      expect(stop.status).toBe(200);
      activeTimers.delete(woId);
      await logTime(technicianToken, woId, { action: 'start', manualHours: 0.25, notes: 'PM analytics planned-window UAT labor' });
      await completeWO(technicianToken, woId, 'PM analytics planned-window UAT completed.');
    }

    const onTimeWo = await getWO(plannerToken, woIds[0]);
    const lateWo = await getWO(plannerToken, woIds[1]);
    expect(onTimeWo.status).toBe('completed');
    expect(lateWo.status).toBe('completed');
    expect(new Date(onTimeWo.actualEnd).getTime()).toBeLessThanOrEqual(new Date(onTimeWo.plannedEnd).getTime());
    expect(new Date(lateWo.actualEnd).getTime()).toBeGreaterThan(new Date(lateWo.plannedEnd).getTime());

    const after = await apiCall(plannerToken, 'GET', '/api/pm-analytics');
    expect(after.status).toBe(200);
    expect(Number(after.data.data?.complianceEvaluatedCount || 0)).toBe(baselineEligible + 2);
    expect(Number(after.data.data?.totalGenerated || 0)).toBeGreaterThanOrEqual(baselineGenerated + 2);
    const canonicalRate = after.data.data?.complianceRate;
    expect(canonicalRate).not.toBeNull();
    const expectedRate = `${canonicalRate}%`;

    await authenticateAs(context, 'planner');

    const schedulesAnalyticsResponse = page.waitForResponse((response) =>
      response.url().includes('/api/pm-analytics') && response.request().method() === 'GET',
    );
    await page.goto('/#/pm-schedules');
    expect((await schedulesAnalyticsResponse).status()).toBe(200);
    await expect(page.getByRole('main').getByRole('heading', { name: 'PM Schedules', exact: true })).toBeVisible({ timeout: 20_000 });
    const complianceRateCard = page.getByText('Compliance Rate', { exact: true }).locator('..');
    await expect(complianceRateCard).toContainText(expectedRate, { timeout: 15_000 });

    const maintenanceAnalyticsResponse = page.waitForResponse((response) =>
      response.url().includes('/api/pm-analytics') && response.request().method() === 'GET',
    );
    await page.goto('/#/maintenance-analytics');
    expect((await maintenanceAnalyticsResponse).status()).toBe(200);
    await expect(page.getByRole('main').getByRole('heading', { name: 'Maintenance Analytics', exact: true })).toBeVisible({ timeout: 20_000 });
    const pmComplianceCard = page.getByText('PM Compliance', { exact: true }).locator('..');
    await expect(pmComplianceCard).toContainText(expectedRate, { timeout: 15_000 });
  } finally {
    for (const woId of activeTimers) {
      await apiCall(technicianToken, 'POST', `/api/work-orders/${woId}/time-logs/stop`, {});
    }
    for (const scheduleId of scheduleIds) {
      await apiCall(plannerToken, 'DELETE', `/api/pm-schedules/${scheduleId}`);
    }
  }
});
