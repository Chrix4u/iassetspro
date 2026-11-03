export type PmAssignmentListPmType = 'tbm' | 'ubm' | 'cbm' | 'fbm';
export type PmAssignmentListFrequencyType = 'time_day' | 'meter' | 'event';
export type PmAssignmentListDueState = 'overdue' | 'due_soon' | 'scheduled' | 'meter' | 'event';

export interface PmAssignmentTargetListRecord {
  id: string;
  assetId: string;
  componentId: string | null;
  isActive: boolean;
  pmType: string | null;
  basis?: string | null;
  activityMode: string | null;
  equipmentState: string | null;
  frequencyInterval: number | null;
  frequencyUnit: string | null;
  nextDueDate: string | Date | null;
  nextDueReading: number | null;
  estimatedMinutes: number | null;
  leadDays: number | null;
  conditionSourceType: string | null;
  conditionSourceId: string | null;
  conditionMetric: string | null;
  conditionOperator: string | null;
  conditionThreshold: number | null;
  conditionThresholdMax: number | null;
  conditionUnit: string | null;
  evaluationCadenceMinutes: number | null;
  asset: { id: string; name: string; assetTag?: string | null; plantId?: string | null };
  component: { id: string; name: string; componentCode?: string | null; componentType?: string | null; parentId?: string | null } | null;
  assetMeter: { id: string; name: string; unit: string; currentValue: number; lastReadingAt?: string | Date | null; isActive?: boolean } | null;
  pmTask: { id: string; taskNumber: number; description: string; taskType?: string | null };
}

export interface PmAssignmentTargetGroup {
  key: string;
  assetId: string;
  componentId: string | null;
  asset: PmAssignmentTargetListRecord['asset'];
  component: PmAssignmentTargetListRecord['component'];
  targetName: string;
  targetCode: string | null;
  targetType: string;
  assignments: PmAssignmentTargetListRecord[];
  taskCount: number;
  totalEstimatedMinutes: number;
  pmTypes: string[];
  activityModes: string[];
  inspectionTypes: string[];
  earliestDueDate: string | Date | null;
}

export interface PmAssignmentAssetGroup {
  assetId: string;
  asset: PmAssignmentTargetGroup['asset'];
  targets: PmAssignmentTargetGroup[];
  targetCount: number;
  taskCount: number;
  totalEstimatedMinutes: number;
  pmTypes: string[];
  earliestDueDate: string | Date | null;
}

export interface PmAssignmentTargetFilters {
  search?: string;
  assetId?: string;
  componentId?: string;
  pmType?: string;
  activityMode?: string;
  inspectionType?: string;
  frequencyType?: PmAssignmentListFrequencyType | '';
  dueState?: PmAssignmentListDueState | '';
}

export function pmAssignmentFrequencyType(
  assignment: Pick<PmAssignmentTargetListRecord, 'pmType' | 'basis'>,
): PmAssignmentListFrequencyType {
  if (assignment.basis === 'calendar') return 'time_day';
  if (assignment.basis === 'meter') return 'meter';
  if (assignment.basis === null) return 'event';
  if (assignment.pmType === 'ubm') return 'meter';
  if (assignment.pmType === 'cbm' || assignment.pmType === 'fbm') return 'event';
  return 'time_day';
}

function targetKey(assignment: Pick<PmAssignmentTargetListRecord, 'assetId' | 'componentId'>): string {
  return `${assignment.assetId}::${assignment.componentId || '__machine__'}`;
}

function asDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function earliestDue(assignments: PmAssignmentTargetListRecord[]): string | Date | null {
  let earliest: { value: string | Date; time: number } | null = null;
  for (const assignment of assignments) {
    const due = asDate(assignment.nextDueDate);
    if (!due) continue;
    if (!earliest || due.getTime() < earliest.time) earliest = { value: assignment.nextDueDate!, time: due.getTime() };
  }
  return earliest?.value ?? null;
}

function earliestTargetDue(targets: PmAssignmentTargetGroup[]): string | Date | null {
  let earliest: { value: string | Date; time: number } | null = null;
  for (const target of targets) {
    const due = asDate(target.earliestDueDate);
    if (!due || !target.earliestDueDate) continue;
    if (!earliest || due.getTime() < earliest.time) earliest = { value: target.earliestDueDate, time: due.getTime() };
  }
  return earliest?.value ?? null;
}

export function groupPmAssignmentTargets(assignments: PmAssignmentTargetListRecord[]): PmAssignmentTargetGroup[] {
  const grouped = new Map<string, PmAssignmentTargetListRecord[]>();
  for (const assignment of assignments) {
    if (!assignment.isActive) continue;
    const key = targetKey(assignment);
    const current = grouped.get(key) || [];
    current.push(assignment);
    grouped.set(key, current);
  }

  return [...grouped.entries()].map(([key, rows]) => {
    const first = rows[0];
    return {
      key,
      assetId: first.assetId,
      componentId: first.componentId,
      asset: first.asset,
      component: first.component,
      targetName: first.component?.name || first.asset.name,
      targetCode: first.component?.componentCode || first.asset.assetTag || null,
      targetType: first.component?.componentType || 'whole_machine',
      assignments: rows,
      taskCount: rows.length,
      totalEstimatedMinutes: rows.reduce((sum, row) => sum + Math.max(0, Number(row.estimatedMinutes || 0)), 0),
      pmTypes: [...new Set(rows.map((row) => row.pmType).filter(Boolean) as string[])],
      activityModes: [...new Set(rows.map((row) => row.activityMode).filter(Boolean) as string[])],
      inspectionTypes: [...new Set(rows.map((row) => row.equipmentState).filter(Boolean) as string[])],
      earliestDueDate: earliestDue(rows),
    };
  }).sort((a, b) => a.asset.name.localeCompare(b.asset.name) || a.targetName.localeCompare(b.targetName));
}

