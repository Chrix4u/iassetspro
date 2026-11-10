/** Replaces one part/task's explicit set without allowing foreign, inactive, or forged checkpoints. */
export function validateInspectionTaskPointSelection(
  input: unknown,
  eligiblePointIds: readonly string[],
): { pointIds: string[]; error: null } | { pointIds: null; error: string } {
  if (!Array.isArray(input) || input.length > 250) {
    return { pointIds: null, error: 'Choose at most 250 inspection checks for one task and part.' };
  }
  if (!input.every((value) => typeof value === 'string'
    && value.length > 0 && value.length <= 120)) {
    return { pointIds: null, error: 'Inspection check IDs must be valid strings.' };
  }
  const pointIds = [...new Set(input as string[])];
  if (pointIds.length !== input.length) {
    return { pointIds: null, error: 'Duplicate inspection checks are not allowed.' };
  }
  const allowed = new Set(eligiblePointIds);
  if (pointIds.some((id) => !allowed.has(id))) {
    return { pointIds: null, error: 'One or more selected checks do not belong to the active machine part.' };
  }
  return { pointIds, error: null };
}

/** Point/task associations must never be inferred from a shared component ID. */
export function inspectionTaskPointLinkStatus(
  tasks: readonly { pmTaskId: string }[],
  points: readonly { id: string }[],
  links: readonly { pmTaskId: string; inspectionPointId: string }[],
): { mode: 'explicit' | 'unconfigured'; byTask: Record<string, string[]> } {
  const taskIds = new Set(tasks.map((task) => task.pmTaskId));
  const pointIds = new Set(points.map((point) => point.id));
  const byTask: Record<string, string[]> = Object.create(null) as Record<string, string[]>;
  for (const id of taskIds) byTask[id] = [];
  for (const link of links) {
    if (taskIds.has(link.pmTaskId) && pointIds.has(link.inspectionPointId)) {
      if (!byTask[link.pmTaskId].includes(link.inspectionPointId)) {
        byTask[link.pmTaskId].push(link.inspectionPointId);
      }
    }
  }
  return { mode: Object.values(byTask).some((ids) => ids.length > 0) ? 'explicit' : 'unconfigured', byTask };
}
