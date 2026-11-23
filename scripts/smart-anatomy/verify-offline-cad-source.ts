#!/usr/bin/env bun
/**
 * Read-only confirmation that a retained original CAD file, its converted GLB,
 * and the offline conversion sidecar still match byte-for-byte.
 * This does not certify a machine model, legal source rights, or OEM accuracy.
 */
import { createHash } from 'node:crypto';
import { basename, extname, resolve } from 'node:path';
import { lstat, readFile } from 'node:fs/promises';
import { validateOfflineCadEvidence } from '../../src/lib/smart-anatomy/offline-cad-evidence';
import { inspectSelfContainedGlb, MAX_PRIVATE_CAD_UPLOAD_BYTES } from '../../src/lib/smart-anatomy/validate-glb';
import { auditedGlbMeshPaths } from '../../src/lib/smart-anatomy/mesh-source-paths';

export type OfflineCadVerifyResult = {
  verifiedSourceDigest: string;
  verifiedGlbDigest: string;
  meshCount: number;
  sourceFileName: string;
  declaredSourceUnits: string;
};

const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

async function readRegularBounded(path: string, maximum: number): Promise<Buffer> {
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink() || info.size < 20 || info.size > maximum) {
    throw new Error('Invalid, symlinked or oversized offline CAD verification file');
  }
  return readFile(path);
}

export async function verifyOfflineCadSource(sourcePath: string, glbPath: string, manifestPath: string): Promise<OfflineCadVerifyResult> {
  const source = resolve(sourcePath), output = resolve(glbPath), manifestFile = resolve(manifestPath);
  if (source === output || output === manifestFile || source === manifestFile ||
      !output.toLowerCase().endsWith('.glb') || !manifestFile.endsWith('.json')) {
    throw new Error('Source, GLB and manifest must be three distinct files');
  }
  const manifestBytes = await readRegularBounded(manifestFile, 32 * 1024);
  let raw: unknown;
  try { raw = JSON.parse(manifestBytes.toString('utf8')); }
  catch { throw new Error('Invalid offline CAD manifest JSON'); }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Invalid offline CAD manifest');
  }
  const attested = raw as Record<string, unknown>;
  const [original, geometry] = await Promise.all([
    readRegularBounded(source,MAX_PRIVATE_CAD_UPLOAD_BYTES),
    readRegularBounded(output,MAX_PRIVATE_CAD_UPLOAD_BYTES),
  ]);
  const sourceHash = digest(original), modelHash = digest(geometry);
  const validated = validateOfflineCadEvidence(raw,{
    glbSha256:modelHash, glbByteLength:geometry.length,
    sourceOrigin:String(attested.sourceOrigin || ''),
  });
  if (validated.sourceSha256 !== sourceHash ||
      validated.sourceByteLength !== original.length ||
      validated.sourceFileName !== basename(source) ||
      validated.convertedFileName !== basename(output) ||
      validated.sourceFormat !== extname(source).toLowerCase().replace(/^\./,'')) {
    throw new Error('Retained CAD file does not match original source provenance manifest');
  }
  const checked = inspectSelfContainedGlb(geometry);
  const paths = auditedGlbMeshPaths(geometry);
  if (checked.meshCount !== validated.sourceMeshCount ||
      paths.size !== validated.sourceMeshInstances) {
    throw new Error('Converted 3D geometry no longer matches source mesh manifest');
  }
  return {
    verifiedSourceDigest:sourceHash,verifiedGlbDigest:modelHash,
    meshCount:paths.size,sourceFileName:basename(source),
    declaredSourceUnits:validated.declaredSourceUnits,
  };
}

function parseArgs(args:string[]): {source:string;glb:string;manifest:string} {
  const values:Record<string,string>={};
  for(let i=0;i<args.length;i+=2){
    const name=args[i]?.replace(/^--/,'');
    if (!args[i]?.startsWith('--') || !['source','glb','manifest'].includes(name) ||
        values[name] || !args[i+1] || args[i+1].startsWith('--')) {
      throw new Error('Required: --source OEM-CAD --glb output.glb --manifest output.glb.source.json');
    }
    values[name]=args[i+1];
  }
  if(!values.source||!values.glb||!values.manifest){
    throw new Error('Source CAD, matching GLB and sidecar are required');
  }
  return values as {source:string;glb:string;manifest:string};
}

if(import.meta.main){
  try {
    const options=parseArgs(process.argv.slice(2));
    const result=await verifyOfflineCadSource(options.source,options.glb,options.manifest);
    console.log('Local CAD source and GLB digests verified:',result);
    console.log('OEM/license/machine revision still require independent engineer sign-off');
  } catch(error) {
    console.error('[CAD source verify]',error instanceof Error?error.message:String(error));
    process.exitCode=1;
  }
}
