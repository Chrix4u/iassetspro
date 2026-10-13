import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  join(process.cwd(), 'src', 'components', 'modules', 'AssetPages.tsx'),
  'utf8',
);

describe('Asset Register action responsiveness', () => {
  it('lets header actions share the phone width and return to natural sizing on larger screens', () => {
    expect(source).toContain("className='flex w-full flex-wrap gap-2 sm:w-auto'");
    expect(source).toContain("className='flex-1 bg-emerald-600 hover:bg-emerald-700 text-white sm:flex-none'");
    expect(source).toContain("className='flex-1 border-violet-300 text-violet-700 hover:bg-violet-50 dark:border-violet-700 dark:text-violet-400 dark:hover:bg-violet-950/30 gap-1.5 sm:flex-none'");
  });

  it('marks the sub-component toggle as a shared responsive filter control', () => {
    expect(source).toContain('className="filter-row-checkbox flex items-center gap-2 ml-auto"');
  });
});
