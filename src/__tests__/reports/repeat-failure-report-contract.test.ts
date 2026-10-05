import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const source = readFileSync('src/app/api/reports/repeat-failures/route.ts', 'utf8');

describe('repeat-failure report current-schema contract', () => {
  it('uses Asset.assetTag while preserving the public assetCode response alias', () => {
    expect(source).toContain('assetTag: true');
    expect(source).not.toContain('assetCode: true');
    expect(source).toContain("assetCode: fr.asset?.assetTag || ''");
  });

  it('loads typed asset/component relations required for repeat-failure drilldown', () => {
    expect(source).toContain('component: { select: { id: true, name: true, componentCode: true');
    expect(source).toContain('manufacturer: true');
    expect(source).toContain('category: { select: { name: true } }');
    expect(source).toContain('manufacturer: a.manufacturer');
    expect(source).toContain('category: a.category');
  });

  it('keeps FailureRecord queries constrained by canonical plant scope', () => {
    expect(source).toContain('const plantScope = await getPlantScope(request, session)');
    expect(source).toContain('const plantFilter = getPlantFilterWhere(plantScope)');
    expect(source).toContain('frFilter.asset = { ...plantFilter }');
  });
});
