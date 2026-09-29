/**
 * Programmatic 3D Geometry Generator
 *
 * Takes a machine name, asks the LLM to describe it as a set of geometric primitives,
 * then builds a valid GLB binary that Three.js GLTFLoader can parse.
 *
 * No external 3D API required — pure programmatic generation.
 */

import { mkdir, writeFile } from 'fs/promises';
import { aiChatCompletion } from '@/lib/ai-client';
import { join } from 'path';
import { db } from '@/lib/db';
import { createLogger } from '@/lib/logger';
import { getBuiltinGeometrySpec } from './builtin-geometry';

const logger = createLogger('generate-3d:programmatic');

// ============================================================================
// TYPES — Geometry specification returned by the LLM
// ============================================================================

interface GeometryPart {
  name: string;
  type: 'box' | 'cylinder' | 'sphere' | 'cone' | 'torus';
  position: [number, number, number];
  rotation: [number, number, number];
  /** For box: [width, height, depth] */
  size?: [number, number, number];
  /** For cylinder/cone: top radius */
  radiusTop?: number;
  /** For cylinder/cone: bottom radius */
  radiusBottom?: number;
  /** For cylinder/cone: height */
  height?: number;
  /** For sphere: radius */
  radius?: number;
  /** For torus: main radius */
  torusRadius?: number;
  /** For torus: tube radius */
  tube?: number;
  /** For sphere/torus: width segments */
  widthSegments?: number;
  /** For sphere: height segments */
  heightSegments?: number;
  /** For cylinder/cone: radial segments */
  radialSegments?: number;
  /** For torus: tubular segments */
  tubularSegments?: number;
  color: string;
  metalness: number;
  roughness: number;
}

interface GeometrySpec {
  machineName: string;
  description: string;
  scale: number;
  parts: GeometryPart[];
}

// ============================================================================
// LLM PROMPT
// ============================================================================

const GEOMETRY_SYSTEM_PROMPT = `You are an expert 3D mechanical engineer. Given a machine or equipment name, you must describe its approximate visual shape as a collection of simple 3D geometric primitives (boxes, cylinders, spheres, cones, torus).

You MUST respond with ONLY a valid JSON object (no markdown fences, no commentary) matching this exact structure:

{
  "machineName": "Full Machine Name",
  "description": "Brief visual description of the machine shape",
  "scale": 1.0,
  "parts": [
    {
      "name": "Main Body",
      "type": "box",
      "position": [0, 0.5, 0],
      "rotation": [0, 0, 0],
      "size": [2, 1, 1],
      "color": "#4a5568",
      "metalness": 0.6,
      "roughness": 0.4
    },
    {
      "name": "Motor Housing",
      "type": "cylinder",
      "position": [0.8, 0.8, 0],
      "rotation": [1.5708, 0, 0],
      "radiusTop": 0.3,
      "radiusBottom": 0.3,
      "height": 0.6,
      "color": "#2d3748",
      "metalness": 0.8,
      "roughness": 0.2
    }
  ]
}

SUPPORTED GEOMETRY TYPES:
- "box": position, rotation, size=[w,h,d], color, metalness, roughness
- "cylinder": position, rotation, radiusTop, radiusBottom, height, radialSegments (default 32), color, metalness, roughness
- "sphere": position, rotation, radius, widthSegments (default 32), heightSegments (default 16), color, metalness, roughness
- "cone": position, rotation, radius (bottom), height, radialSegments (default 32), color, metalness, roughness
- "torus": position, rotation, torusRadius, tube, radialSegments (default 24), tubularSegments (default 48), color, metalness, roughness

IMPORTANT RULES:
1. Use ONLY the types listed above
2. Position is [x, y, z] — Y is up
3. Rotation is [rx, ry, rz] in RADIANS — use Math.PI/2 for 90 degrees (write 1.5708), Math.PI/4 for 45 deg (0.7854), etc.
4. Use realistic industrial colors — grays, dark blues, dark greens for metal bodies; yellows/oranges for safety parts; reds for handles/warnings
5. Metalness: 0-1 where 1 is fully metallic (use 0.7-0.9 for machined metal, 0.3-0.5 for painted surfaces, 0.0 for rubber/plastic)
6. Roughness: 0-1 where 0 is mirror-smooth (use 0.1-0.3 for polished metal, 0.4-0.7 for painted, 0.8-1.0 for matte/rubber)
7. Generate 8-20 parts depending on machine complexity
8. Build the machine from the ground up: base first, then body, then sub-components on top
9. Keep the machine centered around origin — main body near [0, 0.5, 0] so it sits on the ground plane
10. Use appropriate scale so the machine fits within roughly a 4x4x4 unit cube
11. Think about real machine anatomy: base plate, main housing, motor housings, control panels, pipe connections, handles, etc.
12. ONLY return valid JSON — no markdown code fences, no text before/after the JSON`;

