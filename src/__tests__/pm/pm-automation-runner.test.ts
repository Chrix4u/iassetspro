import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  resolvePmAutomationLoopbackUrl,
  runPmAutomationTick,
} from '@/services/pm/automationRunner.service';

describe('PM automation worker runner', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('PM_CRON_SECRET', 'trusted-pm-secret');
    vi.stubEnv('PORT', '3001');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('pins trusted automation calls to the local application loopback', () => {
    expect(resolvePmAutomationLoopbackUrl('3001'))
      .toBe('http://127.0.0.1:3001/api/pm-schedules/check-due-cron');
    expect(resolvePmAutomationLoopbackUrl(undefined))
      .toBe('http://127.0.0.1:3001/api/pm-schedules/check-due-cron');
    vi.stubEnv('PORT', '');
    expect(resolvePmAutomationLoopbackUrl(undefined))
      .toBe('http://127.0.0.1:3000/api/pm-schedules/check-due-cron');
    expect(() => resolvePmAutomationLoopbackUrl('https://evil.example'))
      .toThrow(/invalid PORT/i);
    expect(() => resolvePmAutomationLoopbackUrl('70000'))
      .toThrow(/invalid PORT/i);
  });

  it('executes the canonical PM automation endpoint with the trusted cron secret', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: { workOrdersGenerated: 2, overdueAlertsSent: 1 },
      }),
    });

    await expect(runPmAutomationTick()).resolves.toEqual({
      workOrdersGenerated: 2,
      overdueAlertsSent: 1,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:3001/api/pm-schedules/check-due-cron',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-pm-cron-secret': 'trusted-pm-secret',
        },
        body: '{}',
        cache: 'no-store',
      },
    );
  });

  it('refuses to run without PM_CRON_SECRET instead of falling back to browser auth', async () => {
    vi.stubEnv('PM_CRON_SECRET', '');
    await expect(runPmAutomationTick()).rejects.toThrow(/PM_CRON_SECRET is required/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('turns a canonical endpoint failure into a retryable queue error', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ success: false, error: 'database unavailable' }),
    });

    await expect(runPmAutomationTick()).rejects.toThrow(/database unavailable/i);
  });
});
