import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function readScript(file: string): string {
  return readFileSync(join(process.cwd(), 'scripts', file), 'utf8');
}

describe('GTP NNI Machine 1 historical commissioning safety', () => {
  it('shares a conservative exclusion predicate between mapper and verifier', () => {
    const helper = readScript('lib/gtp-nni1-history-exclusions.ts');
    const mapper = readScript('commission-gtp-nni1-work-order-components.ts');
    const verifier = readScript('verify-gtp-nni1-work-order-components.ts');

    expect(helper).toContain('EXCLUDED_NNI1_HISTORY');
    expect(helper).toContain('isExcludedNni1HistoryTitle');
    expect(mapper).toContain("from './lib/gtp-nni1-history-exclusions'");
    expect(verifier).toContain("from './lib/gtp-nni1-history-exclusions'");
    expect(mapper).toContain('if (isExcludedNni1HistoryTitle(title)) continue;');
    expect(mapper.indexOf('RULES.filter')).toBeGreaterThan(mapper.indexOf('if (isExcludedNni1HistoryTitle(title)) continue;'));
    expect(verifier).toContain('isExcludedNni1HistoryTitle(link.workOrder.title ||');
    expect(verifier).toContain('noExcludedLinks: excludedLinks.length === 0');
    expect(verifier).toContain('if (failed.length) process.exitCode = 1;');
  });

  it('excludes unrelated history variants without suppressing genuine NNI 1 tasks', () => {
    const helper = readScript('lib/gtp-nni1-history-exclusions.ts');
    const declaration = helper.match(/export const EXCLUDED_NNI1_HISTORY\s*=\s*\/(.+)\/i;/);
    expect(declaration).not.toBeNull();
    const excluded = new RegExp(declaration![1], 'i');

    for (const title of [
      'Repair wall fan near NNI',
      'Wall-mounted fans in passage',
      'Concrete repairs to production floor',
      'Gutter near chemical area',
      'Azoic machine electrical fault',
      'Azoic m/c pump',
      'NNI Machine 2 bearing replacement',
      'NNI 2 fan repair',
    ]) {
      expect(excluded.test(title), title).toBe(true);
    }
    for (const title of [
      'NNI Machine 1 cloth guider defective',
      'NNI 1 infeed compensator adjustment',
      'NNI 1 bearing replacement',
    ]) {
      expect(excluded.test(title), title).toBe(false);
    }
  });

  it('preserves provisional UAT hierarchy and conservative historical thresholds', () => {
    const commissioner = readScript('commission-gtp-nni1-components.ts');
    const hierarchyVerifier = readScript('verify-gtp-nni1-components.ts');
    const mapper = readScript('commission-gtp-nni1-work-order-components.ts');
    const historyVerifier = readScript('verify-gtp-nni1-work-order-components.ts');

    expect(commissioner).toContain("const TAG = 'UAT-GTP-372-1-039'");
    expect(commissioner).toContain("const PREFIX = 'GTP-NNI1'");
    expect(commissioner).toContain('db.$transaction');
    expect(commissioner).toContain('OEM/nameplate/master-data verification');
    expect(hierarchyVerifier).toContain('rows.length === 41');
    expect(hierarchyVerifier).toContain('roots.length === 8');
    expect(mapper).toContain("const DRY_RUN = process.env.DRY_RUN === '1'");
    expect(mapper).toContain('if (!DRY_RUN)');
    expect(mapper).toContain('db.$transaction');
    expect(historyVerifier).toContain('total === 64');
    expect(historyVerifier).toContain('mapped.size >= 50');
    expect(historyVerifier).toContain('links.length >= 78');
  });
});
