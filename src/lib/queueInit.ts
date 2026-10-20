// ============================================================================
// QUEUE INITIALIZATION — Register all job processors on app startup
// ============================================================================

import { registerDefaultProcessors, getQueueAdapterType, closeQueueAdapter } from '@/lib/queue';
import { registerNotificationEmailProcessor } from '@/lib/notification-email-queue';
import { closeRedisClient } from '@/lib/redis';
import { createLogger } from '@/lib/logger';
import { startPmAutomationScheduler, stopPmAutomationScheduler } from '@/services/pm/automationScheduler.service';

const logger = createLogger('queue-init');

let initialized = false;

export function initQueues() {
  if (initialized) return;
  initialized = true;

  try {
    registerDefaultProcessors();
    void registerNotificationEmailProcessor().catch((error) => {
      logger.error('Failed to register notification email processor', error);
    });
    startPmAutomationScheduler();

    const adapterType = getQueueAdapterType();
    const redisUrl = process.env.REDIS_URL;
    if (adapterType === 'bullmq' && redisUrl) {
      logger.info(`Job queue system initialized (BullMQ · Redis at ${redisUrl.replace(/\/\/[^:]+:[^@]+@/, '//***:***@')})`);
    } else {
      logger.info('Job queue system initialized (in-memory fallback)');
    }
  } catch (error) {
    logger.error('Failed to initialize job queues', error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * Gracefully shut down all queue and Redis connections.
 * Register this with process.on('SIGTERM', …) and process.on('SIGINT', …)
 * in production deployments.
 */
export async function shutdownQueues() {
  try {
    stopPmAutomationScheduler();
    await closeQueueAdapter();
    await closeRedisClient();
    logger.info('Queue and Redis connections shut down');
  } catch (error) {
    logger.error('Error during queue shutdown', error instanceof Error ? error : new Error(String(error)));
  }
}
