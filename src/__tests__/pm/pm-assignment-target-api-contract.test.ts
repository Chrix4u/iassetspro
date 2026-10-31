import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('PM assignment target API contract', () => {
  it('exposes atomic target replacement and deactivation with plant scope and permissions', () => {
    const file = resolve(process.cwd(), 'src/app/api/pm-assignments/target/route.ts');
    expect(existsSync(file)).toBe(true);
    if (!existsSync(file)) return;
    const source = readFileSync(file, 'utf8');
    expect(source).toContain('export async function PATCH');
    expect(source).toContain('export async function DELETE');
    expect(source).toContain('replacePmAssignmentTarget');
    expect(source).toContain('deactivatePmAssignmentTarget');
    expect(source).toContain('canAccessPlantStrict');
    expect(source).toMatch(/pm_schedules\.update/);
    expect(source).toMatch(/pm_schedules\.delete/);
  });
});
