import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

describe('reliability scoped list query contract', () => {
  it('resolves accessible asset IDs centrally and skips ID expansion for system-wide users', () => {
    const helper = read('src/lib/plant-auth-helpers.ts');
    expect(helper).toContain('export async function resolveAccessibleAssetIds');
    expect(helper).toContain("if (plantScope.isSystemWide)");
    expect(helper).toContain('where: getPlantFilterWhere(plantScope)');
  });

  it.each([
    ['src/services/reliability/degradation.service.ts', 'ListDegradationParams'],
    ['src/services/reliability/lifecycleForecast.service.ts', 'ListForecastParams'],
    ['src/services/reliability/rbi.service.ts', 'ListRbiParams'],
    ['src/services/reliability/sil.service.ts', 'ListSilParams'],
  ])('%s accepts an assetIds scope and applies it to Prisma list/count filters', (path) => {
    const source = read(path);
    expect(source).toContain('assetIds?: string[];');
    expect(source).toContain('where.assetId = { in: assetIds }');
  });

  it('scopes degradation alerts as well as paginated profiles', () => {
    const route = read('src/app/api/reliability/degradation/route.ts');
    const service = read('src/services/reliability/degradation.service.ts');
    expect(route).toContain('getProfilesByStage(stage, assetScope.entity.assetIds)');
    expect(service).toContain('async getProfilesByStage(stage?: string, assetIds?: string[] | null)');
  });

  it('scopes RBI summaries before aggregation', () => {
    const route = read('src/app/api/reliability/rbi/route.ts');
    const service = read('src/services/reliability/rbi.service.ts');
    expect(route).toContain('getSummary(groupBy, assetScope.entity.assetIds)');
    expect(service).toContain("...(assetIds ? { assetId: { in: assetIds } } : {})");
  });

  it('scopes CAPEX planning by explicit plant or accessible asset set', () => {
    const route = read('src/app/api/reliability/lifecycle/route.ts');
    const service = read('src/services/reliability/lifecycleForecast.service.ts');
    expect(route).toContain('plantId ? undefined : assetScope.entity.assetIds');
    expect(service).toContain('else if (assetIds) where.id = { in: assetIds }');
  });
});
