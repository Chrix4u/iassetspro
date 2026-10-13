export interface HierarchyLevelPolicy {
  hierarchySystemId: string;
  order: number;
  isRequired: boolean;
  isActive: boolean;
}

export interface HierarchyLevelRef {
  hierarchySystemId: string;
  order: number;
}

export interface LevelTransitionInput {
  hierarchySystemId: string;
  parent: HierarchyLevelRef | null;
  target: HierarchyLevelRef;
  levels: HierarchyLevelPolicy[];
}

export interface HierarchyCycleInput {
  movingId: string;
  newParentId: string | null;
  descendantIds: string[];
}

export interface HierarchyPlantPlacementInput {
  nodePlantId: string | null;
  parentPlantId: string | null;
}

export function validatePlantHierarchyPlacement(input: HierarchyPlantPlacementInput): void {
  const { nodePlantId, parentPlantId } = input;

  if (!nodePlantId && parentPlantId) {
    throw new Error('Global functional locations must remain hierarchy ancestors above plant-specific nodes');
  }
  if (nodePlantId && parentPlantId && nodePlantId !== parentPlantId) {
    throw new Error('Functional location cannot cross plant boundaries');
  }
}

export function validateLevelTransition(input: LevelTransitionInput): void {
  const { hierarchySystemId, parent, target } = input;

  if (target.hierarchySystemId !== hierarchySystemId) {
    throw new Error('Target level belongs to a different hierarchy system');
  }
  if (parent && parent.hierarchySystemId !== hierarchySystemId) {
    throw new Error('Parent belongs to a different hierarchy system');
  }
  if (target.order < 1) throw new Error('Hierarchy level order must be positive');
  if (parent && target.order <= parent.order) {
    throw new Error('Child hierarchy level must follow its parent level');
  }

  const lowerBound = parent?.order ?? 0;
  const skippedRequired = input.levels
    .filter((level) => level.hierarchySystemId === hierarchySystemId && level.isActive)
    .some((level) => level.order > lowerBound && level.order < target.order && level.isRequired);

  if (skippedRequired) {
    throw new Error('Cannot skip a required hierarchy level');
  }
}

export function assertNoHierarchyCycle(input: HierarchyCycleInput): void {
  if (!input.newParentId) return;
  if (input.newParentId === input.movingId) {
    throw new Error('A functional location cannot be its own parent');
  }
  if (input.descendantIds.includes(input.newParentId)) {
    throw new Error('Hierarchy move would create a cycle by using a descendant as parent');
  }
}
