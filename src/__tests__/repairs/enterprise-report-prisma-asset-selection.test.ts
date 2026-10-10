import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('enterprise report Prisma asset selection', () => {
  it('selects only Asset fields that exist in the current schema for failure analysis', () => {
    const source = fs.readFileSync('src/app/api/reports/enterprise/route.ts', 'utf8');

    expect(source).toContain('failureRecord.findMany');
    expect(source).toContain('assetTag: true');
    expect(source).not.toContain('assetCode: true');
  });
});
