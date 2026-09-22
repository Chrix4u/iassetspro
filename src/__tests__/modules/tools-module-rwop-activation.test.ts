import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (file: string) =>
  fs.readFileSync(path.join(process.cwd(), file), 'utf8');

describe('Tools module activation for RWOP', () => {
  it('keeps Tools optional but licensed in fresh EAM seeds', () => {
    const seed = read('prisma/seed.ts');
    const line = seed
      .split('\n')
      .find((candidate) => candidate.includes("code: 'tools'"));

    expect(line).toBeDefined();
    expect(line).toContain('isCore: false');
    expect(line).toContain('licensed: true');
  });

  it('repairs existing production module state without making Tools core', () => {
    const migration = read(
      'prisma/migrations/20260922163500_activate_tools_module_for_rwop/migration.sql',
    );

    expect(migration).toContain("WHERE `code` = 'tools'");
    expect(migration).toContain('`isCore` = 0');
    expect(migration).toContain('`isSystemLicensed` = 1');
    expect(migration).toContain("cm.`companyId` = '__default__'");
    expect(migration).toContain('cm.`isActive` = 1');
    expect(migration).toContain('cm.`isEnabled` = 1');
    expect(migration).toContain('cm.`licensedAt` = COALESCE');
  });

  it('continues to enforce Tools at the proxy boundary', () => {
    const proxy = read('src/proxy.ts');

    expect(proxy).toContain(
      "return ['work_orders', 'repairs', 'tools'];",
    );
    expect(proxy).toContain(
      'Required module is not licensed, enabled, and active',
    );
  });
});
