import { describe, expect, it } from 'vitest';
import {
  buildPmComplianceKpis,
  formatPmCompliancePercentage,
  sortPmComplianceCycles,
} from '@/lib/pm-compliance-view';

describe('PM compliance view model', () => {
  it('shows no percentage when no PM cycles matured instead of inventing 0%', () => {
    expect(formatPmCompliancePercentage(null)).toBe('—');
    expect(formatPmCompliancePercentage(0)).toBe('0%');
    expect(formatPmCompliancePercentage(33.3)).toBe('33.3%');
    expect(formatPmCompliancePercentage(100)).toBe('100%');
  });

  it('keeps overdue and missed KPI labels mapped to the correct summary fields', () => {
    const kpis = buildPmComplianceKpis({
      maturedCycles: 12,
      completed: 8,
      openOverdue: 3,
      missed: 1,
      completionCompliancePct: 66.7,
    });

    expect(kpis).toEqual([
      { key: 'compliance', label: 'Completion Compliance', value: '66.7%' },
      { key: 'matured', label: 'Matured Cycles', value: '12' },
      { key: 'completed', label: 'Completed', value: '8' },
      { key: 'overdue', label: 'Open Overdue', value: '3' },
      { key: 'missed', label: 'Missed', value: '1' },
    ]);
  });

  it('sorts cycle drill-down newest due first without mutating the API response array', () => {
    const cycles = [
      { identity: 'old', dueAt: '2026-09-01T00:00:00.000Z' },
      { identity: 'new', dueAt: '2026-10-20T00:00:00.000Z' },
      { identity: 'middle', dueAt: '2026-10-01T00:00:00.000Z' },
    ];

    const sorted = sortPmComplianceCycles(cycles);

    expect(sorted.map((cycle) => cycle.identity)).toEqual(['new', 'middle', 'old']);
    expect(cycles.map((cycle) => cycle.identity)).toEqual(['old', 'new', 'middle']);
  });
});
