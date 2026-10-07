import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const detail = fs.readFileSync('src/app/api/pm-schedules/[id]/route.ts', 'utf8');
const lifecycle = fs.readFileSync('src/services/pm/templateLifecycle.service.ts', 'utf8');

function section(source: string, start: string, end?: string): string {
  const from = source.indexOf(start);
  if (from < 0) return '';
  const to = end ? source.indexOf(end, from + start.length) : -1;
  return source.slice(from, to >= 0 ? to : source.length);
}

describe('PM schedule concurrent lifecycle update contract', () => {
  it('defines a transaction-scoped schedule lifecycle lock', () => {
    expect(lifecycle).toContain('export async function lockPmScheduleLifecycle');
    expect(lifecycle).toContain('iassetspro:pm-schedule-lifecycle:${scheduleId}');
    expect(lifecycle).toContain('pg_advisory_xact_lock');
  });

  it('locks and re-reads the schedule before deriving active/template state for PUT', () => {
    const put = section(detail, 'export async function PUT(', 'export async function DELETE(');
    const txAt = put.indexOf('const updateResult = await db.$transaction(async (tx) =>');
    expect(txAt).toBeGreaterThan(0);
    const beforeTx = put.slice(0, txAt);
    const tx = put.slice(txAt);

    expect(beforeTx).not.toContain('const prospectiveIsActive =');
    expect(beforeTx).not.toContain('const prospectiveTemplateId =');
    expect(tx).toContain('await lockPmScheduleLifecycle(tx, id)');
    expect(tx).toContain('const lockedSchedule = await tx.pmSchedule.findUnique');
    expect(tx.indexOf('await lockPmScheduleLifecycle(tx, id)')).toBeLessThan(tx.indexOf('const lockedSchedule = await tx.pmSchedule.findUnique'));
    expect(tx).toContain('const effectiveIsActive = body.isActive !== undefined');
    expect(tx).toContain('lockedSchedule.isActive');
    expect(tx).toContain('const effectiveTemplateId = body.templateId !== undefined');
    expect(tx).toContain('lockedSchedule.templateId');
    expect(tx).toContain('if (effectiveIsActive && effectiveTemplateId)');
    expect(tx).toContain('lockPmTemplateLifecycle(tx, effectiveTemplateId)');
  });

  it('serializes schedule deactivation through the same lifecycle lock', () => {
    const del = section(detail, 'export async function DELETE(');
    const txAt = del.indexOf('db.$transaction(async (tx) =>');
    const lockAt = del.indexOf('lockPmScheduleLifecycle(tx, id)', txAt);
    const updateAt = del.indexOf('tx.pmSchedule.update', txAt);
    expect(txAt).toBeGreaterThan(0);
    expect(lockAt).toBeGreaterThan(txAt);
    expect(updateAt).toBeGreaterThan(lockAt);
  });
});
