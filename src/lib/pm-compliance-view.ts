export interface PmComplianceSummaryView {
  maturedCycles: number;
  completed: number;
  openOverdue: number;
  missed: number;
  completionCompliancePct: number | null;
}

export interface PmComplianceKpi {
  key: 'compliance' | 'matured' | 'completed' | 'overdue' | 'missed';
  label: string;
  value: string;
}

export function formatPmCompliancePercentage(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${value}%`;
}

export function buildPmComplianceKpis(summary: PmComplianceSummaryView): PmComplianceKpi[] {
  return [
    { key: 'compliance', label: 'Completion Compliance', value: formatPmCompliancePercentage(summary.completionCompliancePct) },
    { key: 'matured', label: 'Matured Cycles', value: String(summary.maturedCycles) },
    { key: 'completed', label: 'Completed', value: String(summary.completed) },
    { key: 'overdue', label: 'Open Overdue', value: String(summary.openOverdue) },
    { key: 'missed', label: 'Missed', value: String(summary.missed) },
  ];
}

export function sortPmComplianceCycles<T extends { dueAt: string }>(cycles: readonly T[]): T[] {
  return [...cycles].sort((left, right) => {
    const leftAt = new Date(left.dueAt).getTime();
    const rightAt = new Date(right.dueAt).getTime();
    const safeLeft = Number.isFinite(leftAt) ? leftAt : 0;
    const safeRight = Number.isFinite(rightAt) ? rightAt : 0;
    return safeRight - safeLeft;
  });
}
