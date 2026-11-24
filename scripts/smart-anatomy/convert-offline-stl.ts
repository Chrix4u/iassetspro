#!/usr/bin/env bun
/**
 * Offline handoff for engineer-owned STL scans.
 *
 * Usage:
 * bun scripts/smart-anatomy/convert-offline-stl.ts \
 *   --input /secure/source/shaft.stl \
 *   --output /secure/review/shaft.glb \
 *   --units mm \
 *   --origin site-owned-scan \
 *   --source-note "Authorized workshop laser scan; verify orientation and dimensions"
 *
 * Neither output is auto-imported into any tenant's asset registry or
 * maintenance workflow. This is a bounded, single-mesh preview only.
 */
import { createHash } from 'node:crypto';
import { lstat, readFile, unlink, writeFile } from 'node:fs/promises';
import { basename, extname, resolve } from 'node:path';
import { convertStlToGlb, type StlUnit } from '../../src/lib/smart-anatomy/offline-stl-converter';
import { inspectSelfContainedGlb, MAX_PRIVATE_CAD_UPLOAD_BYTES } from '../../src/lib/smart-anatomy/validate-glb';
import { auditedGlbMeshPaths } from '../../src/lib/smart-anatomy/mesh-source-paths';

function parameters(argv: string[]): Record<string, string> {
  const keys = new Set(['input', 'output', 'units', 'origin', 'source-note']);
  const options: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i]?.replace(/^--/, '');
    if (!argv[i]?.startsWith('--') || !key || !keys.has(key) ||
        !argv[i+1] || argv[i+1].startsWith('--') || options[key]) {
      throw new Error('Unknown, repeated, or missing STL conversion option');
    }
    options[key] = argv[i+1];
  }
  return options;
}

async function main() {
  const args = parameters(process.argv.slice(2));
  if (!args.input || !args.output || !args.units || !args.origin || !args['source-note']) {
    throw new Error('Required: --input source.stl --output output.glb --units mm|cm|m|in|ft --origin licensed-oem|site-owned-scan|original-training --source-note "..."');
  }
  if (!['mm','cm','m','in','ft'].includes(args.units) ||
      !['licensed-oem','site-owned-scan','original-training'].includes(args.origin) ||
      args['source-note'].trim().length < 8 || args['source-note'].length > 1000) {
    throw new Error('Invalid units, legal source origin or source documentation');
  }
  const input = resolve(args.input), output = resolve(args.output);
  if (extname(input).toLowerCase() !== '.stl' || extname(output).toLowerCase() !== '.glb' ||
      input === output || basename(input).length > 255) {
    throw new Error('Input must be .stl and output must be a separate .glb path');
  }
  const stat = await lstat(input);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_PRIVATE_CAD_UPLOAD_BYTES ||
      stat.size < 20) throw new Error('Source must be a regular, bounded 20 byte–25 MB STL');
  const original = await readFile(input);
  const converted = convertStlToGlb(original, args.units as StlUnit);
  const report = inspectSelfContainedGlb(converted.glb);
  const paths = auditedGlbMeshPaths(converted.glb);
  if (report.meshCount !== 1 || paths.size !== 1) {
    throw new Error('Converted model failed independent source-path validation');
  }

  const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
  const manifest = {
    formatVersion: 1,
    converter: 'iAssetsPro offline STL handoff',
    sourceFileName: basename(input),
    sourceFormat: converted.sourceFormat,
    sourceSha256: sha256(original),
    sourceOrigin: args.origin,
    sourceNote: args['source-note'].trim(),
    declaredSourceUnits: args.units,
    coordinateSystem: 'source orientation retained',
    outputUnits: 'meters (glTF 2.0)',
    outputFileName: basename(output),
    outputSha256: sha256(converted.glb),
    triangles: converted.triangles,
    glbBytes: converted.glb.byteLength,
    sourceHasPartHierarchy: false,
    engineerApproval: false,
    warning: 'Single unverified STL geometry only; neither OEM identity nor assembly/BOM or maintenance procedure is approved',
  };
  let glbSaved = false;
  try {
    await writeFile(output, converted.glb, { mode: 0o600, flag: 'wx' });
    glbSaved = true;
    await writeFile(output + '.source.json', JSON.stringify(manifest, null, 2) + '\n',
      {mode: 0o600, flag: 'wx'});
  } catch (error) {
    if (glbSaved) await unlink(output).catch(() => {});
    throw error;
  }
  console.log('Offline conversion complete:', basename(output));
  console.log('Triangles:', converted.triangles, '| GLB bytes:', converted.glb.length);
  console.log('Source origin and SHA-256 recorded in:', output + '.source.json');
  console.log('No asset was commissioned. A different authorized engineer must review before use.');
}

main().catch(error => {
  console.error('[Smart Anatomy STL] ' + (error instanceof Error ? error.message : String(error)));
  process.exitCode = 1;
});
