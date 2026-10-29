export interface PmPortfolioComplianceSummaryView {
  maturedCycles: number;
  completed: number;
  openOverdue: number;
  missed: number;
  completionCompliancePct: number | null;
  machinesWithMaturedCycles: number;
  machinesWithOpenOverdue: number;
}

export interface PmPortfolioComplianceKpi {
  key: 'compliance' | 'matured' | 'completed' | 'overdue' | 'missed' | 'machinesOverdue';
  label: string;
  value: string;
}

export function formatPmPortfolioPercentage(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${value}%`;
}

export function formatPmPortfolioDelay(minutes: number | null): string {
  if (minutes == null || !Number.isFinite(minutes)) return '—';
  if (minutes >= 1440) return `${Math.round((minutes / 1440) * 10) / 10} d`;
  if (minutes >= 60) return `${Math.round((minutes / 60) * 10) / 10} h`;
  return `${Math.round(minutes)} min`;
}

export function buildPmPortfolioComplianceKpis(
  summary: PmPortfolioComplianceSummaryView,
): PmPortfolioComplianceKpi[] {
  return [
    { key: 'compliance', label: 'Completion Compliance', value: formatPmPortfolioPercentage(summary.completionCompliancePct) },
    { key: 'matured', label: 'Matured Cycles', value: String(summary.maturedCycles) },
    { key: 'completed', label: 'Completed', value: String(summary.completed) },
    { key: 'overdue', label: 'Open Overdue', value: String(summary.openOverdue) },
    { key: 'missed', label: 'Missed', value: String(summary.missed) },
    {
      key: 'machinesOverdue',
      label: 'Machines w/ Overdue',
      value: `${summary.machinesWithOpenOverdue} / ${summary.machinesWithMaturedCycles}`,
    },
  ];
}

export function takeTopPmPortfolioMachineRisks<T>(rows: readonly T[], limit = 15): T[] {
  return rows.slice(0, Math.max(0, Math.trunc(limit)));
}
