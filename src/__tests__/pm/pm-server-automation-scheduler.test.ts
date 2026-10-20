import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { add, getJobs } = vi.hoisted(() => ({
  add: vi.fn(async () => 'job-id'),
  getJobs: vi.fn(async () => [] as Array<{ id: string; name: string; status: string }>),
}));

vi.mock('@/lib/queue', () => ({
  QUEUES: { MAINTENANCE_SCHEDULING: 'maintenance-scheduling' },
  jobQueue: { add, getJobs },
}));

import {
  buildPmAutomationJobId,
  enqueuePmAutomationTick,
  isPmAutomationSchedulerStarted,
  resolvePmAutomationIntervalMs,
  startPmAutomationScheduler,
  stopPmAutomationScheduler,
} from '@/services/pm/automationScheduler.service';

describe('server-owned PM automation scheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    add.mockClear();
    getJobs.mockReset();
    getJobs.mockResolvedValue([]);
    vi.stubEnv('PM_CRON_SECRET', 'uat-pm-secret');
    vi.stubEnv('PM_AUTOMATION_INTERVAL_MS', '60000');
  });

  afterEach(() => {
    stopPmAutomationScheduler();
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it('uses a safe bounded cadence', () => {
    expect(resolvePmAutomationIntervalMs(undefined)).toBe(60_000);
    expect(resolvePmAutomationIntervalMs('1000')).toBe(30_000);
    expect(resolvePmAutomationIntervalMs('60000')).toBe(60_000);
    expect(resolvePmAutomationIntervalMs('99999999')).toBe(900_000);
    expect(resolvePmAutomationIntervalMs('not-a-number')).toBe(60_000);
  });

  it('builds one BullMQ-safe deterministic queue identity per cadence bucket', () => {
    const first = buildPmAutomationJobId(Date.parse('2026-10-20T09:49:05Z'), 60_000);
    expect(first).toBe(buildPmAutomationJobId(Date.parse('2026-10-20T09:49:59Z'), 60_000));
    expect(first).not.toContain(':');
    expect(buildPmAutomationJobId(Date.parse('2026-10-20T09:49:59Z'), 60_000))
      .not.toBe(buildPmAutomationJobId(Date.parse('2026-10-20T09:50:00Z'), 60_000));
  });

  it('enqueues the canonical PM automation tick with retry policy', async () => {
    const now = Date.parse('2026-10-20T09:49:30Z');
    await enqueuePmAutomationTick(now);

    expect(add).toHaveBeenCalledWith('maintenance-scheduling', {
      id: buildPmAutomationJobId(now, 60_000),
      name: 'pm-automation-tick',
      data: { action: 'run_pm_automation' },
      attempts: 3,
      backoff: 5_000,
    });
  });

  it('does not overlap a still-running PM automation tick', async () => {
    getJobs.mockResolvedValue([
      { id: 'pm-automation-existing', name: 'pm-automation-tick', status: 'active' },
    ]);

    await expect(enqueuePmAutomationTick(Date.parse('2026-10-20T09:50:30Z')))
      .resolves.toBe('pm-automation-existing');
    expect(add).not.toHaveBeenCalled();
  });

  it('starts once and enqueues on cadence without a browser request', async () => {
    expect(isPmAutomationSchedulerStarted()).toBe(false);
    expect(startPmAutomationScheduler()).toBe(true);
    expect(isPmAutomationSchedulerStarted()).toBe(true);
    expect(startPmAutomationScheduler()).toBe(false);

    await vi.advanceTimersByTimeAsync(59_999);
    expect(add).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(add).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(add).toHaveBeenCalledTimes(2);
    stopPmAutomationScheduler();
    expect(isPmAutomationSchedulerStarted()).toBe(false);
  });

  it('keeps scheduler lifecycle visible across server module reloads', async () => {
    expect(startPmAutomationScheduler()).toBe(true);
    expect(isPmAutomationSchedulerStarted()).toBe(true);

    vi.resetModules();
    const reloaded = await import('@/services/pm/automationScheduler.service');
    expect(reloaded.isPmAutomationSchedulerStarted()).toBe(true);
    reloaded.stopPmAutomationScheduler();
    expect(reloaded.isPmAutomationSchedulerStarted()).toBe(false);
  });

  it('does not start when the trusted PM automation secret is absent', async () => {
    vi.stubEnv('PM_CRON_SECRET', '');
    expect(startPmAutomationScheduler()).toBe(false);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(add).not.toHaveBeenCalled();
  });
});
