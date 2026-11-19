'use client';

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { InteractiveMesh, type AssetMeshBinding } from './InteractiveMesh';
import { buildImportedNodePaths, cloneImportedAnatomyMesh } from './anatomyModelMesh';
import { matchImportedMeshBinding, type ImportedAnatomyMesh } from './anatomyBindings';
import { useDigitalTwinStore } from '@/stores/digitalTwinStore';

// ============================================================================
// Types
// ============================================================================

export interface ModelLoaderProps {
  /** URL of the GLTF/GLB model to load */
  modelUrl: string | null;
  /** Callback when loading starts */
  onLoadingStart?: () => void;
  /** Callback when loading completes */
  onLoadingComplete?: () => void;
  /** Callback with progress (0-100) */
  onProgress?: (progress: number) => void;
  /** Callback on error */
  onError?: (error: Error) => void;
  /** Auto-center the model (default: true) */
  autoCenter?: boolean;
  /** Auto-scale to fit view (default: true) */
  autoScale?: boolean;
  /** Maximum model dimension (default: 8) */
  maxDimension?: number;
  /** Asset-mesh bindings from the store or external source */
  bindings?: AssetMeshBinding[];
  /** Number of actual imported glTF meshes (never inferred from an asset description). */
  onMeshCount?: (count: number) => void;
  /** Exact imported glTF nodes, not inferred or generated machine anatomy. */
  onAnatomyManifest?: (meshes: ImportedAnatomyMesh[]) => void;
  /** Children rendered after the model */
  children?: ReactNode;
}

// ============================================================================
// GLTF Cache — prevents redundant downloads and allows ref-counted disposal
// ============================================================================

interface CacheEntry {
  scene: THREE.Group;
  refCount: number;
  url: string;
}

const gltfCache = new Map<string, CacheEntry>();

function getCacheKey(url: string): string {
  return url;
}

function acquireFromCache(url: string): THREE.Group | null {
  const key = getCacheKey(url);
  const entry = gltfCache.get(key);
  if (entry) {
    entry.refCount++;
    return entry.scene.clone(true);
  }
  return null;
}

function releaseToCache(url: string): void {
  const key = getCacheKey(url);
  const entry = gltfCache.get(key);
  if (entry) {
    entry.refCount--;
    if (entry.refCount <= 0) {
      disposeScene(entry.scene);
      gltfCache.delete(key);
    }
  }
}

// ============================================================================
// Memory Management — proper disposal of Three.js objects
// ============================================================================

function disposeScene(scene: THREE.Group): void {
  scene.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh;
      mesh.geometry?.dispose();
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const mat of materials) {
        if (mat) {
          // Dispose textures
          const keys = Object.keys(mat) as (keyof THREE.Material)[];
          for (const key of keys) {
            const value = mat[key];
            if (value && (value as THREE.Texture).isTexture) {
              (value as THREE.Texture).dispose();
            }
          }
          mat.dispose();
        }
      }
    }
  });
}

// ============================================================================
// Custom GLTF loading hook with progress tracking
// ============================================================================

interface LoadResult {
  scene: THREE.Group | null;
  error: Error | null;
  isLoading: boolean;
}

