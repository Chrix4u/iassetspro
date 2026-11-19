'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Html } from '@react-three/drei';
import { useStoreSelector } from '@/hooks/useDigitalTwin';
import { buildAnatomyExplosion, type AnatomyExplosionPart } from './anatomyExplosion';
import type { AssetMeshBinding } from './InteractiveMesh';

export interface ExplodedViewProps {
  bindings: AssetMeshBinding[];
  animationSpeed?: number;
  showLabels?: boolean;
}

/**
 * Real mesh decomposition of a commissioned GLB/glTF model.  This works even
 * before engineers bind meshes to asset parts, but unmapped meshes remain
 * VISUAL ONLY and never become PM/work-order targets.
 */
interface AnatomyLabel {
  id: string;
  text: string;
  position: [number, number, number];
}

export function ExplodedView({ bindings, animationSpeed = 0.08, showLabels = true }: ExplodedViewProps) {
  const explodeMode = useStoreSelector(state => state.explodeMode);
  const explodeProgress = useStoreSelector(state => state.explodeProgress);
  const explodeAssemblyId = useStoreSelector(state => state.explodeAssemblyId);
  const modelRef = useRef<THREE.Object3D | null>(null);
  const planRef = useRef<AnatomyExplosionPart[]>([]);
  const bindingsRef = useRef(bindings);
  const targetRef = useRef(new THREE.Vector3());
  const tickRef = useRef(0);
  const [labels, setLabels] = useState<AnatomyLabel[]>([]);
  const pendingLabelsRef = useRef<AnatomyLabel[] | null>(null);

  // Changes to engineer-approved part links rebuild the motion plan while
  // keeping the source model's original assembled coordinates.
  const bindingSignature = useMemo(() => JSON.stringify(bindings.map(binding =>
    [binding.meshName, binding.assetId, binding.componentId, binding.explodeOffset]
  )), [bindings]);
  useEffect(() => {
    bindingsRef.current = bindings;
    for (const part of planRef.current) part.mesh.position.copy(part.original);
    planRef.current = [];
    modelRef.current = null;
    // React 19 forbids ref writes during render. Only rebuild when the
    // semantic mesh mappings change, not on every caller re-render.
  }, [bindingSignature]);

  useFrame(({ scene }, delta) => {
    // Never move scene lights, inspection labels, IoT overlays or ground plane.
    let model: THREE.Object3D | null = modelRef.current?.parent ? modelRef.current : null;
    if (!model) {
      scene.traverse(object => {
        if (!model && object.userData.__iAssetsModelRoot === true) model = object;
      });
    }

    if (model !== modelRef.current) {
      // Restore previous model before switching to avoid corrupting cached glTF.
      for (const part of planRef.current) part.mesh.position.copy(part.original);
      modelRef.current = model ?? null;
      planRef.current = model ? buildAnatomyExplosion(model, bindingsRef.current) : [];
    }
    if (!planRef.current.length) return;

    const amount = explodeMode ? Math.max(0, Math.min(1, explodeProgress)) : 0;
    const damping = 1 - Math.exp(-Math.max(1, animationSpeed * 100) * Math.min(delta, 0.1));
    const visibleLabels: AnatomyLabel[] = [];
    const refreshLabels = ++tickRef.current % 10 === 0;
    for (const part of planRef.current) {
      const scoped = !explodeAssemblyId ||
        part.componentId === explodeAssemblyId ||
        part.assetId === explodeAssemblyId ||
        part.name === explodeAssemblyId;
      const target = targetRef.current.copy(part.original)
        .addScaledVector(part.offset, scoped ? amount : 0);
      part.mesh.position.lerp(target, damping);
      if (part.mesh.position.distanceToSquared(target) < 0.00000001) {
        part.mesh.position.copy(target);
      }
      // Only explicitly mapped parts may receive names that suggest they are
      // registered asset anatomy. Unmapped geometry remains visual only.
      if (refreshLabels && showLabels && amount > 0.2 && scoped &&
        (part.componentId || part.assetId) && visibleLabels.length < 40) {
        const position = part.mesh.getWorldPosition(new THREE.Vector3());
        visibleLabels.push({id:part.id, text:part.name,
          position:[position.x,position.y + 0.25,position.z]});
      }
    }
    if (refreshLabels) pendingLabelsRef.current = visibleLabels;
  });

  // The HTML labels are synchronized outside the R3F frame reconciler.
  // Updating React state directly in useFrame would cause update-depth crashes.
  useEffect(() => {
    if (!explodeMode || !showLabels) {
      setLabels([]);
      return;
    }
    let animationId: number;
    let previous = '';
    const flush = () => {
      const pending = pendingLabelsRef.current;
      if (pending) {
        const serialized = JSON.stringify(pending);
        if (serialized !== previous) {
          previous = serialized;
          setLabels(pending);
        }
        pendingLabelsRef.current = null;
      }
      animationId = requestAnimationFrame(flush);
    };
    animationId = requestAnimationFrame(flush);
    return () => cancelAnimationFrame(animationId);
  }, [explodeMode, showLabels]);

  useEffect(() => () => {
    for (const part of planRef.current) part.mesh.position.copy(part.original);
    planRef.current = [];
    modelRef.current = null;
  }, []);

  return <group>{labels.map(label => (
    <Html key={label.id} position={label.position} center distanceFactor={15}
      style={{pointerEvents:'none'}}>
      <span className="rounded border border-cyan-400/30 bg-slate-950/85 px-2 py-1 text-[10px] font-medium text-cyan-100 shadow-lg">
        {label.text}
      </span>
    </Html>
  ))}</group>;
}

export default ExplodedView;
