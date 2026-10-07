import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const templates = fs.readFileSync('src/app/api/pm-templates/route.ts', 'utf8');
const templateDetail = fs.readFileSync('src/app/api/pm-templates/[id]/route.ts', 'utf8');
const tasks = fs.readFileSync('src/app/api/pm-templates/[id]/tasks/route.ts', 'utf8');
const taskDetail = fs.readFileSync('src/app/api/pm-templates/[id]/tasks/[taskId]/route.ts', 'utf8');

function section(source: string, start: string, end?: string): string {
  const from = source.indexOf(start);
  if (from < 0) return '';
  const to = end ? source.indexOf(end, from + start.length) : -1;
  return source.slice(from, to >= 0 ? to : source.length);
}

describe('PM template audit atomicity contract', () => {
  it('creates templates and their audit record in one transaction', () => {
    const post = section(templates, 'export async function POST(');
    expect(post).toContain('db.$transaction(async (tx) =>');
    expect(post).toContain('tx.pmTemplate.create');
    expect(post).toContain('tx.auditLog.create');
    expect(post).toContain("entityType: 'pm_template'");
  });

  it('updates and deactivates templates atomically with audit records', () => {
    const put = section(templateDetail, 'export async function PUT(', 'export async function DELETE(');
    const del = section(templateDetail, 'export async function DELETE(');
    for (const write of [put, del]) {
      expect(write).toContain('db.$transaction(async (tx) =>');
      expect(write).toContain('tx.pmTemplate.update');
      expect(write).toContain('tx.auditLog.create');
      expect(write).toContain("entityType: 'pm_template'");
    }
  });

  it('adds and reorders template tasks atomically with audit records', () => {
    const post = section(tasks, 'export async function POST(', 'export async function PUT(');
    const put = section(tasks, 'export async function PUT(');
    for (const write of [post, put]) {
      expect(write).toContain('db.$transaction(async (tx) =>');
      expect(write).toContain('tx.auditLog.create');
      expect(write).toContain("entityType: 'pm_template_task'");
    }
  });

  it('deletes a template task atomically with its audit record', () => {
    const del = section(taskDetail, 'export async function DELETE(');
    expect(del).toContain('db.$transaction(async (tx) =>');
    expect(del).toContain('tx.pmTemplateTask.update');
    expect(del).toContain('tx.auditLog.create');
    expect(del).toContain("entityType: 'pm_template_task'");
  });
});
