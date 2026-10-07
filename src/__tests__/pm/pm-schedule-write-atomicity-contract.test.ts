import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const collectionRoute = fs.readFileSync('src/app/api/pm-schedules/route.ts', 'utf8');
const detailRoute = fs.readFileSync('src/app/api/pm-schedules/[id]/route.ts', 'utf8');
const postSection = collectionRoute.split('export async function POST')[1] ?? '';
const deleteSection = detailRoute.split('export async function DELETE')[1] ?? '';

describe('PM schedule write atomicity contract', () => {
  it('commits schedule creation, generated usage trigger, and audit as one transaction', () => {
    expect(postSection).toContain('db.$transaction(async (tx) =>');
    expect(postSection).toContain('tx.pmSchedule.create');
    expect(postSection).toContain('tx.pmTrigger.create');
    expect(postSection).toContain('tx.auditLog.create');
    expect(postSection).not.toContain('await db.pmSchedule.create');
    expect(postSection).not.toContain('await db.pmTrigger.create');
    expect(postSection).not.toContain('await db.auditLog.create');
  });

  it('commits schedule deactivation and its audit as one transaction', () => {
    expect(deleteSection).toContain('db.$transaction(async (tx) =>');
    expect(deleteSection).toContain('tx.pmSchedule.update');
    expect(deleteSection).toContain('tx.auditLog.create');
    expect(deleteSection).not.toContain('await db.pmSchedule.update');
    expect(deleteSection).not.toContain('await db.auditLog.create');
  });
});