function useGLTFLoader(
  modelUrl: string | null,
  onProgressRef: React.MutableRefObject<((pct: number) => void) | undefined>,
  onLoadingStartRef: React.MutableRefObject<(() => void) | undefined>,
  onLoadingCompleteRef: React.MutableRefObject<(() => void) | undefined>,
  onErrorRef: React.MutableRefObject<((err: Error) => void) | undefined>,
): LoadResult {
  const [scene, setScene] = useState<THREE.Group | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const loaderRef = useRef<THREE.Loader | null>(null);

  useEffect(() => {
    if (!modelUrl) {
      setScene(null);
      setError(null);
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    // Check cache first
    const cached = acquireFromCache(modelUrl);
    if (cached) {
      setScene(cached);
      setError(null);
      setIsLoading(false);
      // CRITICAL: Defer callbacks to the main React reconciler via setTimeout(0).
      // This component lives inside R3F's Canvas (separate reconciler), and
      // calling setState on the parent (main reconciler) from R3F's reconciler
      // context can interleave with React's concurrent rendering, causing Error #185.
      setTimeout(() => {
        if (!cancelled) {
          onLoadingCompleteRef.current?.();
          onProgressRef.current?.(100);
        }
      }, 0);
      return () => {
        cancelled = true;
        releaseToCache(modelUrl);
      };
    }

    // Dynamic import of GLTFLoader to avoid SSR issues
    setIsLoading(true);
    setError(null);
    // CRITICAL: Defer callbacks — see above for rationale.
    setTimeout(() => {
      if (!cancelled) {
        onLoadingStartRef.current?.();
        onProgressRef.current?.(0);
      }
    }, 0);

    let progressInterval: ReturnType<typeof setInterval> | undefined;

    const loadModel = async () => {
      try {
        // Dynamic import to ensure client-side only
        const { GLTFLoader } = await import(
          'three/examples/jsm/loaders/GLTFLoader.js'
        );

        if (cancelled) return;

        const gltfLoader = new GLTFLoader();
        loaderRef.current = gltfLoader;

        // Progress simulation for single-file models where total=0
        let reportedProgress = 0;

        // Fallback progress ticker for when server doesn't send content-length
        progressInterval = setInterval(() => {
          if (reportedProgress < 90) {
            reportedProgress += Math.random() * 5;
            reportedProgress = Math.min(reportedProgress, 90);
            // CRITICAL: Defer callbacks — see cache hit path for rationale.
            setTimeout(() => {
              if (!cancelled) onProgressRef.current?.(reportedProgress);
            }, 0);
          }
        }, 200);

        gltfLoader.load(
          modelUrl,
          (gltf) => {
            if (cancelled) return;

            if (progressInterval) clearInterval(progressInterval);
            // CRITICAL: Defer callbacks — see cache hit path for rationale.
            setTimeout(() => {
              if (!cancelled) {
                onProgressRef.current?.(100);
                onLoadingCompleteRef.current?.();
              }
            }, 0);

            // Store in cache
            gltfCache.set(getCacheKey(modelUrl), {
              scene: gltf.scene,
              refCount: 1,
              url: modelUrl,
            });

            setScene(gltf.scene.clone(true));
            setIsLoading(false);
          },
          (event) => {
            if (cancelled) return;
            if (event.lengthComputable && event.total > 0) {
              const pct = Math.round((event.loaded / event.total) * 95);
              reportedProgress = pct;
              // CRITICAL: Defer callbacks — see cache hit path for rationale.
              setTimeout(() => {
                if (!cancelled) onProgressRef.current?.(pct);
              }, 0);
            }
          },
          (err) => {
            if (cancelled) return;
            if (progressInterval) clearInterval(progressInterval);

            const errorObj = new Error(
              (err as ErrorEvent)?.message || `Failed to load model: ${modelUrl}`,
            );
            setError(errorObj);
            setIsLoading(false);
            // CRITICAL: Defer callbacks — see cache hit path for rationale.
            setTimeout(() => {
              if (!cancelled) onErrorRef.current?.(errorObj);
            }, 0);
          },
        );
      } catch (importErr) {
        if (cancelled) return;
        const errorObj = new Error(
          `Failed to initialize GLTF loader: ${
            importErr instanceof Error ? importErr.message : String(importErr)
          }`,
        );
        setError(errorObj);
        setIsLoading(false);
        // CRITICAL: Defer callbacks — see cache hit path for rationale.
        setTimeout(() => {
          if (!cancelled) onErrorRef.current?.(errorObj);
        }, 0);
      }
    };

    loadModel();

    return () => {
      cancelled = true;
      if (progressInterval) {
        clearInterval(progressInterval);
      }
      // GLTFLoader does not expose a supported abort API here. The cancelled flag
      // prevents late loader callbacks from mutating React state after unmount.
      loaderRef.current = null;
      // Release cache reference on unmount
      releaseToCache(modelUrl);
    };
  }, [modelUrl]);

  return { scene, error, isLoading };
}

// ============================================================================
// Helper: Compute bounding box of the entire scene
// ============================================================================

function computeSceneBounds(object: THREE.Object3D): THREE.Box3 {
  const box = new THREE.Box3();
  object.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh;
      if (mesh.geometry) {
        mesh.geometry.computeBoundingBox();
        if (mesh.geometry.boundingBox) {
          const meshBox = mesh.geometry.boundingBox.clone();
          meshBox.applyMatrix4(mesh.matrixWorld);
          box.union(meshBox);
        }
      }
    }
  });
  return box;
}

// ============================================================================
// Helper: Compute bounding sphere for LOD calculations
// ============================================================================

function computeBoundingSphere(object: THREE.Object3D): THREE.Sphere {
  const box = computeSceneBounds(object);
  const sphere = new THREE.Sphere();
  box.getBoundingSphere(sphere);
  return sphere;
}

// ============================================================================
// Helper: Apply binding properties to a mesh
// ============================================================================

