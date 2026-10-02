import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Stenter 6 commissioning script source contract', () => {
  it('keeps work-order mapping rules as valid TypeScript source', () => {
    const script = fs.readFileSync('scripts/commission-gtp-stenter6-work-order-components.ts', 'utf8');

    // Regression for an escaped newline that was accidentally committed as
    // literal source text and caused tsx/esbuild to fail before commissioning.
    expect(script).not.toContain('},\\n {key:');
    expect(script).toContain("{key:'yard',code:'INS-YARD',re:/yards? counter/i},\n {key:'pin-roller'");
    expect(script).toContain("{key:'electrical',code:'PRT-ELEC-CABLE',re:/electrical cables?/i},\n {key:'infeed-light'");
  });
});
