import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

describe('RWOP legacy lifecycle import guard', () => {
  it('excludes test-only imports while retaining production-call protection', async () => {
    const source = await readFile(
      join(process.cwd(), 'scripts/check-rwop-legacy-lifecycle-imports.ts'),
      'utf8',
    );

    expect(source).toContain("const TEST_DIRECTORY = '__tests__';");
    expect(source).toContain('TEST_FILE_PATTERN');
    expect(source).toContain('entry.name === TEST_DIRECTORY');
    expect(source).toContain('!TEST_FILE_PATTERN.test(entry.name)');
    expect(source).toContain("const LEGACY_FILE = 'src/services/workExecution.service.ts';");
  });
});
