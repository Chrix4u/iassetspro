import type { MachineChecklistGroup, MachineChecklistPoint } from '@/lib/pm-machine-checklist';

export interface InspectionTaskPointLink {
  pmTaskId: string;
  inspectionPointId: string;
}

/** Only a single-task part has an unambiguous legacy point-to-task association. */
export function inspectionPointsForTask(
  group: MachineChecklistGroup,
  pmTaskId: string,
  links: readonly InspectionTaskPointLink[],
): { points: MachineChecklistPoint[]; mappingRequired: boolean; explicit: boolean } {
  const assignedIds = new Set(group.tasks.map((task) => task.pmTask.id));
  if (!assignedIds.has(pmTaskId)) return { points: [], mappingRequired: false, explicit: false };
  const ownIds = new Set(group.points.map((point) => point.id));
  const mapped = new Set(links
    .filter((link) => link.pmTaskId === pmTaskId && ownIds.has(link.inspectionPointId))
    .map((link) => link.inspectionPointId));
  if (mapped.size) {
    return { points: group.points.filter((point) => mapped.has(point.id)), mappingRequired: false, explicit: true };
  }
  if (assignedIds.size > 1 && group.points.length) {
    return { points: [], mappingRequired: true, explicit: false };
  }
  return { points: group.points, mappingRequired: false, explicit: false };
}

export function missingInspectionTaskMappings(
  groups: readonly MachineChecklistGroup[],
  links: readonly InspectionTaskPointLink[],
): { partCount: number; taskCount: number; firstComponentId: string | null } {
  let partCount = 0;
  let taskCount = 0;
  let firstComponentId: string | null = null;
  for (const group of groups) {
    if (!group.points.length) continue;
    const ids = [...new Set(group.tasks.map((task) => task.pmTask.id))];
    if (ids.length <= 1) continue;
    const missing = ids.filter((id) => inspectionPointsForTask(group, id, links).mappingRequired).length;
    if (missing) {
      partCount += 1;
      taskCount += missing;
      firstComponentId ??= group.component.id;
    }
  }
  return { partCount, taskCount, firstComponentId };
}

/** Canonical issued-paper scope, derived only from active assignments and configured points. */
export function plannedPaperInspectionScope<
  T extends { componentId: string | null; pmTaskId: string },
  P extends { id: string; componentId: string },
>(
  assignments: readonly T[],
  points: readonly P[],
  links: readonly InspectionTaskPointLink[],
): { pointIds: string[]; pairs: InspectionTaskPointLink[]; missingTaskMappings: number } {
  const tasksByPart = new Map<string, Set<string>>();
  for (const assignment of assignments) {
    if (!assignment.componentId) continue;
    if (!tasksByPart.has(assignment.componentId)) tasksByPart.set(assignment.componentId, new Set());
    tasksByPart.get(assignment.componentId)!.add(assignment.pmTaskId);
  }
  const pointsByPart = new Map<string, P[]>();
  for (const point of points) {
    if (!pointsByPart.has(point.componentId)) pointsByPart.set(point.componentId, []);
    pointsByPart.get(point.componentId)!.push(point);
  }
  const pairs: InspectionTaskPointLink[] = [];
  let missingTaskMappings = 0;
  for (const [componentId, taskIds] of tasksByPart) {
    const partPoints = pointsByPart.get(componentId) || [];
    const pointSet = new Set(partPoints.map((point) => point.id));
    for (const pmTaskId of taskIds) {
      const explicitlySelected = new Set(links.filter((link) =>
        link.pmTaskId === pmTaskId && pointSet.has(link.inspectionPointId)).map((link) => link.inspectionPointId));
      if (taskIds.size > 1 && partPoints.length && !explicitlySelected.size) {
        missingTaskMappings += 1;
        continue;
      }
      const chosen = explicitlySelected.size ? partPoints.filter((point) => explicitlySelected.has(point.id)) : partPoints;
      for (const point of chosen) pairs.push({ pmTaskId, inspectionPointId: point.id });
    }
  }
  return { pointIds: [...new Set(pairs.map((pair) => pair.inspectionPointId))], pairs, missingTaskMappings };
}
