import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('GTP Singeing work-order mapping safety', () => {
  it('excludes known cross-machine historical assignments before component rules run', () => {
    const script = fs.readFileSync('scripts/commission-gtp-singeing-work-order-components.ts', 'utf8');

    expect(script).toContain("const EXCLUDE=/silicate machine|nova jet 3000|engraving/i;");
    expect(script).toContain("if(EXCLUDE.test(title)){excluded++;continue;}const ms=RULES.filter");
    expect(script).toContain('excludedWorkOrders:excluded');
  });
});
