import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildImportedNodePaths, cloneImportedAnatomyMesh, importedNodePath } from '@/components/digital-twin/anatomyModelMesh';

function part(name: string) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0x33aabb }));
  mesh.name = name;
  return mesh;
}

describe('Smart Anatomy imported CAD hierarchy provenance', () => {
  it('retains nested imported node paths and disambiguates duplicate sibling names', () => {
    const root = new THREE.Group();
    root.name = 'Imported machine';
    const assembly = new THREE.Group();
    assembly.name = 'Gear unit';
    root.add(assembly);
    const one = part('Bearing');
    const two = part('Bearing');
    assembly.add(one, two);
    expect(importedNodePath(one, root)).toBe('Gear unit/Bearing[1]');
    expect(importedNodePath(two, root)).toBe('Gear unit/Bearing[2]');
    const paths = buildImportedNodePaths(root);
    expect(paths.get(one)).toBe('Gear unit/Bearing[1]');
    expect(paths.get(two)).toBe('Gear unit/Bearing[2]');
  });

  it('keeps assembled geometry in world position without reparenting source meshes', () => {
    const root = new THREE.Group();
    root.position.set(10, 2, -4);
    root.rotation.y = 0.3;
    const assembly = new THREE.Group();
    assembly.position.set(2, 0, 3);
    assembly.rotation.x = 0.7;
    root.add(assembly);
    const bearing = part('Bearing');
    bearing.position.set(3, 1, 0);
    assembly.add(bearing);
    root.updateWorldMatrix(true, true);

    const worldOriginal = bearing.getWorldPosition(new THREE.Vector3());
    const display = cloneImportedAnatomyMesh(bearing, root);
    const flat = new THREE.Group();
    flat.add(display);
    flat.updateWorldMatrix(true, true);
    expect(display.getWorldPosition(new THREE.Vector3()).distanceTo(worldOriginal)).toBeLessThan(1e-6);
    expect(bearing.parent).toBe(assembly);
    expect(display.userData.__iAssetsSourceNodePath).toBe('Group/Bearing');
    expect(display.userData.__iAssetsSourceMeshUUID).toBe(bearing.uuid);
  });

  it('does not leak bound material edits to the source CAD library', () => {
    const root = new THREE.Group();
    const source = part('Impeller');
    root.add(source);
    const display = cloneImportedAnatomyMesh(source, root);
    (display.material as THREE.MeshStandardMaterial).color.set('#ff0000');
    expect((source.material as THREE.MeshStandardMaterial).color.getHex()).toBe(0x33aabb);
    expect(source.geometry).toBe(display.geometry);
    expect(source.material).not.toBe(display.material);
  });
});
