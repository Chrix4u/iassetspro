import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const collection = fs.readFileSync('src/app/api/pm-triggers/route.ts', 'utf8');
const detail = fs.readFileSync('src/app/api/pm-triggers/[id]/route.ts', 'utf8');

describe('PM trigger write atomicity contract', () => {
  it('creates the trigger and audit record in one transaction', () => {
    const post = collection.slice(collection.indexOf('export async function POST'));
    expect(post).toContain('db.$transaction(async (tx) =>');
    expect(post).toContain('tx.pmTrigger.create');
    expect(post).toContain('tx.auditLog.create');
  });

  it('updates trigger state and its audit record in one transaction', () => {
    const put = detail.slice(detail.indexOf('export async function PUT'), detail.indexOf('export async function DELETE'));
    expect(put).toContain('db.$transaction(async (tx) =>');
    expect(put).toContain('tx.pmTrigger.update');
    expect(put).toContain('tx.auditLog.create');
  });

  it('deactivates the trigger and records the audit in one transaction', () => {
    const del = detail.slice(detail.indexOf('export async function DELETE'));
    expect(del).toContain('db.$transaction(async (tx) =>');
    expect(del).toContain('tx.pmTrigger.update');
    expect(del).toContain('tx.auditLog.create');
  });
});
