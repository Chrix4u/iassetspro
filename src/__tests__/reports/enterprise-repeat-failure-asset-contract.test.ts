import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

const route = readFileSync(join(process.cwd(), 'src/app/api/reports/enterprise/route.ts'), 'utf8');

describe('enterprise repeat-failure asset contract', () => {
  it('uses current Asset fields in the FailureRecord relation select', () => {
    expect(route).toContain("asset: { select: { id: true, name: true, assetTag: true");
    expect(route).not.toContain('assetCode: true');
  });

  it('keeps plant scope on failure records through the asset relation', () => {
    expect(route).toContain('frEnterpriseFilter.asset = { ...plantFilter }');
  });

  it('attributes repeat-failure details to the included asset', () => {
    expect(route).toContain("const assetName = fr.asset?.name || fr.workOrderId || 'Unknown'");
    expect(route).toContain('const firstAsset = a.failures[0]?.asset || null');
  });
});
