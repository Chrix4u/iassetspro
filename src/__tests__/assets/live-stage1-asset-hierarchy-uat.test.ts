import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = fs.readFileSync('scripts/live-stage1-asset-hierarchy-uat.mjs', 'utf8');

describe('live Stage-1 asset hierarchy UAT script', () => {
  it('uses authenticated live application APIs rather than direct database access', () => {
    expect(source).toContain('/api/auth/login');
    expect(source).toContain('/api/plants');
    expect(source).toContain('/api/departments');
    expect(source).toContain('/api/asset-categories');
    expect(source).toContain('/api/assets');
    expect(source).toContain('/api/component-registry');
    expect(source).not.toContain('PrismaClient');
    expect(source).not.toContain('db.');
  });

  it('creates the required deep machine hierarchy', () => {
    expect(source).toContain("componentType: 'assembly'");
    expect(source).toContain("componentType: 'subassembly'");
    expect(source).toContain("componentType: 'component'");
    expect(source).toContain("componentType: 'part'");
    expect(source).toContain('RPM-ASM-DRIVE');
    expect(source).toContain('RPM-SUB-GEARBOX');
    expect(source).toContain('RPM-CMP-OUTPUT-SHAFT');
    expect(source).toContain('RPM-PRT-BRG-6205');
  });

  it('is idempotent and verifies parent-child relationships after creation', () => {
    expect(source).toContain('if (found) return found');
    expect(source).toContain('Hierarchy verification failed');
    expect(source).toContain('Sub-assembly parent verification failed');
    expect(source).toContain('Component parent verification failed');
    expect(source).toContain('Part parent verification failed');
  });
});
