import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const detail = fs.readFileSync('src/app/api/checklists/[id]/route.ts', 'utf8');
const operations = fs.readFileSync('src/components/modules/OperationsPages.tsx', 'utf8');

describe('PM checklist history and UI permission contract', () => {
  it('soft-deactivates checklist definitions so historical response evidence remains resolvable', () => {
    const deleteStart = detail.indexOf('export async function DELETE(');
    const del = detail.slice(deleteStart);
    expect(del).toContain('db.$transaction(async (tx) =>');
    expect(del).toContain('tx.checklist.update');
    expect(del).toContain('data: { isActive: false }');
    expect(del).not.toContain('tx.checklistItem.deleteMany');
    expect(del).not.toContain('tx.checklist.delete');
    expect(del).toContain("entityType: 'checklist'");
    expect(del).toContain('newValues: JSON.stringify({ isActive: false })');
  });

  it('uses checklist creation permission in the checklist UI', () => {
    const start = operations.indexOf('export function OperationsChecklistsPage()');
    const page = operations.slice(start);
    expect(page).toContain("hasPermission('pm_checklists.create')");
    expect(page).not.toContain("hasPermission('pm_schedules.create') || isAdmin()");
  });
});
