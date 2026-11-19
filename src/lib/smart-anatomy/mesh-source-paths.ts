import { PropertyBinding } from 'three';
import { inspectSelfContainedGlb } from './validate-glb';

type UnknownRecord = Record<string, unknown>;
const object = (value: unknown): UnknownRecord | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord : null;

/**
 * Conservative source-backed map for *direct* mesh nodes in a GLB 2.0 scene.
 *
 * Three.js GLTFLoader sanitizes node names, and globally disambiguates
 * duplicate names with numeric suffixes. This reconstructs those paths for
 * single-primitive mesh nodes only. More complex GPU-instanced, skinned, or
 * multi-primitive glTF anatomy is deliberately not auto-approved here.
 */
export function auditedGlbMeshPaths(bytes: Uint8Array): Set<string> {
  inspectSelfContainedGlb(bytes);
  const size = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    .getUint32(12, true);
  const source = object(JSON.parse(new TextDecoder('utf-8', {fatal:true})
    .decode(bytes.subarray(20, 20 + size)))) ?? {};
  const nodes = Array.isArray(source.nodes) ? source.nodes.map(object) : [];
  const meshes = Array.isArray(source.meshes) ? source.meshes.map(object) : [];
  const scenes = Array.isArray(source.scenes) ? source.scenes.map(object) : [];
  const requestedScene = typeof source.scene === 'number' ? source.scene : 0;
  const activeScene = scenes[requestedScene];

  const fallbackRoots = nodes.map((_,index)=>index).filter(index=>
    !nodes.some(node => Array.isArray(node?.children) && node.children.includes(index)));
  const rootIds = Array.isArray(activeScene?.nodes) ? activeScene.nodes : fallbackRoots;

  const names: string[] = [];
  const duplicates = new Map<string, number>();
  for (const [index, node] of nodes.entries()) {
    const raw = typeof node?.name === 'string' && node.name
      ? node.name : node?.mesh !== undefined ? 'mesh_' + String(node.mesh)
        : 'node_' + String(index);
    const normalized = PropertyBinding.sanitizeNodeName(raw);
    const count = duplicates.get(normalized) ?? 0;
    duplicates.set(normalized, count + 1);
    names.push(normalized + (count ? '_' + String(count) : ''));
  }

  const paths = new Set<string>();
  const visited = new Set<number>();
  const active = new Set<number>();

  const visit = (id: number, parentPath: string, depth: number): void => {
    if (!Number.isInteger(id) || id < 0 || id >= nodes.length || depth > 60) {
      throw new Error('Invalid GLB scene hierarchy');
    }
    if (active.has(id)) throw new Error('Cyclic GLB scene hierarchy');
    if (visited.has(id)) return; // Shared scene references never imply distinct physical parts.
    const node = nodes[id];
    if (!node) throw new Error('Invalid GLB scene node');
    active.add(id);
    visited.add(id);
    const path = parentPath ? parentPath + '/' + names[id] : names[id];
    if (typeof node.mesh === 'number' && Number.isInteger(node.mesh) &&
      node.mesh >= 0 && node.mesh < meshes.length) {
      const primitives = meshes[node.mesh]?.primitives;
      if (Array.isArray(primitives) && primitives.length === 1) paths.add(path);
    }
    for (const child of Array.isArray(node.children) ? node.children : []) {
      visit(Number(child), path, depth + 1);
    }
    active.delete(id);
  };
  for (const id of rootIds) visit(Number(id), '', 0);
  return paths;
}
