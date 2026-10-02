import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { api } from '@/lib/api';
import type {
  ComponentRegistryItem,
  FailureAnalysisData,
  FailureRecord,
  PredictionAlertData,
  PredictiveModelData,
} from '@/types';

// ============================================================================
// Types
// ============================================================================

/** Health score entry keyed by mesh name */
export interface MeshHealthEntry {
  score: number; // 0-100
  status: 'healthy' | 'warning' | 'critical' | 'unknown';
}

/** Live IoT reading for a mesh */
export interface LiveReading {
  value: number;
  unit: string;
  timestamp: string;
}

/** Camera preset configuration */
export interface CameraPreset {
  name: string;
  position: [number, number, number];
  target: [number, number, number];
  fov?: number;
}

/** Scene data from the digital twin API */
export interface DigitalTwinScene {
  id: string;
  name: string;
  assetId: string;
  description?: string;
  modelUrl?: string;
  cameraPresets?: CameraPreset[];
  hotspots?: DigitalTwinHotspot[];
  annotations?: DigitalTwinAnnotation[];
}

/** Hotspot pinned to a mesh */
export interface DigitalTwinHotspot {
  id: string;
  meshName: string;
  position: [number, number, number];
  title: string;
  description?: string;
  type: 'info' | 'warning' | 'critical' | 'link';
  linkUrl?: string;
}

/** Annotation attached to a scene */
export interface DigitalTwinAnnotation {
  id: string;
  meshName?: string;
  position: [number, number, number];
  text: string;
  author?: string;
  createdAt?: string;
}

/** Section plane axis */
export type SectionAxis = 'x' | 'y' | 'z';

// ============================================================================
// Default values
// ============================================================================

const DEFAULT_CAMERA_POSITION: [number, number, number] = [5, 5, 5];
const DEFAULT_CAMERA_TARGET: [number, number, number] = [0, 0, 0];

function parseVector3(value: unknown, fallback: [number, number, number] = [0, 0, 0]): [number, number, number] {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    if (Array.isArray(parsed) && parsed.length >= 3) {
      const tuple = parsed.slice(0, 3).map(Number);
      if (tuple.every(Number.isFinite)) return tuple as [number, number, number];
    }
    if (parsed && typeof parsed === 'object') {
      const record = parsed as Record<string, unknown>;
      const tuple = [Number(record.x), Number(record.y), Number(record.z)];
      if (tuple.every(Number.isFinite)) return tuple as [number, number, number];
    }
  } catch {
    // Fall back to a safe origin when legacy JSON is malformed.
  }
  return fallback;
}

function normalizeHotspotType(icon: unknown): DigitalTwinHotspot['type'] {
  const value = String(icon || '').toLowerCase();
  if (value === 'danger' || value === 'critical') return 'critical';
  if (value === 'warning') return 'warning';
  if (value === 'link') return 'link';
  return 'info';
}

function normalizeDigitalTwinScene(raw: any): DigitalTwinScene {
  const meshBindings = Array.isArray(raw?.model?.meshBindings) ? raw.model.meshBindings : [];
  const meshNameByBindingId = new Map(meshBindings.map((binding: any) => [binding.id, binding.meshName]));

  return {
    id: String(raw?.id || ''),
    name: String(raw?.name || 'Digital Twin Scene'),
    assetId: String(raw?.assetId || raw?.twin?.assetId || raw?.twin?.asset?.id || ''),
    description: raw?.description || undefined,
    modelUrl: raw?.modelUrl || raw?.model?.filePath || undefined,
    cameraPresets: (Array.isArray(raw?.cameraPresets) ? raw.cameraPresets : []).map((preset: any) => ({
      name: String(preset.name || 'View'),
      position: parseVector3(preset.position, DEFAULT_CAMERA_POSITION),
      target: parseVector3(preset.target, DEFAULT_CAMERA_TARGET),
      fov: Number.isFinite(Number(preset.fov)) ? Number(preset.fov) : undefined,
    })),
    hotspots: (Array.isArray(raw?.hotspots) ? raw.hotspots : []).filter((hotspot: any) => hotspot?.isActive !== false).map((hotspot: any) => ({
      id: String(hotspot.id),
      meshName: String(hotspot.meshName || meshNameByBindingId.get(hotspot.bindingId) || ''),
      position: parseVector3(hotspot.position),
      title: String(hotspot.title || hotspot.label || 'Hotspot'),
      description: hotspot.description || undefined,
      type: normalizeHotspotType(hotspot.type || hotspot.icon),
      linkUrl: hotspot.linkUrl || undefined,
    })),
    annotations: (Array.isArray(raw?.annotations) ? raw.annotations : []).map((annotation: any) => ({
      id: String(annotation.id),
      meshName: annotation.meshName || undefined,
      position: parseVector3(annotation.position),
      text: String(annotation.text || annotation.content || annotation.title || ''),
      author: annotation.author?.fullName || annotation.author?.username || undefined,
      createdAt: annotation.createdAt || undefined,
    })),
  };
}

