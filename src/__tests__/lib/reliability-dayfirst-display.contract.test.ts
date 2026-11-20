import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const source = readFileSync('src/components/modules/ReliabilityEngineeringPage.tsx', 'utf8');

describe('Reliability Engineering date display policy', () => {
  it('uses centralized day-first formatting for visible reliability dates', () => {
    expect(source).toContain('formatUiDate(selectedMode.createdAt)');
    expect(source).toContain('formatUiDate(a.analysisDate)');
    expect(source).toContain('formatUiDate(a.analyzedAt)');
    expect(source).toContain('formatUiDate(a.periodStart)');
    expect(source).toContain('formatUiDate(a.periodEnd)');
    expect(source).toContain('formatUiDateTime(rulData.lastUpdated)');
    expect(source).not.toMatch(/new Date\([^)]*\)\.toLocale(?:DateString|String)\(/);
  });
});