function applyBindingToMesh(mesh: THREE.Mesh, binding: AssetMeshBinding) {
  if (!mesh) return;
  if (binding.isVisible === false) {
    mesh.visible = false;
  }
  if (binding.colorOverride) {
    const mat = mesh.material as THREE.MeshStandardMaterial;
    if (mat && mat.color) {
      mat.color.set(binding.colorOverride);
    }
  }
  (mesh as THREE.Mesh & { __binding?: AssetMeshBinding }).__binding = binding;
}

// ============================================================================
// LOD Manager — enables/disables meshes based on camera distance
// ============================================================================

interface LODManagerProps {
  groupRef: React.RefObject<THREE.Group | null>;
  interactiveMeshes: Array<{ mesh: THREE.Mesh; binding: AssetMeshBinding }>;
  staticMeshes: THREE.Mesh[];
  bounds: THREE.Sphere | null;
  enabled: boolean;
}

function LODManager({
  groupRef,
  interactiveMeshes,
  staticMeshes,
  bounds,
  enabled,
}: LODManagerProps) {
  const { camera } = useThree();
  const frameSkipRef = useRef(0);

  useFrame(() => {
    if (!enabled || !groupRef.current || !bounds) return;

    // Only check LOD every 10 frames for performance
    frameSkipRef.current++;
    if (frameSkipRef.current % 10 !== 0) return;

    const cameraDistance = camera.position.distanceTo(bounds.center);
    const isFar = cameraDistance > bounds.radius * 6;
    const isVeryFar = cameraDistance > bounds.radius * 12;

    // At very far distance, hide all small meshes
    const sizeThreshold = isVeryFar ? 0.15 : isFar ? 0.08 : 0;

    for (const { mesh } of interactiveMeshes) {
      if (!mesh.geometry) continue;
      mesh.geometry.computeBoundingSphere();
      const bsphere = mesh.geometry.boundingSphere;
      if (!bsphere) continue;

      const relativeSize = bsphere.radius / bounds.radius;
      // eslint-disable-next-line react-hooks/immutability
      (mesh as THREE.Mesh).visible = relativeSize >= sizeThreshold;
    }

    for (const mesh of staticMeshes) {
      if (!mesh.geometry) continue;
      mesh.geometry.computeBoundingSphere();
      const bsphere = mesh.geometry.boundingSphere;
      if (!bsphere) continue;

      const relativeSize = bsphere.radius / bounds.radius;
      // eslint-disable-next-line react-hooks/immutability
      (mesh as THREE.Mesh).visible = relativeSize >= sizeThreshold;
    }
  });

  return null;
}

// ============================================================================
// FPS Monitor — logs performance warnings to console
// ============================================================================

function PerformanceMonitor({ enabled }: { enabled: boolean }) {
  const frameCountRef = useRef(0);
  const lastTimeRef = useRef(performance.now());
  const warnedRef = useRef(false);

  useFrame(() => {
    if (!enabled) return;

    frameCountRef.current++;
    const now = performance.now();
    const elapsed = now - lastTimeRef.current;

    if (elapsed >= 2000) {
      const fps = (frameCountRef.current / elapsed) * 1000;
      frameCountRef.current = 0;
      lastTimeRef.current = now;

      if (fps < 24 && !warnedRef.current) {
        console.warn(
          `[DigitalTwin] Low FPS detected: ${Math.round(fps)} fps. Consider enabling LOD or reducing model complexity.`,
        );
        warnedRef.current = true;
      } else if (fps >= 30) {
        warnedRef.current = false;
      }
    }
  });

  return null;
}

// ============================================================================
// Sub-component: Processed model scene graph
// ============================================================================

interface ProcessedModelProps {
  scene: THREE.Group;
  bindings: AssetMeshBinding[];
  onMeshCount?: (count: number) => void;
  onAnatomyManifest?: (meshes: ImportedAnatomyMesh[]) => void;
  maxDimension: number;
  autoCenter: boolean;
  autoScale: boolean;
}

