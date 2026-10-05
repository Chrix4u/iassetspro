import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

describe('reliability direct-entity plant scope', () => {
  it('guards asset/component reliability metrics before querying failures', () => {
    const source = read('src/app/api/reliability/metrics/route.ts');
    expect(source).toContain('authorizeComponentPlant(request, session, componentId)');
    expect(source).toContain('authorizeAssetPlant(request, session, assetId!)');
    expect(source.indexOf('if (!plantAuth.ok)')).toBeLessThan(source.indexOf('db.failureRecord.findMany'));
  });

  it('guards criticality ranking by twin or asset ownership', () => {
    const source = read('src/app/api/reliability/criticality-ranking/route.ts');
    expect(source).toContain('authorizeDigitalTwinPlant(request, session, twinId)');
    expect(source).toContain('authorizeAssetPlant(request, session, assetId!)');
  });

  it.each([
    'src/app/api/reliability/downtime/route.ts',
    'src/app/api/reliability/rcm/route.ts',
  ])('%s authorizes required asset IDs before service access', (path) => {
    const source = read(path);
    expect(source.match(/authorizeAssetPlant\(request, session, assetId\)/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it.each([
    'src/app/api/reliability/rul/route.ts',
    'src/app/api/reliability/weibull-engineering/route.ts',
  ])('%s authorizes required component IDs on GET and POST', (path) => {
    const source = read(path);
    expect(source.match(/authorizeComponentPlant\(request, session, componentId\)/g)?.length).toBe(2);
  });

  it('guards simple Weibull analysis by owning asset/component plant', () => {
    const source = read('src/app/api/reliability/weibull/route.ts');
    expect(source).toContain('authorizeComponentPlant(request, session, componentId)');
    expect(source).toContain('authorizeAssetPlant(request, session, assetId!)');
  });
});
