import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const route = fs.readFileSync('src/app/api/pm-templates/[id]/route.ts', 'utf8');

function section(source: string, start: string, end?: string): string {
  const from = source.indexOf(start);
  if (from < 0) return '';
  const to = end ? source.indexOf(end, from + start.length) : -1;
  return source.slice(from, to >= 0 ? to : source.length);
}

describe('PM template deactivation safety contract', () => {
  it('blocks update-based deactivation while an active PM schedule still uses the template', () => {
    const put = section(route, 'export async function PUT(', 'export async function DELETE(');
    expect(put).toContain('body.isActive === false');
    expect(put).toContain('templateId: id');
    expect(put).toContain('isActive: true');
    expect(put).toContain('active PM schedule');
    expect(put).toContain('status: 409');
  });

  it('blocks delete-based deactivation while an active PM schedule still uses the template', () => {
    const del = section(route, 'export async function DELETE(');
    expect(del).toContain('templateId: id');
    expect(del).toContain('isActive: true');
    expect(del).toContain('active PM schedule');
    expect(del).toContain('status: 409');
  });
});
