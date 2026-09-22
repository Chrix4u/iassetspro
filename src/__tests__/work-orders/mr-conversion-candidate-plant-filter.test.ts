import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (file: string) =>
  fs.readFileSync(path.join(process.cwd(), file), 'utf8');

describe('MR conversion candidate plant filtering', () => {
  it('lets WorkerAssignmentSelector narrow discovery to one plant', () => {
    const selector = read('src/components/shared/WorkerAssignmentSelector.tsx');
    expect(selector).toContain('plantId?: string | null');
    expect(selector).toContain("if (plantId) params.set('plantId', plantId)");
    expect(selector).toContain('[debouncedSearch, assignType, plantId]');
  });

  it('passes the MR plant to technician and supervisor selectors', () => {
    const ui = read('src/components/modules/MaintenancePages.tsx');
    expect(ui).toContain('plantId={(mr as any)?.plantId ? String((mr as any).plantId) : null}');
    expect(ui).toContain("if (plantId) params.set('plantId', plantId)");
    expect(ui).toContain("const [deptsRes, invRes, toolsRes] = await Promise.all([");
    expect(ui).not.toContain('const [usersMap, setUsersMap]');
  });
});
