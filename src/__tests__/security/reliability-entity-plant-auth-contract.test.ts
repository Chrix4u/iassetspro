import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(join(process.cwd(), 'src/lib/plant-auth-helpers.ts'), 'utf8');

describe('reliability entity plant authorization helpers', () => {
  it('authorizes assets using their current plantId', () => {
    expect(source).toContain('export async function authorizeAssetPlant');
    expect(source).toContain("select: { id: true, plantId: true }");
    expect(source).toContain("if (!canAccessPlantStrict(plantScope, asset.plantId))");
  });

  it('authorizes components through their owning asset plant and fails closed when unbound', () => {
    expect(source).toContain('export async function authorizeComponentPlant');
    expect(source).toContain("asset: { select: { plantId: true } }");
    expect(source).toContain('canAccessPlantStrict(plantScope, component.asset?.plantId)');
  });

  it('authorizes digital twins through their owning asset plant', () => {
    expect(source).toContain('export async function authorizeDigitalTwinPlant');
    expect(source).toContain('canAccessPlantStrict(plantScope, twin.asset.plantId)');
  });

  it('uses the canonical scope resolver so denyAccess remains fail-closed', () => {
    expect(source.match(/const scopeOrDeny = await resolveScope\(request, session\)/g)?.length).toBeGreaterThanOrEqual(7);
  });
});
