/**
 * Strict, offline-only STL -> GLB 2.0 converter.
 *
 * STL is only triangle geometry: it does NOT contain manufacturer-verified
 * assembly ancestry, units, parts, BOM or disassembly instructions. One STL
 * becomes one clearly labelled, unverified GLB mesh. The engineer must
 * declare the source units and separately review legal origin and identity.
 *
 * This function is deliberately NOT called by the web upload request. Native
 * format conversion must remain outside the web server process.
 */
import { MAX_PRIVATE_CAD_UPLOAD_BYTES } from './validate-glb';

export type StlUnit = 'mm' | 'cm' | 'm' | 'in' | 'ft';
const UNIT_METERS: Record<StlUnit, number> = {
  mm: 0.001, cm: 0.01, m: 1, in: 0.0254, ft: 0.3048,
};
export const MAX_OFFLINE_STL_TRIANGLES = 340_000;

export interface ConvertedStl {
  glb: Uint8Array;
  triangles: number;
  sourceFormat: 'binary-stl' | 'ascii-stl';
  declaredUnits: StlUnit;
  sourceHasPartHierarchy: false;
  notes: string[];
}

type TriangleWriter = (triangle: number, vertex: number, x: number, y: number, z: number) => void;
const bad = (reason: string): never => { throw new Error('Invalid STL: ' + reason); };

function encodeTriangleGeometry(
  triangleCount: number,
  declaredUnits: StlUnit,
  populate: (write: TriangleWriter) => void,
) {
  if (!Number.isSafeInteger(triangleCount) || triangleCount <= 0 ||
      triangleCount > MAX_OFFLINE_STL_TRIANGLES) bad('triangle count exceeds safe conversion limit');
  const positions = new Float32Array(triangleCount * 9);
  const normals = new Float32Array(triangleCount * 9);
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  const metersPerUnit = UNIT_METERS[declaredUnits];
  const write: TriangleWriter = (triangle, vertex, x, y, z) => {
    if (triangle < 0 || triangle >= triangleCount || vertex < 0 || vertex > 2 ||
        !Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      bad('invalid or non-finite source triangle coordinate');
    }
    for (const [axis, unscaled] of [x, y, z].entries()) {
      const value = Math.fround(unscaled * metersPerUnit);
      if (!Number.isFinite(value)) bad('source coordinates overflow glTF meters');
      positions[triangle * 9 + vertex * 3 + axis] = value;
      min[axis] = Math.min(min[axis], value);
      max[axis] = Math.max(max[axis], value);
    }
  };
  populate(write);

  for (let triangle = 0; triangle < triangleCount; triangle++) {
    const start = triangle * 9;
    const ax = positions[start], ay = positions[start + 1], az = positions[start + 2];
    const bx = positions[start + 3], by = positions[start + 4], bz = positions[start + 5];
    const cx = positions[start + 6], cy = positions[start + 7], cz = positions[start + 8];
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = cx - ax, vy = cy - ay, vz = cz - az;
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const size = Math.hypot(nx, ny, nz);
    if (!Number.isFinite(size) || size === 0) bad('degenerate triangle or invalid geometry scaling');
    nx /= size; ny /= size; nz /= size;
    for (let vertex = 0; vertex < 3; vertex++) {
      normals[start + vertex * 3] = nx;
      normals[start + vertex * 3 + 1] = ny;
      normals[start + vertex * 3 + 2] = nz;
    }
  }
  const posBytes = positions.byteLength;
  const normBytes = normals.byteLength;
  const binary = new Uint8Array(posBytes + normBytes);
  binary.set(new Uint8Array(positions.buffer), 0);
  binary.set(new Uint8Array(normals.buffer), posBytes);

  const json = {
    asset: { version: '2.0', generator: 'iAssetsPro Smart Anatomy Offline STL Converter' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ name: 'STL_Geometry_unverified_single_solid', mesh: 0 }],
    meshes: [{
      name: 'STL_Geometry_unverified_single_solid',
      primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, material: 0 }],
    }],
    materials: [{ name: 'Unverified STL inspection preview', pbrMetallicRoughness: {
      baseColorFactor: [0.58, 0.68, 0.76, 1], metallicFactor: 0.2, roughnessFactor: 0.65,
    }}],
    accessors: [
      {bufferView:0,componentType:5126,count:triangleCount*3,type:'VEC3',min,max},
      {bufferView:1,componentType:5126,count:triangleCount*3,type:'VEC3'},
    ],
    bufferViews: [
      {buffer:0,byteOffset:0,byteLength:posBytes,target:34962},
      {buffer:0,byteOffset:posBytes,byteLength:normBytes,target:34962},
    ],
    buffers: [{byteLength:binary.byteLength}],
  };
  const source = new TextEncoder().encode(JSON.stringify(json));
  const jsonSize = Math.ceil(source.byteLength / 4) * 4;
  const total = 12 + 8 + jsonSize + 8 + binary.byteLength;
  if (total > MAX_PRIVATE_CAD_UPLOAD_BYTES) {
    bad('GLB would exceed 25 MB; reduce triangle count in an engineering-approved workflow');
  }
  const result = new Uint8Array(total);
  const view = new DataView(result.buffer);
  result.set([0x67, 0x6c, 0x54, 0x46]);
  view.setUint32(4, 2, true);
  view.setUint32(8, total, true);
  view.setUint32(12, jsonSize, true);
  view.setUint32(16, 0x4e4f534a, true);
  result.fill(0x20, 20, 20 + jsonSize);
  result.set(source, 20);
  const binStart = 20 + jsonSize;
  view.setUint32(binStart, binary.byteLength, true);
  view.setUint32(binStart + 4, 0x004e4942, true);
  result.set(binary, binStart + 8);
  return result;
}

