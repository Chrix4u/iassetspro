/**
 * Arrange the registered machine BOM in schematic rows without a depth cutoff.
 * Each registered node can appear at most once, even for malformed cyclic input.
 */
export type SchematicPart = { id: string; parentId?: string | null };

export function buildSchematicLevels<T extends SchematicPart>(components: readonly T[]): T[][] {
  const ids = new Set(components.map((component) => component.id));
  const byParent = new Map<string, T[]>();
  const roots: T[] = [];

  for (const component of components) {
    // A missing parent must not silently hide a part from the schematic.
    if (!component.parentId || !ids.has(component.parentId)) {
      roots.push(component);
    } else {
      const children = byParent.get(component.parentId) ?? [];
      children.push(component);
      byParent.set(component.parentId, children);
    }
  }

  const visited = new Set<string>();
  const levels: T[][] = [];
  let current = roots;
  while (current.length) {
    const fresh = current.filter((component) => !visited.has(component.id));
    if (!fresh.length) break;
    fresh.forEach((component) => visited.add(component.id));
    levels.push(fresh);
    current = fresh.flatMap((component) => byParent.get(component.id) ?? []);
  }
  // Orphaned cycles cannot be resolved into a truthful hierarchy. They are
  // deliberately excluded rather than fabricating a parent-child order.
  return levels;
}
