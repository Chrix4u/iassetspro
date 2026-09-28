import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const verifier = fs.readFileSync('scripts/verify-rp01-deep-uat.ts', 'utf8');

describe('RP-01 deep UAT verifier contract', () => {
  it('checks hierarchy size, depth and integrity', () => {
    expect(verifier).toContain("assetTag: 'UAT-RP-001'");
    expect(verifier).toContain('components.length >= 70');
    expect(verifier).toContain('hierarchy.maxDepth >= 4');
    expect(verifier).toContain('hierarchy.orphanCount === 0');
    expect(verifier).toContain('hierarchy.cycleCount === 0');
  });

  it('checks every hierarchy class and maintenance coverage', () => {
    for (const token of ['assemblies', 'subassemblies', 'components', 'parts', 'instruments', 'componentPmCoverage']) {
      expect(verifier).toContain(token);
    }
    expect(verifier).toContain('componentPm >= 14');
  });

  it('requires real store and tool linkage', () => {
    expect(verifier).toContain('linkedSpareLinks === spareLinks');
    expect(verifier).toContain('linkedToolRequirements === toolRequirements');
    expect(verifier).toContain('maintenanceHistory >= 1');
    expect(verifier).toContain('componentWorkOrders >= 1');
    expect(verifier).toContain("status: failed.length === 0 ? 'PASS' : 'FAIL'");
  });
});