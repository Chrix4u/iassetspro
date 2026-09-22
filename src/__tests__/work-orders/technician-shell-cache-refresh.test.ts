import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8');

describe('technician shell cache refresh', () => {
  it('bumps the app-shell cache after technician resource auth fixes', () => {
    const sw = read('public/sw.js');
    expect(sw).toContain("const CACHE_NAME = `${CACHE_PREFIX}v2`");
    expect(sw).toContain("name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME");
  });

  it('never caches API responses', () => {
    const sw = read('public/sw.js');
    expect(sw).toContain("if (url.pathname.startsWith('/api/')) return");
  });
});
