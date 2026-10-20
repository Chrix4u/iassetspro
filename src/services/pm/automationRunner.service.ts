export function resolvePmAutomationLoopbackUrl(rawPort = process.env.PORT): string {
  const normalized = rawPort?.trim() || '';
  if (!normalized) {
    return 'http://127.0.0.1:3000/api/pm-schedules/check-due-cron';
  }
  if (!/^[0-9]+$/.test(normalized)) {
    throw new Error('Invalid PORT for PM automation loopback');
  }
  const port = Number.parseInt(normalized, 10);
  if (port < 1 || port > 65535) {
    throw new Error('Invalid PORT for PM automation loopback');
  }
  return `http://127.0.0.1:${port}/api/pm-schedules/check-due-cron`;
}

export async function runPmAutomationTick(): Promise<unknown> {
  const cronSecret = process.env.PM_CRON_SECRET?.trim();
  if (!cronSecret) {
    throw new Error('PM_CRON_SECRET is required for server-owned PM automation');
  }

  const response = await fetch(resolvePmAutomationLoopbackUrl(), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-pm-cron-secret': cronSecret,
    },
    body: '{}',
    cache: 'no-store',
  });

  let payload: { success?: boolean; error?: string; data?: unknown } = {};
  try {
    payload = await response.json() as { success?: boolean; error?: string; data?: unknown };
  } catch {
    // Keep the HTTP status as the primary failure signal when the body is not JSON.
  }

  if (!response.ok || payload.success !== true) {
    throw new Error(payload.error || `PM automation endpoint failed with HTTP ${response.status}`);
  }

  return payload.data;
}
