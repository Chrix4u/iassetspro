import { parseInspectionLimits } from '@/lib/pm-inspection';
import type { MachineChecklistGroup, MachineChecklistTask } from '@/lib/pm-machine-checklist';

export type MachineInspectionSetupIssue = {
  kind: 'assign_part' | 'add_check' | 'unsupported_method' | 'missing_parameter' | 'missing_limits';
  severity: 'blocker' | 'warning';
  componentId: string | null;
  pointId: string | null;
  label: string;
};

export function assessMachineInspectionReadiness(
  groups: MachineChecklistGroup[],
  generalTasks: MachineChecklistTask[],
): {
  readyPoints: number;
  blockers: number;
  warnings: number;
  issues: MachineInspectionSetupIssue[];
} {
  const issues: MachineInspectionSetupIssue[] = [];
  let readyPoints = 0;
  for (const task of generalTasks) {
    issues.push({
      kind: 'assign_part', severity: 'blocker', componentId: null, pointId: null,
      label: 'Task #' + task.pmTask.taskNumber + ': assign the exact machine part in PM Planning.',
    });
  }
  for (const group of groups) {
    if (!group.points.length) {
      issues.push({
        kind: 'add_check', severity: 'blocker', componentId: group.component.id, pointId: null,
        label: group.component.componentCode + ': configure a sight or instrument inspection point.',
      });
      continue;
    }
    for (const point of group.points) {
      const reference = group.component.componentCode + ' / ' + point.name;
      if (!['visual', 'measurement'].includes(point.inspectionType)) {
        issues.push({
          kind: 'unsupported_method', severity: 'blocker', componentId: group.component.id,
          pointId: point.id, label: reference + ': replace unsupported inspection method.',
        });
        continue;
      }
      if (point.inspectionType === 'measurement' && !point.parameterKey?.trim()) {
        issues.push({
          kind: 'missing_parameter', severity: 'blocker', componentId: group.component.id,
          pointId: point.id, label: reference + ': configure the measurement parameter.',
        });
        continue;
      }
      readyPoints += 1;
      if (point.inspectionType === 'measurement') {
        const limits = parseInspectionLimits(point.normalRange);
        if (limits.min === null && limits.max === null) {
          issues.push({
            kind: 'missing_limits', severity: 'warning', componentId: group.component.id,
            pointId: point.id,
            label: reference + ': numeric limits missing; automatic out-of-range detection is unavailable.',
          });
        }
      }
    }
  }
  return {
    readyPoints,
    blockers: issues.filter((issue) => issue.severity === 'blocker').length,
    warnings: issues.filter((issue) => issue.severity === 'warning').length,
    issues,
  };
}