// ============================================================================
// EXPORT — Generate geometry specification from LLM
// ============================================================================

export async function generateGeometrySpec(
  machineName: string,
  description?: string,
): Promise<GeometrySpec> {
  const userPrompt = `Generate a 3D geometric primitive description for this industrial machine:

Machine: ${machineName.trim()}
${description ? `Additional details: ${description}` : ''}

Return a JSON object with 8-20 geometric parts that visually approximate this machine. Think about what real ${machineName} machines look like — their base, body, motor housings, control panels, pipes, handles, etc.

Remember: Return ONLY valid JSON. No markdown fences.`;

  logger.info('Calling LLM for geometry spec', { machineName });

  let content: string | undefined;
  try {
    const response: Record<string, unknown> = await aiChatCompletion({
      messages: [
        { role: 'system', content: GEOMETRY_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.6,
      max_tokens: 6000,
    });
    content = response.choices?.[0]?.message?.content;
  } catch (fetchErr) {
    const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
    logger.warn('LLM API request failed — falling back to built-in geometry', { message: msg });
    return getBuiltinGeometrySpec(machineName);
  }

  if (!content) {
    logger.warn('LLM returned empty response — falling back to built-in geometry');
    return getBuiltinGeometrySpec(machineName);
  }

  // Strip markdown code fences if present
  let jsonStr = content.trim();
  if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
  }

  let parsed: any;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (parseErr) {
    logger.warn('LLM response is not valid JSON — falling back to built-in geometry', {
      message: parseErr instanceof Error ? parseErr.message : String(parseErr),
    });
    return getBuiltinGeometrySpec(machineName);
  }

  // Validate
  if (!parsed.parts || !Array.isArray(parsed.parts) || parsed.parts.length === 0) {
    logger.warn('LLM response missing parts array — falling back to built-in geometry');
    return getBuiltinGeometrySpec(machineName);
  }

  // Validate each part has required fields and sanitize
  const validTypes = new Set(['box', 'cylinder', 'sphere', 'cone', 'torus']);
  const parts: GeometryPart[] = [];

  for (const part of parsed.parts) {
    if (!validTypes.has(part.type)) {
      logger.warn('Skipping invalid geometry type', { type: part.type, name: part.name });
      continue;
    }
    parts.push({
      name: String(part.name || 'Unnamed Part'),
      type: part.type,
      position: Array.isArray(part.position) ? part.position.map(Number) : [0, 0, 0],
      rotation: Array.isArray(part.rotation) ? part.rotation.map(Number) : [0, 0, 0],
      size: part.size ? part.size.map(Number) : undefined,
      radiusTop: part.radiusTop != null ? Number(part.radiusTop) : undefined,
      radiusBottom: part.radiusBottom != null ? Number(part.radiusBottom) : undefined,
      height: part.height != null ? Number(part.height) : undefined,
      radius: part.radius != null ? Number(part.radius) : undefined,
      torusRadius: part.torusRadius != null ? Number(part.torusRadius) : undefined,
      tube: part.tube != null ? Number(part.tube) : undefined,
      widthSegments: part.widthSegments != null ? Number(part.widthSegments) : undefined,
      heightSegments: part.heightSegments != null ? Number(part.heightSegments) : undefined,
      radialSegments: part.radialSegments != null ? Number(part.radialSegments) : undefined,
      tubularSegments: part.tubularSegments != null ? Number(part.tubularSegments) : undefined,
      color: String(part.color || '#888888'),
      metalness: typeof part.metalness === 'number' ? Math.max(0, Math.min(1, part.metalness)) : 0.5,
      roughness: typeof part.roughness === 'number' ? Math.max(0, Math.min(1, part.roughness)) : 0.5,
    });
  }

  if (parts.length === 0) {
    throw new Error('No valid geometry parts found in LLM response');
  }

  const spec: GeometrySpec = {
    machineName: String(parsed.machineName || machineName),
    description: String(parsed.description || ''),
    scale: typeof parsed.scale === 'number' ? parsed.scale : 1.0,
    parts,
  };

  logger.info('Geometry spec generated', { partCount: parts.length, types: parts.map(p => p.type) });
  return spec;
}

// ============================================================================
// GLB BINARY BUILDER
// ============================================================================

/** Convert hex color string (#rrggbb) to [r, g, b] normalized 0-1 */
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.substring(0, 2), 16) / 255,
    parseInt(h.substring(2, 4), 16) / 255,
    parseInt(h.substring(4, 6), 16) / 255,
  ];
}

