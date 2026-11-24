#!/usr/bin/env bun
/**
 * Offline, authorized STEP/IGES/BREP CAD -> GLB handoff.
 * Real source assembly shapes are retained; no source file or private model is
 * posted to a remote AI service or to the iAssetsPro production API.
 *
 * bun scripts/smart-anatomy/convert-offline-step.ts \
 *   --input /secure/oem/pump.step --output /secure/review/pump.glb \
 *   --origin licensed-oem --source-note "Manufacturer drawing revision A; license confirmed"
 *
 * This runs OpenCascade WASM on a workstation/isolated engineering computer.
 * Do NOT run it in the application's HTTP request process.
 */
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { lstat, readFile, unlink, writeFile } from 'node:fs/promises';
import { basename, extname, resolve, sep } from 'node:path';
import { convertCadImportToGlb, type CadImport } from '../../src/lib/smart-anatomy/offline-step-converter';
import { inspectSelfContainedGlb, MAX_PRIVATE_CAD_UPLOAD_BYTES } from '../../src/lib/smart-anatomy/validate-glb';
import { auditedGlbMeshPaths } from '../../src/lib/smart-anatomy/mesh-source-paths';

type Options = Record<string, string>;
function parseOptions(argv: string[]): Options {
  const allowed = new Set(['input','output','origin','source-note','units']);
  const options: Options = {};
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i], value = argv[i + 1];
    const key = flag?.startsWith('--') ? flag.slice(2) : '';
    if (!key || !allowed.has(key) || !value || value.startsWith('--') || options[key]) {
      throw new Error('Unknown, repeated or missing STEP conversion option');
    }
    options[key] = value;
  }
  return options;
}
function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}
function validatePaths(input: string, output: string): void {
  const source = extname(input).toLowerCase(), result = extname(output).toLowerCase();
  if (!['.step','.stp','.iges','.igs','.brep'].includes(source) || result !== '.glb' ||
    input === output || output.startsWith(resolve(process.cwd(),'public') + sep) ||
    output.startsWith(resolve(process.cwd(),'.next') + sep)) {
    throw new Error('Requires private .step/.stp/.iges/.igs/.brep source and nonpublic .glb output');
  }
}

export async function runOfflineCadHandoff(argv: string[], engineOverride?: (data: Uint8Array, ext: string) => Promise<CadImport>) {
  const options = parseOptions(argv);
  if (!options.input || !options.output || !options.origin || !options['source-note']) {
    throw new Error('Required: --input CAD --output GLB --origin licensed-oem|site-owned-design|original-training --source-note');
  }
  if (!['licensed-oem','site-owned-design','original-training'].includes(options.origin) ||
      options['source-note'].trim().length < 12 || options['source-note'].length > 1000) {
    throw new Error('Document a real authorized CAD source and licensing (minimum 12 characters)');
  }
  const input = resolve(options.input), output = resolve(options.output);
  validatePaths(input, output);
  const sourceFormat = extname(input).toLowerCase();
  const isUnitlessBrep = sourceFormat === '.brep';
  const sourceUnits = options.units || '';
  const physicalScale: Record<string, number> = {mm:0.001,cm:0.01,m:1,in:0.0254,ft:0.3048};
  if (isUnitlessBrep && !Object.prototype.hasOwnProperty.call(physicalScale,sourceUnits)) {
    throw new Error('BREP has no reliable embedded units: declare --units mm|cm|m|in|ft from engineering documentation');
  }
  if (!isUnitlessBrep && options.units) {
    throw new Error('STEP/IGES embedded units are interpreted by OpenCascade; do not override with --units');
  }
  const stat = await lstat(input);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 20 ||
      stat.size > MAX_PRIVATE_CAD_UPLOAD_BYTES) {
    throw new Error('Input CAD must be a regular source file between 20 bytes and 25 MB');
  }
  const raw = await readFile(input);
  const ext = extname(input).toLowerCase();
  let source: CadImport;
  if (engineOverride) {
    source = await engineOverride(raw, ext);
  } else {
    // The OpenCascade dependency is a workstation-only optional development
    // dependency, never an untrusted conversion process inside the web API.
    const require = createRequire(import.meta.url);
    const initializer = require('occt-import-js') as () => Promise<{
      ReadStepFile(data: Uint8Array, options: object): CadImport;
      ReadIgesFile(data: Uint8Array, options: object): CadImport;
      ReadBrepFile(data: Uint8Array, options: object): CadImport;
    }>;
    const engine = await initializer();
    // OpenCascade interprets the original CAD units; request metre output
    // coordinates as required by glTF 2.0.
    const triangulation = {linearUnit:'meter'};
    source = ext === '.step' || ext === '.stp'
      ? engine.ReadStepFile(raw, triangulation)
      : ext === '.iges' || ext === '.igs'
        ? engine.ReadIgesFile(raw, triangulation)
        : engine.ReadBrepFile(raw, triangulation);
  }
  const built = convertCadImportToGlb(source, isUnitlessBrep ? physicalScale[sourceUnits] : 1);
  const inspected = inspectSelfContainedGlb(built.glb);
  const paths = auditedGlbMeshPaths(built.glb);
  if (!inspected.meshCount || !paths.size || paths.size !== built.instanceCount) {
    throw new Error('CAD mesh manifest and GLB independent verifier disagree');
  }
  const manifest = {
    schemaVersion: 1,
    converter: 'iAssetsPro offline OpenCascade assembly-preserving CAD handoff',
    converterVersion: '0.1',
    sourceFileName: basename(input),
    sourceFormat: ext.slice(1),
    sourceOrigin: options.origin,
    sourceNote: options['source-note'].trim(),
    sourceSha256: sha256(raw),
    sourceByteLength: raw.byteLength,
    convertedFileName: basename(output),
    glbSha256: sha256(built.glb),
    glbByteLength: built.glb.byteLength,
    sourceMeshCount: built.meshCount,
    sourceMeshInstances: built.instanceCount,
    sourceAssemblyNodes: built.sourceNodeCount,
    sourceTriangles: built.triangleCount,
    declaredSourceUnits: isUnitlessBrep ? sourceUnits : 'embedded',
    outputUnits: 'meters',
    sourceAssemblyHierarchyPreserved: true,
    additionalPartsInferred: false,
    engineerApproved: false,
    warning: 'Source geometry is authentic to the input file, not independently verified against the installed OEM machine, manual or drawing revision. Physical maintenance approval is separate.',
  };
  let created = false;
  try {
    await writeFile(output, built.glb, {flag:'wx',mode:0o600});
    created = true;
    await writeFile(output + '.source.json', JSON.stringify(manifest,null,2) + '\n',
      {flag:'wx',mode:0o600});
  } catch (error) {
    if (created) await unlink(output).catch(()=>{});
    throw error;
  }
  return {output, manifest};
}

if (import.meta.main) {
  runOfflineCadHandoff(process.argv.slice(2)).then(({output,manifest})=>{
    console.log('Converted real CAD geometry:', output);
    console.log('Source mesh instances:',manifest.sourceMeshInstances,'| source triangles:',manifest.sourceTriangles);
    console.log('SHA-256 provenance:',output + '.source.json');
    console.log('Unverified until a separate authorized engineer approves in Smart Anatomy.');
  }).catch(error=>{
    console.error('[Offline CAD] ' + (error instanceof Error ? error.message : String(error)));
    process.exitCode=1;
  });
}
