import { spawn } from 'node:child_process';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const repoRoot = process.cwd();
const runnerPath = join(repoRoot, 'scripts/iassetspro-pm-cron.sh');
const installerPath = join(repoRoot, 'scripts/install-iassetspro-pm-cron.sh');
const legacySchedulerPath = join(repoRoot, 'mini-services/pm-cron/index.ts');

type RunResult = { code: number | null; stdout: string; stderr: string };
type RunOptions = { input?: string; uid?: number; gid?: number };

function run(
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  options: RunOptions = {},
): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      env,
      uid: options.uid,
      gid: options.gid,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += String(chunk); });
    child.stderr.on('data', (chunk) => { stderr += String(chunk); });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
    if (options.input !== undefined) child.stdin.end(options.input);
    else child.stdin.end();
  });
}

function runWithTimeout(
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  timeoutMs = 800,
): Promise<RunResult & { timedOut: boolean }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: repoRoot, env });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    child.stdout.on('data', (chunk) => { stdout += String(chunk); });
    child.stderr.on('data', (chunk) => { stderr += String(chunk); });
    child.on('error', reject);
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, timeoutMs);
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr, timedOut });
    });
  });
}

async function makeRuntime(secret = 'pm-test-secret-never-log-this') {
  const root = await mkdtemp(join(tmpdir(), 'iassetspro-pm-ops-'));
  const app = join(root, 'app');
  const logs = join(root, 'logs');
  const fakeBin = join(root, 'bin');
  await mkdir(app, { recursive: true });
  await mkdir(fakeBin, { recursive: true });
  await writeFile(join(app, '.env'), secret ? `PM_CRON_SECRET=${secret}\n` : 'APP_ENV=test\n');
  return {
    root,
    app,
    logs,
    fakeBin,
    lock: join(root, 'pm.lock'),
    secret,
  };
}

function runtimeEnv(runtime: Awaited<ReturnType<typeof makeRuntime>>, extra: NodeJS.ProcessEnv = {}) {
  return {
    ...process.env,
    DEPLOY_PATH: runtime.app,
    PM_CRON_LOG_DIR: runtime.logs,
    PM_CRON_LOCK_FILE: runtime.lock,
    PM_AUTOMATION_TZ: 'Africa/Accra',
    PRODUCTION_PORT: '3555',
    ...extra,
  };
}

