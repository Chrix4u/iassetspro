import { test, expect } from '@playwright/test';
import { authenticateAs } from './helpers/auth';
import { apiCall, getToken, lookupAssetId, lookupUserByKey } from './helpers/api';

function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function chooseVisibleOverdueDate(existingSchedules: any[]): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const counts = new Map<string, number>();
  for (const schedule of existingSchedules) {
    if (!schedule?.nextDueDate || !schedule?.isActive) continue;
    const due = new Date(schedule.nextDueDate);
    due.setHours(0, 0, 0, 0);
    const key = dateKey(due);
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  // Prefer the current month so the default Calendar view needs no navigation.
  for (let day = today.getDate() - 1; day >= 1; day--) {
    const candidate = new Date(today.getFullYear(), today.getMonth(), day, 12, 0, 0, 0);
    if ((counts.get(dateKey(candidate)) || 0) < 3) return candidate;
  }

  // If today is the first of the month (or every earlier day is crowded), use
  // the previous month and navigate the Calendar back once.
  const prevMonth = new Date(today.getFullYear(), today.getMonth(), 0, 12, 0, 0, 0);
  for (let day = prevMonth.getDate(); day >= 1; day--) {
    const candidate = new Date(prevMonth.getFullYear(), prevMonth.getMonth(), day, 12, 0, 0, 0);
    if ((counts.get(dateKey(candidate)) || 0) < 3) return candidate;
  }
  throw new Error('Could not find a calendar day with fewer than three existing PM schedules');
}

test('UAT-22: overdue PM appears in Calendar and notifies the assigned technician once per day', async ({ page, context }) => {
  const suffix = Date.now().toString().slice(-7);
  const scheduleTitle = `UAT Overdue PM ${suffix}`;
  const plannerToken = await getToken('planner');
  const technicianToken = await getToken('tech_single');
  const assetId = await lookupAssetId(plannerToken, 'UAT-PUMP-001');
  const technicianId = await lookupUserByKey(plannerToken, 'tech_single');

  const existing = await apiCall(plannerToken, 'GET', '/api/pm-schedules?isActive=true');
  expect(existing.status).toBe(200);
  const dueDate = chooseVisibleOverdueDate(existing.data.data as any[]);

  const create = await apiCall(plannerToken, 'POST', '/api/pm-schedules', {
    title: scheduleTitle,
    description: 'UAT overdue Calendar and notification deduplication proof.',
    assetId,
    frequencyType: 'daily',
    frequencyValue: 1,
    nextDueDate: dueDate.toISOString(),
    estimatedDuration: 1,
    priority: 'high',
    assignedToId: technicianId,
    autoGenerateWO: false,
    leadDays: 0,
  });
  expect(create.status).toBe(201);
  const scheduleId = String(create.data.data?.id || '');
  expect(scheduleId).toBeTruthy();

  try {
  // Planner sees the exact overdue schedule in the visual PM Calendar.
  await authenticateAs(context, 'planner');
  await page.goto('/#/pm-calendar');
  await expect(page.getByRole('main').getByRole('heading', { name: 'PM Calendar', exact: true })).toBeVisible({ timeout: 20_000 });

  const now = new Date();
  if (dueDate.getFullYear() !== now.getFullYear() || dueDate.getMonth() !== now.getMonth()) {
    const previousMonthButton = page.locator('button').filter({ has: page.locator('svg.lucide-chevron-left') }).first();
    await previousMonthButton.click();
  }

  const scheduleButton = page.getByRole('button', { name: new RegExp(scheduleTitle) });
  await expect(scheduleButton).toBeVisible({ timeout: 20_000 });
  await scheduleButton.click();
  const detailDialog = page.getByRole('dialog');
  await expect(detailDialog.getByRole('heading', { name: scheduleTitle, exact: true })).toBeVisible();
  await expect(detailDialog.getByText('Overdue', { exact: true })).toBeVisible();

  // Manual planner execution uses the same canonical cron path but remains plant-scoped.
  const firstCron = await apiCall(plannerToken, 'POST', '/api/pm-schedules/check-due-cron', {});
  expect(firstCron.status).toBe(200);
  const overdueDetail = (firstCron.data.data?.overdueDetails as any[] | undefined)?.find((row) => row.scheduleId === scheduleId);
  expect(overdueDetail?.scheduleTitle).toBe(scheduleTitle);
  expect(Number(firstCron.data.data?.overdueAlertsSent || 0)).toBeGreaterThanOrEqual(1);

  const notificationsAfterFirst = await apiCall(technicianToken, 'GET', '/api/notifications?type=pm_overdue&limit=100');
  expect(notificationsAfterFirst.status).toBe(200);
  const firstMatches = (notificationsAfterFirst.data.data?.notifications as any[] | undefined)?.filter(
    (notification) => notification.entityType === 'pm_schedule' && notification.entityId === scheduleId,
  ) || [];
  expect(firstMatches).toHaveLength(1);
  expect(firstMatches[0]?.title).toBe('PM Schedule Overdue');
  expect(String(firstMatches[0]?.message || '')).toContain(scheduleTitle);

  // A second cron execution inside the 24-hour window must not duplicate the alert.
  const secondCron = await apiCall(plannerToken, 'POST', '/api/pm-schedules/check-due-cron', {});
  expect(secondCron.status).toBe(200);
  const secondDetail = (secondCron.data.data?.overdueDetails as any[] | undefined)?.find((row) => row.scheduleId === scheduleId);
  expect(secondDetail?.scheduleTitle).toBe(scheduleTitle);

  const notificationsAfterSecond = await apiCall(technicianToken, 'GET', '/api/notifications?type=pm_overdue&limit=100');
  expect(notificationsAfterSecond.status).toBe(200);
  const secondMatches = (notificationsAfterSecond.data.data?.notifications as any[] | undefined)?.filter(
    (notification) => notification.entityType === 'pm_schedule' && notification.entityId === scheduleId,
  ) || [];
  expect(secondMatches).toHaveLength(1);
  } finally {
    await apiCall(plannerToken, 'PUT', `/api/pm-schedules/${scheduleId}`, { isActive: false });
    await context.close().catch(() => undefined);
  }
});