function ProcessedModel({
  scene,
  bindings,
  onMeshCount,
  onAnatomyManifest,
  maxDimension,
  autoCenter,
  autoScale,
}: ProcessedModelProps) {
  const groupRef = useRef<THREE.Group>(null);

  // Collect interactive and static meshes from the scene
  const { interactiveMeshes, staticMeshes } = useMemo(() => {
    const interactive: Array<{
      mesh: THREE.Mesh;
      binding: AssetMeshBinding;
    }> = [];
    const staticList: THREE.Mesh[] = [];

    // The original GLB tree is never reparented. Use display meshes with
    // imported world transforms baked into their local coordinates.
    scene.updateWorldMatrix(true, true);
    const sourcePaths = buildImportedNodePaths(scene);
    const nameCount = new Map<string, number>();
    scene.traverse(child => {
      if (!(child as THREE.Mesh).isMesh) return;
      nameCount.set(child.name, (nameCount.get(child.name) ?? 0) + 1);
    });

    scene.traverse((child) => {
      if (!(child as THREE.Mesh).isMesh) return;
      const originalMesh = child as THREE.Mesh;
      const mesh = cloneImportedAnatomyMesh(originalMesh, scene, sourcePaths.get(originalMesh), true);

      // Engineer-approved source path takes precedence. A duplicated CAD name
      // is never an authoritative PM target unless its exact path is mapped.
      const sourcePath = sourcePaths.get(originalMesh) || originalMesh.name;
      const binding = matchImportedMeshBinding(originalMesh.name, sourcePath,
        (nameCount.get(originalMesh.name) ?? 0) > 1, bindings);
      if (binding) {
        applyBindingToMesh(mesh, binding);
        interactive.push({ mesh, binding });
      } else {
        staticList.push(mesh);
      }
    });

    return { interactiveMeshes: interactive, staticMeshes: staticList };
  }, [scene, bindings]);

  const anatomyManifest = useMemo<ImportedAnatomyMesh[]>(() => [
    ...interactiveMeshes.map(({mesh,binding})=>({
      id:mesh.userData.__iAssetsSourceMeshUUID as string || mesh.uuid,
      path:String(mesh.userData.__iAssetsSourceNodePath || mesh.name),
      meshName:mesh.name,
      selectionKey:binding.meshName,
      componentId:binding.componentId ?? null,
      assetId:binding.assetId ?? null,
      componentCode:binding.componentCode,
      verified:Boolean(binding.componentId),
    })),
    ...staticMeshes.map(mesh=>({
      id:mesh.userData.__iAssetsSourceMeshUUID as string || mesh.uuid,
      path:String(mesh.userData.__iAssetsSourceNodePath || mesh.name),
      meshName:mesh.name,
      selectionKey:String(mesh.userData.__iAssetsSourceNodePath || mesh.name),
      componentId:null,
      assetId:null,
      verified:false,
    })),
  ].sort((a,b)=>a.path.localeCompare(b.path)), [interactiveMeshes,staticMeshes]);

  // Canvas rendering is isolated from the main React reconciler.
  useEffect(() => {
    const timer = setTimeout(() => {
      onMeshCount?.(anatomyManifest.length);
      onAnatomyManifest?.(anatomyManifest);
    }, 0);
    return () => clearTimeout(timer);
  }, [onMeshCount, onAnatomyManifest, anatomyManifest]);

  // Compute model bounds for LOD and auto-scale
  const modelBounds = useMemo(() => {
    return computeBoundingSphere(scene);
  }, [scene]);

  // Auto-scale and center on mount
  useEffect(() => {
    if (!autoScale && !autoCenter) return;

    const bounds = computeSceneBounds(scene);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    bounds.getSize(size);
    bounds.getCenter(center);

    const maxDim = Math.max(size.x, size.y, size.z, 0.001);
    const scale = autoScale ? maxDimension / maxDim : 1;

    if (groupRef.current) {
      groupRef.current.scale.setScalar(scale);
      if (autoCenter) {
        groupRef.current.position.sub(center.multiplyScalar(scale));
      }
    }
  }, [scene, autoCenter, autoScale, maxDimension]);

  // Viewer meshes own cloned materials so highlights never mutate the cached
  // manufacturer source. Release those lightweight clones when bindings or
  // models change; textures and geometry remain owned by the source cache.
  useEffect(() => {
    return () => {
      for (const mesh of [...interactiveMeshes.map(item => item.mesh), ...staticMeshes]) {
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const material of materials) material?.dispose();
      }
    };
  }, [interactiveMeshes, staticMeshes]);

  // Dispose source scene cache only when the actual model changes/unmounts.
  useEffect(() => {
    return () => {
      releaseToCache(scene.userData.__sourceUrl || '');
    };
  }, [scene]);

  return (
    <>
      <group ref={groupRef} userData={{ __iAssetsModelRoot: true }}>
        {/* Render interactive meshes with binding behavior */}
        {interactiveMeshes.map(({ mesh, binding }) => (
          <InteractiveMesh
            key={`${binding.meshName}-${binding.assetId}`}
            mesh={mesh}
            binding={binding}
          />
        ))}

        {/* Render static (non-bound) meshes normally */}
        {staticMeshes.map((mesh) => (
          <primitive
            key={`static-${mesh.uuid}`}
            object={mesh}
            onClick={event=>{
              event.stopPropagation();
              const path=String(mesh.userData.__iAssetsSourceNodePath || mesh.name);
              setTimeout(()=>useDigitalTwinStore.getState().selectMesh(path, ''),0);
            }}
            castShadow
            receiveShadow
          />
        ))}
      </group>

      {/* LOD Manager — headless component that toggles visibility */}
      <LODManager
        groupRef={groupRef}
        interactiveMeshes={interactiveMeshes}
        staticMeshes={staticMeshes}
        bounds={modelBounds}
        enabled={interactiveMeshes.length > 5}
      />

      {/* Performance Monitor — logs FPS warnings */}
      <PerformanceMonitor enabled={interactiveMeshes.length > 20} />
    </>
  );
}

