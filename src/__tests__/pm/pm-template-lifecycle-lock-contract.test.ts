import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const scheduleCollection = fs.readFileSync('src/app/api/pm-schedules/route.ts', 'utf8');
const scheduleDetail = fs.readFileSync('src/app/api/pm-schedules/[id]/route.ts', 'utf8');
const templateDetail = fs.readFileSync('src/app/api/pm-templates/[id]/route.ts', 'utf8');
const taskDetail = fs.readFileSync('src/app/api/pm-templates/[id]/tasks/[taskId]/route.ts', 'utf8');
const lifecyclePath = 'src/services/pm/templateLifecycle.service.ts';
const lifecycle = fs.existsSync(lifecyclePath) ? fs.readFileSync(lifecyclePath, 'utf8') : '';

const LOCK_CALL = 'await lockPmTemplateLifecycle(tx,';
const RUNNABLE_ERROR = 'PM template must be active and contain at least one active task';

describe('PM template lifecycle serialization contract', () => {
  it('uses one shared transaction-scoped lock for every write that can change active schedule/template compatibility', () => {
    expect(lifecycle).toContain('iassetspro:pm-template-lifecycle:${templateId}');
    expect(lifecycle).toContain('pg_advisory_xact_lock');

    expect(scheduleCollection).toContain(`${LOCK_CALL} templateId)`);
    expect(scheduleDetail).toContain(`${LOCK_CALL} prospectiveTemplateId)`);
    expect(templateDetail.match(/lockPmTemplateLifecycle\(tx, id\)/g)?.length).toBeGreaterThanOrEqual(2);
    expect(taskDetail).toContain(`${LOCK_CALL} id)`);
  });

  it('revalidates the effective retained template whenever an existing schedule becomes or remains active', () => {
    expect(scheduleDetail).toContain('const prospectiveIsActive =');
    expect(scheduleDetail).toContain('const prospectiveTemplateId =');
    expect(scheduleDetail).toContain('if (prospectiveIsActive && prospectiveTemplateId)');
    expect(scheduleDetail).toContain('tasks: { where: { isActive: true }, take: 1');
    expect(scheduleDetail).toContain(RUNNABLE_ERROR);
  });

  it('revalidates template activity and runnable tasks inside the locked create transaction', () => {
    const transactionStart = scheduleCollection.indexOf('const scheduleResult = await db.$transaction(async (tx) =>');
    expect(transactionStart).toBeGreaterThan(0);
    const transaction = scheduleCollection.slice(transactionStart);
    expect(transaction).toContain(`${LOCK_CALL} templateId)`);
    expect(transaction).toContain('tasks: { where: { isActive: true }, take: 1');
    expect(transaction).toContain(RUNNABLE_ERROR);
  });
});
