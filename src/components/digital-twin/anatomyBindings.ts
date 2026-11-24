import type { AssetMeshBinding } from './InteractiveMesh';

/** Data from imported geometry, never a generated OEM hierarchy. */
export interface ImportedAnatomyMesh {
  id: string;
  path: string;
  meshName: string;
  selectionKey: string;
  componentId: string | null;
  assetId: string | null;
  componentCode?: string;
  verified: boolean;
  /** True only for a tessellated surface marked by the source CAD converter. */
  isCadSurface?: boolean;
}

/** Source-part identity, not an inferred OEM part number or mechanical procedure. */
export function sourceGeometryGroupKey(path: string, isCadSurface: boolean): string {
  if (isCadSurface) {
    const slash = path.lastIndexOf('/');
    if (slash > 0) return 'source-part:' + path.slice(0, slash);
  }
  return 'independent-mesh:' + path;
}

/** Counts actual selectable source geometry groups, not tessellated surfaces. */
export function countImportedSourceGroups(meshes: ReadonlyArray<ImportedAnatomyMesh>): number {
  return new Set(meshes.map(mesh => sourceGeometryGroupKey(
    mesh.path, mesh.isCadSurface === true,
  ))).size;
}

/**
 * Resolve an explicit *source node path* before legacy name bindings.  A
 * duplicate mesh name is never enough to authorize PM / repair access.
 *
 * Existing DB supports unique modelId+meshName; when two source nodes share
 * the same name, the path itself may be stored as meshName in a new binding,
 * with meshPath preserving the original CAD ancestry.
 */
export function matchImportedMeshBinding(
  name: string,
  path: string,
  duplicateName: boolean,
  bindings: ReadonlyArray<AssetMeshBinding>,
): AssetMeshBinding | undefined {
  // A path-qualified link is authoritative only for the exact source node.
  const explicit = bindings.find(binding =>
    binding.meshPath === path || (binding.meshName === path && path.includes('/')));
  if (explicit) return explicit;

  if (duplicateName) return undefined;
  return bindings.find(binding => binding.meshName === name &&
    (!binding.meshPath || binding.meshPath === path));
}

/** Hierarchical CAD tree preserves real ancestry, including repeat-name disambiguators. */
export interface AnatomyTreeNode {
  id: string;
  name: string;
  path: string;
  mesh?: ImportedAnatomyMesh;
  children: AnatomyTreeNode[];
}

export function buildImportedAnatomyTree(meshes: ReadonlyArray<ImportedAnatomyMesh>): AnatomyTreeNode[] {
  const roots: AnatomyTreeNode[] = [];
  const found = new Map<string, AnatomyTreeNode>();
  for (const mesh of meshes) {
    const parts = mesh.path.split('/').filter(Boolean);
    let prefix = '';
    let siblings = roots;
    for (const [index, part] of parts.entries()) {
      prefix = prefix ? prefix + '/' + part : part;
      let node = found.get(prefix);
      if (!node) {
        node = { id: prefix, name: decodeURIComponentSafe(part), path: prefix, children: [] };
        siblings.push(node);
        found.set(prefix, node);
      }
      if (index === parts.length - 1) node.mesh = mesh;
      siblings = node.children;
    }
  }
  return roots;
}

function decodeURIComponentSafe(value: string): string {
  try { return decodeURIComponent(value); } catch { return value; }
}
