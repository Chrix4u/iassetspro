import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('hash deep-link navigation synchronization', () => {
  it('keeps navigation state aligned when the URL hash changes without a reload', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'src/stores/navigationStore.ts'),
      'utf8',
    );

    expect(source).toContain("window.addEventListener('hashchange'");
    expect(source).toContain('const syncFromHash = () =>');
    expect(source).toContain('const parsed = parseHash()');
    expect(source).toContain('currentPage: parsed.page');
    expect(source).toContain('pageParams: parsed.params');
    expect(source).toContain('const hashRoute = parseHash()');
    expect(source).toContain('currentPage: hashRoute.page');
    expect(source).toContain('pageParams: hashRoute.params');
    expect(source).toContain('window.history.replaceState');
  });
});
