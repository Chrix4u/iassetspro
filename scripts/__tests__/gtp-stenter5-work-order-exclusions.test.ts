import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('GTP Stenter 5 work-order mapping safety', () => {
  it('excludes known cross-machine/facility assignments before component rules run', () => {
    const script = fs.readFileSync('scripts/commission-gtp-stenter5-work-order-components.ts', 'utf8');

    expect(script).toContain("const EXCLUDE = /stenter 6|air condition|wood(?:in|en)? plat(?:foam|form)|wood(?:in|en)? pallets?|chemical trolley/i;");
    expect(script).toContain('if (EXCLUDE.test(title)) continue;');
    expect(script).toContain('const matches = RULES.filter((rule) => rule.re.test(title));');
    expect(script.indexOf('if (EXCLUDE.test(title)) continue;'))
      .toBeLessThan(script.indexOf('const matches = RULES.filter((rule) => rule.re.test(title));'));
  });

  it('makes the production verifier fail when excluded provenance links exist', () => {
    const verifier = fs.readFileSync('scripts/verify-gtp-stenter5-work-order-components.ts', 'utf8');

    expect(verifier).toContain('const crossMachineLinks = links.filter');
    expect(verifier).toContain('/stenter 6|air condition|wood(?:in|en)? plat(?:foam|form)|wood(?:in|en)? pallets?|chemical trolley/i');
    expect(verifier).toContain('noCrossMachineLinks: crossMachineLinks.length === 0');
    expect(verifier).toContain('crossMachineLinks: crossMachineLinks.map');
    expect(verifier).toContain('&& crossMachineLinks.length === 0');
  });
});
