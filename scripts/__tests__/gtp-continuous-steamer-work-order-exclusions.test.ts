import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (name: string) => readFileSync(join(process.cwd(), 'scripts', name), 'utf8');

describe('GTP Continuous Steamer UAT history mapping safeguards', () => {
  it('shares one pre-rule-matching exclusion predicate across mapper and verifier', () => {
    const helper = source('lib/gtp-continuous-steamer-history-exclusions.ts');
    const mapper = source('commission-gtp-continuous-steamer-work-order-components.ts');
    const verifier = source('verify-gtp-continuous-steamer-work-order-components.ts');

    expect(helper).toContain('EXCLUDED_CST_HISTORY');
    expect(helper).toContain('isExcludedContinuousSteamerHistoryTitle');
    expect(mapper).toContain("from './lib/gtp-continuous-steamer-history-exclusions'");
    expect(verifier).toContain("from './lib/gtp-continuous-steamer-history-exclusions'");
    expect(mapper).toContain('if (isExcludedContinuousSteamerHistoryTitle(title)) continue;');
    expect(mapper.indexOf('RULES.filter')).toBeGreaterThan(mapper.indexOf('if (isExcludedContinuousSteamerHistoryTitle(title)) continue;'));
    expect(verifier).toContain('isExcludedContinuousSteamerHistoryTitle(link.workOrder.title ||');
    expect(verifier).toContain('noExcludedLinks: excludedLinks.length === 0');
    expect(verifier).toContain('noForeignComponentLinks: foreignComponentLinks.length === 0');
    expect(verifier).toContain('if (failed.length) process.exitCode = 1;');
  });

  it('excludes other machines but retains genuine steamer work', () => {
    const helper = source('lib/gtp-continuous-steamer-history-exclusions.ts');
    const declaration = helper.match(/export const EXCLUDED_CST_HISTORY\s*=\s*\/(.+)\/i;/);
    expect(declaration).not.toBeNull();
    const excluded = new RegExp(declaration![1], 'i');
    for (const title of [
      'Drying range fan replacement',
      'Drying-range roller repair',
      'Stenter 6 bearing fault',
      'Stenter 5 chemical pump repair',
      'NNI Machine 1 valve replacement',
      'Azoic machine bearing repair',
    ]) expect(excluded.test(title), title).toBe(true);

    for (const title of [
      'Continuous Steamer steam trap replacement',
      'Steamer 1 valve leaking',
      'Steam supply pressure loss',
    ]) expect(excluded.test(title), title).toBe(false);
  });

  it('preserves UAT asset scope, provisional hierarchy and historical coverage thresholds', () => {
    const commissioner = source('commission-gtp-continuous-steamer-components.ts');
    const hierarchyVerifier = source('verify-gtp-continuous-steamer-components.ts');
    const mapper = source('commission-gtp-continuous-steamer-work-order-components.ts');
    const historyVerifier = source('verify-gtp-continuous-steamer-work-order-components.ts');

    expect(commissioner).toContain("const TAG = 'UAT-GTP-333-1-005'");
    expect(commissioner).toContain("const PREFIX = 'GTP-CST'");
    expect(commissioner).toContain('db.$transaction');
    expect(hierarchyVerifier).toContain('rows.length === 53');
    expect(hierarchyVerifier).toContain('roots.length === 9');
    expect(mapper).toContain("const DRY_RUN = process.env.DRY_RUN === '1'");
    expect(mapper).toContain('if (!DRY_RUN)');
    expect(historyVerifier).toContain('total === 74');
    expect(historyVerifier).toContain('mapped.size >= 66');
    expect(historyVerifier).toContain('links.length >= 89');
  });
});
