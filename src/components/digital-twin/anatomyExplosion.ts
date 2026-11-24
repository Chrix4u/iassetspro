import * as THREE from 'three';
import type { AssetMeshBinding } from './InteractiveMesh';
import { matchImportedMeshBinding } from './anatomyBindings';

/**
 * Geometry-backed motion plan. Exploding a model translates only imported CAD
 * surfaces; it never creates or infers imaginary OEM pieces.
 *
 * An OpenCascade part may tessellate into several meshes. The converter labels
 * these meshes with iAssetsCadSurface=true; they are a SINGLE physical CAD
 * part for explosion, despite remaining individually selectable for mapping.
 */
export interface AnatomyExplosionPart {
  id: string;
  mesh: THREE.Mesh;
  name: string;
  componentId: string | null;
  assetId: string | null;
  original: THREE.Vector3;
  offset: THREE.Vector3;
}

export function buildAnatomyExplosion(
  modelRoot: THREE.Object3D,
  bindings: ReadonlyArray<AssetMeshBinding>,
): AnatomyExplosionPart[] {
  modelRoot.updateWorldMatrix(true, true);
  const meshes: THREE.Mesh[] = [];
  modelRoot.traverse(object => {
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh && mesh.geometry?.getAttribute('position')?.count && mesh.visible) {
      meshes.push(mesh);
    }
  });
  if (meshes.length < 2) return [];

  // Group ONLY explicit converter-generated face/surface siblings. A generic
  // glTF parent group can contain several independent physical parts, so
  // grouping by hierarchy alone would destroy the assembled BOM semantics.
  const groups = new Map<string, THREE.Mesh[]>();
  for (const mesh of meshes) {
    const sourcePath = mesh.userData.__iAssetsSourceNodePath;
    const sourceParent = typeof sourcePath === 'string' && sourcePath.includes('/')
      ? sourcePath.slice(0, sourcePath.lastIndexOf('/')) : null;
    // Rendered interactive clones are flattened into a scene wrapper; their
    // source paths survive even when their physical parents no longer do.
    const key = mesh.userData.iAssetsCadSurface === true
      ? (sourceParent
          ? 'original-part:' + sourceParent
          : 'original-parent-uuid:' + (mesh.parent?.uuid || mesh.uuid))
      : 'independent-mesh:' + mesh.uuid;
    const existing = groups.get(key) || [];
    existing.push(mesh);
    groups.set(key, existing);
  }

  // Several surfaces of one real part do not constitute a disassemblable
  // assembly. Refuse to portray that as an exploded BOM.
  if (groups.size < 2) return [];
  const groupsList = [...groups.values()];
  const bounds = groupsList.map(members => {
    const box = new THREE.Box3();
    for (const mesh of members) box.union(new THREE.Box3().setFromObject(mesh));
    return box;
  });
  const assembledBounds = bounds.reduce((all, box) => all.union(box), new THREE.Box3());
  if (assembledBounds.isEmpty()) return [];

  const assemblyCenter = assembledBounds.getCenter(new THREE.Vector3());
  const assemblyExtent = assembledBounds.getSize(new THREE.Vector3()).length();
  const spread = Math.max(assemblyExtent * 0.28, 0.01);
  const nameCount = new Map<string, number>();
  for (const mesh of meshes) nameCount.set(mesh.name, (nameCount.get(mesh.name) ?? 0) + 1);

  const offsets = new Map<THREE.Mesh, THREE.Vector3>();
  for (const [groupIndex, members] of groupsList.entries()) {
    const center = bounds[groupIndex].getCenter(new THREE.Vector3());
    const relative = center.clone().sub(assemblyCenter);
    if (relative.lengthSq() < 0.000001) {
      const angle = groupIndex * Math.PI * (3 - Math.sqrt(5));
      const y = 1 - (2 * (groupIndex + 0.5)) / groupsList.length;
      relative.set(Math.cos(angle) * Math.sqrt(1 - y * y), y,
        Math.sin(angle) * Math.sqrt(1 - y * y));
    }
    relative.normalize().multiplyScalar(spread);

    // Explicit offsets for one physical part must agree, even if separate
    // source surfaces were mapped by different reviewers. Never split a
    // physical part when two conflicting offsets have been entered.
    const explicit: THREE.Vector3[] = [];
    for (const mesh of members) {
      const sourcePath = String(mesh.userData.__iAssetsSourceNodePath || mesh.name);
      const binding = matchImportedMeshBinding(
        mesh.name, sourcePath, (nameCount.get(mesh.name) ?? 0) > 1, bindings,
      );
      if (binding?.explodeOffset?.length === 3 &&
        binding.explodeOffset.every(Number.isFinite)) {
        explicit.push(new THREE.Vector3(...binding.explodeOffset));
      }
    }
    if (explicit.some(value => value.distanceToSquared(explicit[0]) > 0.00000001)) {
      return [];
    }

    for (const mesh of members) {
      let localOffset: THREE.Vector3;
      if (explicit.length) {
        // All converter-generated surfaces are direct siblings and their
        // engineer-defined offsets share the same parent-local frame.
        localOffset = explicit[0].clone();
      } else {
        // Convert a single physical part's common world translation into
        // every surface's parent-local coordinates, retaining model scale.
        const parentInverse = mesh.parent?.matrixWorld.clone().invert() ?? new THREE.Matrix4();
        const origin = new THREE.Vector3().applyMatrix4(parentInverse);
        localOffset = relative.clone().applyMatrix4(parentInverse).sub(origin);
      }
      if (!localOffset.toArray().every(Number.isFinite)) return [];
      offsets.set(mesh, localOffset);
    }
  }

  return meshes.map((mesh, index) => {
    const sourcePath = String(mesh.userData.__iAssetsSourceNodePath || mesh.name);
    const binding = matchImportedMeshBinding(
      mesh.name, sourcePath, (nameCount.get(mesh.name) ?? 0) > 1, bindings,
    );
    return {
      id: mesh.uuid,
      mesh,
      name: mesh.name || 'Imported part ' + String(index + 1),
      componentId: binding?.componentId ?? null,
      assetId: binding?.assetId ?? null,
      original: mesh.position.clone(),
      offset: offsets.get(mesh)!.clone(),
    };
  });
}
