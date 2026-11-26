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
  // The browser viewer uses the built-in GLTFLoader without proprietary or
  // remote decoder dependencies. Do not silently accept imported geometry
  // that requires a decoder this deployed viewer cannot actually provide.
  const decoderExtensions = [
    'KHR_draco_mesh_compression', 'EXT_meshopt_compression', 'KHR_texture_basisu',
  ];
  const required = Array.isArray(root.extensionsRequired) ? root.extensionsRequired : [];
  const missingDecoder = required.find(ext => decoderExtensions.includes(String(ext)));
  if (missingDecoder) {
    throw new Error(
      'GLB requires unsupported compressed extension ' + missingDecoder +
      '; export a self-contained standard GLB for the current offline viewer',
    );
  }
  // GLB 2.0 permits a JSON chunk and at most one immediately following BIN
  // chunk. Reject truncated headers, dangling bytes and unsupported chunks.
  // This check prevents a misleading JSON manifest from being approved while
  // its binary geometry is missing or points outside the actual file.
  const binaryStart = 20 + jsonLength;
  let binLength = 0;
  if (binaryStart < bytes.byteLength) {
    if (binaryStart + 8 > bytes.byteLength) {
      throw new Error('Invalid GLB binary chunk header');
    }
    binLength = dv.getUint32(binaryStart, true);
    if (dv.getUint32(binaryStart + 4, true) !== 0x004e4942 ||
        binLength % 4 !== 0 ||
        binaryStart + 8 + binLength !== bytes.byteLength) {
      throw new Error('Invalid GLB binary chunk layout');
    }
  }

  const buffers = Array.isArray(root.buffers) ? root.buffers : [];
  if (buffers.length > 1000) {
    throw new Error('Invalid GLB buffer count');
  }
  for (const [index, entry] of buffers.entries()) {
    const buffer = record(entry);
    const length = buffer?.byteLength;
    if (!Number.isSafeInteger(length) || (length as number) < 0 ||
        (length as number) > MAX_PRIVATE_CAD_UPLOAD_BYTES) {
      throw new Error('Invalid GLB declared buffer length');
    }
    // Only the first buffer may be an embedded GLB BIN payload.
    if (buffer?.uri === undefined) {
      if (index !== 0 || !binLength || length === undefined ||
          (length as number) > binLength || binLength - (length as number) > 3) {
        throw new Error('Invalid GLB embedded buffer bounds');
      }
    }
  }
  if (binLength > 0 && (buffers.length === 0 || record(buffers[0])?.uri !== undefined)) {
    throw new Error('Invalid GLB unreferenced binary chunk');
  }

  const views = Array.isArray(root.bufferViews) ? root.bufferViews : [];
  if (views.length > 50000) throw new Error('Invalid GLB buffer view count');
  for (const entry of views) {
    const view = record(entry);
    const index = view?.buffer;
    const offset = view?.byteOffset ?? 0;
    const length = view?.byteLength;
    if (!Number.isInteger(index) || (index as number) < 0 ||
        (index as number) >= buffers.length ||
        !Number.isSafeInteger(offset) || (offset as number) < 0 ||
        !Number.isSafeInteger(length) || (length as number) <= 0 ||
        (offset as number) + (length as number) >
          (record(buffers[index as number])?.byteLength as number)) {
      throw new Error('Invalid GLB buffer view bounds');
    }
  }

  const nodes = Array.isArray(root.nodes) ? root.nodes : [];
  const meshes = Array.isArray(root.meshes) ? root.meshes : [];
  if (nodes.length === 0 || meshes.length === 0 || nodes.length > 15000 || meshes.length > 5000) {
    throw new Error('GLB must contain between 1 and 5000 meshes and no more than 15000 nodes');
  }
  // Reject invalid scene ancestry before storing a model. A cyclic or
  // out-of-bounds hierarchy can make both inspection and part mapping diverge.
  const visitState = new Uint8Array(nodes.length);
  for (let index = 0; index < nodes.length; index++) {
    const stack: Array<{ index: number; exiting: boolean }> = [{index, exiting:false}];
    while (stack.length) {
      const item = stack.pop()!;
      if (item.exiting) { visitState[item.index] = 2; continue; }
      if (visitState[item.index] === 2) continue;
      if (visitState[item.index] === 1) throw new Error('Invalid GLB cyclic scene hierarchy');
      const node = record(nodes[item.index]);
      if (!node) throw new Error('Invalid GLB scene node');
      if (node.mesh !== undefined && (!Number.isInteger(node.mesh) ||
          (node.mesh as number) < 0 || (node.mesh as number) >= meshes.length)) {
        throw new Error('Invalid GLB node mesh reference');
      }
      visitState[item.index] = 1;
      stack.push({index:item.index,exiting:true});
      const children = node.children;
      if (children !== undefined && !Array.isArray(children)) {
        throw new Error('Invalid GLB scene children');
      }
      if (Array.isArray(children)) {
        if (children.length > nodes.length ||
            new Set(children).size !== children.length) {
          throw new Error('Invalid GLB repeated scene children');
        }
        for (const child of children.slice().reverse()) {
          if (!Number.isInteger(child) || child < 0 || child >= nodes.length) {
            throw new Error('Invalid GLB child index');
          }
          // Three.js cannot represent cyclic model ancestry safely.
          if (visitState[child] === 1) throw new Error('Invalid GLB cyclic scene hierarchy');
          if (visitState[child] !== 2) stack.push({index:child,exiting:false});
        }
      }
    }
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
