import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('hash deep-link navigation synchronization', () => {
  it('keeps the SPA navigation store aligned with direct URL hash changes and deep links', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'src/stores/navigationStore.ts'),
      'utf8',
    );

    expect(source).toContain("window.addEventListener('hashchange'");
    expect(source).toContain('const syncFromHash = () =>');
    expect(source).toContain('const parsed = parseHash()');
    expect(source).toContain('currentPage: parsed.page');
    expect(source).toContain('pageParams: parsed.params');
  });
});