describe('repository-owned PM automation operations', () => {
  const cleanups: string[] = [];

  afterEach(async () => {
    await Promise.all(cleanups.splice(0).map((path) => rm(path, { recursive: true, force: true })));
  });

  it('dry-runs against the active release on port 3001 defaults and logs Accra time without exposing the secret', async () => {
    const runtime = await makeRuntime();
    cleanups.push(runtime.root);

    const result = await run('bash', [runnerPath, '--dry-run'], runtimeEnv(runtime, {
      PRODUCTION_PORT: undefined,
      TZ: 'America/Chicago',
    }));

    expect(result.code).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('status=ok mode=dry-run');
    expect(result.stdout).toContain('endpoint=http://127.0.0.1:3001/api/pm-schedules/check-due-cron');
    expect(result.stdout).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]00:00 /);
    expect(result.stdout).not.toContain(runtime.secret);
  });

  it('skips the fallback PM trigger when server-owned BullMQ automation is healthy', async () => {
    const runtime = await makeRuntime();
    cleanups.push(runtime.root);
    const calls = join(runtime.root, 'curl-calls');
    const fakeCurl = join(runtime.fakeBin, 'curl');
    await writeFile(fakeCurl, `#!/usr/bin/env bash
set -euo pipefail
out=''
method='GET'
url=''
while (( $# )); do
  case "$1" in
    -o) out="$2"; shift 2 ;;
    -X) method="$2"; shift 2 ;;
    -w|-H|--max-time) shift 2 ;;
    http://*) url="$1"; shift ;;
    *) shift ;;
  esac
done
printf '%s %s\n' "$method" "$url" >> ${JSON.stringify(calls)}
if [[ "$url" == */api/pm-automation/status ]]; then
  printf '%s' '{"success":true,"data":{"health":"healthy","schedulerStarted":true,"lastCompletedAt":"2026-11-01T20:00:00.000Z"}}' > "$out"
else
  printf '%s' '{"success":true,"data":{"workOrdersGenerated":1}}' > "$out"
fi
printf '200'
`, { mode: 0o755 });

    const result = await run('bash', [runnerPath], runtimeEnv(runtime, {
      PATH: `${runtime.fakeBin}:${process.env.PATH ?? ''}`,
    }));

    expect(result.code).toBe(0);
    const callLog = await readFile(calls, 'utf8');
    expect(callLog.trim().split('\n')).toEqual([
      'GET http://127.0.0.1:3555/api/pm-automation/status',
    ]);
    const log = await readFile(join(runtime.logs, 'cron.log'), 'utf8');
    expect(log).toContain('mode=watchdog primary=healthy action=skip');
    expect(log).not.toContain(runtime.secret);
  });

  it('runs one fallback PM trigger when server-owned automation is degraded', async () => {
    const runtime = await makeRuntime();
    cleanups.push(runtime.root);
    const calls = join(runtime.root, 'curl-calls');
    const fakeCurl = join(runtime.fakeBin, 'curl');
    await writeFile(fakeCurl, `#!/usr/bin/env bash
set -euo pipefail
out=''
method='GET'
url=''
while (( $# )); do
  case "$1" in
    -o) out="$2"; shift 2 ;;
    -X) method="$2"; shift 2 ;;
    -w|-H|--max-time) shift 2 ;;
    http://*) url="$1"; shift ;;
    *) shift ;;
  esac
done
printf '%s %s\n' "$method" "$url" >> ${JSON.stringify(calls)}
if [[ "$url" == */api/pm-automation/status ]]; then
  printf '%s' '{"success":true,"data":{"health":"degraded","schedulerStarted":true}}' > "$out"
else
  printf '%s' '{"success":true,"data":{"dueSchedulesChecked":18,"workOrdersGenerated":0,"runtimeTriggers":{"evaluated":4,"generated":0},"overdueSchedulesFound":0,"overdueAlertsSent":0}}' > "$out"
fi
printf '200'
`, { mode: 0o755 });

    const result = await run('bash', [runnerPath], runtimeEnv(runtime, {
      PATH: `${runtime.fakeBin}:${process.env.PATH ?? ''}`,
    }));

    expect(result.code).toBe(0);
    const callLog = await readFile(calls, 'utf8');
    expect(callLog.trim().split('\n')).toEqual([
      'GET http://127.0.0.1:3555/api/pm-automation/status',
      'POST http://127.0.0.1:3555/api/pm-schedules/check-due-cron',
    ]);
    const log = await readFile(join(runtime.logs, 'cron.log'), 'utf8');
    expect(log).toContain('mode=fallback primary=degraded');
    expect(log).toContain('status=ok http=200');
    expect(log).not.toContain(runtime.secret);
  });

  it('fails closed when PM_CRON_SECRET is missing and never reaches curl', async () => {
    const runtime = await makeRuntime('');
    cleanups.push(runtime.root);
    const marker = join(runtime.root, 'curl-called');
    const fakeCurl = join(runtime.fakeBin, 'curl');
    await writeFile(fakeCurl, `#!/usr/bin/env bash\nprintf called > ${JSON.stringify(marker)}\nexit 99\n`, { mode: 0o755 });

    const result = await run('bash', [runnerPath, '--dry-run'], runtimeEnv(runtime, {
      PATH: `${runtime.fakeBin}:${process.env.PATH ?? ''}`,
    }));

    expect(result.code).toBe(1);
    await expect(access(marker)).rejects.toThrow();
    const log = await readFile(join(runtime.logs, 'cron.log'), 'utf8');
    expect(log).toContain('status=error reason=cron_secret_missing');
  });

  it('suppresses an overlapping automation tick with the shared flock', async () => {
    const runtime = await makeRuntime();
    cleanups.push(runtime.root);
    const fakeCurl = join(runtime.fakeBin, 'curl');
    await writeFile(fakeCurl, `#!/usr/bin/env bash\nset -euo pipefail\nout=''\nwhile (( $# )); do\n  case "$1" in\n    -o) out="$2"; shift 2 ;;\n    -w|-X|-H|--max-time) shift 2 ;;\n    *) shift ;;\n  esac\ndone\nprintf '%s' '{"success":true,"data":{"dueSchedulesChecked":18,"workOrdersGenerated":0,"runtimeTriggers":{"evaluated":4,"generated":0},"overdueSchedulesFound":0,"overdueAlertsSent":0}}' > "$out"\nsleep 1\nprintf '200'\n`, { mode: 0o755 });
    const env = runtimeEnv(runtime, { PATH: `${runtime.fakeBin}:${process.env.PATH ?? ''}` });

    const first = run('bash', [runnerPath], env);
    await new Promise((resolve) => setTimeout(resolve, 150));
    const second = await run('bash', [runnerPath], env);
    const firstResult = await first;

    expect(firstResult.code).toBe(0);
    expect(second.code).toBe(0);
    const log = await readFile(join(runtime.logs, 'cron.log'), 'utf8');
    expect(log).toContain('skip=overlap');
    expect(log).toContain('status=ok http=200');
    expect(log).not.toContain(runtime.secret);
  });

  it('renders the same five-minute Africa/Accra cron definition on repeated previews', async () => {
    const env = { ...process.env, DEPLOY_PATH: '/srv/iassetspro-current' };
    const first = await run('bash', [installerPath, '--render'], env);
    const second = await run('bash', [installerPath, '--render'], env);
    const expected = [
      'SHELL=/bin/bash',
      'PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
      'CRON_TZ=Africa/Accra',
      '*/5 * * * * root /srv/iassetspro-current/scripts/iassetspro-pm-cron.sh >/dev/null 2>&1',
      '',
    ].join('\n');

    expect(first.code).toBe(0);
    expect(first.stderr).toBe('');
    expect(first.stdout).toBe(expected);
    expect(second).toEqual(first);
  });

  it('removes only the exact legacy PM cron marker and filtering is idempotent', async () => {
    const source = [
      'MAILTO=ops@example.com',
      'CRON_TZ=Africa/Accra',
      '*/5 * * * * /home/lightworld/bin/iassetspro-pm-cron.sh >/dev/null 2>&1 # iassetspro-pm-cron',
      '0 1 * * * /usr/local/bin/backup # nightly-backup',
      '*/10 * * * * /usr/local/bin/other # iassetspro-pm-cron-old',
      '',
    ].join('\n');
    const expected = [
      'MAILTO=ops@example.com',
      'CRON_TZ=Africa/Accra',
      '0 1 * * * /usr/local/bin/backup # nightly-backup',
      '*/10 * * * * /usr/local/bin/other # iassetspro-pm-cron-old',
      '',
    ].join('\n');

    const first = await run('bash', [installerPath, '--filter-legacy-crontab'], process.env, { input: source });
    const second = await run('bash', [installerPath, '--filter-legacy-crontab'], process.env, { input: first.stdout });

    expect(first.code).toBe(0);
    expect(first.stdout).toBe(expected);
    expect(second.stdout).toBe(expected);
  });

  it('refuses a real install when invoked without root privileges', async () => {
    const unprivileged = typeof process.getuid === 'function' && process.getuid() === 0
      ? { uid: 65534, gid: 65534 }
      : {};
    const result = await run('bash', [installerPath], process.env, unprivileged);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain('root is required');
  });

  it('fails closed before starting the legacy Bun scheduler when PM_CRON_SECRET is absent', async () => {
    const env = { ...process.env };
    delete env.PM_CRON_SECRET;
    delete env.PM_CRON_TARGET_URL;
    const result = await runWithTimeout('bun', [legacySchedulerPath], env);

    expect(result.timedOut).toBe(false);
    expect(result.code).not.toBe(0);
    expect(`${result.stdout}${result.stderr}`).toContain('PM_CRON_SECRET is required');
  });

  it('derives the legacy scheduler target from PRODUCTION_PORT instead of assuming port 3000', async () => {
    const result = await runWithTimeout('bun', [legacySchedulerPath], {
      ...process.env,
      PM_CRON_SECRET: 'legacy-test-secret',
      PRODUCTION_PORT: '3999',
      PM_CRON_TARGET_URL: undefined,
    });

    expect(result.stdout).toContain('Target: http://127.0.0.1:3999/api/pm-schedules/check-due-cron');
    expect(result.stdout).not.toContain('localhost:3000');
  });

  it('honors an explicit PM_CRON_TARGET_URL for the legacy scheduler', async () => {
    const target = 'http://127.0.0.1:4888/custom-pm-check';
    const result = await runWithTimeout('bun', [legacySchedulerPath], {
      ...process.env,
      PM_CRON_SECRET: 'legacy-test-secret',
      PRODUCTION_PORT: '3999',
      PM_CRON_TARGET_URL: target,
    });

    expect(result.stdout).toContain(`Target: ${target}`);
  });
});
