'use client';

import { useRef, useState, useCallback, useMemo, useEffect } from 'react';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { useDigitalTwinStore } from '@/stores/digitalTwinStore';
import { useStoreSelector } from '@/hooks/useDigitalTwin';

// ============================================================================
// Types
// ============================================================================

/** Binding data linking a mesh to an asset */
export interface AssetMeshBinding {
  meshName: string;
  assetId: string;
  assetName: string;
  isClickable?: boolean;
  isVisible?: boolean;
  colorOverride?: string;
  explodeOffset?: [number, number, number];
  hotspots?: Array<{ id: string; title: string; type: string }>;
}

export interface InteractiveMeshProps {
  /** The Three.js mesh object reference */
  mesh: THREE.Mesh;
  /** The asset-mesh binding data */
  binding: AssetMeshBinding;
  /** Original geometry of the mesh for bounds calculation */
  children?: React.ReactNode;
}

// ============================================================================
// Color palette for selection / hover / IoT
// ============================================================================

const SELECTION_COLOR = new THREE.Color('#22d3ee'); // cyan-400
const SELECTION_EMISSIVE = new THREE.Color('#22d3ee');
const HOVER_COLOR = new THREE.Color('#94a3b8'); // slate-400
const HOVER_EMISSIVE = new THREE.Color('#64748b'); // slate-500
const IOT_CRITICAL_COLOR = new THREE.Color('#ef4444');
const IOT_CRITICAL_EMISSIVE = new THREE.Color('#dc2626');
const IOT_WARNING_COLOR = new THREE.Color('#f59e0b');
const IOT_WARNING_EMISSIVE = new THREE.Color('#d97706');
const IOT_GOOD_COLOR = new THREE.Color('#22c55e');
const IOT_GOOD_EMISSIVE = new THREE.Color('#16a34a');
const IOT_EXCELLENT_COLOR = new THREE.Color('#10b981');
const IOT_EXCELLENT_EMISSIVE = new THREE.Color('#059669');

// ============================================================================
// Spring interpolation helper — mimics spring physics for smooth transitions
// ============================================================================

function springLerp(
  current: number,
  target: number,
  velocity: React.MutableRefObject<number>,
  stiffness: number = 0.08,
  damping: number = 0.75,
): number {
  const force = (target - current) * stiffness;
  velocity.current = (velocity.current + force) * damping;
  return current + velocity.current;
}

// ============================================================================
// Component
// ============================================================================

