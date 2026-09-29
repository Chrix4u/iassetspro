'use client';

import React, {
  Suspense,
  useState,
  useCallback,
  useMemo,
  useRef,
  useEffect,
} from 'react';
import { Canvas } from '@react-three/fiber';
import {
  OrbitControls,
  OrthographicCamera,
  PerspectiveCamera,
  Preload,
  Stats,
} from '@react-three/drei';
import * as THREE from 'three';
import { useDigitalTwinStore } from '@/stores/digitalTwinStore';
import { useDigitalTwinScene, useMeshInteraction, useCameraControls } from '@/hooks/useDigitalTwin';
import { api } from '@/lib/api';

import { SceneLighting } from './SceneLighting';
import { GroundPlane } from './GroundPlane';
import { ModelLoader } from './ModelLoader';
import { InteractiveMesh, type AssetMeshBinding } from './InteractiveMesh';
import { IoTOverlayLayer } from './IoTOverlayLayer';
import { SectionPlane } from './SectionPlane';
import { ExplodedView } from './ExplodedView';
import { HotspotLayer } from './HotspotLayer';
import { AnnotationLayer } from './AnnotationLayer';
import { TwinToolbar } from './TwinToolbar';
import { SceneTreePanel } from './SceneTreePanel';
import { ComponentInfoPanel } from './ComponentInfoPanel';

