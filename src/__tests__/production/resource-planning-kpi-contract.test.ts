import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('production KPI render safety', () => {
  it('does not inject the Minus icon component as a standalone KPI record', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'src/components/modules/ProductionPages.tsx'),
      'utf8',
    );

    const standaloneMinusEntries = source.match(/^\s*Minus,\s*$/gm) ?? [];

    expect(standaloneMinusEntries).toHaveLength(0);
    expect(source).toContain('<Minus className="h-4 w-4 text-slate-400" />');
  });
});
