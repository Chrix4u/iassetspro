import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8');

const locationListRoute = read('src', 'app', 'api', 'functional-locations', 'route.ts');
const assetLocationRoute = read('src', 'app', 'api', 'assets', '[id]', 'functional-locations', 'route.ts');

describe('functional-location assignment read permission contract', () => {
  it('allows assign permission to read candidate functional locations needed by the picker', () => {
    expect(locationListRoute).toContain("!hasPermission(session, 'assets.functional_locations.view') &&\n      !hasPermission(session, 'assets.functional_locations.assign')");
  });

  it('allows assign permission to preload the asset current functional location before relocation', () => {
    expect(assetLocationRoute).toContain("!hasPermission(session, 'assets.functional_locations.view') &&\n      !hasPermission(session, 'assets.functional_locations.assign')");
  });
});
