export type PmPlanningIssue = {
  code: string;
  label: string;
};

type PmTaskRequirement = {
  requiredParts?: string | null;
  estimatedMinutes?: number | null;
};

export type PmPlanningReadinessInput = {
  plannerId?: string | null;
  assignedTo?: string | null;
  assignedSupervisorId?: string | null;
  departmentId?: string | null;
  repairsOperational?: boolean;
  requiredSkills?: string | null;
  requiredTools?: string | null;
  suggestedParts?: string | null;
  suggestedTools?: string | null;
  tasks: PmTaskRequirement[];
};

type ResourceRequirement = {
  label: string;
  id?: string;
};

function parseArray(value: string | null | undefined): unknown[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeKey(value: unknown): string {
  return typeof value === 'string'
    ? value.trim().toLowerCase().replace(/\s+/g, ' ')
    : '';
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    const key = normalizeKey(trimmed);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}
function stringArray(value: string | null | undefined): string[] {
  return uniqueStrings(
    parseArray(value).filter((item): item is string => typeof item === 'string'),
  );
}

function taskPartRequirements(tasks: PmTaskRequirement[]): ResourceRequirement[] {
  const requirements: ResourceRequirement[] = [];
  const seen = new Set<string>();

  for (const task of tasks) {
    for (const raw of parseArray(task.requiredParts)) {
      let label = '';
      let id: string | undefined;

      if (typeof raw === 'string') {
        label = raw.trim();
      } else if (raw && typeof raw === 'object') {
        const record = raw as Record<string, unknown>;
        label = typeof record.partName === 'string'
          ? record.partName.trim()
          : typeof record.itemName === 'string'
            ? record.itemName.trim()
            : '';
        id = typeof record.itemId === 'string' && record.itemId.trim()
          ? record.itemId.trim()
          : undefined;
      }

      const key = id ? `id:${id}` : `label:${normalizeKey(label)}`;
      if (!label || seen.has(key)) continue;
      seen.add(key);
      requirements.push({ label, id });
    }
  }

  return requirements;
}

function mappedResourceKeys(
  value: string | null | undefined,
  idFields: string[],
  labelFields: string[],
): { count: number; ids: Set<string>; labels: Set<string> } {
  const ids = new Set<string>();
  const labels = new Set<string>();
  let count = 0;

  for (const raw of parseArray(value)) {
    if (!raw || typeof raw !== 'object') continue;
    const record = raw as Record<string, unknown>;
    let hasIdentity = false;

    for (const field of idFields) {
      const id = record[field];
      if (typeof id === 'string' && id.trim()) {
        ids.add(id.trim());
        hasIdentity = true;
      }
    }
    for (const field of labelFields) {
      const key = normalizeKey(record[field]);
      if (key) {
        labels.add(key);
        hasIdentity = true;
      }
    }

    if (hasIdentity) count += 1;
  }

  return { count, ids, labels };
}
export function buildPmPlanningReadiness(input: PmPlanningReadinessInput) {
  const requiredPartEntries = taskPartRequirements(input.tasks);
  const requiredToolLabels = stringArray(input.requiredTools);
  const requiredSkills = stringArray(input.requiredSkills);

  const mappedParts = mappedResourceKeys(
    input.suggestedParts,
    ['itemId'],
    ['itemName', 'itemCode'],
  );
  const mappedTools = mappedResourceKeys(
    input.suggestedTools,
    ['toolId'],
    ['toolName', 'toolCode'],
  );

  const unresolvedPartLabels = requiredPartEntries
    .filter((part) => {
      if (part.id && mappedParts.ids.has(part.id)) return false;
      return !mappedParts.labels.has(normalizeKey(part.label));
    })
    .map((part) => part.label);

  const unresolvedToolLabels = requiredToolLabels.filter(
    (tool) => !mappedTools.labels.has(normalizeKey(tool)),
  );

  const blockingIssues: PmPlanningIssue[] = [];
  if (input.repairsOperational === false) {
    blockingIssues.push({ code: 'repairs_module_unavailable', label: 'Repairs module is unavailable for PM execution' });
  }
  if (!input.plannerId) {
    blockingIssues.push({ code: 'planner_missing', label: 'Assign an accountable maintenance planner' });
  }
  if (!input.assignedTo) {
    blockingIssues.push({ code: 'technician_missing', label: 'Assign a technician or team leader' });
  }
  if (!input.assignedSupervisorId) {
    blockingIssues.push({ code: 'supervisor_missing', label: 'Assign a supervisor for review' });
  }
  if (!input.departmentId) {
    blockingIssues.push({ code: 'department_missing', label: 'Assign the responsible department' });
  }

  const warnings: PmPlanningIssue[] = [];
  if (input.tasks.length === 0) {
    warnings.push({ code: 'checklist_empty', label: 'No PM checklist is attached to this work order' });
  }
  if (unresolvedPartLabels.length > 0) {
    warnings.push({ code: 'unmapped_parts', label: `${unresolvedPartLabels.length} required part${unresolvedPartLabels.length === 1 ? '' : 's'} still need inventory mapping` });
  }
  if (unresolvedToolLabels.length > 0) {
    warnings.push({ code: 'unmapped_tools', label: `${unresolvedToolLabels.length} required tool${unresolvedToolLabels.length === 1 ? '' : 's'} still need tool mapping` });
  }

  return {
    readyForPlanning: blockingIssues.length === 0,
    blockingIssues,
    warnings,
    checklist: {
      taskCount: input.tasks.length,
      estimatedMinutes: input.tasks.reduce((sum, task) => sum + (task.estimatedMinutes || 0), 0),
    },
    requiredSkills,
    resources: {
      mappedPartCount: mappedParts.count,
      mappedToolCount: mappedTools.count,
      unresolvedPartLabels,
      unresolvedToolLabels,
    },
  };
}
