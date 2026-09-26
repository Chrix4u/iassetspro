import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const deploy = fs.readFileSync('scripts/deploy-production-artifact-core.sh', 'utf8');
const cleanSeed = fs.readFileSync('prisma/seed-constants.ts', 'utf8');
const referenceSeed = fs.readFileSync('prisma/seed-reference-data.ts', 'utf8');

describe('PostgreSQL reference-data refresh after commissioning', () => {
  it('refreshes reference/RBAC data even when users already exist', () => {
    expect(deploy).toContain('PostgreSQL staging already commissioned; refreshing non-destructive reference/RBAC data');
    expect(deploy).toContain('bun --env-file=.env run prisma/seed-reference-data.ts');
    expect(deploy).not.toContain('constants bootstrap skipped');
  });

  it('keeps the clean bootstrap invariant separate from non-destructive refresh', () => {
    expect(cleanSeed).toContain("runSeed('prisma/seed-reference-data.ts')");
    expect(cleanSeed).toContain('Constants-only seed invariant failed');
    expect(referenceSeed).not.toContain('Constants-only seed invariant failed');
    expect(referenceSeed).toContain('Non-destructive reference/RBAC refresh complete');
  });

  it('maintains the canonical permissions, trades, modules and transitions through the reference seed', () => {
    expect(referenceSeed).toContain("runSeed('prisma/seed-permissions-only.ts')");
    expect(referenceSeed).toContain("runSeed('prisma/seed-trades.ts')");
    expect(referenceSeed).toContain("runSeed('scripts/seed-transitions.ts')");
    expect(referenceSeed).toContain('db.systemModule.upsert');
  });
});
