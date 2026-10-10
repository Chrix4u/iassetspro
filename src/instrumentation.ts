/**
 * Next.js server bootstrap hook.
 *
 * Queue processors must be registered when a Node.js server instance starts so
 * BullMQ jobs are consumed even before any request happens to touch the queue
 * subsystem. Keep Node-only dependencies out of the Edge runtime.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const { initQueues } = await import('@/lib/queueInit');
  initQueues();
}