interface DigitalTwinStateData {
  // Scene
  currentSceneId: string | null;
  currentScene: DigitalTwinScene | null;
  scenes: DigitalTwinScene[];
  isLoadingScene: boolean;
  sceneError: string | null;

  // Model
  modelUrl: string | null;
  modelLoading: boolean;
  modelError: string | null;

  // Selection
  selectedMeshName: string | null;
  selectedAssetId: string | null;
  selectedAsset: Record<string, unknown> | null;
  hoveredMeshName: string | null;
  isInfoPanelOpen: boolean;

  // Camera
  cameraPosition: [number, number, number];
  cameraTarget: [number, number, number];
  cameraPreset: string | null;
  isTransitioning: boolean;

  // Exploded View
  explodeMode: boolean;
  explodeProgress: number;
  explodeAssemblyId: string | null;

  // Section / Isolation
  sectionMode: boolean;
  sectionAxis: SectionAxis;
  sectionPosition: number;
  isolationAssetId: string | null;

  // IoT Overlay
  iotOverlayEnabled: boolean;
  iotHealthMap: Record<string, MeshHealthEntry>;
  liveReadings: Record<string, LiveReading>;

  // Hotspots
  hotspotsVisible: boolean;
  activeHotspotId: string | null;

  // Annotations
  annotationsVisible: boolean;

  // Asset data
  assetWorkOrders: Record<string, unknown>[];
  assetIoTDevices: Record<string, unknown>[];
  assetPmSchedules: Record<string, unknown>[];
  assetBomChildren: Record<string, unknown>[];
  assetAttachments: Record<string, unknown>[];
  isLoadingAssetData: boolean;

  // Component registry
  componentRegistry: ComponentRegistryItem | null;
  componentTree: ComponentRegistryItem[];
  isLoadingRegistry: boolean;

  // Failure analysis
  failureAnalysis: FailureAnalysisData | null;
  failureRecords: FailureRecord[];
  isLoadingFailureAnalysis: boolean;

  // Predictive maintenance
  predictionAlerts: PredictionAlertData[];
  predictiveModels: PredictiveModelData[];
  isLoadingPredictionData: boolean;
}

const INITIAL_STATE: DigitalTwinStateData = {
  // Scene
  currentSceneId: null,
  currentScene: null,
  scenes: [],
  isLoadingScene: false,
  sceneError: null,

  // Model
  modelUrl: null,
  modelLoading: false,
  modelError: null,

  // Selection
  selectedMeshName: null,
  selectedAssetId: null,
  selectedAsset: null,
  hoveredMeshName: null,
  isInfoPanelOpen: false,

  // Camera
  cameraPosition: DEFAULT_CAMERA_POSITION,
  cameraTarget: DEFAULT_CAMERA_TARGET,
  cameraPreset: null,
  isTransitioning: false,

  // Exploded View
  explodeMode: false,
  explodeProgress: 0,
  explodeAssemblyId: null,

  // Section / Isolation
  sectionMode: false,
  sectionAxis: 'y',
  sectionPosition: 0,
  isolationAssetId: null,

  // IoT Overlay
  iotOverlayEnabled: false,
  iotHealthMap: {},
  liveReadings: {},

  // Hotspots
  hotspotsVisible: true,
  activeHotspotId: null,

  // Annotations
  annotationsVisible: true,

  // Asset data
  assetWorkOrders: [],
  assetIoTDevices: [],
  assetPmSchedules: [],
  assetBomChildren: [],
  assetAttachments: [],
  isLoadingAssetData: false,

  // Component registry
  componentRegistry: null,
  componentTree: [],
  isLoadingRegistry: false,

  // Failure analysis
  failureAnalysis: null,
  failureRecords: [],
  isLoadingFailureAnalysis: false,

  // Predictive maintenance
  predictionAlerts: [],
  predictiveModels: [],
  isLoadingPredictionData: false,
};

// ============================================================================
// Store Interface
// ============================================================================

