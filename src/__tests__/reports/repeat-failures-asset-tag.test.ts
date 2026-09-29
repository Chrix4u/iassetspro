import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const route = fs.readFileSync('src/app/api/reports/repeat-failures/route.ts', 'utf8');

describe('repeat failure report asset identity contract', () => {
  it('uses the current Asset.assetTag field rather than the removed assetCode field', () => {
    expect(route).toContain('assetTag: true');
    expect(route).toContain("assetTag: fr.asset?.assetTag || ''");
    expect(route).toContain('assetTag: a.assetTag');
    expect(route).not.toContain('assetCode: true');
    expect(route).not.toContain('fr.asset?.assetCode');
  });
});
