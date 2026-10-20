import { createLogger } from '@/lib/logger';
import { jobQueue, QUEUES } from '@/lib/queue';

const logger = createLogger('pm-automation-scheduler');

export const DEFAULT_PM_AUTOMATION_INTERVAL_MS = 60_000;
export const MIN_PM_AUTOMATION_INTERVAL_MS = 30_000;
export const MAX_PM_AUTOMATION_INTERVAL_MS = 900_000;

let schedulerTimer: ReturnType<typeof setInterval> | null = null;

export function resolvePmAutomationIntervalMs(raw = process.env.PM_AUTOMATION_INTERVAL_MS): number {
  if (!raw) return DEFAULT_PM_AUTOMATION_INTERVAL_MS;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return DEFAULT_PM_AUTOMATION_INTERVAL_MS;
  return Math.min(MAX_PM_AUTOMATION_INTERVAL_MS, Math.max(MIN_PM_AUTOMATION_INTERVAL_MS, parsed));
}

export function buildPmAutomationJobId(nowMs: number, intervalMs: number): string {
  return `pm-automation-${Math.floor(nowMs / intervalMs)}`;
}

export async function enqueuePmAutomationTick(nowMs = Date.now()): Promise<string> {
  const inFlight = (await jobQueue.getJobs(QUEUES.MAINTENANCE_SCHEDULING)).find(
    (job) => job.name === 'pm-automation-tick'
      && (job.status === 'waiting' || job.status === 'active' || job.status === 'delayed'),
  );
  if (inFlight) return inFlight.id;

  const intervalMs = resolvePmAutomationIntervalMs();
  return jobQueue.add(QUEUES.MAINTENANCE_SCHEDULING, {
    id: buildPmAutomationJobId(nowMs, intervalMs),
    name: 'pm-automation-tick',
    data: { action: 'run_pm_automation' },
    attempts: 3,
    backoff: 5_000,
  });
}

export function startPmAutomationScheduler(): boolean {
  if (schedulerTimer) return false;

  const cronSecret = process.env.PM_CRON_SECRET?.trim();
  if (!cronSecret) {
    logger.warn('PM automation scheduler not started because PM_CRON_SECRET is not configured');
    return false;
  }

  const intervalMs = resolvePmAutomationIntervalMs();
  schedulerTimer = setInterval(() => {
    void enqueuePmAutomationTick().catch((error) => {
      logger.error('Failed to enqueue PM automation tick', error);
    });
  }, intervalMs);

  if (typeof schedulerTimer === 'object' && 'unref' in schedulerTimer) {
    schedulerTimer.unref();
  }

  logger.info('PM automation scheduler started', { intervalMs });
  return true;
}

export function stopPmAutomationScheduler(): void {
  if (!schedulerTimer) return;
  clearInterval(schedulerTimer);
  schedulerTimer = null;
  logger.info('PM automation scheduler stopped');
}
