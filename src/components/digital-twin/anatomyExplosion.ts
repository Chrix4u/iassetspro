import * as THREE from 'three';
import type { AssetMeshBinding } from './InteractiveMesh';

/**
 * Geometry-backed motion plan.  Exploding a model translates meshes already
 * present in its imported scene; it NEVER creates imaginary machine parts.
 * World-space directions are converted to the mesh's parent-local coordinates,
 * so assembly transforms and non-uniform scaling remain intact.
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

  // A welded single-mesh file is not an exploded CAD assembly.
  if (meshes.length < 2) return [];

  const boxes = meshes.map(mesh => new THREE.Box3().setFromObject(mesh));
  const assembledBounds = boxes.reduce((all, box) => all.union(box), new THREE.Box3());
  if (assembledBounds.isEmpty()) return [];
  const assemblyCenter = assembledBounds.getCenter(new THREE.Vector3());
  const assemblyExtent = assembledBounds.getSize(new THREE.Vector3()).length();
  const spread = Math.max(assemblyExtent * 0.28, 0.01);
  const bindingsByName = new Map(bindings.map(binding => [binding.meshName, binding]));
  const nameCount = new Map<string, number>();
  for (const mesh of meshes) nameCount.set(mesh.name, (nameCount.get(mesh.name) ?? 0) + 1);

  return meshes.map((mesh, index) => {
    const center = boxes[index].getCenter(new THREE.Vector3());
    const relative = center.clone().sub(assemblyCenter);
    // Coaxial parts need different spread directions even if their centres coincide.
    // This is a VIEW transform applied to real mesh geometry, not modelled geometry.
    if (relative.lengthSq() < 0.000001) {
      const angle = index * Math.PI * (3 - Math.sqrt(5));
      const y = 1 - (2 * (index + 0.5)) / meshes.length;
      relative.set(Math.cos(angle) * Math.sqrt(1 - y * y), y,
        Math.sin(angle) * Math.sqrt(1 - y * y));
    }
    relative.normalize();

    // A name-only binding is ambiguous when imported CAD nodes reuse names.
    // Such meshes are visually explodable, but not maintenance-authoritative.
    const binding = nameCount.get(mesh.name) === 1 ? bindingsByName.get(mesh.name) : undefined;
    let localOffset: THREE.Vector3;
    if (binding?.explodeOffset?.every(Number.isFinite)) {
      // Explicit engineer-defined offset retains its existing parent-local meaning.
      localOffset = new THREE.Vector3(...binding.explodeOffset);
    } else {
      const worldOffset = relative.multiplyScalar(spread);
      const parentInverse = mesh.parent?.matrixWorld.clone().invert() ?? new THREE.Matrix4();
      const origin = new THREE.Vector3().applyMatrix4(parentInverse);
      localOffset = worldOffset.applyMatrix4(parentInverse).sub(origin);
    }

    return {
      id: mesh.uuid,
      mesh,
      name: mesh.name || 'Imported part ' + String(index + 1),
      componentId: binding?.componentId ?? null,
      assetId: binding?.assetId ?? null,
      original: mesh.position.clone(),
      offset: localOffset,
    };
  });
}
