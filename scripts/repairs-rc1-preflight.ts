/*
 * Repairs RC1 staging preflight
 *
 * Run only against a staging environment with real PostgreSQL + Redis credentials:
 *   bun run test:repairs-rc1-preflight
 *
 * This script is intentionally fail-closed. It proves that the generated
 * Prisma client can execute against the deployed Repairs schema and that the
 * configured queue is genuinely BullMQ/Redis backed rather than the in-memory
 * development fallback.
 */

import { db, checkDbHealth } from '@/lib/db';
import { getRedisClient, closeRedisClient } from '@/lib/redis';

type CheckResult = {
  name: string;
  ok: boolean;
  detail: string;
};

const results: CheckResult[] = [];

function check(name: string, ok: boolean, detail: string): void {
  results.push({ name, ok, detail });
  const marker = ok ? 'PASS' : 'FAIL';
  console.log(`[${marker}] ${name}: ${detail}`);
}

async function assertDatabase(): Promise<void> {
  const health = await checkDbHealth();
  check(
    'Prisma client models',
    health.modelCheckPassed,
    health.modelCheckPassed
      ? `${health.totalModels} model delegates available`
      : `missing: ${health.missingModels.join(', ') || 'unknown'}`,
  );

  try {
    await db.$queryRawUnsafe('SELECT 1 AS repairs_rc1_db_probe');
    check('PostgreSQL connectivity', true, 'SELECT 1 executed successfully');
  } catch (error) {
    check('PostgreSQL connectivity', false, error instanceof Error ? error.message : String(error));
    return;
  }

  const modelChecks: Array<[string, () => Promise<number>]> = [
    ['work_orders', () => db.workOrder.count()],
    ['maintenance_requests', () => db.maintenanceRequest.count()],
    ['repair_completions', () => db.repairCompletion.count()],
    ['work_order_time_logs', () => db.workOrderTimeLog.count()],
    ['work_order_components', () => db.workOrderComponent.count()],
    ['repair_material_requests', () => db.repairMaterialRequest.count()],
    ['repair_tool_requests', () => db.repairToolRequest.count()],
    ['failure_records', () => db.failureRecord.count()],
    ['idempotency_records', () => db.idempotencyRecord.count()],
    ['labor_rates', () => db.laborRate.count()],
  ];

  for (const [name, probe] of modelChecks) {
    try {
      const count = await probe();
      check(
        `Schema table ${name}`,
        true,
        `query succeeded (${count} row${count === 1 ? '' : 's'})`,
      );
    } catch (error) {
      check(
        `Schema table ${name}`,
        false,
        error instanceof Error ? error.message : String(error),
      );
    }
  }
}

async function waitForRedis(): Promise<boolean> {
  if (!process.env.REDIS_URL?.trim()) {
    check('Redis configuration', false, 'REDIS_URL is not configured');
    return false;
  }

  const client = getRedisClient('queue');
  try {
    const pong = await Promise.race([
      client.ping(),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 10_000)),
    ]);
    check(
      'Redis connectivity',
      pong,
      pong ? 'PING returned successfully' : 'PING did not succeed within 10 seconds',
    );
    return pong;
  } catch (error) {
    check('Redis connectivity', false, error instanceof Error ? error.message : String(error));
    return false;
  }
}

async function assertBullMQ(): Promise<void> {
  if (!process.env.REDIS_URL?.trim()) {
    check('Queue adapter', false, 'REDIS_URL is required for the RC1 staging queue');
    return;
  }

  // Adapter choice is configuration-driven: REDIS_URL must select BullMQ even
  // while Redis is still establishing its initial connection. Connectivity is
  // then proved independently with PING and an enqueue/process round-trip.
  const {
    jobQueue,
    getQueueAdapterType,
    registerDefaultProcessors,
    closeQueueAdapter,
    QUEUES,
  } = await import('@/lib/queue');

  const adapter = getQueueAdapterType();
  check('Queue adapter', adapter === 'bullmq', `selected adapter: ${adapter}`);
  if (adapter !== 'bullmq') {
    await closeQueueAdapter();
    return;
  }

  const redisOk = await waitForRedis();
  if (!redisOk) {
    await closeQueueAdapter();
    return;
  }

  registerDefaultProcessors();

  const jobId = `repairs-rc1-preflight-${Date.now()}`;
  try {
    const queuedId = await jobQueue.add(QUEUES.CACHE_WARMING, {
      id: jobId,
      name: 'repairs_rc1_preflight',
      data: { cacheKey: jobId, source: 'repairs-rc1-preflight' },
      attempts: 1,
    });

    let completed = false;
    let lastState = 'unknown';
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      const job = await jobQueue.getJob(QUEUES.CACHE_WARMING, queuedId);
      lastState = job?.status ?? 'missing';
      if (job?.status === 'completed') {
        completed = true;
        break;
      }
      if (job?.status === 'failed') break;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    check(
      'BullMQ enqueue/process round-trip',
      completed,
      completed ? `job ${queuedId} completed` : `job ${queuedId} ended/paused at ${lastState}`,
    );

    try {
      await jobQueue.remove(QUEUES.CACHE_WARMING, queuedId);
    } catch {
      // Cleanup failure is non-fatal to the functional proof.
    }
  } catch (error) {
    check(
      'BullMQ enqueue/process round-trip',
      false,
      error instanceof Error ? error.message : String(error),
    );
  } finally {
    await closeQueueAdapter();
  }
}

async function main(): Promise<void> {
  console.log('=== iAssetsPro EAM — Repairs RC1 Staging Preflight ===');
  console.log(`Node environment: ${process.env.NODE_ENV || 'unset'}`);
  console.log(`Timestamp: ${new Date().toISOString()}`);

  if (process.env.NODE_ENV === 'production') {
    console.warn(
      'WARNING: This preflight creates one temporary queue job. Prefer running against staging, not live production.',
    );
  }

  await assertDatabase();
  await assertBullMQ();

  const failed = results.filter((result) => !result.ok);
  console.log('\n=== Repairs RC1 Preflight Summary ===');
  console.log(`Passed: ${results.length - failed.length}/${results.length}`);
  console.log(`Failed: ${failed.length}/${results.length}`);

  if (failed.length > 0) {
    console.error('RC1 PREFLIGHT FAILED');
    for (const item of failed) console.error(` - ${item.name}: ${item.detail}`);
    process.exitCode = 1;
  } else {
    console.log('RC1 PREFLIGHT PASSED');
  }

  await closeRedisClient();
  await db.$disconnect();
}

main().catch(async (error) => {
  console.error('RC1 PREFLIGHT CRASHED:', error);
  process.exitCode = 1;
  try { await closeRedisClient(); } catch { /* ignore */ }
  try { await db.$disconnect(); } catch { /* ignore */ }
});
