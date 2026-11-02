import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('PM schedule filter layout contract', () => {
  const list = source('src/components/modules/pm/PmAssignmentTargetList.tsx');

  it('wraps desktop filters into wider rows instead of forcing eight narrow columns', () => {
    expect(list).toContain('sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6');
    expect(list).not.toContain('xl:grid-cols-8');
    expect(list).toContain('label="Asset" className="xl:col-span-2"');
    expect(list).toContain('label="Part / Target" className="xl:col-span-2"');
    expect(list).toContain('label="Due State" className="xl:col-span-2"');
  });

  it('keeps long selected values inside their filter cell', () => {
    expect(list).toContain("className={`min-w-0 ${className}`}");
    expect(list).toContain('w-full min-w-0 overflow-hidden');
    expect(list).toContain('[&>span]:truncate');
  });
});
