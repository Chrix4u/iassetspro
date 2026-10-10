import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const rbacSource = fs.readFileSync(path.join(process.cwd(), 'scripts/seed-repairs-uat-rbac.ts'), 'utf8');
const baseSeedSource = fs.readFileSync(path.join(process.cwd(), 'scripts/seed-repairs-uat.ts'), 'utf8');

describe('Repairs UAT canonical Production Manager setup', () => {
  it('seeds the production manager permissions required by production-count PM UAT', () => {
    expect(rbacSource).toContain('production_manager: [');
    expect(rbacSource).toContain("'work_centers.create'");
    expect(rbacSource).toContain("'production.create'");
    expect(rbacSource).toContain("['production_manager', 'work_centers.create']");
  });

  it('licenses the production module used by work-center and production-order APIs', () => {
    expect(baseSeedSource).toContain("code: 'production'");
    expect(baseSeedSource).toContain("name: 'Production Management'");
  });
});
