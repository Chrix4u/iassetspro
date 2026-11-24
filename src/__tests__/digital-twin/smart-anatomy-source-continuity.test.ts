import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { convertCadImportToGlb } from '@/lib/smart-anatomy/offline-step-converter';
import { verifyOfflineCadSource } from '../../../scripts/smart-anatomy/verify-offline-cad-source';

const sha = (bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const geometry=convertCadImportToGlb({
  success:true,
  root:{name:'Sample CAD',meshes:[0],children:[]},
  meshes:[{name:'Actual sample triangle',attributes:{position:{array:[0,0,0,0.001,0,0,0,0.001,0]}},
    index:{array:[0,1,2]}}],
}).glb;

describe('Offline actual CAD source-to-GLB checksum continuity',()=>{
  it('matches original source, private GLB and sidecar without network access or DB writes',async()=>{
    const folder=await mkdtemp(join(tmpdir(),'iassetspro-cad-check-'));
    try {
      const source=join(folder,'workshop.step');
      const glb=join(folder,'workshop.glb');
      const sidecar=join(folder,'workshop.glb.source.json');
      const original=Buffer.from('ISO-10303-21;\nHEADER;\nFILE_DESCRIPTION((\'sample\'),\'2;1\');\nENDSEC;\nEND-ISO-10303-21;\n');
      await writeFile(source,original,{mode:0o600});
      await writeFile(glb,geometry,{mode:0o600});
      const manifest={
        schemaVersion:1,
        converter:'iAssetsPro offline OpenCascade assembly-preserving CAD handoff',
        sourceFileName:'workshop.step', sourceFormat:'step', sourceOrigin:'site-owned-design',
        sourceNote:'Site-supplied authenticated geometry prepared for isolated mock validation',
        sourceSha256:sha(original),sourceByteLength:original.length,
        convertedFileName:'workshop.glb',glbSha256:sha(geometry),glbByteLength:geometry.length,
        sourceMeshCount:1,sourceMeshInstances:1,sourceAssemblyNodes:1,sourceTriangles:1,
        declaredSourceUnits:'embedded',outputUnits:'meters',
        sourceAssemblyHierarchyPreserved:true,additionalPartsInferred:false,engineerApproved:false,
      };
      await writeFile(sidecar,JSON.stringify(manifest),{mode:0o600});
      const verified=await verifyOfflineCadSource(source,glb,sidecar);
      expect(verified.verifiedSourceDigest).toBe(sha(original));
      expect(verified.verifiedGlbDigest).toBe(sha(geometry));
      expect(verified.meshCount).toBe(1);
      expect(verified.declaredSourceUnits).toBe('embedded');
      await writeFile(source,Buffer.concat([original,Buffer.from('tampered')]));
      await expect(verifyOfflineCadSource(source,glb,sidecar)).rejects.toThrow(/Retained CAD/);
      await writeFile(source,original);
      await writeFile(glb,Buffer.concat([geometry,Buffer.from('modified')]));
      await expect(verifyOfflineCadSource(source,glb,sidecar)).rejects.toThrow(/does not match/);
    } finally {await rm(folder,{recursive:true,force:true});}
  });
});
