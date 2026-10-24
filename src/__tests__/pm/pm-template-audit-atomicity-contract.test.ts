import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const templates = fs.readFileSync('src/app/api/pm-templates/route.ts', 'utf8');
const templateDetail = fs.readFileSync('src/app/api/pm-templates/[id]/route.ts', 'utf8');
const taskAssociations = fs.readFileSync('src/services/pm/pmTemplateTaskAssociation.service.ts', 'utf8');

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

  it('mutates template task associations and writes their audit events in canonical transactions', () => {
    for (const operation of [
      'linkPmTasksToTemplate',
      'createAndLinkPmTasks',
      'reorderPmTemplateTasks',
      'deactivatePmTemplateTask',
      'convertLegacyPmTemplateTask',
    ]) {
      const start = taskAssociations.indexOf(`export async function ${operation}`);
      expect(start).toBeGreaterThan(0);
      const next = taskAssociations.indexOf('export async function ', start + 1);
      const write = taskAssociations.slice(start, next > start ? next : undefined);
      expect(write).toContain('db.$transaction');
    }
    expect(taskAssociations).toContain('tx.auditLog.create');
    expect(taskAssociations).toContain("entityType: 'pm_template_task'");
  });
});
