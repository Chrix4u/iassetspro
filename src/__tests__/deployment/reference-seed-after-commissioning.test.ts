import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => fs.readFileSync(path, 'utf8');

describe('commissioned PostgreSQL reference reconciliation', () => {
  it('reconciles idempotent constants after users exist without relaxing first-bootstrap emptiness', () => {
    const seed = read('prisma/seed-constants.ts');
    const deploy = read('scripts/deploy-production-artifact-core.sh');

    expect(seed).toContain("process.env.IASSETSPRO_ALLOW_COMMISSIONED_DATA === '1'");
    expect(seed).toContain('Constants-only seed invariant failed:');
    expect(seed).toContain('Reference data reconciled without modifying commissioned operational records');

    expect(deploy).toContain('PostgreSQL staging already commissioned; reconciling idempotent constants/reference data');
    expect(deploy).toContain('IASSETSPRO_ALLOW_COMMISSIONED_DATA=1 NODE_ENV=production bun --env-file=.env run prisma/seed-constants.ts');
    expect(deploy).not.toContain('constants bootstrap skipped');
  });
});
