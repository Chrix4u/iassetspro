/** Groups inspections as machine -> inspection task -> assigned machine parts.
 * Preserve distinct sight/instrument methods and parameters even when tasks
 * share the same human-readable name. Input order is irrelevant to the output.
 */
export interface GroupableInspectionPoint {
  id: string;
  name: string;
  inspectionType: string;
  parameterKey: string | null;
  component: {
    id: string;
    name: string;
    componentCode: string;
    asset: { id: string; name: string; assetTag: string } | null;
  };
}

export function groupInspectionPoints<T extends GroupableInspectionPoint>(points: T[]) {
  const machines = new Map<string, {
    id: string; name: string; code: string;
    tasks: Map<string, { key: string; name: string; method: string; parameter: string | null; points: T[] }>;
  }>();

  for (const point of points) {
    const machine = point.component.asset;
    const machineId = machine?.id || 'unassigned';
    let group = machines.get(machineId);
    if (!group) {
      group = {
        id: machineId, name: machine?.name || 'Unassigned machine',
        code: machine?.assetTag || '',
        tasks: new Map(),
      };
      machines.set(machineId, group);
    }
    const key = [point.name, point.inspectionType, point.parameterKey || '']
      .map((value) => value.trim().toLowerCase()).join('|');
    let task = group.tasks.get(key);
    if (!task) {
      task = { key, name: point.name, method: point.inspectionType, parameter: point.parameterKey, points: [] };
      group.tasks.set(key, task);
    }
    task.points.push(point);
  }

  return [...machines.values()]
    .sort((a, b) => a.name.localeCompare(b.name) || a.code.localeCompare(b.code))
    .map(({ tasks, ...machine }) => ({
      ...machine,
      tasks: [...tasks.values()]
        .sort((a, b) => a.name.localeCompare(b.name) || a.method.localeCompare(b.method))
        .map((task) => ({
          ...task,
          points: task.points.slice().sort((a, b) =>
            a.component.componentCode.localeCompare(b.component.componentCode) ||
            a.component.name.localeCompare(b.component.name)),
        })),
    }));
}
