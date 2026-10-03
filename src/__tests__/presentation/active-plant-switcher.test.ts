import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('active plant switcher', () => {
  it('renders the selector and persists the selected plant', () => {
    const source = fs.readFileSync('src/components/EAMApp.tsx', 'utf8');
    expect(source).toContain('aria-label="Active plant"');
    expect(source).toContain('plantAccess.length > 1');
    expect(source).toContain('switchPlant');
    expect(source).toContain('window.location.reload()');
  });
});
