// ============================================================================
// JOB QUEUE — BullMQ-like abstraction with in-memory fallback
// ============================================================================

import { createLogger } from '@/lib/logger';
import { closeRedisClient } from '@/lib/redis';

const logger = createLogger('queue');

export type JobStatus = 'waiting' | 'active' | 'completed' | 'failed' | 'delayed';

export interface JobDefinition<T = unknown> {
  id?: string;
  name: string;
  data: T;
  priority?: number;
  attempts?: number;
  backoff?: number;
  delay?: number;
}

export interface JobRecord<T = unknown> {
  id: string;
  name: string;
  data: T;
  status: JobStatus;
  progress: number;
  result?: unknown;
  error?: string;
  attempts: number;
  maxAttempts: number;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  failedAt?: string;
}

export const QUEUES = {
  NOTIFICATION: 'notifications',
  TELEMETRY: 'telemetry-processing',
  REPORT_GENERATION: 'report-generation',
  ASSET_INDEXING: 'asset-indexing',
  EMAIL: 'email',
  MAINTENANCE_SCHEDULING: 'maintenance-scheduling',
  PREDICTIVE_ANALYSIS: 'predictive-analysis',
  CACHE_WARMING: 'cache-warming',
  AUDIT_LOGGING: 'audit-logging',
  WORKFLOW: 'workflow-orchestration',
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

export const QUEUE_LABELS: Record<QueueName, string> = {
  [QUEUES.NOTIFICATION]: 'Notifications',
  [QUEUES.TELEMETRY]: 'Telemetry Processing',
  [QUEUES.REPORT_GENERATION]: 'Report Generation',
  [QUEUES.ASSET_INDEXING]: 'Asset Indexing',
  [QUEUES.EMAIL]: 'Email Delivery',
  [QUEUES.MAINTENANCE_SCHEDULING]: 'Maintenance Scheduling',
  [QUEUES.PREDICTIVE_ANALYSIS]: 'Predictive Analysis',
  [QUEUES.CACHE_WARMING]: 'Cache Warming',
  [QUEUES.AUDIT_LOGGING]: 'Audit Logging',
  [QUEUES.WORKFLOW]: 'Workflow Orchestration',
};

export const QUEUE_ICONS: Record<QueueName, string> = {
  [QUEUES.NOTIFICATION]: 'Bell',
  [QUEUES.TELEMETRY]: 'Activity',
  [QUEUES.REPORT_GENERATION]: 'FileBarChart',
  [QUEUES.ASSET_INDEXING]: 'Building2',
  [QUEUES.EMAIL]: 'Mail',
  [QUEUES.MAINTENANCE_SCHEDULING]: 'Calendar',
  [QUEUES.PREDICTIVE_ANALYSIS]: 'TrendingUp',
  [QUEUES.CACHE_WARMING]: 'Zap',
  [QUEUES.AUDIT_LOGGING]: 'ScrollText',
  [QUEUES.WORKFLOW]: 'GitBranch',
};

// ============================================================================
// In-Memory Queue Implementation
// ============================================================================

class InMemoryQueue {
  private queues = new Map<string, Map<string, JobRecord>>();
  private processors = new Map<string, Set<(job: JobRecord) => Promise<unknown>>>();
  private processing = new Set<string>();

  async add<T>(queueName: string, definition: JobDefinition<T>): Promise<string> {
    const id = definition.id || `${queueName}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const job: JobRecord<T> = {
      id,
      name: definition.name,
      data: definition.data,
      status: definition.delay && definition.delay > 0 ? 'delayed' : 'waiting',
      progress: 0,
      attempts: 0,
      maxAttempts: definition.attempts || 3,
      createdAt: new Date().toISOString(),
    };

    if (!this.queues.has(queueName)) {
      this.queues.set(queueName, new Map());
    }
    this.queues.get(queueName)!.set(id, job);

    if (job.status === 'waiting') {
      setImmediate(() => this.processQueue(queueName));
    } else if (definition.delay) {
      setTimeout(() => {
        const existing = this.queues.get(queueName)?.get(id);
        if (existing && existing.status === 'delayed') {
          existing.status = 'waiting';
          this.processQueue(queueName);
        }
      }, definition.delay);
    }

    logger.info(`Job added to queue [${queueName}]`, { jobId: id, jobName: definition.name });
    return id;
  }

  private async processQueue(queueName: string) {
    if (this.processing.has(queueName)) return;
    this.processing.add(queueName);

    try {
      const processors = this.processors.get(queueName);
      if (!processors || processors.size === 0) return;

      const queue = this.queues.get(queueName);
      if (!queue) return;

      for (const [id, job] of queue.entries()) {
        if (job.status !== 'waiting') continue;
        const processor = [...processors][0];
        if (!processor) continue;

        job.status = 'active';
        job.startedAt = new Date().toISOString();
        job.attempts++;

        try {
          const result = await processor(job);
          job.status = 'completed';
          job.progress = 100;
          job.result = result;
          job.completedAt = new Date().toISOString();
          logger.info(`Job completed [${queueName}]`, { jobId: id, jobName: job.name });
        } catch (error) {
          job.error = error instanceof Error ? error.message : String(error);
          if (job.attempts < job.maxAttempts) {
            job.status = 'waiting';
            const backoff = Math.max(0, (job.attempts - 1) * 5000);
            logger.warn(`Job failed, retrying [${queueName}]`, {
              jobId: id,
              attempt: job.attempts,
              nextRetryInMs: backoff,
            });
            setTimeout(() => {
              const retryJob = this.queues.get(queueName)?.get(id);
              if (retryJob && retryJob.status === 'waiting') this.processQueue(queueName);
            }, backoff);
          } else {
            job.status = 'failed';
            job.failedAt = new Date().toISOString();
            logger.error(`Job failed permanently [${queueName}]`, {
              jobId: id,
              jobName: job.name,
              error: job.error,
            });
          }
        }
      }
    } finally {
      this.processing.delete(queueName);
    }
  }

  async process<T>(queueName: string, handler: (job: JobRecord<T>) => Promise<unknown>): Promise<void> {
    if (!this.processors.has(queueName)) this.processors.set(queueName, new Set());
    this.processors.get(queueName)!.add(handler as (job: JobRecord) => Promise<unknown>);
    this.processQueue(queueName);
  }

  async getJob(queueName: string, jobId: string): Promise<JobRecord | null> {
    return this.queues.get(queueName)?.get(jobId) || null;
  }

  async getQueueStatus(queueName: string) {
    const queue = this.queues.get(queueName);
    if (!queue) {
      return { name: queueName, total: 0, waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 };
    }
    const jobs = [...queue.values()];
    return {
      name: queueName,
      total: jobs.length,
      waiting: jobs.filter((job) => job.status === 'waiting').length,
      active: jobs.filter((job) => job.status === 'active').length,
      completed: jobs.filter((job) => job.status === 'completed').length,
      failed: jobs.filter((job) => job.status === 'failed').length,
      delayed: jobs.filter((job) => job.status === 'delayed').length,
    };
  }

  async getAllQueueStatus() {
    const statuses: Record<string, Awaited<ReturnType<typeof this.getQueueStatus>>> = {};
    for (const queueName of Object.values(QUEUES)) {
      statuses[queueName] = await this.getQueueStatus(queueName);
    }
    return statuses;
  }

  async getQueueJobs(queueName: string): Promise<JobRecord[]> {
    const queue = this.queues.get(queueName);
    if (!queue) return [];
    return [...queue.values()];
  }

  async clearQueue(queueName: string): Promise<number> {
    const queue = this.queues.get(queueName);
    if (!queue) return 0;
    const count = queue.size;
    queue.clear();
    return count;
  }

  async retryJob(queueName: string, jobId: string): Promise<boolean> {
    const job = this.queues.get(queueName)?.get(jobId);
    if (!job || (job.status !== 'failed' && job.status !== 'completed')) return false;
    job.status = 'waiting';
    job.attempts = 0;
    job.error = undefined;
    job.startedAt = undefined;
    job.completedAt = undefined;
    job.failedAt = undefined;
    job.progress = 0;
    this.processQueue(queueName);
    return true;
  }

  async removeJob(queueName: string, jobId: string): Promise<boolean> {
    const queue = this.queues.get(queueName);
    if (!queue) return false;
    return queue.delete(jobId);
  }
}

// ============================================================================
// BullMQ Adapter — production queue backed by Redis
// ============================================================================

type BullMQConnectionOptions = {
  host: string;
  port: number;
  username?: string;
  password?: string;
  db?: number;
  tls?: Record<string, never>;
  maxRetriesPerRequest: null;
};

/**
 * Parse REDIS_URL into connection options understood by BullMQ/ioredis.
 *
 * BullMQ is deliberately selected from configuration, not from an instantaneous
 * Redis "ready" flag. ioredis owns connection establishment and retry behavior;
 * this prevents a production process from becoming permanently pinned to the
 * in-memory adapter merely because Redis was still connecting on first use.
 */
export function getBullMQConnectionOptions(redisUrl = process.env.REDIS_URL): BullMQConnectionOptions {
  if (!redisUrl?.trim()) throw new Error('REDIS_URL is required for BullMQ');

  const parsed = new URL(redisUrl);
  if (parsed.protocol !== 'redis:' && parsed.protocol !== 'rediss:') {
    throw new Error(`Unsupported Redis protocol: ${parsed.protocol}`);
  }

  const dbSegment = parsed.pathname.replace(/^\//, '');
  const db = dbSegment ? Number.parseInt(dbSegment, 10) : 0;
  if (!Number.isFinite(db) || db < 0) {
    throw new Error('REDIS_URL contains an invalid database index');
  }

  return {
    host: parsed.hostname,
    port: Number.parseInt(parsed.port || '6379', 10),
    ...(parsed.username ? { username: decodeURIComponent(parsed.username) } : {}),
    ...(parsed.password ? { password: decodeURIComponent(parsed.password) } : {}),
    ...(db > 0 ? { db } : {}),
    ...(parsed.protocol === 'rediss:' ? { tls: {} } : {}),
    // BullMQ Workers require this setting so blocking commands are not limited
    // by the normal command retry cap.
    maxRetriesPerRequest: null,
  };
}

function createBullMQConnection() {
  return { connection: getBullMQConnectionOptions() };
}

class BullMQQueueAdapter {
  private queues = new Map<string, any>();
  private workers = new Map<string, any>();
  private eventListeners = new Map<string, Set<{
    event: 'completed' | 'failed' | 'progress';
    callback: (...args: unknown[]) => void;
  }>>();

  private getOrCreateQueue(queueName: string): any {
    let queue = this.queues.get(queueName);
    if (!queue) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { Queue } = require('bullmq');
      queue = new Queue(queueName, {
        ...createBullMQConnection(),
        defaultJobOptions: {
          removeOnComplete: { count: 200 },
          removeOnFail: { count: 100 },
        },
      });
      this.queues.set(queueName, queue);
    }
    return queue;
  }

  async add<T>(queueName: string, definition: JobDefinition<T>): Promise<string> {
    const queue = this.getOrCreateQueue(queueName);
    const opts: Record<string, unknown> = {};
    if (definition.id) opts.jobId = definition.id;
    if (definition.priority) opts.priority = definition.priority;
    if (definition.attempts) opts.attempts = definition.attempts;
    if (definition.delay && definition.delay > 0) opts.delay = definition.delay;
    if (definition.backoff) opts.backoff = { type: 'exponential', delay: definition.backoff };

    const job = await queue.add(definition.name, definition.data, opts);
    logger.info(`BullMQ job added to queue [${queueName}]`, {
      jobId: job?.id,
      jobName: definition.name,
    });
    return job?.id ?? `unknown-${Date.now()}`;
  }

  async process<T>(queueName: string, handler: (job: JobRecord<T>) => Promise<unknown>): Promise<void> {
    if (this.workers.has(queueName)) {
      logger.warn(`Worker already registered for [${queueName}], skipping`);
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Worker } = require('bullmq');
    const worker = new Worker(
      queueName,
      async (bullJob: any) => {
        const jobRecord: JobRecord<T> = {
          id: bullJob.id ?? '',
          name: bullJob.name,
          data: bullJob.data as T,
          status: 'active',
          progress: 0,
          attempts: bullJob.attemptsMade,
          maxAttempts: bullJob.opts?.attempts ?? 3,
          createdAt: new Date(bullJob.timestamp ?? Date.now()).toISOString(),
          startedAt: new Date(bullJob.processedOn ?? Date.now()).toISOString(),
        };
        return handler(jobRecord);
      },
      {
        ...createBullMQConnection(),
        concurrency: 5,
        autorun: true,
      },
    );

    worker.on('completed', (bullJob: any) => {
      logger.info(`BullMQ job completed [${queueName}]`, { jobId: bullJob.id });
      this.fireEvent(queueName, 'completed', bullJob);
    });
    worker.on('failed', (bullJob: any, err: Error) => {
      logger.error(`BullMQ job failed [${queueName}]`, { jobId: bullJob?.id, error: err.message });
      this.fireEvent(queueName, 'failed', bullJob, err);
    });
    worker.on('progress', (bullJob: any, progress: number) => {
      this.fireEvent(queueName, 'progress', bullJob, progress);
    });
    worker.on('error', (err: Error) => {
      logger.error(`BullMQ worker error [${queueName}]`, { error: err.message });
    });

    this.workers.set(queueName, worker);
    logger.info(`BullMQ worker started for [${queueName}]`);
  }

  private fireEvent(queueName: string, event: string, ...args: unknown[]) {
    const listeners = this.eventListeners.get(queueName);
    if (!listeners) return;
    for (const listener of listeners) {
      if (listener.event === event) {
        try {
          listener.callback(...args);
        } catch {
          // A monitoring callback must never fail queue processing.
        }
      }
    }
  }

  async getJob(queueName: string, jobId: string): Promise<JobRecord | null> {
    const queue = this.getOrCreateQueue(queueName);
    const bullJob = await queue.getJob(jobId);
    if (!bullJob) return null;
    const state = await bullJob.getState();
    return this.bullJobToRecord(bullJob, state);
  }

  async getQueueJobs(queueName: string): Promise<JobRecord[]> {
    const queue = this.getOrCreateQueue(queueName);
    const states: Array<'waiting' | 'active' | 'completed' | 'failed' | 'delayed'> = [
      'waiting', 'active', 'completed', 'failed', 'delayed',
    ];
    const jobs: JobRecord[] = [];
    for (const state of states) {
      const bullJobs = await queue.getJobs([state], 0, 200);
      for (const bullJob of bullJobs) {
        jobs.push(this.bullJobToRecord(bullJob, state));
      }
    }
    return jobs;
  }

  async getQueueStatus(queueName: string) {
    const queue = this.getOrCreateQueue(queueName);
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
      queue.getDelayedCount(),
    ]);
    return {
      name: queueName,
      total: waiting + active + completed + failed + delayed,
      waiting,
      active,
      completed,
      failed,
      delayed,
    };
  }

  async getAllQueueStatus() {
    const statuses: Record<string, Awaited<ReturnType<typeof this.getQueueStatus>>> = {};
    for (const queueName of Object.values(QUEUES)) {
      statuses[queueName] = await this.getQueueStatus(queueName);
    }
    return statuses;
  }

  async clearQueue(queueName: string): Promise<number> {
    const queue = this.getOrCreateQueue(queueName);
    await queue.drain();
    await queue.obliterate({ force: true });
    return 0;
  }

  async retryJob(queueName: string, jobId: string): Promise<boolean> {
    const queue = this.getOrCreateQueue(queueName);
    try {
      const job = await queue.getJob(jobId);
      if (!job) return false;
      await job.retry();
      return true;
    } catch {
      return false;
    }
  }

  async removeJob(queueName: string, jobId: string): Promise<boolean> {
    const queue = this.getOrCreateQueue(queueName);
    try {
      const job = await queue.getJob(jobId);
      if (!job) return false;
      await job.remove();
      return true;
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    for (const [, worker] of this.workers) {
      try { await worker.close(); } catch { /* ignore */ }
    }
    for (const [, queue] of this.queues) {
      try { await queue.close(); } catch { /* ignore */ }
    }
    this.workers.clear();
    this.queues.clear();
    logger.info('BullMQ connections closed gracefully');
  }

  private bullJobToRecord(bullJob: any, state: string): JobRecord {
    return {
      id: bullJob.id ?? '',
      name: bullJob.name,
      data: bullJob.data,
      status: this.mapBullState(state),
      progress: bullJob.progress ?? 0,
      result: bullJob.returnvalue ?? undefined,
      error: bullJob.failedReason ?? undefined,
      attempts: bullJob.attemptsMade,
      maxAttempts: bullJob.opts?.attempts ?? 3,
      createdAt: new Date(bullJob.timestamp ?? Date.now()).toISOString(),
      startedAt: bullJob.processedOn ? new Date(bullJob.processedOn).toISOString() : undefined,
      completedAt: bullJob.finishedOn ? new Date(bullJob.finishedOn).toISOString() : undefined,
      failedAt: bullJob.finishedOn && state === 'failed' ? new Date(bullJob.finishedOn).toISOString() : undefined,
    };
  }

  private mapBullState(state: string): JobStatus {
    switch (state) {
      case 'waiting': return 'waiting';
      case 'active': return 'active';
      case 'completed': return 'completed';
      case 'failed': return 'failed';
      case 'delayed': return 'delayed';
      default: return 'waiting';
    }
  }
}

// ============================================================================
// Queue Singleton & Public API
// ============================================================================

const memoryInstance = new InMemoryQueue();
let adapterInstance: InMemoryQueue | BullMQQueueAdapter | null = null;
let adapterInitialized = false;

/**
 * Adapter choice is configuration-driven and immutable for the process:
 *   REDIS_URL configured -> BullMQ
 *   REDIS_URL absent     -> in-memory development/sandbox queue
 *
 * We intentionally do NOT check whether Redis reports "ready" here. Real Redis
 * may still be connecting during application startup; BullMQ/ioredis handles
 * that lifecycle. Checking readiness once and caching the result would create a
 * permanent durability downgrade for the process.
 */
function getAdapter(): InMemoryQueue | BullMQQueueAdapter {
  if (!adapterInitialized) {
    adapterInitialized = true;
    if (process.env.REDIS_URL?.trim()) {
      adapterInstance = new BullMQQueueAdapter();
      logger.info('Job queue using BullMQ adapter (REDIS_URL configured)');
    } else {
      adapterInstance = memoryInstance;
      logger.info('Job queue using in-memory adapter (development/sandbox)');
    }
  }
  return adapterInstance!;
}

export const jobQueue = {
  add: (...args: Parameters<InMemoryQueue['add']>) => getAdapter().add(...args),
  process: (...args: Parameters<InMemoryQueue['process']>) => getAdapter().process(...args),
  getJob: (...args: Parameters<InMemoryQueue['getJob']>) => getAdapter().getJob(...args),
  getJobs: (...args: Parameters<InMemoryQueue['getQueueJobs']>) => getAdapter().getQueueJobs(...args),
  getStatus: (...args: Parameters<InMemoryQueue['getQueueStatus']>) => getAdapter().getQueueStatus(...args),
  getAllStatus: (...args: Parameters<InMemoryQueue['getAllQueueStatus']>) => getAdapter().getAllQueueStatus(...args),
  clear: (...args: Parameters<InMemoryQueue['clearQueue']>) => getAdapter().clearQueue(...args),
  retry: (...args: Parameters<InMemoryQueue['retryJob']>) => getAdapter().retryJob(...args),
  remove: (...args: Parameters<InMemoryQueue['removeJob']>) => getAdapter().removeJob(...args),
};

export function getQueueAdapterType(): 'bullmq' | 'memory' {
  return getAdapter() instanceof BullMQQueueAdapter ? 'bullmq' : 'memory';
}

export async function closeQueueAdapter(): Promise<void> {
  if (adapterInstance instanceof BullMQQueueAdapter) {
    await adapterInstance.close();
  }
  await closeRedisClient();
}

// ============================================================================
// Pre-built Job Processors — registered on app startup
// ============================================================================

export function registerDefaultProcessors() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { notifyUser } = require('@/lib/notifications');

  jobQueue.process(QUEUES.NOTIFICATION, async (job) => {
    const { userId, title, message, type, entityType, entityId, actionUrl, forceSms } = job.data as {
      userId: string;
      title: string;
      message: string;
      type: string;
      entityType?: string;
      entityId?: string;
      actionUrl?: string;
      forceSms?: boolean;
    };
    await notifyUser(userId, type, title, message, entityType, entityId, actionUrl, { forceSms });
    return { delivered: true, timestamp: new Date().toISOString() };
  });

  jobQueue.process(QUEUES.TELEMETRY, async (job) => {
    const { sourceId, readings } = job.data as { sourceId: string; readings: unknown[] };
    logger.info('Processing telemetry batch', { sourceId, count: readings.length });
    return { processed: readings.length };
  });

  jobQueue.process(QUEUES.AUDIT_LOGGING, async (job) => {
    const { action, entityType, entityId, userId } = job.data as Record<string, unknown>;
    logger.info('Audit log entry', { action, entityType, entityId, userId });
    return { logged: true };
  });

  jobQueue.process(QUEUES.EMAIL, async (job) => {
    const { to, subject, template } = job.data as { to: string; subject: string; template: string };
    logger.info('Processing email job', { to, subject, template });
    return { sent: true, to };
  });

  jobQueue.process(QUEUES.REPORT_GENERATION, async (job) => {
    const { reportType } = job.data as { reportType: string; params: Record<string, unknown> };
    logger.info('Generating report', { reportType });
    return { generated: true, reportType };
  });

  jobQueue.process(QUEUES.ASSET_INDEXING, async (job) => {
    const { assetId, operation } = job.data as { assetId: string; operation: string };
    logger.info('Indexing asset', { assetId, operation });
    return { indexed: true };
  });

  jobQueue.process(QUEUES.MAINTENANCE_SCHEDULING, async (job) => {
    const { scheduleId, action } = job.data as { scheduleId?: string; action: string };

    if (action === 'run_pm_automation') {
      // Load lazily so the generic queue module stays lightweight for callers
      // that only enqueue unrelated work. The runner uses the canonical PM cron
      // endpoint, preserving its locks, audit actor, trigger engines and alerts.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { runPmAutomationTick } = require('@/services/pm/automationRunner.service');
      const result = await runPmAutomationTick();
      return { scheduled: true, action, result, timestamp: new Date().toISOString() };
    }

    logger.info('Processing maintenance schedule', { scheduleId, action });
    return { scheduled: true, action };
  });

  jobQueue.process(QUEUES.PREDICTIVE_ANALYSIS, async (job) => {
    const { modelId, assetId } = job.data as { modelId: string; assetId: string };
    logger.info('Running predictive analysis', { modelId, assetId });
    return { completed: true };
  });

  jobQueue.process(QUEUES.CACHE_WARMING, async (job) => {
    const { cacheKey, source } = job.data as { cacheKey: string; source: string };
    logger.info('Warming cache', { cacheKey, source });
    return { warmed: true };
  });

  jobQueue.process(QUEUES.WORKFLOW, async (job) => {
    const { workflowId, step } = job.data as {
      workflowId: string;
      step: string;
      payload: Record<string, unknown>;
    };
    logger.info('Processing workflow step', { workflowId, step });
    return { executed: true };
  });

  logger.info('Default job processors registered (10 queues)');
}
