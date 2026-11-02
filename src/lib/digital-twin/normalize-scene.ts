import type {
  CameraPreset,
  DigitalTwinAnnotation,
  DigitalTwinHotspot,
  DigitalTwinMeshBinding,
  DigitalTwinScene,
} from '@/stores/digitalTwinStore';

type UnknownRecord = Record<string, unknown>;

const DEFAULT_CAMERA_POSITION: [number, number, number] = [5, 5, 5];
const DEFAULT_CAMERA_TARGET: [number, number, number] = [0, 0, 0];

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function parseVector3(
  value: unknown,
  fallback: [number, number, number] = [0, 0, 0],
): [number, number, number] {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    if (Array.isArray(parsed) && parsed.length >= 3) {
      const tuple = parsed.slice(0, 3).map(Number);
      if (tuple.every(Number.isFinite)) return tuple as [number, number, number];
    }

    const record = asRecord(parsed);
    if (record) {
      const tuple = [Number(record.x), Number(record.y), Number(record.z)];
      if (tuple.every(Number.isFinite)) return tuple as [number, number, number];
    }
  } catch {
    // Persisted legacy vectors can be malformed; keep the viewer usable with a safe fallback.
  }

  return [...fallback];
}

function normalizeHotspotType(value: unknown): DigitalTwinHotspot['type'] {
  const normalized = String(value ?? '').toLowerCase();
  if (normalized === 'danger' || normalized === 'critical') return 'critical';
  if (normalized === 'warning') return 'warning';
  if (normalized === 'link') return 'link';
  return 'info';
}

export function normalizeDigitalTwinScene(raw: unknown): DigitalTwinScene {
  const scene = asRecord(raw) ?? {};
  const twin = asRecord(scene.twin);
  const twinAsset = asRecord(twin?.asset);
  const model = asRecord(scene.model);

  const meshNameByBindingId = new Map<string, string>();
  const meshBindings = Array.isArray(model?.meshBindings) ? model.meshBindings : [];
  for (const bindingValue of meshBindings) {
    const binding = asRecord(bindingValue);
    const bindingId = asOptionalString(binding?.id);
    const meshName = asOptionalString(binding?.meshName);
    if (bindingId && meshName) meshNameByBindingId.set(bindingId, meshName);
  }

  const normalizedMeshBindings = meshBindings
    .map((bindingValue): DigitalTwinMeshBinding | null => {
      const binding = asRecord(bindingValue);
      if (!binding) return null;
      const meshName = asOptionalString(binding.meshName);
      const assetId = asOptionalString(binding.assetId);
      if (!meshName || !assetId) return null;
      const asset = asRecord(binding.asset);
      const component = asRecord(binding.component);
      const rawExplodeOffset = binding.explodeOffset;
      return {
        id: asOptionalString(binding.id),
        meshName,
        assetId,
        assetName: asOptionalString(asset?.name) ?? assetId,
        componentId: asOptionalString(binding.componentId) ?? asOptionalString(component?.id) ?? null,
        componentName: asOptionalString(component?.name),
        componentCode: asOptionalString(component?.componentCode),
        componentType: asOptionalString(component?.componentType),
        isClickable: binding.isClickable !== false,
        isVisible: binding.isVisible !== false,
        colorOverride: asOptionalString(binding.colorOverride),
        explodeOffset: rawExplodeOffset == null ? undefined : parseVector3(rawExplodeOffset),
      } satisfies DigitalTwinMeshBinding;
    })
    .filter((binding): binding is DigitalTwinMeshBinding => binding !== null);

  const cameraPresets: CameraPreset[] = (Array.isArray(scene.cameraPresets) ? scene.cameraPresets : [])
    .map((presetValue) => {
      const preset = asRecord(presetValue);
      if (!preset) return null;
      const fov = Number(preset.fov);
      return {
        name: asOptionalString(preset.name) ?? 'View',
        position: parseVector3(preset.position, DEFAULT_CAMERA_POSITION),
        target: parseVector3(preset.target, DEFAULT_CAMERA_TARGET),
        ...(Number.isFinite(fov) ? { fov } : {}),
      } satisfies CameraPreset;
    })
    .filter((preset): preset is CameraPreset => preset !== null);

  const hotspots: DigitalTwinHotspot[] = (Array.isArray(scene.hotspots) ? scene.hotspots : [])
    .map((hotspotValue) => asRecord(hotspotValue))
    .filter((hotspot): hotspot is UnknownRecord => hotspot !== null && hotspot.isActive !== false)
    .map((hotspot) => {
      const bindingId = asOptionalString(hotspot.bindingId);
      return {
        id: String(hotspot.id ?? ''),
        meshName: asOptionalString(hotspot.meshName)
          ?? (bindingId ? meshNameByBindingId.get(bindingId) : undefined)
          ?? '',
        position: parseVector3(hotspot.position),
        title: asOptionalString(hotspot.title) ?? asOptionalString(hotspot.label) ?? 'Hotspot',
        description: asOptionalString(hotspot.description),
        type: normalizeHotspotType(hotspot.type ?? hotspot.icon),
        linkUrl: asOptionalString(hotspot.linkUrl),
      };
    });

  const annotations: DigitalTwinAnnotation[] = (Array.isArray(scene.annotations) ? scene.annotations : [])
    .map((annotationValue) => asRecord(annotationValue))
    .filter((annotation): annotation is UnknownRecord => annotation !== null)
    .map((annotation) => {
      const author = asRecord(annotation.author);
      return {
        id: String(annotation.id ?? ''),
        meshName: asOptionalString(annotation.meshName),
        position: parseVector3(annotation.position),
        text: asOptionalString(annotation.text)
          ?? asOptionalString(annotation.content)
          ?? asOptionalString(annotation.title)
          ?? '',
        author: asOptionalString(author?.fullName) ?? asOptionalString(author?.username),
        createdAt: asOptionalString(annotation.createdAt),
      };
    });

  return {
    id: String(scene.id ?? ''),
    name: asOptionalString(scene.name) ?? 'Digital Twin Scene',
    assetId: asOptionalString(scene.assetId)
      ?? asOptionalString(twin?.assetId)
      ?? asOptionalString(twinAsset?.id)
      ?? '',
    ...(asOptionalString(scene.modelId) ?? asOptionalString(model?.id)
      ? { modelId: asOptionalString(scene.modelId) ?? asOptionalString(model?.id) }
      : {}),
    description: asOptionalString(scene.description),
    modelUrl: asOptionalString(scene.modelUrl) ?? asOptionalString(model?.filePath),
    meshBindings: normalizedMeshBindings,
    cameraPresets,
    hotspots,
    annotations,
  };
}