export interface DigitalTwinState extends DigitalTwinStateData {
  // Actions — Scene
  setScene: (sceneId: string, scene: DigitalTwinScene) => void;
  loadScene: (sceneId: string) => Promise<void>;

  // Actions — Model
  setModelUrl: (url: string) => void;

  // Actions — Selection
  selectMesh: (meshName: string | null, assetId?: string | null) => void;
  hoverMesh: (meshName: string | null) => void;

  // Actions — Camera
  setCameraPosition: (pos: [number, number, number]) => void;
  setCameraTarget: (target: [number, number, number]) => void;
  goToPreset: (presetName: string) => void;

  // Actions — Exploded View
  toggleExplodeMode: () => void;
  setExplodeProgress: (progress: number) => void;
  setExplodeAssembly: (assemblyId: string | null) => void;

  // Actions — Section / Isolation
  toggleSectionMode: () => void;
  setSectionAxis: (axis: SectionAxis) => void;
  setSectionPosition: (position: number) => void;
  isolateAsset: (assetId: string | null) => void;

  // Actions — IoT Overlay
  toggleIoTOverlay: () => void;
  updateHealthMap: (map: Record<string, MeshHealthEntry>) => void;
  updateLiveReading: (meshName: string, reading: LiveReading) => void;

  // Actions — Hotspots & Annotations
  toggleHotspots: () => void;
  toggleAnnotations: () => void;

  // Actions — Info panel
  setInfoPanelOpen: (open: boolean) => void;

  // Actions — Asset data loading
  loadAssetData: (assetId: string) => Promise<void>;

  // Actions — Component registry
  loadComponentRegistry: (assetId: string) => Promise<void>;

  // Actions — Failure analysis
  loadFailureAnalysis: (params: { assetId?: string; componentId?: string }) => Promise<void>;

  // Actions — Predictive maintenance
  loadPredictionAlerts: (filters?: Record<string, string>) => Promise<void>;
  loadPredictiveModels: () => Promise<void>;
  acknowledgePredictionAlert: (alertId: string) => Promise<void>;

  // Actions — Reset
  reset: () => void;
}

// ============================================================================
// Zustand Store with DevTools
// ============================================================================

