import { parseInspectionLimits } from '@/lib/pm-inspection';
import type { MachineChecklistGroup, MachineChecklistTask } from '@/lib/pm-machine-checklist';

export interface PrintableMachineInspectionData {
  machine: { id: string; name: string; assetTag: string; plantId: string };
  equipmentState: 'running' | 'standstill';
  generatedAt: string;
  totalAssignments: number;
  totalConfiguredPoints: number;
  unconfiguredTasks: number;
  groups: MachineChecklistGroup[];
  generalTasks: MachineChecklistTask[];
}

export interface PrintableMachineInspectionRow {
  id: string;
  partCode: string;
  partName: string;
  assignedTasks: string;
  checkName: string;
  method: string;
  reference: string;
  actual: string;
  outcome: string;
  remarks: string;
  recordedAt: string;
  recordedState: 'running' | 'standstill' | 'unknown';
  correctiveWorkOrder: string;
  requiresConfiguration: boolean;
}

function taskText(task: MachineChecklistTask): string {
  return `#${task.pmTask.taskNumber} ${task.pmTask.description}`;
}

function formatDateTime(dateValue: string | Date | null): string {
  if (!dateValue) return '';
  const date = new Date(dateValue);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString();
}

/**
 * A printable snapshot of the latest SAVED records. Never present unsaved
 * form inputs, an unknown parameter range, or a blank check as a passing result.
 * Values from different rows may have different inspection timestamps.
 */
export function buildMachineInspectionPrintRows(
  data: PrintableMachineInspectionData,
): PrintableMachineInspectionRow[] {
  const rows: PrintableMachineInspectionRow[] = [];
  for (const group of data.groups) {
    const assignedTasks = group.tasks.map(taskText).join('; ');
    if (group.points.length === 0) {
      rows.push({
        id: `unconfigured-${group.component.id}`,
        partCode: group.component.componentCode,
        partName: group.component.name,
        assignedTasks,
        checkName: 'Inspection point not configured',
        method: '—',
        reference: 'Requires planner setup',
        actual: '', outcome: 'UNCONFIGURED', remarks: '', recordedAt: '',
        recordedState: 'unknown', correctiveWorkOrder: '', requiresConfiguration: true,
      });
    }

    for (const point of group.points) {
      const limits = parseInspectionLimits(point.normalRange);
      const reference = point.inspectionType === 'measurement'
        ? (limits.min === null && limits.max === null
          ? 'Numeric limits NOT SET'
          : `${limits.min ?? '—'} – ${limits.max ?? '—'} ${limits.unit || ''}`.trim())
        : point.inspectionType === 'visual'
          ? 'Sight / qualitative observation'
          : 'Legacy method — reconfigure';
      const record = point.latestRecord;
      const actual = !record ? '' :
        point.inspectionType === 'measurement'
          ? `${record.value ?? ''}${record.value !== null && record.value !== '' && limits.unit ? ` ${limits.unit}` : ''}`
          : (record.findings || record.value || '');
      rows.push({
        id: point.id,
        partCode: group.component.componentCode,
        partName: group.component.name,
        assignedTasks,
        checkName: point.name,
        method: point.inspectionType,
        reference,
        actual,
        outcome: record?.result.toUpperCase().replace(/_/g, ' ') || 'NOT RECORDED',
        remarks: record?.findings || '',
        recordedAt: record ? formatDateTime(record.inspectedAt) : '',
        recordedState: record?.equipmentState === 'running' || record?.equipmentState === 'standstill'
          ? record.equipmentState : 'unknown',
        correctiveWorkOrder: point.openCorrectiveWorkOrder
          ? `${point.openCorrectiveWorkOrder.woNumber} (${point.openCorrectiveWorkOrder.status})`
          : '',
        requiresConfiguration: point.inspectionType !== 'visual' && point.inspectionType !== 'measurement',
      });
    }
  }

  for (const task of data.generalTasks) {
    rows.push({
      id: `general-${task.id}`,
      partCode: 'UNASSIGNED',
      partName: 'Machine-wide task',
      assignedTasks: taskText(task),
      checkName: 'Assign to exact part and configure inspection point',
      method: '—',
      reference: 'Requires planner setup',
      actual: '', outcome: 'UNCONFIGURED', remarks: '', recordedAt: '',
      recordedState: 'unknown', correctiveWorkOrder: '', requiresConfiguration: true,
    });
  }
  return rows;
}

export function machineInspectionPrintSummary(rows: PrintableMachineInspectionRow[]) {
  const recorded = rows.filter(row =>
    row.outcome !== 'NOT RECORDED' && !row.requiresConfiguration);
  return {
    checks: rows.filter(row => !row.requiresConfiguration).length,
    recorded: recorded.length,
    normal: recorded.filter(row => row.outcome === 'PASS').length,
    abnormal: recorded.filter(row => row.outcome !== 'PASS').length,
    unconfigured: rows.filter(row => row.requiresConfiguration).length,
  };
}
