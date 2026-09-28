import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const proxy = fs.readFileSync('src/proxy.ts', 'utf8');

describe('PM internal proxy authentication', () => {
  it('has no hard-coded/default PM cron secret', () => {
    expect(proxy).toContain("const INTERNAL_SECRET = process.env.PM_CRON_SECRET || ''");
    expect(proxy).not.toContain('eam-pm-cron-secret-2025');
    expect(proxy).not.toContain('pm-scheduler-internal-2025');
  });

  it('allows all three intended PM automation endpoints through the secret gate', () => {
    expect(proxy).toContain("'/api/pm-schedules/check-due'");
    expect(proxy).toContain("'/api/pm-schedules/check-due-cron'");
    expect(proxy).toContain("'/api/pm-triggers/evaluate'");
    expect(proxy).toContain('INTERNAL_SECRET && cronSecret === INTERNAL_SECRET');
  });

  it('keeps invalid/missing secrets on the normal auth path', () => {
    expect(proxy).toContain('Missing/invalid internal secret falls through to normal user auth');
    expect(proxy).toContain("const authHeader = request.headers.get('authorization')");
  });
});