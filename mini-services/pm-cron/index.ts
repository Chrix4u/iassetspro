/**
 * PM Cron Scheduler
 *
 * Runs as a background service on port 3010.
 * Triggers the PM check-due-cron endpoint every 6 hours.
 * The cron endpoint handles WO generation + overdue detection + notifications.
 * Also provides a manual trigger endpoint.
 */

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours
const CRON_SECRET = process.env.PM_CRON_SECRET?.trim() || '';
if (!CRON_SECRET) {
  console.error('[PM Cron] PM_CRON_SECRET is required; refusing to start');
  process.exit(1);
}
const PRODUCTION_PORT = process.env.PRODUCTION_PORT?.trim() || '3001';
const TARGET_URL = process.env.PM_CRON_TARGET_URL?.trim()
  || `http://127.0.0.1:${PRODUCTION_PORT}/api/pm-schedules/check-due-cron`;
const SERVICE_PORT = 3010;

console.log(`[PM Cron] Starting on port ${SERVICE_PORT}`);
console.log(`[PM Cron] Will check PM schedules every ${CHECK_INTERVAL_MS / 60000} minutes`);
console.log(`[PM Cron] Target: ${TARGET_URL}`);

async function triggerCheckDue() {
  console.log(`[PM Cron] ${new Date().toISOString()} — Triggering PM check-due-cron...`);
  try {
    const response = await fetch(TARGET_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-PM-Cron-Secret': CRON_SECRET,
      },
    });

    const data = await response.json();
    if (data.success) {
      const d = data.data;
      console.log(
        `[PM Cron] Done: ${d.dueSchedulesChecked} checked, ${d.workOrdersGenerated} WOs generated, ` +
        `${d.skipped} skipped, ${d.overdueSchedulesFound} overdue, ${d.overdueAlertsSent} alerts sent`,
      );
    } else {
      console.error(`[PM Cron] Check failed:`, data.error);
    }
  } catch (err) {
    console.error(`[PM Cron] Error triggering check-due-cron:`, err);
  }
}

// Bun HTTP server for manual trigger + health check
declare const Bun: {
  serve: (options: {
    port: number;
    fetch: (req: Request) => Response | Promise<Response>;
  }) => { stop(): void };
};

const server = Bun.serve({
  port: SERVICE_PORT,
  fetch(req) {
    const url = new URL(req.url);

    // Health check
    if (url.pathname === '/health') {
      return Response.json({ status: 'ok', service: 'pm-cron-scheduler', uptime: process.uptime() });
    }

    // Manual trigger
    if (url.pathname === '/trigger' && req.method === 'POST') {
      // Trigger asynchronously — don't block the response
      triggerCheckDue();
      return Response.json({ success: true, message: 'PM check-due-cron triggered' });
    }

    return Response.json({ error: 'Not found' }, { status: 404 });
  },
});

console.log(`[PM Cron] HTTP server listening on http://localhost:${SERVICE_PORT}`);
console.log(`[PM Cron] Manual trigger: POST http://localhost:${SERVICE_PORT}/trigger`);
console.log(`[PM Cron] Health check: GET http://localhost:${SERVICE_PORT}/health`);

// Run initial check after 10 seconds (give Next.js time to start)
setTimeout(() => {
  triggerCheckDue();
}, 10_000);

// Schedule recurring checks
setInterval(triggerCheckDue, CHECK_INTERVAL_MS);
