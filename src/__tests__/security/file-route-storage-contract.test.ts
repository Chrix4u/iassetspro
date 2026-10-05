import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

const route = readFileSync(join(process.cwd(), 'src/app/api/files/[...path]/route.ts'), 'utf8');

describe('file route storage boundary', () => {
  it('returns Web-compatible bytes for downloads', () => {
    expect(route).toContain('new Uint8Array(result.buffer)');
  });

  it('maps invalid storage keys to a client error', () => {
    expect(route).toContain('error instanceof InvalidStorageKeyError');
    expect(route).toContain("error: 'Invalid file path'");
    expect(route).toContain('{ status: 400 }');
  });
});