/**
 * Generate vertices and normals for a box.
 * Returns flat arrays suitable for glTF.
 */
function generateBoxVertices(
  width: number, height: number, depth: number,
): { positions: number[]; normals: number[]; indices: number[] } {
  const w = width / 2, h = height / 2, d = depth / 2;
  // prettier-ignore
  const positions: number[] = [
    // Front face (+Z)
    -w, -h,  d,   w, -h,  d,   w,  h,  d,  -w,  h,  d,
    // Back face (-Z)
    -w, -h, -d,  -w,  h, -d,   w,  h, -d,   w, -h, -d,
    // Top face (+Y)
    -w,  h, -d,  -w,  h,  d,   w,  h,  d,   w,  h, -d,
    // Bottom face (-Y)
    -w, -h, -d,   w, -h, -d,   w, -h,  d,  -w, -h,  d,
    // Right face (+X)
     w, -h, -d,   w,  h, -d,   w,  h,  d,   w, -h,  d,
    // Left face (-X)
    -w, -h, -d,  -w, -h,  d,  -w,  h,  d,  -w,  h, -d,
  ];
  // prettier-ignore
  const normals: number[] = [
    0, 0, 1,  0, 0, 1,  0, 0, 1,  0, 0, 1,
    0, 0,-1,  0, 0,-1,  0, 0,-1,  0, 0,-1,
    0, 1, 0,  0, 1, 0,  0, 1, 0,  0, 1, 0,
    0,-1, 0,  0,-1, 0,  0,-1, 0,  0,-1, 0,
    1, 0, 0,  1, 0, 0,  1, 0, 0,  1, 0, 0,
   -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0,
  ];
  const indices: number[] = [];
  for (let i = 0; i < 6; i++) {
    const o = i * 4;
    indices.push(o, o + 1, o + 2, o, o + 2, o + 3);
  }
  return { positions, normals, indices };
}

/**
 * Generate vertices and normals for a cylinder (or cone).
 */
function generateCylinderVertices(
  radiusTop: number,
  radiusBottom: number,
  height: number,
  radialSegments: number,
): { positions: number[]; normals: number[]; indices: number[] } {
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];

  const halfHeight = height / 2;
  const slope = (radiusBottom - radiusTop) / height;
  const slant = Math.sqrt(height * height + (radiusBottom - radiusTop) * (radiusBottom - radiusTop));

  // Side vertices
  for (let iy = 0; iy <= 1; iy++) {
    const y = iy === 0 ? -halfHeight : halfHeight;
    const r = iy === 0 ? radiusBottom : radiusTop;
    for (let ix = 0; ix <= radialSegments; ix++) {
      const u = (ix / radialSegments) * Math.PI * 2;
      const sin = Math.sin(u);
      const cos = Math.cos(u);
      positions.push(r * cos, y, r * sin);
      // Normal for tapered cylinder
      if (slant > 0) {
        normals.push(height / slant * cos, slope / slant, height / slant * sin);
      } else {
        normals.push(cos, 0, sin);
      }
    }
  }

  // Side indices
  for (let ix = 0; ix < radialSegments; ix++) {
    const a = ix;
    const b = ix + radialSegments + 1;
    indices.push(a, b, a + 1);
    indices.push(a + 1, b, b + 1);
  }

  // Cap function
  const addCap = (isTop: boolean) => {
    const capCenterIdx = positions.length / 3;
    const y = isTop ? halfHeight : -halfHeight;
    const r = isTop ? radiusTop : radiusBottom;
    const ny = isTop ? 1 : -1;
    positions.push(0, y, 0);
    normals.push(0, ny, 0);

    for (let ix = 0; ix <= radialSegments; ix++) {
      const u = (ix / radialSegments) * Math.PI * 2;
      positions.push(r * Math.cos(u), y, r * Math.sin(u));
      normals.push(0, ny, 0);
    }

    for (let ix = 0; ix < radialSegments; ix++) {
      if (isTop) {
        indices.push(capCenterIdx, capCenterIdx + ix + 1, capCenterIdx + ix + 2);
      } else {
        indices.push(capCenterIdx, capCenterIdx + ix + 2, capCenterIdx + ix + 1);
      }
    }
  };

  if (radiusTop > 0) addCap(true);
  if (radiusBottom > 0) addCap(false);

  return { positions, normals, indices };
}

