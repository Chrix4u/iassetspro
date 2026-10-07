import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const collection = fs.readFileSync('src/app/api/checklists/route.ts', 'utf8');
const detail = fs.readFileSync('src/app/api/checklists/[id]/route.ts', 'utf8');

function section(source: string, start: string, end?: string): string {
  const from = source.indexOf(start);
  if (from < 0) return '';
  const to = end ? source.indexOf(end, from + start.length) : -1;
  return source.slice(from, to >= 0 ? to : source.length);
}

describe('PM checklist write atomicity contract', () => {
  it('creates checklist state and audit record in one transaction', () => {
    const post = section(collection, 'export async function POST(');
    expect(post).toContain('db.$transaction(async (tx) =>');
    expect(post).toContain('tx.checklist.create');
    expect(post).toContain('tx.auditLog.create');
    expect(post).toContain("entityType: 'checklist'");
  });

  it('updates checklist state and audit record in one transaction', () => {
    const put = section(detail, 'export async function PUT(', 'export async function DELETE(');
    expect(put).toContain('db.$transaction(async (tx) =>');
    expect(put).toContain('tx.checklist.update');
    expect(put).toContain('tx.auditLog.create');
    expect(put).toContain("entityType: 'checklist'");
  });

  it('keeps checklist deletion atomic with its audit record', () => {
    const del = section(detail, 'export async function DELETE(');
    expect(del).toContain('db.$transaction(async (tx) =>');
    expect(del).toContain('tx.checklist.update');
    expect(del).toContain('data: { isActive: false }');
    expect(del).toContain('tx.auditLog.create');
  });
});