export function InteractiveMesh({ mesh, binding }: InteractiveMeshProps) {
  const meshRef = useRef<THREE.Mesh>(mesh);
  const [hovered, setHovered] = useState(false);
  const [isTooltipVisible, setIsTooltipVisible] = useState(false);

  // Spring velocities for smooth animated transitions
  const emissiveVelocity = useRef(0);
  const emissiveIntensityVelocity = useRef(0);
  const outlineOpacityVelocity = useRef(0);

  // useStoreSelector: Safe alternative to useDigitalTwinStore() inside R3F Canvas.
  // Avoids useSyncExternalStore cross-reconciler cascading (Error #185).
  // Action functions (selectMesh, hoverMesh, isolateAsset) use getState() at call time.
  const selectedMeshName = useStoreSelector((s) => s.selectedMeshName);
  const hoveredMeshName = useStoreSelector((s) => s.hoveredMeshName);
  const iotOverlayEnabled = useStoreSelector((s) => s.iotOverlayEnabled);
  const iotHealthMap = useStoreSelector((s) => s.iotHealthMap);
  const liveReadings = useStoreSelector((s) => s.liveReadings);
  const isolationAssetId = useStoreSelector((s) => s.isolationAssetId);

  // Outline geometry for selection / hover
  const [lineSegmentsObj, setLineSegmentsObj] = useState<
    THREE.LineSegments | null
  >(null);
  const outlineMaterialRef = useRef<THREE.LineBasicMaterial | null>(null);

  useEffect(() => {
    if (meshRef.current?.geometry) {
      const geo = new THREE.EdgesGeometry(meshRef.current.geometry, 15);
      const mat = new THREE.LineBasicMaterial({
        color: SELECTION_COLOR,
        transparent: true,
        opacity: 0,
        depthTest: true,
        linewidth: 1,
      });
      outlineMaterialRef.current = mat;
      setLineSegmentsObj(new THREE.LineSegments(geo, mat));
    }
    return () => {
      setLineSegmentsObj((prev) => {
        if (prev) {
          prev.geometry.dispose();
          (prev.material as THREE.Material).dispose();
        }
        return null;
      });
      outlineMaterialRef.current = null;
    };
  }, [mesh]);

  const isSelected = selectedMeshName === binding.meshName;
  const isHovered = hoveredMeshName === binding.meshName;

  // Original material color backup
  const originalColorRef = useRef<THREE.Color | null>(null);
  // Track current animated values for the outline
  const currentOutlineOpacity = useRef(0);

  // Memoize whether this mesh is interactive
  const isClickable = binding.isClickable !== false;
  const isVisible = binding.isVisible !== false;

  // Health data for this mesh
  const healthEntry = useMemo(
    () => iotHealthMap[binding.meshName],
    [iotHealthMap, binding.meshName],
  );

  const liveReading = useMemo(
    () => liveReadings[binding.meshName],
    [liveReadings, binding.meshName],
  );

  // ── Touch support: long-press timer ─────────────────────────────────────

  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLongPressRef = useRef(false);

  const clearLongPress = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  // ── Event handlers ────────────────────────────────────────────────────────

  const openComponentDetails = useCallback(() => {
    if (!isClickable) return;
    // Defer Zustand setState via setTimeout(0) to prevent Error #185.
    // R3F pointer events can fire during React's concurrent render phase,
    // and Zustand set() bypasses React's scheduler (not wrapped by startTransition).
    setTimeout(() => {
      useDigitalTwinStore.getState().selectMesh(binding.meshName, binding.assetId);
    }, 0);
  }, [isClickable, binding.meshName, binding.assetId]);

  const handleClick = useCallback(
    (e: THREE.Event) => {
      e.stopPropagation();
      // Ignore clicks that were actually long-press starts
      if (isLongPressRef.current) {
        isLongPressRef.current = false;
        return;
      }
      openComponentDetails();
    },
    [openComponentDetails],
  );

  const handleDoubleClick = useCallback(
    (e: THREE.Event) => {
      e.stopPropagation();
      if (!isClickable) return;
      // Defer Zustand setState via setTimeout(0) — see handleClick for rationale.
      setTimeout(() => {
        if (isolationAssetId === binding.assetId) {
          useDigitalTwinStore.getState().isolateAsset(null);
        } else {
          useDigitalTwinStore.getState().isolateAsset(binding.assetId);
        }
      }, 0);
    },
    [isClickable, binding.assetId, isolationAssetId],
  );

  const handlePointerOver = useCallback(
    (e: THREE.Event) => {
      e.stopPropagation();
      setHovered(true);
      setIsTooltipVisible(true);
      // Defer Zustand setState via setTimeout(0) — see handleClick for rationale.
      setTimeout(() => useDigitalTwinStore.getState().hoverMesh(binding.meshName), 0);
      document.body.style.cursor = isClickable ? 'pointer' : 'default';
    },
    [isClickable, binding.meshName],
  );

  const handlePointerDown = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      if (!isClickable || e.pointerType !== 'touch') return;

      clearLongPress();
      isLongPressRef.current = false;
      longPressTimerRef.current = setTimeout(() => {
        isLongPressRef.current = true;
        openComponentDetails();
      }, 500);
    },
    [isClickable, clearLongPress, openComponentDetails],
  );

  const handlePointerUp = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      clearLongPress();
    },
    [clearLongPress],
  );

  const handlePointerOut = useCallback(
    (e: THREE.Event) => {
      e.stopPropagation();
      setHovered(false);
      setIsTooltipVisible(false);
      // Defer Zustand setState via setTimeout(0) — see handleClick for rationale.
      setTimeout(() => useDigitalTwinStore.getState().hoverMesh(null), 0);
      document.body.style.cursor = 'default';
      clearLongPress();
    },
    [clearLongPress],
  );

  const handleContextMenu = useCallback(
    (e: THREE.Event) => {
      e.stopPropagation();
      openComponentDetails();
    },
    [openComponentDetails],
  );

  // ── Per-frame material updates with spring-based transitions ──────────────

  useFrame(() => {
    const obj = meshRef.current;
    if (!obj || !obj.material) return;

    const material = obj.material as THREE.MeshStandardMaterial;

    // Store original color on first frame
    if (!originalColorRef.current) {
      originalColorRef.current = material.color.clone();
    }

    // ── Determine target material state ────────────────────────────────────
    let targetColor: THREE.Color | null = null;
    let targetEmissive = new THREE.Color('#000000');
    let targetEmissiveIntensity = 0;

    if (isSelected) {
      targetColor = SELECTION_COLOR;
      targetEmissive = SELECTION_EMISSIVE;
      targetEmissiveIntensity = 0.35;
    } else if (isHovered) {
      targetColor = null; // Keep original color on hover
      targetEmissive = HOVER_EMISSIVE;
      targetEmissiveIntensity = 0.15;
    } else if (iotOverlayEnabled && healthEntry) {
      if (healthEntry.score <= 30) {
        targetColor = IOT_CRITICAL_COLOR;
        targetEmissive = IOT_CRITICAL_EMISSIVE;
        targetEmissiveIntensity = 0.3;
      } else if (healthEntry.score <= 60) {
        targetColor = IOT_WARNING_COLOR;
        targetEmissive = IOT_WARNING_EMISSIVE;
        targetEmissiveIntensity = 0.15;
      } else if (healthEntry.score <= 80) {
        targetColor = IOT_GOOD_COLOR;
        targetEmissive = IOT_GOOD_EMISSIVE;
        targetEmissiveIntensity = 0.08;
      } else {
        targetColor = IOT_EXCELLENT_COLOR;
        targetEmissive = IOT_EXCELLENT_EMISSIVE;
        targetEmissiveIntensity = 0.06;
      }
    } else if (binding.colorOverride) {
      targetColor = new THREE.Color(binding.colorOverride);
    }

    // ── Apply color with smooth transition ──────────────────────────────────
    if (targetColor) {
      material.color.lerp(targetColor, 0.12);
    } else {
      material.color.lerp(originalColorRef.current, 0.08);
    }

    // ── Apply emissive with spring physics ──────────────────────────────────
    material.emissive.lerp(targetEmissive, 0.1);
    const currentEmissive = material.emissiveIntensity;
    const newEmissiveIntensity = springLerp(
      currentEmissive,
      targetEmissiveIntensity,
      emissiveIntensityVelocity,
      0.12,
      0.7,
    );
    material.emissiveIntensity = newEmissiveIntensity;

    // ── Pulsing effect for critical/warning health ──────────────────────────
    if (iotOverlayEnabled && healthEntry && healthEntry.score <= 30) {
      const t = performance.now() * 0.003;
      const pulse = 0.2 + Math.sin(t) * 0.15;
      material.emissiveIntensity = Math.max(material.emissiveIntensity, pulse);
      material.emissive.lerp(IOT_CRITICAL_EMISSIVE, 0.3);
    } else if (iotOverlayEnabled && healthEntry && healthEntry.score <= 60) {
      const t = performance.now() * 0.002;
      const pulse = 0.1 + Math.sin(t) * 0.08;
      material.emissiveIntensity = Math.max(material.emissiveIntensity, pulse);
      material.emissive.lerp(IOT_WARNING_EMISSIVE, 0.2);
    }

    // ── Visibility ──────────────────────────────────────────────────────────
    obj.visible = isVisible;

    // ── Outline opacity animation ───────────────────────────────────────────
    const targetOutlineOpacity =
      isSelected ? 0.9 : isHovered ? 0.5 : 0;
    currentOutlineOpacity.current = springLerp(
      currentOutlineOpacity.current,
      targetOutlineOpacity,
      outlineOpacityVelocity,
      0.15,
      0.7,
    );

    if (outlineMaterialRef.current) {
      outlineMaterialRef.current.opacity = currentOutlineOpacity.current;

      // Update outline color based on state
      if (isSelected) {
        outlineMaterialRef.current.color.copy(SELECTION_COLOR);
      } else if (isHovered) {
        outlineMaterialRef.current.color.copy(HOVER_COLOR);
      }
    }

    // ── Dispose long-press timer if component unmounted ─────────────────────
  });

  // Cleanup long-press timer on unmount
  useEffect(() => {
    return () => {
      clearLongPress();
    };
  }, [clearLongPress]);

  // ── Determine tooltip color based on health ───────────────────────────────

  const tooltipColor = useMemo(() => {
    if (!healthEntry) return { color: '#e2e8f0', border: '#475569' };
    if (healthEntry.score <= 30) return { color: '#fca5a5', border: '#ef4444' };
    if (healthEntry.score <= 60) return { color: '#fde68a', border: '#f59e0b' };
    return { color: '#86efac', border: '#22c55e' };
  }, [healthEntry]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <group>
      <primitive
        ref={meshRef}
        object={mesh}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onPointerOver={handlePointerOver}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerOut={handlePointerOut}
        onContextMenu={handleContextMenu}
        castShadow
        receiveShadow
      />

      {/* Selection / hover outline — always rendered, visibility controlled by opacity */}
      {lineSegmentsObj && (
        <primitive object={lineSegmentsObj} />
      )}

      {/* Live telemetry label when IoT overlay is active */}
      {iotOverlayEnabled && liveReading && (
        <Html
          position={[
            (mesh.position?.x ?? 0),
            (mesh.position?.y ?? 0) + 1.2,
            (mesh.position?.z ?? 0),
          ]}
          center
          distanceFactor={15}
          style={{ pointerEvents: 'none' }}
        >
          <div
            className="px-2 py-1 rounded text-xs font-mono whitespace-nowrap shadow-lg transition-opacity duration-200"
            style={{
              background: 'rgba(0,0,0,0.8)',
              color: tooltipColor.color,
              border: `1px solid ${tooltipColor.border}`,
              backdropFilter: 'blur(8px)',
              opacity: isTooltipVisible || isSelected ? 1 : 0.7,
            }}
          >
            <div className="flex items-center gap-1.5">
              {healthEntry && healthEntry.score <= 30 && (
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
              )}
              {healthEntry && healthEntry.score > 30 && healthEntry.score <= 60 && (
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500" />
              )}
              <span>
                {liveReading.value.toFixed(1)} {liveReading.unit}
              </span>
            </div>
          </div>
        </Html>
      )}

      {/* Health tooltip on hover (shows health details) */}
      {isTooltipVisible && !isSelected && iotOverlayEnabled && healthEntry && (
        <Html
          position={[
            (mesh.position?.x ?? 0),
            (mesh.position?.y ?? 0) + 1.8,
            (mesh.position?.z ?? 0),
          ]}
          center
          distanceFactor={12}
          style={{ pointerEvents: 'none' }}
        >
          <div
            className="px-2 py-1 rounded text-[10px] shadow-lg whitespace-nowrap"
            style={{
              background: 'rgba(0,0,0,0.85)',
              border: `1px solid ${tooltipColor.border}44`,
              backdropFilter: 'blur(8px)',
              color: tooltipColor.color,
            }}
          >
            <div className="font-medium">{binding.assetName}</div>
            <div className="opacity-70">
              Health: {healthEntry.score}/100
            </div>
            {liveReading && (
              <div className="font-mono opacity-80">
                {liveReading.value.toFixed(1)} {liveReading.unit}
              </div>
            )}
          </div>
        </Html>
      )}

      {/* Hotspot indicator icons */}
      {binding.hotspots && binding.hotspots.length > 0 && (
        <Html
          position={[
            (mesh.position?.x ?? 0),
            (mesh.position?.y ?? 0) + 0.8,
            (mesh.position?.z ?? 0),
          ]}
          center
          distanceFactor={12}
          style={{ pointerEvents: 'none' }}
        >
          <div className="flex flex-col items-center gap-0.5">
            <div className="h-5 w-5 rounded-full bg-amber-500 flex items-center justify-center shadow-lg animate-pulse">
              <span className="text-[10px] text-white font-bold">
                {binding.hotspots.length}
              </span>
            </div>
          </div>
        </Html>
      )}
    </group>
  );
}

export default InteractiveMesh;