/**
 * Generate vertices and normals for a sphere.
 */
function generateSphereVertices(
  radius: number,
  widthSegments: number,
  heightSegments: number,
): { positions: number[]; normals: number[]; indices: number[] } {
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];

  for (let iy = 0; iy <= heightSegments; iy++) {
    const v = iy / heightSegments;
    const phi = v * Math.PI;
    for (let ix = 0; ix <= widthSegments; ix++) {
      const u = ix / widthSegments;
      const theta = u * Math.PI * 2;
      const x = -radius * Math.cos(theta) * Math.sin(phi);
      const y = radius * Math.cos(phi);
      const z = radius * Math.sin(theta) * Math.sin(phi);
      positions.push(x, y, z);
      const len = Math.sqrt(x * x + y * y + z * z) || 1;
      normals.push(x / len, y / len, z / len);
    }
  }

  for (let iy = 0; iy < heightSegments; iy++) {
    for (let ix = 0; ix < widthSegments; ix++) {
      const a = iy * (widthSegments + 1) + ix;
      const b = a + widthSegments + 1;
      indices.push(a, b, a + 1);
      indices.push(a + 1, b, b + 1);
    }
  }

  return { positions, normals, indices };
}

/**
 * Generate vertices and normals for a torus.
 */
function generateTorusVertices(
  torusRadius: number,
  tube: number,
  radialSegments: number,
  tubularSegments: number,
): { positions: number[]; normals: number[]; indices: number[] } {
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];

  for (let j = 0; j <= radialSegments; j++) {
    for (let i = 0; i <= tubularSegments; i++) {
      const u = (i / tubularSegments) * Math.PI * 2;
      const v = (j / radialSegments) * Math.PI * 2;

      const cx = torusRadius * Math.cos(u);
      const cy = 0;
      const cz = torusRadius * Math.sin(u);

      const x = (torusRadius + tube * Math.cos(v)) * Math.cos(u);
      const y = tube * Math.sin(v);
      const z = (torusRadius + tube * Math.cos(v)) * Math.sin(u);

      positions.push(x, y, z);

      const nx = x - cx;
      const ny = y - cy;
      const nz = z - cz;
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      normals.push(nx / len, ny / len, nz / len);
    }
  }

  for (let j = 0; j < radialSegments; j++) {
    for (let i = 0; i < tubularSegments; i++) {
      const a = j * (tubularSegments + 1) + i;
      const b = a + tubularSegments + 1;
      indices.push(a, b, a + 1);
      indices.push(a + 1, b, b + 1);
    }
  }

  return { positions, normals, indices };
}

/**
 * Generate geometry for a single part, applying position and rotation transforms.
 */
