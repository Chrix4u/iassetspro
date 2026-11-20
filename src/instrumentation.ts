/**
 * Next.js server bootstrap hook.
 *
 * Queue processors must be registered when a Node.js server instance starts so
 * BullMQ jobs are consumed even before any request happens to touch the queue
 * subsystem. Keep Node-only dependencies out of the Edge runtime.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  // Deployment canaries must never process live BullMQ jobs or PM schedules
  // alongside the existing production instance. Normal production starts
  // without this flag and retains the full queue bootstrap.
  if (process.env.IASSETSPRO_DEPLOY_CANARY === '1') return;

  const { initQueues } = await import('@/lib/queueInit');
  initQueues();
}
