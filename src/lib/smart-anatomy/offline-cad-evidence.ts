/** Validate a claimed offline CAD conversion sidecar against the actual GLB bytes.
 * The source STEP cannot be verified until an engineer inspects the retained
 * original and independently checks its SHA-256. Do not treat metadata as OEM approval.
 */
import { MAX_PRIVATE_CAD_UPLOAD_BYTES } from './validate-glb';

export interface OfflineCadEvidence {
  schemaVersion: 1;
  converter: string;
  sourceFileName: string;
  sourceFormat: string;
  sourceOrigin: string;
  sourceNote: string;
  sourceSha256: string;
  sourceByteLength: number;
  convertedFileName: string;
  glbSha256: string;
  glbByteLength: number;
  sourceMeshCount: number;
  sourceMeshInstances: number;
  sourceAssemblyNodes: number;
  sourceTriangles: number;
  outputUnits: string;
  sourceAssemblyHierarchyPreserved: true;
  additionalPartsInferred: false;
  engineerApproved: false;
}

const sha = /^[a-f0-9]{64}$/i;
function boundedInteger(v: unknown, min: number, max: number): v is number {
  return typeof v === 'number' && Number.isSafeInteger(v) && v >= min && v <= max;
}

export function validateOfflineCadEvidence(
  raw: unknown,
  expected: {glbSha256: string; glbByteLength: number; sourceOrigin: string},
): OfflineCadEvidence {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Invalid offline CAD source evidence');
  }
  const data = raw as Record<string, unknown>;
  const shortString = (v: unknown, max: number): v is string =>
    typeof v === 'string' && v.length > 0 && v.length <= max;
  if (data.schemaVersion !== 1 ||
      data.converter !== 'iAssetsPro offline OpenCascade assembly-preserving CAD handoff' ||
      !shortString(data.sourceFileName,255) ||
      /[\\/\x00-\x1f]/.test(String(data.sourceFileName)) ||
      !shortString(data.convertedFileName,255) ||
      /[\\/\x00-\x1f]/.test(String(data.convertedFileName)) ||
      !String(data.convertedFileName).toLowerCase().endsWith('.glb') ||
      !shortString(data.sourceFormat,6) ||
      !['step','stp','iges','igs','brep'].includes(data.sourceFormat) ||
      !shortString(data.sourceNote,1000) ||
      !shortString(data.sourceOrigin,25) ||
      data.sourceOrigin !== expected.sourceOrigin ||
      !sha.test(String(data.sourceSha256 || '')) ||
      !sha.test(String(data.glbSha256 || '')) ||
      String(data.glbSha256).toLowerCase() !== expected.glbSha256.toLowerCase() ||
      data.glbByteLength !== expected.glbByteLength ||
      !boundedInteger(data.sourceByteLength,20,MAX_PRIVATE_CAD_UPLOAD_BYTES) ||
      !boundedInteger(data.sourceMeshCount,1,10000) ||
      !boundedInteger(data.sourceMeshInstances,1,25000) ||
      !boundedInteger(data.sourceAssemblyNodes,1,20000) ||
      !boundedInteger(data.sourceTriangles,1,10000000) ||
      data.outputUnits !== 'meters' ||
      data.sourceAssemblyHierarchyPreserved !== true ||
      data.additionalPartsInferred !== false ||
      data.engineerApproved !== false) {
    throw new Error('Offline CAD evidence does not match this GLB or lacks required source provenance');
  }
  return {
    schemaVersion:1, converter:String(data.converter),
    sourceFileName:String(data.sourceFileName),
    sourceFormat:String(data.sourceFormat),
    sourceOrigin:String(data.sourceOrigin),
    sourceNote:String(data.sourceNote),
    sourceSha256:String(data.sourceSha256).toLowerCase(),
    sourceByteLength:data.sourceByteLength as number,
    convertedFileName:String(data.convertedFileName),
    glbSha256:expected.glbSha256.toLowerCase(),
    glbByteLength:expected.glbByteLength,
    sourceMeshCount:data.sourceMeshCount as number,
    sourceMeshInstances:data.sourceMeshInstances as number,
    sourceAssemblyNodes:data.sourceAssemblyNodes as number,
    sourceTriangles:data.sourceTriangles as number,
    outputUnits:'meters',
    sourceAssemblyHierarchyPreserved:true,
    additionalPartsInferred:false,
    engineerApproved:false,
  };
}