function generatePartGeometry(part: GeometryPart): {
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array | Uint16Array;
} {
  let geo: { positions: number[]; normals: number[]; indices: number[] };

  switch (part.type) {
    case 'box': {
      const w = part.size?.[0] ?? 1;
      const h = part.size?.[1] ?? 1;
      const d = part.size?.[2] ?? 1;
      geo = generateBoxVertices(w, h, d);
      break;
    }
    case 'cylinder': {
      geo = generateCylinderVertices(
        part.radiusTop ?? 0.5,
        part.radiusBottom ?? 0.5,
        part.height ?? 1,
        part.radialSegments ?? 32,
      );
      break;
    }
    case 'sphere': {
      geo = generateSphereVertices(
        part.radius ?? 0.5,
        part.widthSegments ?? 32,
        part.heightSegments ?? 16,
      );
      break;
    }
    case 'cone': {
      geo = generateCylinderVertices(
        0, // radiusTop = 0 for cone
        part.radius ?? part.radiusBottom ?? 0.5,
        part.height ?? 1,
        part.radialSegments ?? 32,
      );
      break;
    }
    case 'torus': {
      geo = generateTorusVertices(
        part.torusRadius ?? 1,
        part.tube ?? 0.3,
        part.radialSegments ?? 24,
        part.tubularSegments ?? 48,
      );
      break;
    }
    default:
      throw new Error(`Unknown geometry type: ${part.type}`);
  }

  // Apply rotation (Euler angles XYZ) then translation
  const [rx, ry, rz] = part.rotation;
  const [tx, ty, tz] = part.position;

  const cosX = Math.cos(rx), sinX = Math.sin(rx);
  const cosY = Math.cos(ry), sinY = Math.sin(ry);
  const cosZ = Math.cos(rz), sinZ = Math.sin(rz);

  const transformedPositions = new Float32Array(geo.positions.length);
  const transformedNormals = new Float32Array(geo.normals.length);

  for (let i = 0; i < geo.positions.length; i += 3) {
    let x = geo.positions[i];
    let y = geo.positions[i + 1];
    let z = geo.positions[i + 2];

    // Rotate XYZ
    // Rotate X
    let y1 = y * cosX - z * sinX;
    let z1 = y * sinX + z * cosX;
    y = y1; z = z1;
    // Rotate Y
    let x1 = x * cosY + z * sinY;
    z1 = -x * sinY + z * cosY;
    x = x1; z = z1;
    // Rotate Z
    x1 = x * cosZ - y * sinZ;
    y1 = x * sinZ + y * cosZ;
    x = x1; y = y1;

    // Translate
    transformedPositions[i] = x + tx;
    transformedPositions[i + 1] = y + ty;
    transformedPositions[i + 2] = z + tz;

    // Also rotate normals (no translation)
    let nx = geo.normals[i];
    let ny = geo.normals[i + 1];
    let nz = geo.normals[i + 2];
    // Rotate X
    let ny1 = ny * cosX - nz * sinX;
    let nz1 = ny * sinX + nz * cosX;
    ny = ny1; nz = nz1;
    // Rotate Y
    let nx1 = nx * cosY + nz * sinY;
    nz1 = -nx * sinY + nz * cosY;
    nx = nx1; nz = nz1;
    // Rotate Z
    nx1 = nx * cosZ - ny * sinZ;
    ny1 = nx * sinZ + ny * cosZ;
    nx = nx1; ny = ny1;

    // Normalize (rotation preserves length, but just in case)
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
    transformedNormals[i] = nx / len;
    transformedNormals[i + 1] = ny / len;
    transformedNormals[i + 2] = nz / len;
  }

  // Indices — use Uint32 for large meshes, Uint16 for small
  const vertexCount = geo.positions.length / 3;
  const indices = vertexCount > 65535
    ? new Uint32Array(geo.indices)
    : new Uint16Array(geo.indices);

  return {
    positions: transformedPositions,
    normals: transformedNormals,
    indices,
  };
}

/**
 * Build a valid glTF 2.0 JSON + binary blob, then wrap in GLB container.
 */
