import { parseInspectionLimits } from '@/lib/pm-inspection';
import type { MachineChecklistGroup, MachineChecklistTask } from '@/lib/pm-machine-checklist';
import { inspectionPointsForTask, type InspectionTaskPointLink } from '@/lib/pm-task-point-scope';
import { pmAssignmentDueLabel } from '@/lib/pm-early-field-inspection';

export interface PaperInspectionHierarchyNode {
  id: string;
  code: string;
  name: string;
  type: string;
}
export interface PaperInspectionRow {
  id: string;
  pointId: string | null;
  partId: string | null;
  partCode: string;
  partName: string;
  scheduledDue: string;
  hierarchy: PaperInspectionHierarchyNode[];
  checkName: string;
  parameter: string;
  method: string;
  acceptedRange: string;
  unit: string;
  requiresConfiguration: boolean;
  configurationNote: string;
}
export interface PaperInspectionTask {
  id: string;
  number: number;
  instruction: string;
  rows: PaperInspectionRow[];
}

/** Mirrors the engineer's paper layout: one task followed by EVERY assigned part.
 * An inspection point assigned to two PM tasks appears under both instructions.
 * No latest saved value is copied onto a blank field worksheet.
 */
export function buildPaperInspectionTasks(
  groups: MachineChecklistGroup[],
  generalTasks: MachineChecklistTask[],
  explicitTaskPointLinks: readonly InspectionTaskPointLink[] = [],
): PaperInspectionTask[] {
  const sections = new Map<string, PaperInspectionTask>();
  const seen = new Set<string>();
  const getSection = (task: MachineChecklistTask) => {
    let section = sections.get(task.pmTask.id);
    if (!section) {
      section = { id: task.pmTask.id, number: task.pmTask.taskNumber,
        instruction: task.pmTask.description, rows: [] };
      sections.set(section.id, section);
    }
    return section;
  };
  for (const group of groups) {
    const hierarchy: PaperInspectionHierarchyNode[] = group.component.hierarchyPath?.length
      ? group.component.hierarchyPath
      : [{ id: group.component.id, code: group.component.componentCode,
          name: group.component.name, type: group.component.componentType }];
    for (const task of group.tasks) {
      const section = getSection(task);
      const scoped = inspectionPointsForTask(group, task.pmTask.id, explicitTaskPointLinks);
      if (!scoped.points.length) {
        const unique = [section.id, group.component.id, 'unconfigured'].join(':');
        if (seen.has(unique)) continue;
        seen.add(unique);
        section.rows.push({
          id: unique, pointId: null, partId: group.component.id,
          partCode: group.component.componentCode, partName: group.component.name,
          scheduledDue: pmAssignmentDueLabel(task), hierarchy,
          checkName: scoped.mappingRequired ? 'Task/check mapping not configured' : 'Inspection point not configured',
          parameter: '—', method: '—', acceptedRange: '—', unit: '',
          requiresConfiguration: true,
          configurationNote: scoped.mappingRequired
            ? 'Planner must assign the exact configured checks to this task on this part.'
            : 'Planner must define sight or instrument check before electronic entry.',
        });
      }
      for (const point of scoped.points) {
        const unique = [section.id, group.component.id, point.id].join(':');
        if (seen.has(unique)) continue;
        seen.add(unique);
        const validMethod = point.inspectionType === 'visual' || point.inspectionType === 'measurement';
        const hasParameter = point.inspectionType !== 'measurement' || Boolean(point.parameterKey?.trim());
        const reference = parseInspectionLimits(point.normalRange);
        const missingLimits = point.inspectionType === 'measurement'
          && reference.min === null && reference.max === null;
        const acceptedRange = point.inspectionType === 'visual'
          ? 'Describe sight / sound observation'
          : missingLimits ? 'Limits NOT CONFIGURED'
            : String(reference.min ?? '—') + ' to ' + String(reference.max ?? '—');
        section.rows.push({
          id: unique, pointId: point.id, partId: group.component.id,
          partCode: group.component.componentCode, partName: group.component.name,
          scheduledDue: pmAssignmentDueLabel(task), hierarchy,
          checkName: point.name,
          parameter: point.parameterKey || (point.inspectionType === 'visual' ? 'Qualitative observation' : '—'),
          method: point.inspectionType === 'measurement' ? 'Instrument'
            : point.inspectionType === 'visual' ? 'Sight / sound' : 'Unsupported',
          acceptedRange, unit: reference.unit || '',
          requiresConfiguration: !validMethod || !hasParameter,
          configurationNote: !validMethod ? 'Planner must replace unsupported inspection method.'
            : !hasParameter ? 'Planner must configure instrument parameter.'
              : missingLimits ? 'No numeric limits: manual assessment required.' : '',
        });
      }
    }
  }
  for (const task of generalTasks) {
    const section = getSection(task);
    const unique = [section.id, task.id, 'unassigned'].join(':');
    if (seen.has(unique)) continue;
    seen.add(unique);
    section.rows.push({
      id: unique, pointId: null, partId: null,
      partCode: 'MACHINE-WIDE', partName: 'Part assignment required',
      scheduledDue: pmAssignmentDueLabel(task),
      hierarchy: [], checkName: task.pmTask.description,
      parameter: '—', method: '—', acceptedRange: '—', unit: '',
      requiresConfiguration: true,
      configurationNote: 'Assign exact component and an inspection point before electronic entry.',
    });
  }
  const result = [...sections.values()].sort(
    (a, b) => a.number - b.number || a.instruction.localeCompare(b.instruction),
  );
  for (const section of result) {
    section.rows.sort((a, b) =>
      a.hierarchy.map((h) => h.code).join('/').localeCompare(b.hierarchy.map((h) => h.code).join('/'))
      || a.partCode.localeCompare(b.partCode)
      || a.checkName.localeCompare(b.checkName));
  }
  return result;
}
