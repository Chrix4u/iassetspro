/*
 * Repairs notification queue burst validation.
 *
 * This is an infrastructure/load smoke test, not an SMTP integration test. It
 * deliberately disables SMTP, enqueues a burst into the real Redis/BullMQ
 * notification-email queue, and proves every job is processed to the expected
 * `smtp_not_configured` terminal result without failures or stuck work.
 */

const requestedJobs = Number.parseInt(process.env.REPAIRS_NOTIFICATION_LOAD_JOBS || '100', 10);
const jobCount = Number.isFinite(requestedJobs)
  ? Math.min(500, Math.max(1, requestedJobs))
  : 100;
const timeoutMs = 30_000;

async function main(): Promise<void> {
  if (!process.env.REDIS_URL?.trim()) {
    throw new Error('REDIS_URL is required for notification queue burst validation');
  }

  // This test validates durable queue throughput only. It must never send real
  // email, even when executed manually in an environment that has SMTP config.
  delete process.env.SMTP_HOST;
  delete process.env.SMTP_PORT;
  delete process.env.SMTP_USER;
  delete process.env.SMTP_PASS;
  delete process.env.SMTP_FROM;

  const {
    closeQueueAdapter,
    getQueueAdapterType,
    jobQueue,
  } = await import('@/lib/queue');
  const {
    enqueueNotificationEmail,
    NOTIFICATION_EMAIL_QUEUE,
  } = await import('@/lib/notification-email-queue');
  type QueueJob = NonNullable<Awaited<ReturnType<typeof jobQueue.getJob>>>;

  try {
    const adapter = getQueueAdapterType();
    if (adapter !== 'bullmq') {
      throw new Error(`Expected BullMQ adapter, got ${adapter}`);
    }

    const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const startedAt = Date.now();

    console.log('=== Repairs Notification Queue Burst Validation ===');
    console.log(`Adapter: ${adapter}`);
    console.log(`Queue: ${NOTIFICATION_EMAIL_QUEUE}`);
    console.log(`Jobs: ${jobCount}`);
    console.log('SMTP delivery: intentionally disabled');

    const jobIds = await Promise.all(
      Array.from({ length: jobCount }, (_, index) =>
        enqueueNotificationEmail({
          notificationId: `load-${runId}-${index}`,
          userId: `load-user-${index % 20}`,
          type: 'repair_wo_started',
          title: `Load validation WO ${index + 1}`,
          message: `Deterministic notification queue load validation ${index + 1}/${jobCount}`,
          actionUrl: `wo-detail?id=load-${index}`,
        }),
      ),
    );

    if (new Set(jobIds).size !== jobCount) {
      throw new Error('Notification queue produced duplicate job IDs during unique burst enqueue');
    }

    const deadline = Date.now() + timeoutMs;
    let finalJobs: QueueJob[] = [];

    while (Date.now() < deadline) {
      const observedJobs = await Promise.all(
        jobIds.map((jobId) => jobQueue.getJob(NOTIFICATION_EMAIL_QUEUE, jobId)),
      );
      finalJobs = observedJobs.filter((job): job is QueueJob => job !== null);

      const failed = finalJobs.filter((job) => job.status === 'failed');
      if (failed.length > 0) {
        const sample = failed.slice(0, 3).map((job) => `${job.id}: ${job.error || 'unknown error'}`);
        throw new Error(`Notification queue burst produced ${failed.length} failed job(s): ${sample.join('; ')}`);
      }

      if (finalJobs.length === jobCount && finalJobs.every((job) => job.status === 'completed')) {
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    if (finalJobs.length !== jobCount) {
      throw new Error(`Only ${finalJobs.length}/${jobCount} burst jobs were observable before timeout`);
    }

    const unfinished = finalJobs.filter((job) => job.status !== 'completed');
    if (unfinished.length > 0) {
      const statusCounts = unfinished.reduce<Record<string, number>>((counts, job) => {
        counts[job.status] = (counts[job.status] || 0) + 1;
        return counts;
      }, {});
      throw new Error(
        `Notification queue burst did not drain within ${timeoutMs}ms: ${JSON.stringify(statusCounts)}`,
      );
    }

    const wrongResults = finalJobs.filter((job) => {
      const result = job.result as { delivered?: boolean; skipped?: string } | undefined;
      return result?.delivered !== false || result?.skipped !== 'smtp_not_configured';
    });
    if (wrongResults.length > 0) {
      throw new Error(
        `${wrongResults.length}/${jobCount} jobs did not return the expected SMTP-disabled terminal result`,
      );
    }

    const durationMs = Date.now() - startedAt;
    const jobsPerSecond = durationMs > 0 ? (jobCount / durationMs) * 1000 : jobCount;
    const queueStatus = await jobQueue.getStatus(NOTIFICATION_EMAIL_QUEUE);

    console.log(`Completed: ${jobCount}/${jobCount}`);
    console.log(`Failed: 0/${jobCount}`);
    console.log(`Duration: ${durationMs}ms`);
    console.log(`Observed throughput: ${jobsPerSecond.toFixed(1)} jobs/sec`);
    console.log(
      `Queue status: waiting=${queueStatus.waiting}, active=${queueStatus.active}, failed=${queueStatus.failed}`,
    );
    console.log('REPAIRS NOTIFICATION QUEUE BURST PASSED');
  } finally {
    await closeQueueAdapter();
  }
}

main().catch((error) => {
  console.error('REPAIRS NOTIFICATION QUEUE BURST FAILED');
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
