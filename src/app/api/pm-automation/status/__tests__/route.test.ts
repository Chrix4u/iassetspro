import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  getSession,
  hasPermission,
  isAdmin,
  getStatus,
  getJobs,
  isSchedulerStarted,
  resolveInterval,
} = vi.hoisted(() => ({
  getSession: vi.fn(),
  hasPermission: vi.fn(),
  isAdmin: vi.fn(),
  getStatus: vi.fn(),
  getJobs: vi.fn(),
  isSchedulerStarted: vi.fn(),
  resolveInterval: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ getSession, hasPermission, isAdmin }));
vi.mock('@/lib/queue', () => ({
  QUEUES: { MAINTENANCE_SCHEDULING: 'maintenance-scheduling' },
  jobQueue: { getStatus, getJobs },
}));
vi.mock('@/services/pm/automationScheduler.service', () => ({
  isPmAutomationSchedulerStarted: isSchedulerStarted,
  resolvePmAutomationIntervalMs: resolveInterval,
}));

import { GET } from '../route';

const session = { userId: 'planner-1', permissions: ['pm_schedules.view'], roles: ['planner'] };
const queueStatus = { name: 'maintenance-scheduling', total: 0, waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 };
const request = () => new NextRequest('http://localhost/api/pm-automation/status');

describe('GET /api/pm-automation/status', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-20T18:00:00.000Z'));
    vi.stubEnv('PM_CRON_SECRET', 'configured-secret');
    getSession.mockReturnValue(session);
    hasPermission.mockReturnValue(true);
    isAdmin.mockReturnValue(false);
    getStatus.mockResolvedValue(queueStatus);
    getJobs.mockResolvedValue([]);
    isSchedulerStarted.mockReturnValue(true);
    resolveInterval.mockReturnValue(60_000);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('rejects unauthenticated callers before reading queue state', async () => {
    getSession.mockReturnValue(null);
    const response = await GET(request());
    expect(response.status).toBe(401);
    expect(getJobs).not.toHaveBeenCalled();
  });

  it('rejects actors without PM schedule view permission', async () => {
    hasPermission.mockReturnValue(false);
    const response = await GET(request());
    expect(response.status).toBe(403);
    expect(getJobs).not.toHaveBeenCalled();
  });

  it('reports disabled when trusted PM automation is not configured', async () => {
    vi.stubEnv('PM_CRON_SECRET', '');
    isSchedulerStarted.mockReturnValue(false);
    const response = await GET(request());
    const body = await response.json();
    expect(body.data.health).toBe('disabled');
    expect(body.data.configured).toBe(false);
    expect(JSON.stringify(body)).not.toContain('configured-secret');
  });

  it('reports starting while the scheduler is live but has not completed its first tick', async () => {
    const response = await GET(request());
    const body = await response.json();
    expect(body.data.health).toBe('starting');
    expect(body.data.schedulerStarted).toBe(true);
  });

  it('reports healthy after a recent successful automation tick', async () => {
    getJobs.mockResolvedValue([{
      id: 'pm-automation-1', name: 'pm-automation-tick', status: 'completed',
      createdAt: '2026-10-20T17:59:00.000Z', completedAt: '2026-10-20T17:59:30.000Z',
    }]);
    const response = await GET(request());
    const body = await response.json();
    expect(body.data.health).toBe('healthy');
    expect(body.data.lastCompletedAt).toBe('2026-10-20T17:59:30.000Z');
  });

  it('reports degraded when a later automation tick failed', async () => {
    getJobs.mockResolvedValue([
      { id: 'ok', name: 'pm-automation-tick', status: 'completed', createdAt: '2026-10-20T17:57:00.000Z', completedAt: '2026-10-20T17:57:30.000Z' },
      { id: 'bad', name: 'pm-automation-tick', status: 'failed', createdAt: '2026-10-20T17:59:00.000Z', failedAt: '2026-10-20T17:59:30.000Z' },
    ]);
    const response = await GET(request());
    const body = await response.json();
    expect(body.data.health).toBe('degraded');
    expect(body.data.lastFailedAt).toBe('2026-10-20T17:59:30.000Z');
  });

  it('reports degraded when successful automation has gone stale beyond three cadences', async () => {
    getJobs.mockResolvedValue([{
      id: 'stale', name: 'pm-automation-tick', status: 'completed',
      createdAt: '2026-10-20T17:50:00.000Z', completedAt: '2026-10-20T17:51:00.000Z',
    }]);
    const response = await GET(request());
    const body = await response.json();
    expect(body.data.health).toBe('degraded');
  });
});