export const useDigitalTwinStore = create<DigitalTwinState>()(
  devtools(
    (set, get) => ({
      ...INITIAL_STATE,

      // ────────────────────────────────────────────────────────────────────────
      // Scene
      // ────────────────────────────────────────────────────────────────────────

      setScene: (sceneId: string, scene: DigitalTwinScene) => {
        set(
          {
            currentSceneId: sceneId,
            currentScene: scene,
            sceneError: null,
            isLoadingScene: false,
            modelUrl: scene.modelUrl ?? null,
          },
          false,
          'digitalTwin/setScene',
        );
      },

      loadScene: async (sceneId: string) => {
        set({ isLoadingScene: true, sceneError: null }, false, 'digitalTwin/loadScene:start');

        try {
          const res = await api.get<DigitalTwinScene>(`/api/digital-twin-scenes/${sceneId}`);

          if (!res.success || !res.data) {
            const errorMsg = res.error || `Scene ${sceneId} not found`;
            set({ isLoadingScene: false, sceneError: errorMsg }, false, 'digitalTwin/loadScene:error');
            return;
          }

          const scene = normalizeDigitalTwinScene(res.data);

          set(
            {
              currentSceneId: sceneId,
              currentScene: scene,
              scenes: [],
              isLoadingScene: false,
              sceneError: null,
              modelUrl: scene.modelUrl ?? null,
              modelLoading: false,
              modelError: null,
              // Load camera presets from scene
              cameraPreset: null,
              iotHealthMap: {},
              liveReadings: {},
            },
            false,
            'digitalTwin/loadScene:success',
          );

          // NOTE: loadAssetData is intentionally NOT called here.
          // Calling it synchronously (or via queueMicrotask) after the mega-update
          // above triggers Zustand subscriber notifications that interleave with
          // React's concurrent rendering, causing Error #185.
          // Instead, DigitalTwinViewer handles asset data loading via useEffect
          // which fires AFTER the render is committed.
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : 'Failed to load scene';
          set({ isLoadingScene: false, sceneError: message }, false, 'digitalTwin/loadScene:error');
        }
      },

      // ────────────────────────────────────────────────────────────────────────
      // Model
      // ────────────────────────────────────────────────────────────────────────

      setModelUrl: (url: string) => {
        set({ modelUrl: url, modelLoading: true, modelError: null }, false, 'digitalTwin/setModelUrl');
      },

      // ────────────────────────────────────────────────────────────────────────
      // Selection
      // ────────────────────────────────────────────────────────────────────────

      selectMesh: (meshName: string | null, assetId?: string | null) => {
        const prevAssetId = get().selectedAssetId;
        const effectiveAssetId = assetId ?? (meshName ? prevAssetId : null);

        set(
          {
            selectedMeshName: meshName,
            selectedAssetId: meshName ? effectiveAssetId : null,
            selectedAsset: meshName ? get().selectedAsset : null,
            isInfoPanelOpen: !!meshName,
          },
          false,
          'digitalTwin/selectMesh',
        );

        // NOTE: loadAssetData is intentionally NOT called here.
        // Calling it (even via queueMicrotask) after the set() above causes
        // Zustand subscriber notifications that interleave with React's
        // concurrent rendering, causing Error #185.
        // Instead, DigitalTwinViewer handles asset data loading via useEffect
        // which fires AFTER the render is committed.
      },

      hoverMesh: (meshName: string | null) => {
        if (get().hoveredMeshName === meshName) return;
        set({ hoveredMeshName: meshName }, false, 'digitalTwin/hoverMesh');
      },

      // ────────────────────────────────────────────────────────────────────────
      // Camera
      // ────────────────────────────────────────────────────────────────────────

      setCameraPosition: (pos: [number, number, number]) => {
        set({ cameraPosition: pos }, false, 'digitalTwin/setCameraPosition');
      },

      setCameraTarget: (target: [number, number, number]) => {
        set({ cameraTarget: target }, false, 'digitalTwin/setCameraTarget');
      },

      goToPreset: (presetName: string) => {
        const scene = get().currentScene;
        const presets = scene?.cameraPresets ?? [];
        const preset = presets.find((p) => p.name === presetName);

        if (preset) {
          set(
            {
              cameraPreset: presetName,
              cameraPosition: preset.position,
              cameraTarget: preset.target,
              isTransitioning: true,
            },
            false,
            'digitalTwin/goToPreset',
          );
        }
      },

      // ────────────────────────────────────────────────────────────────────────
      // Exploded View
      // ────────────────────────────────────────────────────────────────────────

      toggleExplodeMode: () => {
        const current = get().explodeMode;
        set(
          {
            explodeMode: !current,
            explodeProgress: current ? 0 : get().explodeProgress || 1,
            explodeAssemblyId: current ? null : get().explodeAssemblyId,
          },
          false,
          'digitalTwin/toggleExplodeMode',
        );
      },

      setExplodeProgress: (progress: number) => {
        const clamped = Math.max(0, Math.min(1, progress));
        set({ explodeProgress: clamped }, false, 'digitalTwin/setExplodeProgress');
      },

      setExplodeAssembly: (assemblyId: string | null) => {
        set(
          {
            explodeAssemblyId: assemblyId,
            explodeMode: !!assemblyId,
            explodeProgress: assemblyId ? 1 : 0,
          },
          false,
          'digitalTwin/setExplodeAssembly',
        );
      },

      // ────────────────────────────────────────────────────────────────────────
      // Section / Isolation
      // ────────────────────────────────────────────────────────────────────────

      toggleSectionMode: () => {
        const current = get().sectionMode;
        set(
          {
            sectionMode: !current,
            sectionPosition: current ? 0 : get().sectionPosition,
          },
          false,
          'digitalTwin/toggleSectionMode',
        );
      },

      setSectionAxis: (axis: SectionAxis) => {
        set({ sectionAxis: axis }, false, 'digitalTwin/setSectionAxis');
      },

      setSectionPosition: (position: number) => {
        const clamped = Math.max(-1, Math.min(1, position));
        set({ sectionPosition: clamped }, false, 'digitalTwin/setSectionPosition');
      },

      isolateAsset: (assetId: string | null) => {
        set(
          {
            isolationAssetId: assetId,
            sectionMode: false,
            explodeMode: false,
            explodeProgress: 0,
          },
          false,
          'digitalTwin/isolateAsset',
        );
      },

      // ────────────────────────────────────────────────────────────────────────
      // IoT Overlay
      // ────────────────────────────────────────────────────────────────────────

      toggleIoTOverlay: () => {
        set(
          { iotOverlayEnabled: !get().iotOverlayEnabled },
          false,
          'digitalTwin/toggleIoTOverlay',
        );
      },

      updateHealthMap: (map: Record<string, MeshHealthEntry>) => {
        set(
          (state) => {
            // CRITICAL: Only create a new object reference if entries actually changed.
            // Previously, this always created { ...state.iotHealthMap, ...map } even if
            // the map was empty or unchanged, causing unnecessary re-renders in
            // IoTOverlayLayer and SceneTreePanel that amplify Error #185 cascading.
            const keys = Object.keys(map);
            if (keys.length === 0) return state;
            const hasChanges = keys.some(
              (key) => map[key] && state.iotHealthMap[key]?.score !== map[key].score,
            );
            return hasChanges
              ? { iotHealthMap: { ...state.iotHealthMap, ...map } }
              : state;
          },
          false,
          'digitalTwin/updateHealthMap',
        );
      },

      updateLiveReading: (meshName: string, reading: LiveReading) => {
        set(
          (state) => {
            const existing = state.liveReadings[meshName];
            if (existing && existing.value === reading.value) return state;
            return { liveReadings: { ...state.liveReadings, [meshName]: reading } };
          },
          false,
          'digitalTwin/updateLiveReading',
        );
      },

      // ────────────────────────────────────────────────────────────────────────
      // Hotspots & Annotations
      // ────────────────────────────────────────────────────────────────────────

      toggleHotspots: () => {
        set(
          { hotspotsVisible: !get().hotspotsVisible, activeHotspotId: null },
          false,
          'digitalTwin/toggleHotspots',
        );
      },

      toggleAnnotations: () => {
        set({ annotationsVisible: !get().annotationsVisible }, false, 'digitalTwin/toggleAnnotations');
      },

      // ────────────────────────────────────────────────────────────────────────
      // Info Panel
      // ────────────────────────────────────────────────────────────────────────

      setInfoPanelOpen: (open: boolean) => {
        set({ isInfoPanelOpen: open }, false, 'digitalTwin/setInfoPanelOpen');
      },

      // ────────────────────────────────────────────────────────────────────────
      // Asset Data Loading
      // ────────────────────────────────────────────────────────────────────────

      loadAssetData: async (assetId: string) => {
        set({ isLoadingAssetData: true }, false, 'digitalTwin/loadAssetData:start');

        try {
          // Fetch asset details
          const assetRes = await api.get<Record<string, unknown>>(`/api/assets/${assetId}`);
          if (assetRes.success && assetRes.data) {
            set({ selectedAsset: assetRes.data }, false, 'digitalTwin/loadAssetData:assetLoaded');
          }

          // Fetch related data in parallel
          const [workOrdersRes, iotDevicesRes, pmSchedulesRes, bomRes, attachmentsRes] =
            await Promise.all([
              api.get<Record<string, unknown>[]>(`/api/work-orders?assetId=${assetId}&limit=10`).catch(() => ({
                success: false,
                data: [],
              })),
              api
                .get<Record<string, unknown>[]>(`/api/iot/devices?assetId=${assetId}&limit=20`)
                .catch(() => ({ success: false, data: [] })),
              api
                .get<Record<string, unknown>[]>(`/api/pm-schedules?assetId=${assetId}&limit=10`)
                .catch(() => ({ success: false, data: [] })),
              api
                .get<Record<string, unknown>[]>(`/api/bill-of-materials?assetId=${assetId}`)
                .catch(() => ({ success: false, data: [] })),
              api
                .get<Record<string, unknown>[]>(`/api/attachments?entityId=${assetId}`)
                .catch(() => ({ success: false, data: [] })),
            ]);

          set(
            {
              assetWorkOrders: workOrdersRes.success ? (workOrdersRes.data ?? []) : [],
              assetIoTDevices: iotDevicesRes.success ? (iotDevicesRes.data ?? []) : [],
              assetPmSchedules: pmSchedulesRes.success ? (pmSchedulesRes.data ?? []) : [],
              assetBomChildren: bomRes.success ? (bomRes.data ?? []) : [],
              assetAttachments: attachmentsRes.success ? (attachmentsRes.data ?? []) : [],
              isLoadingAssetData: false,
            },
            false,
            'digitalTwin/loadAssetData:success',
          );
        } catch (err: unknown) {
          // Graceful degradation — don't block the viewer
          console.warn('[DigitalTwin] Failed to load asset data:', err);
          set({ isLoadingAssetData: false }, false, 'digitalTwin/loadAssetData:error');
        }
      },

      // ────────────────────────────────────────────────────────────────────────
      // Component Registry
      // ────────────────────────────────────────────────────────────────────────

      loadComponentRegistry: async (assetId: string) => {
        set({ isLoadingRegistry: true }, false, 'digitalTwin/loadComponentRegistry:start');
        try {
          const res = await api.get<ComponentRegistryItem>(`/api/component-registry?assetId=${assetId}`);
          if (res.success && res.data) {
            const tree = Array.isArray(res.data) ? res.data : res.data.children ? [res.data] : [res.data];
            set(
              {
                componentRegistry: Array.isArray(res.data) ? null : res.data,
                componentTree: tree,
                isLoadingRegistry: false,
              },
              false,
              'digitalTwin/loadComponentRegistry:success',
            );
          } else {
            set({ isLoadingRegistry: false }, false, 'digitalTwin/loadComponentRegistry:error');
          }
        } catch {
          set({ isLoadingRegistry: false }, false, 'digitalTwin/loadComponentRegistry:error');
        }
      },

      // ────────────────────────────────────────────────────────────────────────
      // Failure Analysis
      // ────────────────────────────────────────────────────────────────────────

      loadFailureAnalysis: async (params: { assetId?: string; componentId?: string }) => {
        set({ isLoadingFailureAnalysis: true }, false, 'digitalTwin/loadFailureAnalysis:start');
        try {
          const qs = new URLSearchParams();
          if (params.assetId) qs.set('assetId', params.assetId);
          if (params.componentId) qs.set('componentId', params.componentId);

          const [analysisRes, recordsRes] = await Promise.all([
            api.get<FailureAnalysisData>(`/api/failure-analysis?${qs.toString()}`).catch(() => ({
              success: false,
              data: null,
            })),
            api
              .get<FailureRecord[]>(`/api/failure-records?${qs.toString()}&limit=20`)
              .catch(() => ({ success: false, data: [] })),
          ]);

          set(
            {
              failureAnalysis: analysisRes.success ? (analysisRes.data ?? null) : null,
              failureRecords: recordsRes.success ? (recordsRes.data ?? []) : [],
              isLoadingFailureAnalysis: false,
            },
            false,
            'digitalTwin/loadFailureAnalysis:success',
          );
        } catch {
          set({ isLoadingFailureAnalysis: false }, false, 'digitalTwin/loadFailureAnalysis:error');
        }
      },

      // ────────────────────────────────────────────────────────────────────────
      // Predictive Maintenance
      // ────────────────────────────────────────────────────────────────────────

      loadPredictionAlerts: async (filters?: Record<string, string>) => {
        set({ isLoadingPredictionData: true }, false, 'digitalTwin/loadPredictionAlerts:start');
        try {
          const qs = new URLSearchParams(filters);
          const res = await api.get<PredictionAlertData[]>(`/api/prediction-alerts?${qs.toString()}`);
          set(
            {
              predictionAlerts: res.success ? (res.data ?? []) : [],
              isLoadingPredictionData: false,
            },
            false,
            'digitalTwin/loadPredictionAlerts:success',
          );
        } catch {
          set({ isLoadingPredictionData: false }, false, 'digitalTwin/loadPredictionAlerts:error');
        }
      },

      loadPredictiveModels: async () => {
        set({ isLoadingPredictionData: true }, false, 'digitalTwin/loadPredictiveModels:start');
        try {
          const res = await api.get<PredictiveModelData[]>('/api/predictive-models');
          set(
            {
              predictiveModels: res.success ? (res.data ?? []) : [],
              isLoadingPredictionData: false,
            },
            false,
            'digitalTwin/loadPredictiveModels:success',
          );
        } catch {
          set({ isLoadingPredictionData: false }, false, 'digitalTwin/loadPredictiveModels:error');
        }
      },

      acknowledgePredictionAlert: async (alertId: string) => {
        try {
          await api.patch(`/api/prediction-alerts/${alertId}/acknowledge`);
          set(
            (state) => ({
              predictionAlerts: state.predictionAlerts.map((a) =>
                a.id === alertId ? { ...a, isAcknowledged: true, acknowledgedAt: new Date().toISOString() } : a,
              ),
            }),
            false,
            'digitalTwin/acknowledgePredictionAlert',
          );
        } catch {
          // Silent failure
        }
      },

      // ────────────────────────────────────────────────────────────────────────
      // Reset
      // ────────────────────────────────────────────────────────────────────────

      reset: () => {
        set(INITIAL_STATE, false, 'digitalTwin/reset');
      },
    }),
    { name: 'DigitalTwinStore', enabled: process.env.NODE_ENV === 'development' },
  ),
);
