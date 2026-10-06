import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const actorResolver = fs.readFileSync('src/lib/pm-automation-actor.ts', 'utf8');
const checkDue = fs.readFileSync('src/app/api/pm-schedules/check-due/route.ts', 'utf8');
const checkDueCron = fs.readFileSync('src/app/api/pm-schedules/check-due-cron/route.ts', 'utf8');

describe('PM automation actor persistence contract', () => {
  it('never uses a synthetic system foreign key for cron-owned writes', () => {
    expect(checkDue).not.toContain("session?.userId || 'system'");
    expect(checkDueCron).not.toContain("session?.userId || 'system'");
    expect(checkDue).toContain('hasValidCronSecret ? undefined : session?.userId');
    expect(checkDue).toContain('resolvePmAutomationActorId(');
    expect(checkDueCron).toContain('resolvePmAutomationActorId(session?.userId)');
  });

  it('resolves cron execution to a persisted active user before mutations', () => {
    expect(actorResolver).toContain('PM_CRON_USER_ID');
    expect(actorResolver).toContain("username: 'admin'");
    expect(actorResolver).toContain("status: 'active'");
    expect(actorResolver).toContain('PM automation requires PM_CRON_USER_ID');
  });

  it('uses the resolved actor for PM task comments and audit rows', () => {
    expect(checkDue).toContain('userId: automationActorId');
    expect(checkDueCron).toContain('const auditUserId = automationActorId');
    expect(checkDueCron).toContain('userId: auditUserId');
  });
});
