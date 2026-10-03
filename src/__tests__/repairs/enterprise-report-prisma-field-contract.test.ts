import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('enterprise report Prisma Asset field contract', () => {
  it('queries the real Asset tag field and never the removed assetCode field', () => {
    const source = fs.readFileSync('src/app/api/reports/enterprise/route.ts', 'utf8');
    expect(source).not.toContain('assetCode: true');
    expect(source).toContain('assetTag: true');
  });
});
