import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const collectionRoute = readFileSync(
  join(process.cwd(), 'src/app/api/assets/route.ts'),
  'utf8',
);
const itemRoute = readFileSync(
  join(process.cwd(), 'src/app/api/assets/[id]/route.ts'),
  'utf8',
);

describe('Asset collection plant boundary contract', () => {
  it('uses strict plant access rather than the lenient null-plant helper', () => {
    expect(collectionRoute).toContain('canAccessPlantStrict');
    expect(collectionRoute).not.toContain('canAccessPlant(');
  });

  it('applies resolved plant scope when no explicit plant query is supplied', () => {
    expect(collectionRoute).toContain('applyPlantScope(where, plantScope)');
  });

  it('rejects an inaccessible plantId query instead of trusting the query parameter', () => {
    expect(collectionRoute).toContain('!canAccessPlantStrict(plantScope, searchPlantId)');
    expect(collectionRoute).toContain("error: 'Access denied'");
  });

  it('requires create permission plus access to the target plant', () => {
    expect(collectionRoute).toContain("hasPermission(session, 'assets.create')");
    expect(collectionRoute).toContain('!canAccessPlantStrict(plantScope, plantId)');
    expect(collectionRoute).toContain("error: 'Access denied for target plant'");
  });

  it('rejects cross-plant parent hierarchy during creation', () => {
    expect(collectionRoute).toContain('parent.plantId !== plantId');
    expect(collectionRoute).toContain('Parent asset must belong to the same plant');
  });
});

describe('Asset direct route plant boundary contract', () => {
  it('uses strict plant checks for direct asset access', () => {
    expect(itemRoute).toContain('canAccessPlantStrict');
    expect(itemRoute).not.toContain('canAccessPlant(');
  });

  it('checks the existing asset plant before update or delete', () => {
    const existingChecks = itemRoute.match(
      /!canAccessPlantStrict\(plantScope, existing\.plantId\)/g,
    ) ?? [];
    expect(existingChecks.length).toBeGreaterThanOrEqual(2);
  });

  it('checks the destination plant before an asset move', () => {
    expect(itemRoute).toContain('!canAccessPlantStrict(plantScope, targetPlantId)');
    expect(itemRoute).toContain("error: 'Access denied for target plant'");
  });

  it('keeps plantId mandatory instead of allowing an update to null it', () => {
    expect(itemRoute).toContain("error: 'Plant is required'");
    expect(itemRoute).toContain('updateData.plantId = targetPlantId');
    expect(itemRoute).not.toContain("const fkFields = ['categoryId', 'plantId'");
  });

  it('rejects parent links and moves that would cross plant boundaries', () => {
    expect(itemRoute).toContain('parent.plantId !== targetPlantId');
    expect(itemRoute).toContain('Parent asset must belong to the same plant');
    expect(itemRoute).toContain('Move would create a cross-plant asset hierarchy');
  });
});