const numeric = '[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:[eE][+-]?\\d+)?';
const vertexPattern = new RegExp('^vertex\\s+(' + numeric + ')\\s+(' +
  numeric + ')\\s+(' + numeric + ')$', 'i');
const facetPattern = new RegExp('^facet\\s+normal\\s+' + numeric +
  '\\s+' + numeric + '\\s+' + numeric + '$', 'i');

export function convertStlToGlb(input: Uint8Array, units: StlUnit): ConvertedStl {
  if (!Object.prototype.hasOwnProperty.call(UNIT_METERS, units)) {
    bad('explicit known source unit (mm, cm, m, in, ft) is required');
  }
  if (input.byteLength < 20 || input.byteLength > MAX_PRIVATE_CAD_UPLOAD_BYTES) {
    bad('source must be between 20 bytes and 25 MB');
  }

  // Some valid binary STL headers begin with the word "solid"; distinguish
  // binary by its authoritative exact 84+50*N byte length, not the prefix.
  if (input.byteLength >= 84) {
    const data = new DataView(input.buffer, input.byteOffset, input.byteLength);
    const triangles = data.getUint32(80, true);
    if (84 + triangles * 50 === input.byteLength) {
      const glb = encodeTriangleGeometry(triangles, units, write => {
        for (let i = 0; i < triangles; i++) {
          const offset = 84 + i * 50 + 12; // ignore STL face normal, recompute geometry normal
          for (let vertex = 0; vertex < 3; vertex++) {
            const start = offset + vertex * 12;
            write(i, vertex, data.getFloat32(start, true),
              data.getFloat32(start + 4, true), data.getFloat32(start + 8, true));
          }
        }
      });
      return {
        glb, triangles, sourceFormat:'binary-stl', declaredUnits:units,
        sourceHasPartHierarchy:false,
        notes:['STL has no unit, assembly or bill-of-material metadata.',
          'Single STL produces one unverified mesh; original engineering CAD is required for multipart exploded views.'],
      };
    }
  }

  let text: string;
  try { text = new TextDecoder('utf-8', {fatal:true}).decode(input).replace(/^\uFEFF/, ''); }
  catch { return bad('source is neither complete binary STL nor UTF-8 ASCII STL'); }
  const rows = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (!/^solid(?:\s|$)/i.test(rows[0] ?? '') ||
      !/^endsolid(?:\s|$)/i.test(rows[rows.length-1] ?? '')) {
    bad('ASCII STL must have complete solid and endsolid markers');
  }
  const vertexLines: Array<ReadonlyArray<number>> = [];
  let row = 1, triangles = 0;
  while (row < rows.length - 1) {
    if (!facetPattern.test(rows[row++] ?? '')) bad('malformed ASCII facet normal');
    if (!/^outer\s+loop$/i.test(rows[row++] ?? '')) bad('malformed ASCII outer loop');
    for (let vertex = 0; vertex < 3; vertex++) {
      const match = vertexPattern.exec(rows[row++] ?? '');
      if (!match) bad('malformed ASCII triangle vertex');
      vertexLines.push([Number(match[1]), Number(match[2]), Number(match[3])]);
    }
    if (!/^endloop$/i.test(rows[row++] ?? '') ||
        !/^endfacet$/i.test(rows[row++] ?? '')) {
      bad('incomplete ASCII facet');
    }
    triangles++;
    if (triangles > MAX_OFFLINE_STL_TRIANGLES) bad('triangle count exceeds safe conversion limit');
  }
  const glb = encodeTriangleGeometry(triangles, units, write => {
    for (let i = 0; i < triangles; i++) for (let v = 0; v < 3; v++) {
      const [x, y, z] = vertexLines[i * 3 + v];
      write(i, v, x, y, z);
    }
  });
  return {
    glb, triangles, sourceFormat:'ascii-stl', declaredUnits:units,
    sourceHasPartHierarchy:false,
    notes:['STL has no unit, assembly or bill-of-material metadata.',
      'Single STL produces one unverified mesh; original engineering CAD is required for multipart exploded views.'],
  };
}
