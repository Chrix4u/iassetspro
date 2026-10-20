import { NextRequest, NextResponse } from 'next/server';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { jobQueue, QUEUES, type JobRecord } from '@/lib/queue';
import {
  isPmAutomationSchedulerStarted,
  resolvePmAutomationIntervalMs,
} from '@/services/pm/automationScheduler.service';

export const dynamic = 'force-dynamic';

type AutomationHealth = 'healthy' | 'starting' | 'degraded' | 'disabled';

function eventTime(job: JobRecord | undefined): number {
  if (!job) return 0;
  const value = job.completedAt || job.failedAt || job.startedAt || job.createdAt;
  return value ? new Date(value).getTime() : 0;
}

export async function GET(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }
    if (!hasPermission(session, 'pm_schedules.view') && !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const configured = Boolean(process.env.PM_CRON_SECRET?.trim());
    const schedulerStarted = isPmAutomationSchedulerStarted();
    const intervalMs = resolvePmAutomationIntervalMs();
    const [queueStatus, jobs] = await Promise.all([
      jobQueue.getStatus(QUEUES.MAINTENANCE_SCHEDULING),
      jobQueue.getJobs(QUEUES.MAINTENANCE_SCHEDULING),
    ]);
    const automationJobs = jobs
      .filter((job) => job.name === 'pm-automation-tick')
      .sort((a, b) => eventTime(b) - eventTime(a));
    const latest = automationJobs[0];
    const lastCompleted = automationJobs.find((job) => job.status === 'completed');
    const lastFailed = automationJobs.find((job) => job.status === 'failed');
    const lastCompletedAt = lastCompleted?.completedAt || null;
    const lastFailedAt = lastFailed?.failedAt || null;
    const freshnessWindowMs = Math.max(intervalMs * 3, 180_000);

    let health: AutomationHealth = 'starting';
    if (!configured) {
      health = 'disabled';
    } else if (!schedulerStarted) {
      health = 'degraded';
    } else if (lastFailed && (!lastCompleted || eventTime(lastFailed) > eventTime(lastCompleted))) {
      health = 'degraded';
    } else if (lastCompletedAt) {
      health = Date.now() - new Date(lastCompletedAt).getTime() <= freshnessWindowMs
        ? 'healthy'
        : 'degraded';
    } else if (automationJobs.length > 0 && latest?.status === 'failed') {
      health = 'degraded';
    }

    return NextResponse.json({
      success: true,
      data: {
        health,
        configured,
        schedulerStarted,
        intervalMs,
        queue: queueStatus,
        lastActivityStatus: latest?.status || null,
        lastActivityAt: latest ? new Date(eventTime(latest)).toISOString() : null,
        lastCompletedAt,
        lastFailedAt,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load PM automation status';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
