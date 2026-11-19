import * as THREE from 'three';

/**
 * Preserve the imported model's assembled transforms when adapting GLB/glTF
 * meshes to the existing interactive viewer. It renders clones, not the cached
 * source nodes. The model's source hierarchy therefore survives for future
 * engineer-approved path-based mapping.
 */
export function importedNodePath(mesh: THREE.Object3D, root: THREE.Object3D): string {
  const nodes: string[] = [];
  let node: THREE.Object3D | null = mesh;
  while (node && node !== root) {
    const parent: THREE.Object3D | null = node.parent;
    const label = node.name || node.type || 'Node';
    const siblings: THREE.Object3D[] = parent?.children.filter(
      child => (child.name || child.type || 'Node') === label,
    ) ?? [];
    const position = siblings.indexOf(node);
    const suffix = siblings.length > 1 ? '[' + String(position + 1) + ']' : '';
    nodes.unshift(label.replaceAll('/', '%2F') + suffix);
    node = parent;
  }
  return nodes.join('/');
}

/** Single-pass unique source paths for large OEM assemblies, O(nodes) total. */
export function buildImportedNodePaths(root: THREE.Object3D): WeakMap<THREE.Object3D, string> {
  const paths = new WeakMap<THREE.Object3D, string>();
  const stack: Array<{node: THREE.Object3D; prefix: string}> = [{node:root,prefix:''}];
  while (stack.length) {
    const {node,prefix} = stack.pop()!;
    const total = new Map<string, number>();
    for (const child of node.children) {
      const name = child.name || child.type || 'Node';
      total.set(name, (total.get(name) ?? 0) + 1);
    }
    const seen = new Map<string, number>();
    for (const child of node.children) {
      const name = child.name || child.type || 'Node';
      const index = (seen.get(name) ?? 0) + 1;
      seen.set(name, index);
      const segment = name.replaceAll('/', '%2F') +
        ((total.get(name) ?? 0) > 1 ? '[' + String(index) + ']' : '');
      const childPath = prefix ? prefix + '/' + segment : segment;
      paths.set(child, childPath);
      stack.push({node:child,prefix:childPath});
    }
  }
  return paths;
}

export function cloneImportedAnatomyMesh(
  mesh: THREE.Mesh,
  root: THREE.Object3D,
  sourcePath?: string,
  matricesReady = false,
): THREE.Mesh {
  if (!matricesReady) root.updateWorldMatrix(true, true);
  const display = mesh.clone(false);
  // Mutating a bound mesh's color/visibility must never contaminate the source
  // library model or another installed machine that shares its geometry.
  display.material = Array.isArray(mesh.material)
    ? mesh.material.map(material => material.clone())
    : mesh.material.clone();
  mesh.matrixWorld.decompose(display.position, display.quaternion, display.scale);
  display.matrixAutoUpdate = true;
  display.userData.__iAssetsSourceNodePath = sourcePath ?? importedNodePath(mesh, root);
  display.userData.__iAssetsSourceMeshUUID = mesh.uuid;
  return display;
}
