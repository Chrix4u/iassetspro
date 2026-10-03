import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('global plant context selector contract', () => {
  it('renders a real active-plant selector and persists plant context through reload', () => {
    const app = fs.readFileSync(
      path.join(process.cwd(), 'src/components/EAMApp.tsx'),
      'utf8',
    );
    const auth = fs.readFileSync(
      path.join(process.cwd(), 'src/stores/authStore.ts'),
      'utf8',
    );

    expect(app).toContain('aria-label="Active plant"');
    expect(app).toContain("api.get<Plant[]>('/api/plants')");
    expect(app).toContain("localStorage.setItem('user_plant_id', plantId)");
    expect(app).toContain('window.location.reload()');
    expect(app).toContain('plant.code} · {plant.name');

    expect(auth).toContain("role.slug === 'admin'");
    expect(auth).toContain('isSystemAdmin ||');
  });
});
