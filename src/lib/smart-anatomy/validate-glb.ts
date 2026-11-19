/**
 * Conservative validator for *self-contained* glTF Binary (GLB 2.0) models.
 * This is input validation, not a guarantee that downstream CAD is safe:
 * untrusted files still require size caps and isolated conversion workers.
 */
export const MAX_PRIVATE_CAD_UPLOAD_BYTES = 25 * 1024 * 1024;

type GlbRecord = Record<string, unknown>;

export interface CheckedGlb {
  meshCount: number;
  nodeCount: number;
  vertexCount: number;
}

function record(value: unknown): GlbRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as GlbRecord : null;
}

export function inspectSelfContainedGlb(bytes: Uint8Array): CheckedGlb {
  if (bytes.byteLength < 28 || bytes.byteLength > MAX_PRIVATE_CAD_UPLOAD_BYTES) {
    throw new Error('GLB file must be between 28 bytes and 25 MB');
  }
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (String.fromCharCode(...bytes.subarray(0, 4)) !== 'glTF' || dv.getUint32(4, true) !== 2) {
    throw new Error('Only glTF Binary version 2.0 files are accepted');
  }
  if (dv.getUint32(8, true) !== bytes.byteLength) {
    throw new Error('GLB header length does not match file size');
  }

  const jsonLength = dv.getUint32(12, true);
  const jsonChunkType = dv.getUint32(16, true);
  if (jsonChunkType !== 0x4e4f534a || jsonLength <= 0 ||
      jsonLength > bytes.byteLength - 20 || jsonLength % 4 !== 0) {
    throw new Error('Invalid GLB JSON chunk');
  }

  let json: unknown;
  try {
    json = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(20, 20 + jsonLength)));
  } catch {
    throw new Error('Invalid JSON or UTF-8 inside GLB');
  }
  const root = record(json);
  const asset = record(root?.asset);
  if (!root || !asset || asset.version !== '2.0') {
    throw new Error('Invalid glTF asset metadata');
  }
  const nodes = Array.isArray(root.nodes) ? root.nodes : [];
  const meshes = Array.isArray(root.meshes) ? root.meshes : [];
  if (nodes.length === 0 || meshes.length === 0 || nodes.length > 15000 || meshes.length > 5000) {
    throw new Error('GLB must contain between 1 and 5000 meshes and no more than 15000 nodes');
  }
  // GLB must never cause a private model viewer to fetch URLs or files supplied
  // by an untrusted model. Embedded binary/data URIs are permitted.
  const external = (items: unknown) => Array.isArray(items) && items.some(item => {
    const uri = record(item)?.uri;
    return typeof uri === 'string' && !uri.startsWith('data:');
  });
  if (external(root.buffers) || external(root.images) || external(root.shaders)) {
    throw new Error('GLB cannot reference external URLs or files');
  }

  const accessors = Array.isArray(root.accessors) ? root.accessors : [];
  let vertexCount = 0;
  for (const meshValue of meshes) {
    const mesh = record(meshValue);
    if (!mesh || !Array.isArray(mesh.primitives)) {
      throw new Error('Invalid mesh primitives in GLB');
    }
    for (const primitiveValue of mesh.primitives) {
      const primitive = record(primitiveValue);
      const attributes = record(primitive?.attributes);
      const positionId = attributes?.POSITION;
      if (Number.isInteger(positionId) && (positionId as number) >= 0) {
        const accessor = record(accessors[positionId as number]);
        const count = accessor?.count;
        if (typeof count === 'number' && Number.isFinite(count) && count >= 0) {
          vertexCount += count;
        }
      }
    }
  }
  if (vertexCount > 15_000_000) {
    throw new Error('GLB contains too many vertices');
  }
  return { meshCount: meshes.length, nodeCount: nodes.length, vertexCount };
}
