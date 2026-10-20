import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8');

describe('PM automation operator status contract', () => {
  it('exposes a read-only PM automation status endpoint to PM viewers without leaking the secret', () => {
    const route = read('src/app/api/pm-automation/status/route.ts');
    expect(route).toContain("hasPermission(session, 'pm_schedules.view')");
    expect(route).toContain('isPmAutomationSchedulerStarted');
    expect(route).toContain('resolvePmAutomationIntervalMs');
    expect(route).toContain('jobQueue.getJobs(QUEUES.MAINTENANCE_SCHEDULING)');
    expect(route).toContain("job.name === 'pm-automation-tick'");
    expect(route).not.toContain('cronSecret:');
    expect(route).not.toContain('PM_CRON_SECRET,');
  });

  it('classifies automation as healthy, starting, degraded or disabled', () => {
    const route = read('src/app/api/pm-automation/status/route.ts');
    for (const state of ['healthy', 'starting', 'degraded', 'disabled']) {
      expect(route).toContain(`'${state}'`);
    }
  });

  it('surfaces PM automation health on the PM schedules page without mutating schedules', () => {
    const ui = read('src/components/modules/MaintenancePages.tsx');
    expect(ui).toContain("api.get('/api/pm-automation/status')");
    expect(ui).toContain('PM Automation');
    expect(ui).toContain('pmAutomationStatus');
    expect(ui).not.toContain("api.post('/api/pm-schedules/check-due', {})");
  });
});