export function groupPmAssignmentAssets(groups: PmAssignmentTargetGroup[]): PmAssignmentAssetGroup[] {
  const grouped = new Map<string, PmAssignmentTargetGroup[]>();
  for (const group of groups) {
    const current = grouped.get(group.assetId) || [];
    current.push(group);
    grouped.set(group.assetId, current);
  }

  return [...grouped.entries()].map(([assetId, targets]) => {
    const orderedTargets = [...targets].sort((a, b) => {
      if (a.componentId === null && b.componentId !== null) return -1;
      if (a.componentId !== null && b.componentId === null) return 1;
      return a.targetName.localeCompare(b.targetName);
    });
    const asset = orderedTargets[0].asset;
    return {
      assetId,
      asset,
      targets: orderedTargets,
      targetCount: orderedTargets.length,
      taskCount: orderedTargets.reduce((sum, target) => sum + target.taskCount, 0),
      totalEstimatedMinutes: orderedTargets.reduce((sum, target) => sum + target.totalEstimatedMinutes, 0),
      pmTypes: [...new Set(orderedTargets.flatMap((target) => target.pmTypes))],
      earliestDueDate: earliestTargetDue(orderedTargets),
    };
  }).sort((a, b) => a.asset.name.localeCompare(b.asset.name));
}

function isOverdue(assignment: PmAssignmentTargetListRecord, now: Date): boolean {
  if (pmAssignmentFrequencyType(assignment) === 'meter') {
    return assignment.nextDueReading != null && assignment.assetMeter?.currentValue != null
      ? Number(assignment.assetMeter.currentValue) >= Number(assignment.nextDueReading)
      : false;
  }
  const due = asDate(assignment.nextDueDate);
  return Boolean(due && due.getTime() < now.getTime());
}

function isDueSoon(assignment: PmAssignmentTargetListRecord, now: Date): boolean {
  if (pmAssignmentFrequencyType(assignment) !== 'time_day') return false;
  const due = asDate(assignment.nextDueDate);
  if (!due || due.getTime() < now.getTime()) return false;
  return due.getTime() <= now.getTime() + 7 * 24 * 60 * 60 * 1000;
}

function matchesDueState(assignment: PmAssignmentTargetListRecord, dueState: PmAssignmentListDueState, now: Date): boolean {
  const frequencyType = pmAssignmentFrequencyType(assignment);
  if (dueState === 'overdue') return isOverdue(assignment, now);
  if (dueState === 'due_soon') return isDueSoon(assignment, now);
  if (dueState === 'meter') return frequencyType === 'meter';
  if (dueState === 'event') return frequencyType === 'event';
  if (dueState === 'scheduled') {
    if (frequencyType !== 'time_day') return false;
    const due = asDate(assignment.nextDueDate);
    return Boolean(due && due.getTime() >= now.getTime());
  }
  return true;
}

export function filterPmAssignmentTargets(
  groups: PmAssignmentTargetGroup[],
  filters: PmAssignmentTargetFilters,
  now: Date = new Date(),
): PmAssignmentTargetGroup[] {
  const search = filters.search?.trim().toLowerCase() || '';
  return groups.filter((group) => {
    if (filters.assetId && group.assetId !== filters.assetId) return false;
    if (filters.componentId) {
      if (filters.componentId === '__machine__') {
        if (group.componentId !== null) return false;
      } else if (group.componentId !== filters.componentId) return false;
    }
    if (search) {
      const haystack = [
        group.targetName,
        group.targetCode || '',
        group.asset.name,
        group.asset.assetTag || '',
        ...group.assignments.flatMap((assignment) => [String(assignment.pmTask.taskNumber), assignment.pmTask.description]),
      ].join(' ').toLowerCase();
      if (!haystack.includes(search)) return false;
    }

    const hasTaskFilters = Boolean(filters.pmType || filters.activityMode || filters.inspectionType || filters.frequencyType || filters.dueState);
    if (!hasTaskFilters) return true;

    return group.assignments.some((assignment) => {
      if (filters.pmType && assignment.pmType !== filters.pmType) return false;
      if (filters.activityMode && assignment.activityMode !== filters.activityMode) return false;
      if (filters.inspectionType && assignment.equipmentState !== filters.inspectionType) return false;
      if (filters.frequencyType && pmAssignmentFrequencyType(assignment) !== filters.frequencyType) return false;
      if (filters.dueState && !matchesDueState(assignment, filters.dueState, now)) return false;
      return true;
    });
  });
}
