import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const authStore = fs.readFileSync('src/stores/authStore.ts', 'utf8');

describe('multi-plant selection persistence', () => {
  it('preserves an explicitly selected authorized plant during fetchMe refresh', () => {
    expect(authStore).toContain('preserveSelectedPlant?: boolean');
    expect(authStore).toContain('localStorage.getItem(LS_PLANT_ID)');
    expect(authStore).toContain('(user.plantAccess || []).some((plant) => plant.id === existingPlantId)');
    expect(authStore).toContain('preserveSelectedPlant: true');
  });

  it('falls back to the server primary plant when the stored plant is no longer authorized', () => {
    expect(authStore).toContain("const selectedPlantId = canKeepExistingPlant ? existingPlantId : (user.plantId || '')");
  });

  it('does not reuse a stale plant selection across an explicit login', () => {
    const loginStart = authStore.indexOf('login: async');
    const loginEnd = authStore.indexOf('logout: async', loginStart);
    const loginBlock = authStore.slice(loginStart, loginEnd);
    expect(loginBlock).toContain('persistAuthData(res.data.user, res.data.permissions);');
    expect(loginBlock).not.toContain('preserveSelectedPlant: true');
  });
});

[executed on device: vps.lightworldtech.com (31ed37c1-850c-4620-b64f-dd66de41fa53)]