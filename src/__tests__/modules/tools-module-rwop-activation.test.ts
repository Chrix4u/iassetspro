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
    const constantsSeed = read('prisma/seed-constants.ts');
    const toolsLine = constantsSeed
      .split('\n')
      .find((line) => line.includes("code: 'tools'"));

    expect(toolsLine).toBeDefined();
    expect(toolsLine).toContain('isCore: false');
    expect(toolsLine).toContain('licensed: true');
    expect(constantsSeed).toContain("companyId: '__default__'");
    expect(constantsSeed).toContain('isActive: true');
    expect(constantsSeed).toContain('isEnabled: true');
    expect(constantsSeed).toContain('licensedAt: new Date()');
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
