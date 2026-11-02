import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('GTP Stenter 6 work-order mapping safety', () => {
  it('excludes known cross-machine/facility assignments before component rules run', () => {
    const script = fs.readFileSync('scripts/commission-gtp-stenter6-work-order-components.ts', 'utf8');

    expect(script).toContain("const EXCLUDE=/stenter 5|steamer|water dispenser|main gate/i;");
    expect(script).toContain('if(EXCLUDE.test(title))continue;');
    expect(script).toContain('const ms=RULES.filter(r=>r.re.test(title));');
    expect(script.indexOf('if(EXCLUDE.test(title))continue;'))
      .toBeLessThan(script.indexOf('const ms=RULES.filter(r=>r.re.test(title));'));
  });

  it('makes the production verifier fail when excluded provenance links exist', () => {
    const verifier = fs.readFileSync('scripts/verify-gtp-stenter6-work-order-components.ts', 'utf8');

    expect(verifier).toContain('const crossMachineLinks=links.filter');
    expect(verifier).toContain('/stenter 5|steamer|water dispenser|main gate/i');
    expect(verifier).toContain('noCrossMachineLinks:crossMachineLinks.length===0');
    expect(verifier).toContain('crossMachineLinks:crossMachineLinks.map');
  });
});