function buildGlb(spec: GeometrySpec): Buffer {
  // ── 1. Generate all geometry ──────────────────────────────────────────────
  const geometries: Array<{
    positions: Float32Array;
    normals: Float32Array;
    indices: Uint32Array | Uint16Array;
    part: GeometryPart;
  }> = [];

  let totalVertexCount = 0;
  let totalIndexCount = 0;

  for (const part of spec.parts) {
    const geo = generatePartGeometry(part);
    geometries.push({ ...geo, part });
    totalVertexCount += geo.positions.length / 3;
    totalIndexCount += geo.indices.length;
  }

  // ── 2. Build glTF JSON structure ──────────────────────────────────────────
  const gltf: Record<string, unknown> = {
    asset: {
      version: '2.0',
      generator: 'EAM-Programmatic-3D-Generator',
    },
    scene: 0,
    scenes: [
      {
        name: spec.machineName,
        nodes: geometries.map((_, i) => i),
      },
    ],
    nodes: [],
    meshes: [],
    accessors: [],
    bufferViews: [],
    buffers: [],
  };

  const accessors: any[] = [];
  const bufferViews: any[] = [];

  // We'll build a single BIN buffer with all geometry data
  // Layout: [positions0, normals0, indices0, positions1, normals1, indices1, ...]
  const binChunks: Buffer[] = [];
  let currentBinOffset = 0;

  for (let gi = 0; gi < geometries.length; gi++) {
    const { positions, normals, indices, part } = geometries[gi];
    const vertexCount = positions.length / 3;
    const indexCount = indices.length;

    // Position buffer view
    const posBuffer = Buffer.from(positions.buffer);
    const posByteLength = posBuffer.byteLength;
    const posBufferView = {
      buffer: 0,
      byteOffset: currentBinOffset,
      byteLength: posByteLength,
      target: 34962, // ARRAY_BUFFER
    };
    bufferViews.push(posBufferView);
    accessors.push({
      bufferView: bufferViews.length - 1,
      byteOffset: 0,
      componentType: 5126, // FLOAT
      count: vertexCount,
      type: 'VEC3',
      max: computeMax(positions),
      min: computeMin(positions),
    });
    const posAccessorIdx = accessors.length - 1;
    binChunks.push(posBuffer);
    currentBinOffset += posByteLength;

    // Normal buffer view
    const normBuffer = Buffer.from(normals.buffer);
    const normByteLength = normBuffer.byteLength;
    const normBufferView = {
      buffer: 0,
      byteOffset: currentBinOffset,
      byteLength: normByteLength,
      target: 34962, // ARRAY_BUFFER
    };
    bufferViews.push(normBufferView);
    accessors.push({
      bufferView: bufferViews.length - 1,
      byteOffset: 0,
      componentType: 5126, // FLOAT
      count: vertexCount,
      type: 'VEC3',
      max: [1, 1, 1],
      min: [-1, -1, -1],
    });
    const normAccessorIdx = accessors.length - 1;
    binChunks.push(normBuffer);
    currentBinOffset += normByteLength;

    // Index buffer view
    const idxBuffer = Buffer.from(indices.buffer);
    const idxByteLength = idxBuffer.byteLength;
    const isUint32 = indices instanceof Uint32Array;
    // Pad to 4-byte alignment for indices
    const padding = idxByteLength % 4;
    const paddingBuf = padding > 0 ? Buffer.alloc(4 - padding, 0) : Buffer.alloc(0);

    const idxBufferView = {
      buffer: 0,
      byteOffset: currentBinOffset,
      byteLength: idxByteLength,
      target: 34963, // ELEMENT_ARRAY_BUFFER
    };
    bufferViews.push(idxBufferView);
    accessors.push({
      bufferView: bufferViews.length - 1,
      byteOffset: 0,
      componentType: isUint32 ? 5125 : 5123, // UNSIGNED_INT or UNSIGNED_SHORT
      count: indexCount,
      type: 'SCALAR',
      max: [Math.max(...indices)],
      min: [0],
    });
    const idxAccessorIdx = accessors.length - 1;
    binChunks.push(idxBuffer);
    if (paddingBuf.length > 0) {
      binChunks.push(paddingBuf);
    }
    currentBinOffset += idxByteLength + paddingBuf.length;

    // Material (deduplicate by color+metalness+roughness)
    const [cr, cg, cb] = hexToRgb(part.color);
    const mesh = {
      name: part.name,
      primitives: [
        {
          attributes: {
            POSITION: posAccessorIdx,
            NORMAL: normAccessorIdx,
          },
          indices: idxAccessorIdx,
          material: gi, // One material per mesh for simplicity (we deduplicate below)
        },
      ],
    };

    // Node with identity transform (position/rotation already baked into vertices)
    const node = {
      name: part.name,
      mesh: gi,
    };

    (gltf.meshes as any[]).push(mesh);
    (gltf.nodes as any[]).push(node);
  }

  // ── 3. Create materials ──────────────────────────────────────────────────
  const materials: any[] = [];
  for (const part of spec.parts) {
    const [cr, cg, cb] = hexToRgb(part.color);
    materials.push({
      name: part.name,
      pbrMetallicRoughness: {
        baseColorFactor: [cr, cg, cb, 1.0],
        metallicFactor: part.metalness,
        roughnessFactor: part.roughness,
      },
      doubleSided: true,
    });
  }
  gltf.materials = materials;

  // ── 4. Assemble ─────────────────────────────────────────────────────────
  gltf.accessors = accessors;
  gltf.bufferViews = bufferViews;
  gltf.buffers = [
    {
      byteLength: currentBinOffset,
    },
  ];

  // ── 5. Encode GLB ─────────────────────────────────────────────────────────
  const jsonStr = JSON.stringify(gltf);
  // JSON must be padded to 4-byte boundary
  const jsonBuf = Buffer.from(jsonStr, 'utf-8');
  const jsonPadLen = (4 - (jsonBuf.length % 4)) % 4;
  const jsonPadded = jsonPadLen > 0
    ? Buffer.concat([jsonBuf, Buffer.alloc(jsonPadLen, 0x20)]) // pad with spaces
    : jsonBuf;

  const binData = Buffer.concat(binChunks);
  // BIN must be padded to 4-byte boundary
  const binPadLen = (4 - (binData.length % 4)) % 4;
  const binPadded = binPadLen > 0
    ? Buffer.concat([binData, Buffer.alloc(binPadLen, 0)])
    : binData;

  const totalLength = 12 + 8 + jsonPadded.length + 8 + binPadded.length;

  const glbBuffer = Buffer.alloc(totalLength);
  let offset = 0;

  // GLB Header
  glbBuffer.writeUInt32LE(0x46546C67, offset); offset += 4; // magic: 'glTF'
  glbBuffer.writeUInt32LE(2, offset); offset += 4;           // version: 2
  glbBuffer.writeUInt32LE(totalLength, offset); offset += 4;  // total length

  // JSON Chunk
  glbBuffer.writeUInt32LE(jsonPadded.length, offset); offset += 4;
  glbBuffer.writeUInt32LE(0x4E4F534A, offset); offset += 4; // type: 'JSON'
  jsonPadded.copy(glbBuffer, offset); offset += jsonPadded.length;

  // BIN Chunk
  glbBuffer.writeUInt32LE(binPadded.length, offset); offset += 4;
  glbBuffer.writeUInt32LE(0x004E4942, offset); offset += 4; // type: 'BIN\0'
  binPadded.copy(glbBuffer, offset); offset += binPadded.length;

  return glbBuffer;
}

