import { describe, expect, it } from 'vitest';
import {
  buildPmPortfolioComplianceKpis,
  formatPmPortfolioDelay,
  formatPmPortfolioPercentage,
  takeTopPmPortfolioMachineRisks,
} from '@/lib/pm-portfolio-compliance-view';

describe('PM portfolio compliance view model', () => {
  it('distinguishes no matured-cycle percentage from a real 0% compliance result', () => {
    expect(formatPmPortfolioPercentage(null)).toBe('—');
    expect(formatPmPortfolioPercentage(0)).toBe('0%');
    expect(formatPmPortfolioPercentage(66.7)).toBe('66.7%');
    expect(formatPmPortfolioPercentage(100)).toBe('100%');
  });

  it('maps overdue and missed portfolio counts to the correct KPI labels', () => {
    const kpis = buildPmPortfolioComplianceKpis({
      maturedCycles: 18,
      completed: 12,
      openOverdue: 4,
      missed: 2,
      completionCompliancePct: 66.7,
      machinesWithMaturedCycles: 9,
      machinesWithOpenOverdue: 3,
    });

    expect(kpis).toEqual([
      { key: 'compliance', label: 'Completion Compliance', value: '66.7%' },
      { key: 'matured', label: 'Matured Cycles', value: '18' },
      { key: 'completed', label: 'Completed', value: '12' },
      { key: 'overdue', label: 'Open Overdue', value: '4' },
      { key: 'missed', label: 'Missed', value: '2' },
      { key: 'machinesOverdue', label: 'Machines w/ Overdue', value: '3 / 9' },
    ]);
  });

  it('formats oldest-overdue delays consistently across minutes, hours, and days', () => {
    expect(formatPmPortfolioDelay(null)).toBe('—');
    expect(formatPmPortfolioDelay(45)).toBe('45 min');
    expect(formatPmPortfolioDelay(90)).toBe('1.5 h');
    expect(formatPmPortfolioDelay(2880)).toBe('2 d');
    expect(formatPmPortfolioDelay(3600)).toBe('2.5 d');
  });

  it('preserves deterministic server risk order while limiting the machine table without mutating input', () => {
    const rows = Array.from({ length: 18 }, (_, index) => ({
      assetId: `asset-${index}`,
      assetName: `Risk ${String(index).padStart(2, '0')}`,
    }));

    const top = takeTopPmPortfolioMachineRisks(rows);

    expect(top).toHaveLength(15);
    expect(top.map((row) => row.assetId)).toEqual(Array.from({ length: 15 }, (_, index) => `asset-${index}`));
    expect(rows).toHaveLength(18);
    expect(rows[15].assetId).toBe('asset-15');
  });
});
