/** Offline translation of actual OpenCascade CAD geometry to a hierarchy-preserving GLB.
 * This code never guesses an OEM BOM or certifies a physical disassembly procedure.
 */
import { MAX_PRIVATE_CAD_UPLOAD_BYTES } from './validate-glb';

export type CadTreeNode = {name: string; meshes: number[]; children: CadTreeNode[]};
export type CadMesh = {
  name?: string; color?: number[];
  attributes: {position: {array: number[]}; normal?: {array: number[]}};
  index: {array: number[]};
};
export type CadImport = {success: boolean; root: CadTreeNode; meshes: CadMesh[]};
export type CadGlb = {glb: Buffer; meshCount: number; instanceCount: number; triangleCount: number; sourceNodeCount: number};

function safeName(value: unknown, fallback: string): string {
  const name = typeof value === 'string' ? value.replace(/[\\/\x00-\x1f\x7f]/g, '_').trim().slice(0, 180) : '';
  return name || fallback;
}
function numericArray(input: unknown, label: string): number[] {
  if (!Array.isArray(input) || !input.length || input.some(x => typeof x !== 'number' || !Number.isFinite(x))) {
    throw new Error('Invalid numeric CAD ' + label);
  }
  return input;
}

export function convertCadImportToGlb(data: CadImport, coordinateScale = 1): CadGlb {
  if (!Number.isFinite(coordinateScale) || coordinateScale <= 0 || coordinateScale > 1000) {
    throw new Error('Invalid physical CAD source-to-metre scale');
  }
  if (!data?.success || !data.root || !Array.isArray(data.meshes) ||
      !data.meshes.length || data.meshes.length > 10000) throw new Error('No supported CAD meshes');
  const binaryParts: Buffer[] = [];
  const bufferViews: Array<Record<string, number>> = [];
  const accessors: Array<Record<string, unknown>> = [];
  const meshes: Array<Record<string, unknown>> = [];
  const materials: Array<Record<string, unknown>> = [];
  const nodes: Array<Record<string, unknown>> = [];
  let length = 0;
  let triangleCount = 0;
  function append(bytes: Buffer, target: number): number {
    const pad = (4 - (length % 4)) % 4;
    if (pad) { binaryParts.push(Buffer.alloc(pad)); length += pad; }
    const index = bufferViews.length;
    bufferViews.push({buffer: 0, byteOffset: length, byteLength: bytes.length, target});
    length += bytes.length;
    if (length > MAX_PRIVATE_CAD_UPLOAD_BYTES) throw new Error('Converted CAD exceeds 25 MB limit');
    binaryParts.push(bytes);
    return index;
  }
  for (let k = 0; k < data.meshes.length; k++) {
    const item = data.meshes[k];
    const pos = numericArray(item?.attributes?.position?.array, 'positions');
    const inds = numericArray(item?.index?.array, 'triangle indices');
    const normal = item?.attributes?.normal?.array === undefined ? null : numericArray(item.attributes.normal.array, 'normals');
    if (pos.length % 3 || inds.length % 3 || pos.length < 9 || inds.length < 3 ||
        (normal && normal.length !== pos.length)) throw new Error('Malformed source CAD triangles');
    const vertexCount = pos.length / 3;
    if (inds.some(i => !Number.isInteger(i) || i < 0 || i >= vertexCount)) {
      throw new Error('Source CAD triangle references an invalid vertex');
    }
    const vertices = new Float32Array(pos.map(value => value * coordinateScale));
    if (vertices.some(v => !Number.isFinite(v))) throw new Error('Source coordinate out of range');
    const pView = append(Buffer.from(vertices.buffer), 34962);
    const pMin = [Infinity, Infinity, Infinity], pMax = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < vertices.length; i += 3) {
      for (let axis = 0; axis < 3; axis++) {
        pMin[axis] = Math.min(pMin[axis], vertices[i + axis]);
        pMax[axis] = Math.max(pMax[axis], vertices[i + axis]);
      }
    }
    const pAccessor = accessors.push({
      bufferView: pView, byteOffset: 0, componentType: 5126,
      count: vertexCount, type: 'VEC3', min: pMin, max: pMax,
    }) - 1;
    let nAccessor: number | undefined;
    if (normal) {
      const normalView = append(Buffer.from(new Float32Array(normal).buffer), 34962);
      nAccessor = accessors.push({bufferView: normalView, byteOffset: 0, componentType: 5126,
        count: vertexCount, type: 'VEC3'}) - 1;
    }
    const iView = append(Buffer.from(new Uint32Array(inds).buffer), 34963);
    const iAccessor = accessors.push({bufferView: iView, byteOffset: 0, componentType: 5125,
      count: inds.length, type: 'SCALAR'}) - 1;
    const color = Array.isArray(item.color) && item.color.length === 3 &&
      item.color.every(c => typeof c === 'number' && Number.isFinite(c) && c >= 0 && c <= 1)
      ? item.color : [0.7, 0.75, 0.8];
    const materialIndex = materials.push({pbrMetallicRoughness: {
      baseColorFactor: [...color, 1], metallicFactor: 0.1, roughnessFactor: 0.72,
    }, doubleSided: true}) - 1;
    meshes.push({name: safeName(item.name, 'CAD surface ' + (k + 1)),
      primitives: [{attributes: {
        POSITION: pAccessor, ...(nAccessor === undefined ? {} : {NORMAL: nAccessor}),
      }, indices: iAccessor, material: materialIndex, mode: 4}]});
    triangleCount += inds.length / 3;
  }

  const seen = new Set<CadTreeNode>();
  let instanceCount = 0, sourceNodeCount = 0;
  function makeNode(input: CadTreeNode, depth: number): number {
    if (!input || seen.has(input) || depth > 96 || ++sourceNodeCount > 20000 ||
        !Array.isArray(input.meshes) || !Array.isArray(input.children)) {
      throw new Error('Invalid, cyclic or excessively deep CAD hierarchy');
    }
    seen.add(input);
    const name = safeName(input.name, depth === 0 ? 'CAD assembly' : 'Unlabeled CAD node');
    const id = nodes.length;
    const node: Record<string, unknown> = {name};
    nodes.push(node);
    const children: number[] = [];
    for (let j = 0; j < input.meshes.length; j++) {
      const meshId = input.meshes[j];
      if (!Number.isInteger(meshId) || meshId < 0 || meshId >= meshes.length) {
        throw new Error('CAD source hierarchy references missing geometry');
      }
      instanceCount++;
      if (input.meshes.length === 1) {
        node.mesh = meshId;
      } else {
        const meshNode = nodes.length;
        // Mark tessellated surfaces as belonging to one genuine source CAD
        // product/part. The viewer explodes that physical part as a unit;
        // individual surfaces remain selectable for exact source mapping.
        nodes.push({
          name: name + ' · CAD surface ' + String(j + 1).padStart(2, '0'),
          mesh: meshId,
          extras: {iAssetsCadSurface: true, iAssetsCadParentNode: id},
        });
        children.push(meshNode);
      }
    }
    for (const child of input.children) children.push(makeNode(child, depth + 1));
    if (children.length) node.children = children;
    if (nodes.length > 25000) throw new Error('Too many CAD source nodes');
    return id;
  }
  const root = makeNode(data.root, 0);
  if (!instanceCount) throw new Error('CAD assembly contains no referenced geometry');
  const referenced = new Set<number>();
  for (const node of nodes) if (typeof node.mesh === 'number') referenced.add(node.mesh);
  if (referenced.size !== data.meshes.length) throw new Error('Source CAD has unreferenced geometry');

  const binary = Buffer.concat(binaryParts);
  const gltf = {
    asset: {version: '2.0', generator: 'iAssetsPro OpenCascade offline CAD handoff',
      extras: {source: 'actual uploaded CAD', engineerVerified: false,
        manufacturerCertified: false, sourceHierarchyPreserved: true}},
    scene: 0, scenes: [{nodes: [root]}], nodes, meshes, materials,
    buffers: [{byteLength: binary.length}], bufferViews, accessors,
  };
  const json = Buffer.from(JSON.stringify(gltf));
  const jsonLength = json.length + (4 - json.length % 4) % 4;
  const binLength = binary.length + (4 - binary.length % 4) % 4;
  const total = 12 + 8 + jsonLength + 8 + binLength;
  if (total > MAX_PRIVATE_CAD_UPLOAD_BYTES) throw new Error('GLB is larger than 25 MB private CAD intake limit');
  const output = Buffer.alloc(total);
  output.write('glTF', 0, 'ascii');
  output.writeUInt32LE(2, 4);
  output.writeUInt32LE(total, 8);
  output.writeUInt32LE(jsonLength, 12);
  output.write('JSON', 16, 'ascii');
  json.copy(output, 20);
  output.fill(0x20, 20 + json.length, 20 + jsonLength);
  const binHeader = 20 + jsonLength;
  output.writeUInt32LE(binLength, binHeader);
  output.write('BIN\u0000', binHeader + 4, 'ascii');
  binary.copy(output, binHeader + 8);
  return {glb: output, meshCount: meshes.length, instanceCount, triangleCount, sourceNodeCount};
}
