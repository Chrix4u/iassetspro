import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildAnatomyExplosion } from '@/components/digital-twin/anatomyExplosion';

function actualMesh(name: string, x: number) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 1), new THREE.MeshStandardMaterial());
  mesh.name = name;
  mesh.position.set(x, 0, 0);
  return mesh;
}

describe('Smart Anatomy geometry-backed disassembly', () => {
  it('refuses to invent parts or explode a monolithic imported mesh', () => {
    const root = new THREE.Group();
    root.add(actualMesh('Solid body', 0));
    expect(buildAnatomyExplosion(root, [])).toEqual([]);
    expect(buildAnatomyExplosion(new THREE.Group(), [])).toEqual([]);
  });

  it('separates real meshes and leaves source coordinates unchanged', () => {
    const root = new THREE.Group();
    const shaft = actualMesh('Shaft', -2);
    const housing = actualMesh('Housing', 2);
    root.add(shaft, housing);
    const plans = buildAnatomyExplosion(root, []);
    expect(plans).toHaveLength(2);
    expect(plans.map(p => p.name)).toEqual(['Shaft', 'Housing']);
    expect(plans.every(p => p.offset.length() > 0)).toBe(true);
    expect(shaft.position.x).toBe(-2);
    expect(housing.position.x).toBe(2);
    expect(plans[0].offset.x).toBeLessThan(0);
    expect(plans[1].offset.x).toBeGreaterThan(0);
  });

  it('handles coincident centres and duplicate CAD node names by mesh UUID', () => {
    const root = new THREE.Group();
    root.add(actualMesh('Unnamed', 0), actualMesh('Unnamed', 0));
    const plans = buildAnatomyExplosion(root, []);
    expect(plans).toHaveLength(2);
    expect(plans[0].id).not.toBe(plans[1].id);
    expect(plans.every(p => p.offset.length() > 0)).toBe(true);
    const ambiguous = buildAnatomyExplosion(root, [
      {meshName:'Unnamed', assetId:'some-asset', componentId:'wrong-collision',
        assetName:'Could match either mesh'},
    ]);
    expect(ambiguous.every(p => p.componentId === null && p.assetId === null)).toBe(true);
  });

  it('preserves engineer-defined offsets and links to registered maintenance parts', () => {
    const root = new THREE.Group();
    root.add(actualMesh('Impeller', -2), actualMesh('Shaft', 2));
    const plans = buildAnatomyExplosion(root, [
      { meshName: 'Impeller', componentId: 'verified-part-1', assetId: 'installed-pump-1',
        assetName: 'Impeller', explodeOffset: [0, 3, 0] },
    ]);
    expect(plans[0].componentId).toBe('verified-part-1');
    expect(plans[0].assetId).toBe('installed-pump-1');
    expect(plans[0].offset.toArray()).toEqual([0, 3, 0]);
    expect(plans[1].componentId).toBeNull();
  });

  it('computes finite local displacements through transformed CAD parent groups', () => {
    const root = new THREE.Group();
    root.position.set(10, 2, -5);
    root.scale.set(2, 1, 0.5);
    const subAssembly = new THREE.Group();
    subAssembly.rotation.y = Math.PI / 3;
    root.add(subAssembly);
    subAssembly.add(actualMesh('Wheel', -1), actualMesh('Bearing', 1));
    const plans = buildAnatomyExplosion(root, []);
    expect(plans).toHaveLength(2);
    expect(plans.every(p => p.offset.toArray().every(Number.isFinite))).toBe(true);
    expect(plans.every(p => p.offset.length() > 0)).toBe(true);
  });
});
