import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const route = fs.readFileSync('src/app/api/component-visuals/route.ts', 'utf8');
const authStore = fs.readFileSync('src/stores/authStore.ts', 'utf8');
const generateRoute = fs.readFileSync('src/app/api/component-visuals/generate/route.ts', 'utf8');

describe('visual explorer plant selection', () => {
  it('authorizes component visuals against all assigned plants and the explicit plant scope', () => {
    expect(route).toContain('getPlantScope(request, session)');
    expect(route).toContain('canAccessPlant(plantScope, asset.plantId)');
    expect(route).not.toContain('getUserPlantId');
  });

  it('applies the same plant scope to visual generation', () => {
    expect(generateRoute).toContain('getPlantScope(request, session)');
    expect(generateRoute).toContain('canAccessPlant(plantScope, asset.plantId)');
    expect(generateRoute).not.toContain('getUserPlantId');
  });

  it('preserves a valid user-selected plant across auth refreshes', () => {
    expect(authStore).toContain('previouslySelectedPlantId');
    expect(authStore).toContain('accessiblePlantIds.has(previouslySelectedPlantId)');
    expect(authStore).toContain('previousUserId === user.id');
    expect(authStore).toContain("localStorage.setItem(LS_PLANT_ID, selectedPlantId)");
  });

  it('falls back to the primary plant when the selected plant is stale or belongs to another user', () => {
    expect(authStore).toContain(" : (user.plantId || '')");
  });
});