// ============================================================================
// Loading fallback inside Canvas
// ============================================================================

function CanvasLoadingIndicator() {
  return null; // Handled by the parent Suspense boundary
}

// ============================================================================
// Error Fallback component inside Canvas
// ============================================================================

function ErrorFallback({
  error,
  onRetry,
}: {
  error: string;
  onRetry?: () => void;
}) {
  return (
    <group>
      <mesh position={[0, 0.5, 0]}>
        <boxGeometry args={[1.5, 0.8, 1.5]} />
        <meshStandardMaterial color="#ef4444" transparent opacity={0.3} wireframe />
      </mesh>
    </group>
  );
}

// ============================================================================
// Main ModelLoader Component
// ============================================================================

export function ModelLoader({
  modelUrl,
  onLoadingStart,
  onLoadingComplete,
  onProgress,
  onError,
  autoCenter = true,
  autoScale = true,
  maxDimension = 8,
  bindings: externalBindings,
  onMeshCount,
  onAnatomyManifest,
  children,
}: ModelLoaderProps) {
  const [localError, setLocalError] = useState<string | null>(null);

  // Use refs for callbacks to avoid useEffect dependency loops
  const onProgressRef = useRef(onProgress);
  onProgressRef.current = onProgress;
  const onLoadingStartRef = useRef(onLoadingStart);
  onLoadingStartRef.current = onLoadingStart;
  const onLoadingCompleteRef = useRef(onLoadingComplete);
  onLoadingCompleteRef.current = onLoadingComplete;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  // Use external bindings if provided, otherwise empty
  const bindings = externalBindings ?? [];

  // Custom GLTF loading with progress
  const { scene, error: loadError, isLoading } = useGLTFLoader(
    modelUrl,
    onProgressRef,
    onLoadingStartRef,
    onLoadingCompleteRef,
    onErrorRef,
  );

  // Sync error state
  useEffect(() => {
    if (loadError) {
      setLocalError(loadError.message);
    }
  }, [loadError]);

  // CRITICAL: Removed redundant useEffect that called onLoadingStart directly.
  // Loading start is already handled via the onLoadingStartRef in useGLTFLoader.
  // That ref-based path uses setTimeout(0) to defer to main reconciler, while
  // this useEffect was firing inside R3F's reconciler, risking Error #185.

  // ── Empty state when no model URL ─────────────────────────────────────────

  if (!modelUrl) {
    return (
      <group>
        <mesh position={[0, 0.5, 0]}>
          <boxGeometry args={[2, 1, 2]} />
          <meshStandardMaterial
            color="#333340"
            wireframe
            transparent
            opacity={0.4}
          />
        </mesh>
      </group>
    );
  }

  // ── Error state ───────────────────────────────────────────────────────────

  if (localError) {
    return <ErrorFallback error={localError} />;
  }

  // ── Still loading ─────────────────────────────────────────────────────────

  if (isLoading || !scene) {
    return (
      <group>
        {/* Loading state is handled by parent overlay */}
        <CanvasLoadingIndicator />
      </group>
    );
  }

  // ── Render loaded model ──────────────────────────────────────────────────

  // Store source URL for cache management (clone first to avoid mutating hook result)
  // eslint-disable-next-line react-hooks/immutability
  scene.userData.__sourceUrl = modelUrl;

  return (
    <group>
      <ProcessedModel
        scene={scene}
        bindings={bindings}
        onMeshCount={onMeshCount}
        onAnatomyManifest={onAnatomyManifest}
        maxDimension={maxDimension}
        autoCenter={autoCenter}
        autoScale={autoScale}
      />
      {children}
    </group>
  );
}

export default ModelLoader;
