import Redis from 'ioredis';
import { Queue, Worker } from 'bullmq';

const redisUrl = process.env.REDIS_URL?.trim();
if (!redisUrl) {
  console.error('REDIS PREFLIGHT FAILED: REDIS_URL is not configured');
  process.exit(1);
}

const queueName = `iassetspro-deploy-preflight-${process.pid}-${Date.now()}`;
const client = new Redis(redisUrl, { maxRetriesPerRequest: null });
const queueConnection = new Redis(redisUrl, { maxRetriesPerRequest: null });
const workerConnection = new Redis(redisUrl, { maxRetriesPerRequest: null });
let queue;
let worker;

try {
  const pong = await client.ping();
  if (pong !== 'PONG') throw new Error(`Redis PING returned ${String(pong)}`);
  console.log('Redis connectivity: PONG');

  queue = new Queue(queueName, { connection: queueConnection });
  worker = new Worker(
    queueName,
    async (job) => ({ ok: true, marker: job.data?.marker ?? null }),
    { connection: workerConnection },
  );
  await worker.waitUntilReady();

  const marker = `deploy-${Date.now()}`;
  const job = await queue.add('durability-preflight', { marker }, {
    attempts: 1,
    removeOnComplete: false,
    removeOnFail: false,
  });

  const deadline = Date.now() + 10_000;
  let state = await job.getState();
  while (!['completed', 'failed'].includes(state) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    state = await job.getState();
  }
  if (state !== 'completed') throw new Error(`BullMQ round-trip ended at ${state}`);

  console.log('BullMQ enqueue/process round-trip: completed');
  console.log('PRODUCTION REDIS PREFLIGHT PASSED');
} catch (error) {
  console.error(`REDIS PREFLIGHT FAILED: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  try { await worker?.close(); } catch {}
  try { await queue?.obliterate({ force: true }); } catch {}
  try { await queue?.close(); } catch {}
  for (const connection of [client, queueConnection, workerConnection]) {
    try { await connection.quit(); } catch { try { connection.disconnect(); } catch {} }
  }
}