/** Compute per-component max for VEC3 accessor */
function computeMax(arr: Float32Array | number[]): number[] {
  let mx = -Infinity, my = -Infinity, mz = -Infinity;
  for (let i = 0; i < arr.length; i += 3) {
    if (arr[i] > mx) mx = arr[i];
    if (arr[i + 1] > my) my = arr[i + 1];
    if (arr[i + 2] > mz) mz = arr[i + 2];
  }
  return [mx, my, mz];
}

/** Compute per-component min for VEC3 accessor */
function computeMin(arr: Float32Array | number[]): number[] {
  let mn = Infinity, my = Infinity, mz = Infinity;
  for (let i = 0; i < arr.length; i += 3) {
    if (arr[i] < mn) mn = arr[i];
    if (arr[i + 1] < my) my = arr[i + 1];
    if (arr[i + 2] < mz) mz = arr[i + 2];
  }
  return [mn, my, mz];
}

// ============================================================================
// EXPORT — Main function: generate programmatic 3D model
// ============================================================================

const UPLOAD_DIR = join(process.cwd(), 'public', 'generated-assets', 'models');

export async function generateProgrammatic3DModel(
  machineName: string,
  description?: string,
  assetId: string = '',
  userId: string = '',
): Promise<{ success: boolean; modelId?: string; filePath?: string; error?: string }> {
  const timer = logger.timer('generateProgrammatic3DModel');

  try {
    // ── 1. Generate geometry spec from LLM ───────────────────────────────
    logger.info('Step 1: Generating geometry spec via LLM', { machineName });

    let spec: GeometrySpec;
    try {
      spec = await generateGeometrySpec(machineName, description);
    } catch (llmErr) {
      const msg = llmErr instanceof Error ? llmErr.message : 'Unknown LLM error';
      logger.error('LLM geometry spec generation failed', { message: msg });
      return { success: false, error: `Geometry spec generation failed: ${msg}` };
    }

    // ── 2. Build GLB binary ──────────────────────────────────────────────
    logger.info('Step 2: Building GLB binary', { partCount: spec.parts.length });

    let glbBuffer: Buffer;
    try {
      glbBuffer = buildGlb(spec);
    } catch (buildErr) {
      const msg = buildErr instanceof Error ? buildErr.message : 'Unknown build error';
      logger.error('GLB build failed', { message: msg });
      return { success: false, error: `GLB build failed: ${msg}` };
    }

    // ── 3. Save GLB file ────────────────────────────────────────────────
    const fileName = `${assetId || 'programmatic'}.glb`;
    const diskPath = join(UPLOAD_DIR, fileName);
    const relativePath = `/generated-assets/models/${fileName}`;

    try {
      await mkdir(UPLOAD_DIR, { recursive: true });
      await writeFile(diskPath, glbBuffer);
      logger.info('GLB file saved', { diskPath, fileSize: glbBuffer.length });
    } catch (fsErr) {
      const msg = fsErr instanceof Error ? fsErr.message : 'Unknown file system error';
      logger.error('Failed to save GLB file', { message: msg });
      return { success: false, error: `File save failed: ${msg}` };
    }

    // ── 4. Create AssetModel DB record ──────────────────────────────────
    let modelRecord: { id: string } | null = null;

    if (assetId && userId) {
      try {
        // Deactivate any existing models for this asset
        await db.assetModel.updateMany({
          where: { assetId, isActive: true },
          data: { isActive: false },
        });

        modelRecord = await db.assetModel.create({
          data: {
            assetId,
            name: spec.machineName,
            fileName,
            filePath: relativePath,
            fileType: 'glb',
            fileSize: glbBuffer.length,
            format: 'glb',
            meshCount: spec.parts.length,
            vertexCount: spec.parts.reduce((sum, _p) => sum + 1, 0), // approximate
            uploadedById: userId,
            isActive: true,
          },
        });

        logger.info('AssetModel record created', { modelId: modelRecord?.id, assetId });
      } catch (dbErr) {
        const msg = dbErr instanceof Error ? dbErr.message : 'Unknown DB error';
        logger.warn('Failed to create AssetModel record (non-fatal)', { message: msg });
      }
    } else {
      logger.info('No assetId/userId provided, skipping DB record creation');
    }

    // ── 5. Optionally create DigitalTwinScene ────────────────────────────
    if (assetId && userId && modelRecord) {
      try {
        let twin = await db.digitalTwin.findFirst({ where: { assetId } });
        if (!twin) {
          twin = await db.digitalTwin.create({
            data: {
              assetId,
              name: `${spec.machineName} Digital Twin`,
              description: `Digital twin commissioned automatically with the generated 3D model for ${spec.machineName}.`,
              type: 'other',
              parameters: '{}',
              connections: '{}',
              healthScore: 100,
              syncInterval: '5min',
              createdById: userId,
            },
          });
          logger.info('DigitalTwin created for generated model', { twinId: twin.id, assetId });
        }

        if (twin) {
          await db.digitalTwinScene.create({
            data: {
              name: `3D Model - ${spec.machineName}`,
              description: `Programmatic 3D model for ${spec.machineName}, generated via LLM geometry specification.`,
              twinId: twin.id,
              modelId: modelRecord.id,
              isActive: true,
              createdById: userId,
            },
          });
          logger.info('DigitalTwinScene created', { twinId: twin.id, modelId: modelRecord.id });
        }
      } catch (sceneErr) {
        const msg = sceneErr instanceof Error ? sceneErr.message : 'Unknown error';
        logger.warn('Failed to create DigitalTwinScene (non-fatal)', { message: msg });
      }
    }

    timer.end();

    return {
      success: true,
      modelId: modelRecord?.id,
      filePath: relativePath,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('generateProgrammatic3DModel failed', { message });
    return { success: false, error: message };
  }
}

// Re-export types for external use
export type { GeometrySpec, GeometryPart };