import {
  Box,
  Upload,
  RefreshCw,
  AlertTriangle,
  Loader2,
  Monitor,
  Eye,
  Layers,
  Plus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

// ============================================================================
// Types
// ============================================================================

export interface DigitalTwinViewerProps {
  /** Scene ID to load (null for empty state) */
  sceneId?: string | null;
  /** Override model URL (optional) */
  modelUrl?: string | null;
  /** External asset-mesh bindings (optional) */
  bindings?: AssetMeshBinding[];
  /** Asset ID — used to resolve scenes when sceneId is not provided */
  assetId?: string | null;
  /** Digital Twin ID — used to fetch the default scene when sceneId is not provided */
  twinId?: string | null;
  /** Digital Twin display name */
  twinName?: string | null;
  /** Height of the viewer container (CSS value) */
  height?: string;
  /** IoT polling interval in ms (0 to disable) */
  iotPollInterval?: number;
  /** Whether to show the scene tree panel */
  showSceneTree?: boolean;
  /** Whether to show the component info panel */
  showInfoPanel?: boolean;
  /** Whether to enable WebSocket real-time updates (default: true) */
  enableRealtime?: boolean;
  /** Whether to show the toolbar */
  showToolbar?: boolean;
  /** Custom loading component */
  loadingComponent?: React.ReactNode;
  /** Custom error component */
  errorComponent?: (error: string, retry: () => void) => React.ReactNode;
}

// ============================================================================
// No Scene State (twin has no scenes yet)
// ============================================================================

function NoSceneOverlay({
  twinName,
  onCreateScene,
  isTreeOpen = false,
}: {
  twinName?: string | null;
  onCreateScene?: () => void;
  isTreeOpen?: boolean;
}) {
  return (
    <div className={`absolute top-0 right-0 bottom-0 flex items-center justify-center z-10 pointer-events-none transition-all duration-300 ${isTreeOpen ? 'left-[280px]' : 'left-0'}`}>
      <div className="flex flex-col items-center gap-4 text-slate-400 pointer-events-auto">
        <div
          className="h-20 w-20 rounded-2xl flex items-center justify-center"
          style={{
            background: 'rgba(16,185,129,0.08)',
            border: '2px dashed rgba(16,185,129,0.2)',
          }}
        >
          <Layers className="h-10 w-10 text-emerald-500/50" />
        </div>
        <div className="text-center">
          <h3 className="text-sm font-semibold text-slate-300 mb-1">
            No Scenes Available
          </h3>
          <p className="text-xs text-slate-500 max-w-[280px]">
            {twinName
              ? `The digital twin "${twinName}" has no 3D scenes yet. Create a scene to start viewing.`
              : 'This digital twin has no 3D scenes yet. Create a scene to start viewing.'}
          </p>
        </div>
        {onCreateScene && (
          <Button
            variant="outline"
            size="sm"
            onClick={onCreateScene}
            className="mt-2 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-300"
          >
            <Plus className="h-4 w-4 mr-2" />
            Create Scene
          </Button>
        )}
      </div>
    </div>
  );
}
NoSceneOverlay.displayName = 'NoSceneOverlay';

// ============================================================================
// Loading State (shown inside Canvas)
// ============================================================================

function ViewerLoadingState() {
  return (
    <mesh position={[0, 0, 0]}>
      <torusGeometry args={[1.5, 0.08, 16, 64]} />
      <meshStandardMaterial color="#22d3ee" transparent opacity={0.3} />
    </mesh>
  );
}
ViewerLoadingState.displayName = 'ViewerLoadingState';

// ============================================================================
// Empty State (no model loaded)
// ============================================================================

function EmptyStateOverlay({ onUpload, isTreeOpen = false }: { onUpload?: () => void; isTreeOpen?: boolean }) {
  return (
    <div className={`absolute top-0 right-0 bottom-0 flex items-center justify-center z-10 pointer-events-none transition-all duration-300 ${isTreeOpen ? 'left-[280px]' : 'left-0'}`}>
      <div className="flex flex-col items-center gap-4 text-slate-400 pointer-events-auto">
        <div
          className="h-20 w-20 rounded-2xl flex items-center justify-center"
          style={{
            background: 'rgba(34,211,238,0.08)',
            border: '2px dashed rgba(34,211,238,0.2)',
          }}
        >
          <Box className="h-10 w-10 text-cyan-500/50" />
        </div>
        <div className="text-center">
          <h3 className="text-sm font-semibold text-slate-300 mb-1">
            No Model Loaded
          </h3>
          <p className="text-xs text-slate-500 max-w-[250px]">
            Upload a 3D model (GLTF/GLB) to start the Digital Twin viewer, or select an asset with an associated twin.
          </p>
        </div>
        {onUpload && (
          <Button
            variant="outline"
            size="sm"
            onClick={onUpload}
            className="mt-2 border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10 hover:text-cyan-300"
          >
            <Upload className="h-4 w-4 mr-2" />
            Upload Model
          </Button>
        )}
      </div>
    </div>
  );
}
EmptyStateOverlay.displayName = 'EmptyStateOverlay';

// ============================================================================
// Error State
// ============================================================================

function ErrorStateOverlay({
  error,
  onRetry,
}: {
  error: string;
  onRetry: () => void;
}) {
  return (
    <div className="absolute inset-0 flex items-center justify-center z-10 bg-black/20">
      <div
        className="flex flex-col items-center gap-4 p-6 rounded-xl max-w-[320px] text-center"
        style={{
          background: 'rgba(10,10,18,0.95)',
          border: '1px solid rgba(239,68,68,0.2)',
          backdropFilter: 'blur(16px)',
        }}
      >
        <div className="h-12 w-12 rounded-full bg-red-500/10 flex items-center justify-center">
          <AlertTriangle className="h-6 w-6 text-red-400" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-slate-200 mb-1">
            Failed to Load Scene
          </h3>
          <p className="text-xs text-slate-400 leading-relaxed">{error}</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={onRetry}
          className="border-slate-600 text-slate-300 hover:bg-white/5"
        >
          <RefreshCw className="h-3.5 w-3.5 mr-2" />
          Retry
        </Button>
      </div>
    </div>
  );
}
ErrorStateOverlay.displayName = 'ErrorStateOverlay';

// ============================================================================
// Camera Controller (R3F component inside Canvas)
// ============================================================================

function CameraController({ locked2D = false }: { locked2D?: boolean }) {
  const { cameraPosition, cameraTarget, isTransitioning } = useCameraControls();
  const controlsRef = useRef<any>(null);
  // Use refs to avoid unstable deps in useEffect.
  // cameraPosition/cameraTarget are arrays that change reference on each
  // animation frame — putting them directly in deps causes Error #185.
  const positionRef = useRef(cameraPosition);
  const targetRef = useRef(cameraTarget);
  const transitioningRef = useRef(isTransitioning);

  // Sync refs without causing re-renders
  positionRef.current = cameraPosition;
  targetRef.current = cameraTarget;
  transitioningRef.current = isTransitioning;

  // Update OrbitControls once after mount.
  // Subsequent position updates happen via R3F's internal frame loop,
  // not via useEffect, to avoid Error #185.
  useEffect(() => {
    if (!controlsRef.current) return;
    const ctrl = controlsRef.current;
    const target = targetRef.current;
    const position = positionRef.current;
    ctrl.target.set(target[0], target[1], target[2]);
    ctrl.object.position.set(position[0], position[1], position[2]);
    ctrl.update();
    // Only run once after mount — subsequent updates happen via R3F's frame loop
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enableDamping
      dampingFactor={0.08}
      minDistance={1}
      maxDistance={100}
      maxPolarAngle={Math.PI * 0.85}
      enablePan
      enableZoom
      enableRotate={!locked2D}
    />
  );
}
CameraController.displayName = 'CameraController';

// ============================================================================
// Click handler for deselecting
// ============================================================================

function BackgroundClickHandler() {
  // Use getState() for actions — no React subscription needed (stable refs).
  // Avoids cross-reconciler Zustand subscription (Error #185).
  return (
    <mesh
      visible={false}
      position={[0, 0, 0]}
      onClick={() => {
        setTimeout(() => {
          const store = useDigitalTwinStore.getState();
          store.selectMesh(null, null);
          store.setInfoPanelOpen(false);
        }, 0);
      }}
    >
      <sphereGeometry args={[200, 16, 16]} />
      <meshBasicMaterial side={THREE.BackSide} />
    </mesh>
  );
}
BackgroundClickHandler.displayName = 'BackgroundClickHandler';

// ============================================================================
// Main DigitalTwinViewer Component
// ============================================================================

// CRITICAL: Set displayName on ALL components so React's error boundaries
// show real names in production builds (instead of minified rA, nm, etc.)

export function DigitalTwinViewer({
  sceneId = null,
  modelUrl: propModelUrl,
  bindings: propBindings = [],
  assetId = null,
  twinId = null,
  twinName = null,
  height = 'calc(100vh - 120px)',
  iotPollInterval = 15000,
  enableRealtime = true,
  showSceneTree = true,
  showInfoPanel = true,
  showToolbar = true,
  loadingComponent,
  errorComponent,
}: DigitalTwinViewerProps) {
  // ── Store state ──────────────────────────────────────────────────────────
  const currentScene = useDigitalTwinStore((s) => s.currentScene);
  const modelUrl = useDigitalTwinStore((s) => s.modelUrl);
  const sceneError = useDigitalTwinStore((s) => s.sceneError);
  const isLoadingScene = useDigitalTwinStore((s) => s.isLoadingScene);
  const isInfoPanelOpen = useDigitalTwinStore((s) => s.isInfoPanelOpen);
  const selectedMeshName = useDigitalTwinStore((s) => s.selectedMeshName);
  const selectedAssetId = useDigitalTwinStore((s) => s.selectedAssetId);
  const loadScene = useDigitalTwinStore((s) => s.loadScene);
  const selectMesh = useDigitalTwinStore((s) => s.selectMesh);
  const setInfoPanelOpen = useDigitalTwinStore((s) => s.setInfoPanelOpen);
  const setModelUrl = useDigitalTwinStore((s) => s.setModelUrl);
  const reset = useDigitalTwinStore((s) => s.reset);
  const loadAssetData = useDigitalTwinStore((s) => s.loadAssetData);

  // ── Hooks ────────────────────────────────────────────────────────────────
  const { resetCamera, setCameraPosition, setCameraTarget } = useCameraControls();
  const { error: hookError, refresh } = useDigitalTwinScene(sceneId, {
    iotPollInterval,
    enableRealtime,
  });

  // ── Load asset data when scene loads or selection changes ──────────────
  // CRITICAL: This was previously done via queueMicrotask inside the store's
  // loadScene() and selectMesh() actions, which caused React Error #185
  // because the microtask fired during React's concurrent render phase.
  // Using useEffect ensures loadAssetData fires AFTER the render is committed,
  // completely eliminating the cascading setState issue.
  useEffect(() => {
    const assetId = selectedAssetId ?? currentScene?.assetId;
    if (assetId) {
      loadAssetData(assetId);
    }
  }, [selectedAssetId, currentScene?.assetId, loadAssetData]);

  // ── Local UI state ──────────────────────────────────────────────────────
  const [isTreeOpen, setIsTreeOpen] = useState(showSceneTree);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [viewMode, setViewMode] = useState<'3d' | '2d-front' | '2d-top' | '2d-side'>('3d');
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [isModelLoading, setIsModelLoading] = useState(false);
  const [modelError, setModelError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  // Scene resolution state (when twinId is used without sceneId)
  const [isResolvingScene, setIsResolvingScene] = useState(false);
  const [resolvedModelUrl, setResolvedModelUrl] = useState<string | null>(null);
  const [hasNoScenes, setHasNoScenes] = useState(false);

  // CRITICAL: Throttled progress handler — prevents Error #185 by limiting
  // how often setLoadingProgress fires during Canvas initialization.
  // ModelLoader calls onProgress every ~200ms via setInterval; each call
  // triggers a full re-render that can interleave with R3F Canvas setup.
  const lastProgressTimeRef = useRef(0);
  const handleProgress = useCallback((pct: number) => {
    const now = Date.now();
    // Always allow 0% and 100% through immediately for UX
    if (pct === 0 || pct === 100) {
      lastProgressTimeRef.current = now;
      setLoadingProgress(pct);
      return;
    }
    // Throttle to max once per 500ms to avoid overwhelming React during Canvas init
    if (now - lastProgressTimeRef.current >= 500) {
      lastProgressTimeRef.current = now;
      setLoadingProgress(pct);
    }
  }, []);

  // Canvas ref for screenshots
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // ── Memoize Canvas props to prevent infinite re-renders in R3F ────────
  // R3F's Canvas uses useEffect internally which depends on prop references.
  // Inline objects/functions create new refs every render, causing Error #185.
  const glConfig = useMemo(() => ({
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance' as const,
    toneMapping: THREE.ACESFilmicToneMapping,
    toneMappingExposure: 1.0,
    outputColorSpace: THREE.SRGBColorSpace,
  }), []);

  const dprValue = useMemo<[number, number]>(() => [1, 2], []);

  const handleCreated = useCallback(({ gl }: { gl: THREE.WebGLRenderer }) => {
    canvasRef.current = gl.domElement;
    gl.setClearColor('#0a0a12');
    gl.localClippingEnabled = true;
  }, []);

  // ── Resolve scene from twinId when sceneId is not provided ─────────────
  useEffect(() => {
    // Only attempt resolution when sceneId is not given but twinId is
    if (sceneId || !twinId || propModelUrl) {
      return;
    }

    let cancelled = false;

    const resolveScene = async () => {
      setIsResolvingScene(true);
      setHasNoScenes(false);
      setResolvedModelUrl(null);

      try {
        // Fetch scenes for this twin
        const scenesRes = await api.get<Array<{
          id: string;
          name: string;
          modelId: string;
          model?: { id: string; name: string; format: string; filePath: string } | null;
        }>>(`/api/digital-twin-scenes?twinId=${twinId}`);

        if (cancelled) return;

        if (!scenesRes.success || !scenesRes.data || scenesRes.data.length === 0) {
          // Twin has no scenes
          setHasNoScenes(true);
          setIsResolvingScene(false);
          return;
        }

        // Take the first scene and load its complete relational context
        // (hotspots, annotations, camera presets, mesh bindings) into the store.
        const firstScene = scenesRes.data[0];
        await loadScene(firstScene.id);
        if (cancelled) return;

        if (!firstScene.modelId) {
          // Scene exists but has no model linked
          setHasNoScenes(true);
          setIsResolvingScene(false);
          return;
        }

        // If the scene already has filePath from the list endpoint, use it directly
        if (firstScene.model?.filePath) {
          setResolvedModelUrl(firstScene.model.filePath);
          setModelUrl(firstScene.model.filePath);
          setIsResolvingScene(false);
          return;
        }

        // Otherwise, fetch the model details
        const modelRes = await api.get<{ filePath: string }>(`/api/asset-models/${firstScene.modelId}`);

        if (cancelled) return;

        if (modelRes.success && modelRes.data?.filePath) {
          setResolvedModelUrl(modelRes.data.filePath);
          setModelUrl(modelRes.data.filePath);
        } else {
          // Model not found or no filePath
          setHasNoScenes(true);
        }
      } catch {
        // Silently fail — the empty state will show
        setHasNoScenes(true);
      } finally {
        if (!cancelled) {
          setIsResolvingScene(false);
        }
      }
    };

    resolveScene();

    return () => {
      cancelled = true;
    };
  }, [sceneId, twinId, propModelUrl, loadScene, setModelUrl, retryCount]);

  // ── Effective model URL ─────────────────────────────────────────────────
  const effectiveModelUrl = propModelUrl ?? resolvedModelUrl ?? modelUrl;

  // ── Error handling ──────────────────────────────────────────────────────
  const effectiveError = sceneError || hookError || modelError;

  // ── Retry handler ───────────────────────────────────────────────────────
  const handleRetry = useCallback(() => {
    setModelError(null);
    setRetryCount((c) => c + 1);
    if (sceneId) {
      loadScene(sceneId);
    }
    refresh();
  }, [sceneId, loadScene, refresh]);

  // ── Screenshot handler ──────────────────────────────────────────────────
  const handleScreenshot = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const link = document.createElement('a');
    link.download = `digital-twin-${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }, []);

  // ── Fullscreen toggle ──────────────────────────────────────────────────
  const handleToggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  }, []);

  const handleViewModeChange = useCallback((mode: '3d' | '2d-front' | '2d-top' | '2d-side') => {
    setViewMode(mode);
    if (mode === '3d') {
      resetCamera();
      return;
    }

    const positions: Record<'2d-front' | '2d-top' | '2d-side', [number, number, number]> = {
      '2d-front': [0, 0, 20],
      '2d-top': [0, 20, 0.001],
      '2d-side': [20, 0, 0],
    };
    setCameraTarget([0, 0, 0]);
    setCameraPosition(positions[mode]);
  }, [resetCamera, setCameraPosition, setCameraTarget]);

  // ── Model loading callbacks ────────────────────────────────────────────
  const handleModelLoadingStart = useCallback(() => {
    setIsModelLoading(true);
    setLoadingProgress(0);
    setModelError(null);
  }, []);

  const handleModelLoadingComplete = useCallback(() => {
    setIsModelLoading(false);
    setLoadingProgress(100);
  }, []);

  const handleModelError = useCallback((err: Error) => {
    setModelError(err.message);
    setIsModelLoading(false);
  }, []);

  // ── Scene tree toggle ───────────────────────────────────────────────────
  const handleToggleTree = useCallback(() => {
    setIsTreeOpen((prev) => !prev);
  }, []);

  // ── Mesh select from scene tree ────────────────────────────────────────
  const handleMeshSelectFromTree = useCallback(
    (meshName: string, assetId?: string) => {
      // Use the already-subscribed actions instead of getState()
      selectMesh(meshName, assetId);
      setInfoPanelOpen(true);
    },
    [selectMesh, setInfoPanelOpen],
  );

  // ── Custom error component ─────────────────────────────────────────────
  const errorContent = errorComponent ? (
    errorComponent(effectiveError ?? 'Unknown error', handleRetry)
  ) : (
    <ErrorStateOverlay error={effectiveError ?? 'Unknown error'} onRetry={handleRetry} />
  );

  // ── Bindings for exploded view ─────────────────────────────────────────
  const effectiveBindings = propBindings.length > 0 ? propBindings : [];

  return (
    <div
      className="relative w-full overflow-hidden"
      style={{
        height,
        background: 'linear-gradient(135deg, #0a0a12 0%, #0d0d1a 50%, #0a0f14 100%)',
      }}
    >
      {/* ── 3D Canvas (mounts empty, children added after delay) ────────── */}
      <Canvas
        shadows
        dpr={dprValue}
        gl={glConfig}
        style={{ background: '#0a0a12' }}
        onCreated={handleCreated}
      >
          <>
            <Suspense fallback={<ViewerLoadingState />}>
              {/* Camera */}
              {viewMode === '3d' ? (
                <PerspectiveCamera makeDefault fov={50} position={[10, 8, 10]} near={0.1} far={1000} />
              ) : (
                <OrthographicCamera makeDefault zoom={45} position={viewMode === '2d-front' ? [0, 0, 20] : viewMode === '2d-top' ? [0, 20, 0.001] : [20, 0, 0]} near={0.1} far={1000} />
              )}

              {/* Camera controls */}
              <CameraController locked2D={viewMode !== '3d'} />

              {/* Lighting */}
              <SceneLighting />

              {/* Ground plane */}
              <GroundPlane />

              {/* Model */}
              {effectiveModelUrl && (
                <ModelLoader
                  modelUrl={effectiveModelUrl}
                  bindings={effectiveBindings}
                  onLoadingStart={handleModelLoadingStart}
                  onLoadingComplete={handleModelLoadingComplete}
                  onError={handleModelError}
                  onProgress={handleProgress}
                />
              )}

              {/* Exploded view */}
              <ExplodedView bindings={effectiveBindings} />

              {/* Section plane */}
              <SectionPlane />

              {/* IoT overlay */}
              <IoTOverlayLayer />

              {/* Hotspots */}
              <HotspotLayer />

              {/* Annotations */}
              <AnnotationLayer />

              {/* Background click handler (deselect) */}
              <BackgroundClickHandler />

              <Preload all />
            </Suspense>

          </>
      </Canvas>

      {/* ── Loading overlay ──────────────────────────────────────────────── */}
      {(isLoadingScene || isResolvingScene || (isModelLoading && loadingProgress < 100)) && (
        <div className="absolute inset-0 flex items-center justify-center z-10 bg-black/30 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3">
            <div className="relative">
              <Loader2 className="h-8 w-8 text-cyan-400 animate-spin" />
              <div
                className="absolute inset-0 rounded-full animate-ping"
                style={{ background: 'radial-gradient(circle, rgba(34,211,238,0.15), transparent)' }}
              />
            </div>
            <div className="text-center">
              <p className="text-xs text-slate-300 font-medium">
                {isResolvingScene ? 'Resolving scene...' : isLoadingScene ? 'Loading scene...' : 'Loading model...'}
              </p>
              {loadingProgress > 0 && loadingProgress < 100 && (
                <div className="mt-2 w-32">
                  <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-cyan-500 rounded-full transition-all duration-300"
                      style={{ width: `${loadingProgress}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1">
                    {Math.round(loadingProgress)}%
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Error overlay ────────────────────────────────────────────────── */}
      {effectiveError && !isLoadingScene && errorContent}

      {/* ── Empty state overlay (no model) ───────────────────────────────── */}
      {!effectiveModelUrl && !isLoadingScene && !isResolvingScene && !effectiveError && !hasNoScenes && !twinId && (
        <EmptyStateOverlay isTreeOpen={isTreeOpen} />
      )}

      {/* ── No scene state (twin has no scenes) ──────────────────────────── */}
      {!effectiveModelUrl && !isLoadingScene && !isResolvingScene && !effectiveError && hasNoScenes && (
        <NoSceneOverlay twinName={twinName} isTreeOpen={isTreeOpen} />
      )}

      {/* ── Status bar (bottom) ──────────────────────────────────────────── */}
      <div
        className="absolute bottom-0 left-0 right-0 z-10 flex items-center justify-between px-4 py-1.5"
        style={{
          background: 'rgba(10,10,18,0.7)',
          borderTop: '1px solid rgba(148,163,184,0.06)',
          backdropFilter: 'blur(8px)',
        }}
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <Monitor className="h-3 w-3 text-cyan-400" />
            <span className="text-[10px] text-slate-400">Digital Twin Viewer · {viewMode === '3d' ? '3D' : viewMode.replace('2d-', '2D ').replace(/^2D /, '2D ').replace(/\b\w/g, c => c.toUpperCase())}</span>
          </div>
          {currentScene && (
            <>
              <span className="text-slate-700">•</span>
              <span className="text-[10px] text-slate-400">{currentScene.name}</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-3">
          {selectedMeshName && (
            <span className="text-[10px] text-cyan-400 font-mono">
              Selected: {selectedMeshName}
            </span>
          )}
          <div className="flex items-center gap-1">
            <Eye className="h-3 w-3 text-emerald-400" />
            <span className="text-[10px] text-slate-500">Ready</span>
          </div>
        </div>
      </div>

      {/* ── Floating Toolbar (top center) ────────────────────────────────── */}
      {showToolbar && (
        <TwinToolbar
          onResetCamera={resetCamera}
          onScreenshot={handleScreenshot}
          isFullscreen={isFullscreen}
          onToggleFullscreen={handleToggleFullscreen}
          viewMode={viewMode}
          onViewModeChange={handleViewModeChange}
          isTreeOpen={isTreeOpen}
        />
      )}

      {/* ── Scene Tree Panel (left) ──────────────────────────────────────── */}
      <SceneTreePanel
        isOpen={isTreeOpen}
        onToggle={handleToggleTree}
        onMeshSelect={handleMeshSelectFromTree}
      />

      {/* ── Component Info Panel (right) ─────────────────────────────────── */}
      {showInfoPanel && isInfoPanelOpen && selectedAssetId && (
        <ComponentInfoPanel isOpen={isInfoPanelOpen} />
      )}
    </div>
  );
}

DigitalTwinViewer.displayName = 'DigitalTwinViewer';

export default DigitalTwinViewer;