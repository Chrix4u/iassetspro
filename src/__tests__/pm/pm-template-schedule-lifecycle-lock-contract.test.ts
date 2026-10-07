import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const collection = fs.readFileSync('src/app/api/pm-schedules/route.ts', 'utf8');
const detail = fs.readFileSync('src/app/api/pm-schedules/[id]/route.ts', 'utf8');
const templateDetail = fs.readFileSync('src/app/api/pm-templates/[id]/route.ts', 'utf8');
const taskDetail = fs.readFileSync('src/app/api/pm-templates/[id]/tasks/[taskId]/route.ts', 'utf8');
const helperPath = 'src/services/pm/templateLifecycle.service.ts';
const helper = fs.existsSync(helperPath) ? fs.readFileSync(helperPath, 'utf8') : '';

function section(source: string, start: string, end?: string): string {
  const from = source.indexOf(start);
  if (from < 0) return '';
  const to = end ? source.indexOf(end, from + start.length) : -1;
  return source.slice(from, to >= 0 ? to : source.length);
}

describe('PM template/schedule lifecycle lock contract', () => {
  it('defines one shared transaction lock for template lifecycle mutations', () => {
    expect(helper).toContain('export async function lockPmTemplateLifecycle');
    expect(helper).toContain('iassetspro:pm-template-lifecycle:${templateId}');
    expect(helper).toContain("SELECT pg_advisory_xact_lock(hashtext($1))");
  });

  it('serializes both template deactivation paths before checking active schedules', () => {
    const put = section(templateDetail, 'export async function PUT(', 'export async function DELETE(');
    const del = section(templateDetail, 'export async function DELETE(');
    for (const mutation of [put, del]) {
      const lockAt = mutation.indexOf('lockPmTemplateLifecycle(tx, id)');
      const scheduleCheckAt = mutation.indexOf('tx.pmSchedule.findFirst');
      expect(lockAt).toBeGreaterThan(0);
      expect(scheduleCheckAt).toBeGreaterThan(lockAt);
    }
  });


  it('serializes template task removal with schedule assignment before checking active schedules', () => {
    const del = section(taskDetail, 'export async function DELETE(');
    const lifecycleLockAt = del.indexOf('lockPmTemplateLifecycle(tx, id)');
    const scheduleCheckAt = del.indexOf('tx.pmSchedule.findFirst');
    expect(lifecycleLockAt).toBeGreaterThan(0);
    expect(scheduleCheckAt).toBeGreaterThan(lifecycleLockAt);
  });

  it('revalidates a selected template under the shared lock before creating an active schedule', () => {
    const post = section(collection, 'export async function POST(');
    const transactionAt = post.indexOf('db.$transaction(async (tx) =>');
    expect(transactionAt).toBeGreaterThan(0);
    expect(post.slice(0, transactionAt)).not.toContain('db.pmTemplate.findUnique');
    const transaction = post.slice(transactionAt);
    expect(transaction).toContain('lockPmTemplateLifecycle(tx, templateId)');
    expect(transaction).toContain('tx.pmTemplate.findUnique');
    expect(transaction).toContain('tasks: { where: { isActive: true }, take: 1, select: { id: true } }');
    expect(transaction).toContain("kind: 'invalid_template'");
  });

  it('validates the effective retained template when an active schedule is updated or reactivated', () => {
    const put = section(detail, 'export async function PUT(', 'export async function DELETE(');
    expect(put).toContain('const prospectiveIsActive = body.isActive !== undefined');
    expect(put).toContain('const prospectiveTemplateId = body.templateId !== undefined');
    expect(put).toContain('if (prospectiveIsActive && prospectiveTemplateId)');
    expect(put).toContain('lockPmTemplateLifecycle(tx, prospectiveTemplateId)');
    expect(put).toContain('tx.pmTemplate.findUnique');
    expect(put).toContain('tasks: { where: { isActive: true }, take: 1, select: { id: true } }');
    expect(put).toContain("kind: 'invalid_template'");
  });
});
