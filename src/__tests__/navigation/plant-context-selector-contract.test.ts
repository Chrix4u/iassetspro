import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('app shell plant context selector', () => {
  it('lets admins and multi-plant users switch the API plant scope explicitly', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'src/components/EAMApp.tsx'),
      'utf8',
    );

    expect(source).toContain('aria-label="Active plant"');
    expect(source).toContain("localStorage.getItem('user_plant_id')");
    expect(source).toContain("localStorage.setItem('user_plant_id', plantId)");
    expect(source).toContain('value="__all__">All accessible plants');
    expect(source).toContain('plantAccess.map((plant)');
    expect(source).toContain('window.location.reload()');
  });
});
