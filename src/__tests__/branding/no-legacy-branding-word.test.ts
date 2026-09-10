import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';

const extensions = new Set(['.ts','.tsx','.js','.jsx','.mjs','.cjs','.json','.webmanifest','.html','.css','.svg']);

function files(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) out.push(...files(full));
    else if (extensions.has(extname(full).toLowerCase())) out.push(full);
  }
  return out;
}

describe('runtime branding', () => {
  it('contains no standalone legacy display word', () => {
    const oldWord = 'Enter' + 'prise';
    const pattern = new RegExp(`\\b${oldWord}\\b`);
    const violations = [...files(join(process.cwd(), 'src')), ...files(join(process.cwd(), 'public'))]
      .filter((file) => pattern.test(readFileSync(file, 'utf8')));
    expect(violations).toEqual([]);
  });
});
