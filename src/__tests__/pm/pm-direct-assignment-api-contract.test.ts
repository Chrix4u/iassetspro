import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('direct PM assignment API contract', () => {
  it('exposes collection CRUD without requiring schedule title', () => {
    const file = resolve(process.cwd(), 'src/app/api/pm-assignments/route.ts');
    expect(existsSync(file)).toBe(true);
    if (!existsSync(file)) return;
    const source = readFileSync(file, 'utf8');
    expect(source).toContain('export async function GET');
    expect(source).toContain('export async function POST');
    expect(source).toContain('createPmAssignment');
    expect(source).not.toMatch(/title\s+is required/i);
  });

  it('exposes item update/deactivate route', () => {
    const file = resolve(process.cwd(), 'src/app/api/pm-assignments/[id]/route.ts');
    expect(existsSync(file)).toBe(true);
    if (!existsSync(file)) return;
    const source = readFileSync(file, 'utf8');
    expect(source).toContain('export async function PATCH');
    expect(source).toContain('export async function DELETE');
  });
});
