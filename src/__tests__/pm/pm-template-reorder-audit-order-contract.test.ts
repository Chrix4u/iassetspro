import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const route = fs.readFileSync('src/app/api/pm-templates/[id]/tasks/route.ts', 'utf8');

function section(source: string, start: string): string {
  const from = source.indexOf(start);
  return from < 0 ? '' : source.slice(from);
}

describe('PM template reorder audit ordering contract', () => {
  it('reads the immediately preceding active task order under the reorder transaction lock', () => {
    const put = section(route, 'export async function PUT(');
    const transactionStart = put.indexOf('await db.$transaction(async (tx) =>');
    expect(transactionStart).toBeGreaterThan(0);

    const beforeTransaction = put.slice(0, transactionStart);
    const transactionBody = put.slice(transactionStart);

    expect(beforeTransaction).not.toContain('db.pmTemplateTask.findMany');
    expect(transactionBody).toContain('const lockedActiveTasks = await tx.pmTemplateTask.findMany');
    expect(transactionBody).toContain("orderBy: [{ taskNumber: 'asc' }, { sortOrder: 'asc' }, { id: 'asc' }]");
    expect(transactionBody).toContain('lockedActiveTasks.map((task) => task.id)');
    expect(transactionBody).toContain('const lockedActiveTaskIds = new Set');
    expect(transactionBody).toContain('lockedActiveTasks.length === normalizedTaskIds.length');
  });
});
