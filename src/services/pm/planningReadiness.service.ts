export type PmPlanningIssue = {
  code: string;
  label: string;
};

type PmTaskRequirement = {
  requiredParts?: string | null;
  estimatedMinutes?: number | null;
};

type PmMaterialRequest = {
  itemId?: string | null;
  itemName?: string | null;
  status?: string | null;
  source?: string | null;
};

type PmToolRequest = {
  toolId?: string | null;
  toolName?: string | null;
  status?: string | null;
  source?: string | null;
};

export type PmPlanningReadinessInput = {
  plannerId?: string | null;
  assignedTo?: string | null;
  assignedSupervisorId?: string | null;
  departmentId?: string | null;
  repairsOperational?: boolean;
  inventoryOperational?: boolean;
  toolsOperational?: boolean;
  requiredSkills?: string | null;
  requiredTools?: string | null;
  suggestedParts?: string | null;
  suggestedTools?: string | null;
  materialRequests?: PmMaterialRequest[];
  toolRequests?: PmToolRequest[];
  tasks: PmTaskRequirement[];
};

type ResourceRequirement = {
  label: string;
  id?: string;
};

type MappedResource = ResourceRequirement & {
  aliases: string[];
};

type ResourceRequest = {
  id?: string | null;
  label?: string | null;
  status?: string | null;
  source?: string | null;
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

function mappedResources(
  value: string | null | undefined,
  idFields: string[],
  labelFields: string[],
): { count: number; ids: Set<string>; labels: Set<string>; entries: MappedResource[] } {
  const ids = new Set<string>();
  const labels = new Set<string>();
  const entries: MappedResource[] = [];
  const seen = new Set<string>();

  for (const raw of parseArray(value)) {
    if (!raw || typeof raw !== 'object') continue;
    const record = raw as Record<string, unknown>;

    const resourceIds = idFields
      .map((field) => record[field])
      .filter((candidate): candidate is string => typeof candidate === 'string' && candidate.trim().length > 0)
      .map((candidate) => candidate.trim());
    const resourceLabels = labelFields
      .map((field) => record[field])
      .filter((candidate): candidate is string => typeof candidate === 'string' && candidate.trim().length > 0)
      .map((candidate) => candidate.trim());

    const id = resourceIds[0];
    const label = resourceLabels[0] || id;
    if (!label) continue;

    const identityKey = id ? `id:${id}` : `label:${normalizeKey(label)}`;
    if (seen.has(identityKey)) continue;
    seen.add(identityKey);

    for (const resourceId of resourceIds) ids.add(resourceId);
    for (const resourceLabel of resourceLabels) {
      const key = normalizeKey(resourceLabel);
      if (key) labels.add(key);
    }

    entries.push({
      id,
      label,
      aliases: uniqueStrings(resourceLabels),
    });
  }

  return { count: entries.length, ids, labels, entries };
}

function requestHasEnteredExecutionPipeline(request: ResourceRequest): boolean {
  const status = normalizeKey(request.status);
  const source = normalizeKey(request.source);

  if (status === 'rejected') return false;

  // Legacy planner_suggested rows can exist before execution staff explicitly
  // submit a recommendation. They only count as requested after advancing past
  // the initial pending state. This mirrors the canonical suggested-items flow.
  if (source === 'planner_suggested' && status === 'pending') return false;

  return true;
}

function requestMatchesResource(resource: MappedResource, request: ResourceRequest): boolean {
  if (resource.id && request.id && resource.id === request.id) return true;

  const requestLabel = normalizeKey(request.label);
  if (!requestLabel) return false;

  return resource.aliases.some((alias) => normalizeKey(alias) === requestLabel)
    || normalizeKey(resource.label) === requestLabel;
}

function requestCoverage(
  resources: MappedResource[],
  requests: ResourceRequest[],
) {
  const activeRequests = requests.filter(requestHasEnteredExecutionPipeline);
  const outstandingLabels: string[] = [];
  let requestedCount = 0;

  for (const resource of resources) {
    const covered = activeRequests.some((request) => requestMatchesResource(resource, request));
    if (covered) requestedCount += 1;
    else outstandingLabels.push(resource.label);
  }

  return {
    recommendedCount: resources.length,
    requestedCount,
    outstandingLabels: uniqueStrings(outstandingLabels),
  };
}

export function buildPmPlanningReadiness(input: PmPlanningReadinessInput) {
  const requiredPartEntries = taskPartRequirements(input.tasks);
  const requiredToolLabels = stringArray(input.requiredTools);
  const requiredSkills = stringArray(input.requiredSkills);

  const mappedParts = mappedResources(
    input.suggestedParts,
    ['itemId'],
    ['itemName', 'itemCode', 'requirementLabel'],
  );
  const mappedTools = mappedResources(
    input.suggestedTools,
    ['toolId'],
    ['toolName', 'toolCode', 'requirementLabel'],
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

  const materialRequestCoverage = requestCoverage(
    mappedParts.entries,
    (input.materialRequests || []).map((request) => ({
      id: request.itemId,
      label: request.itemName,
      status: request.status,
      source: request.source,
    })),
  );
  const toolRequestCoverage = requestCoverage(
    mappedTools.entries,
    (input.toolRequests || []).map((request) => ({
      id: request.toolId,
      label: request.toolName,
      status: request.status,
      source: request.source,
    })),
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

  const repairsOperational = input.repairsOperational !== false;
  if (
    repairsOperational
    && input.inventoryOperational !== false
    && materialRequestCoverage.outstandingLabels.length > 0
  ) {
    const count = materialRequestCoverage.outstandingLabels.length;
    warnings.push({
      code: 'materials_not_requested',
      label: `${count} planned material${count === 1 ? '' : 's'} still need execution staff submission into the Repairs approval workflow`,
    });
  }
  if (
    repairsOperational
    && input.toolsOperational !== false
    && toolRequestCoverage.outstandingLabels.length > 0
  ) {
    const count = toolRequestCoverage.outstandingLabels.length;
    warnings.push({
      code: 'tools_not_requested',
      label: `${count} planned tool${count === 1 ? '' : 's'} still need execution staff submission into the Repairs approval workflow`,
    });
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
      requestCoverage: {
        materials: materialRequestCoverage,
        tools: toolRequestCoverage,
      },
    },
  };
}
