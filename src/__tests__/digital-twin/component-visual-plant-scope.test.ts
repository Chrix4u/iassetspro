import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const visualsRoute = fs.readFileSync('src/app/api/component-visuals/route.ts', 'utf8');
const generateRoute = fs.readFileSync('src/app/api/component-visuals/generate/route.ts', 'utf8');

describe('component visual multi-plant scope', () => {
  it('uses the request plant scope for visual reads and writes', () => {
    expect(visualsRoute).toContain("from '@/lib/plant-scope'");
    expect(visualsRoute).toContain('getPlantScope(request, session)');
    expect(visualsRoute).toContain('canAccessPlantStrict(plantScope, asset.plantId)');
    expect(visualsRoute).not.toContain('getUserPlantId');
  });

  it('uses the selected authorized plant for AI visual generation', () => {
    expect(generateRoute).toContain("from '@/lib/plant-scope'");
    expect(generateRoute).toContain('getPlantScope(request, session)');
    expect(generateRoute).toContain('canAccessPlantStrict(plantScope, asset.plantId)');
    expect(generateRoute).not.toContain('getUserPlantId');
  });
});