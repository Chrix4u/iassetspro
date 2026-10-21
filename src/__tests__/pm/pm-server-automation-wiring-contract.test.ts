import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const queue = fs.readFileSync('src/lib/queue.ts', 'utf8');
const queueInit = fs.readFileSync('src/lib/queueInit.ts', 'utf8');
const pmUi = fs.readFileSync('src/components/modules/MaintenancePages.tsx', 'utf8');

describe('PM server automation wiring contract', () => {
  it('starts and stops PM automation with the Node queue runtime lifecycle', () => {
    expect(queueInit).toContain('startPmAutomationScheduler');
    expect(queueInit).toContain('stopPmAutomationScheduler');
  });

  it('makes the maintenance-scheduling worker execute the canonical PM automation run', () => {
    expect(queue).toContain("action === 'run_pm_automation'");
    expect(queue).toContain('runPmAutomationTick');
  });

  it('does not mutate PM schedules merely because a user opens the PM page', () => {
    expect(pmUi).not.toContain("api.post('/api/pm-schedules/check-due', {})");
    expect(pmUi).not.toContain('Background PM check: fire-and-forget trigger on page load');
  });
});
