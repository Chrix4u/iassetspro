import { describe, it, expect } from 'vitest';
import { validateOfflineCadEvidence } from '@/lib/smart-anatomy/offline-cad-evidence';
import { readFileSync } from 'node:fs';

const glbSha = 'a'.repeat(64);
const evidence = {
  schemaVersion: 1,
  converter: 'iAssetsPro offline OpenCascade assembly-preserving CAD handoff',
  sourceFileName: 'OEM-Pump-A.step',
  sourceFormat: 'step',
  sourceOrigin: 'licensed-oem',
  sourceNote: 'Licensed manufacturer CAD file, drawing rev A; confirmed in engineering files',
  sourceSha256: 'b'.repeat(64),
  sourceByteLength: 140000,
  convertedFileName: 'OEM-Pump-A.glb',
  glbSha256: glbSha,
  glbByteLength: 159832,
  sourceMeshCount: 18,
  sourceMeshInstances: 18,
  sourceAssemblyNodes: 7,
  sourceTriangles: 3848,
  outputUnits: 'meters',
  sourceAssemblyHierarchyPreserved: true,
  additionalPartsInferred: false,
  engineerApproved: false,
};

const expected = {glbSha256:glbSha,glbByteLength:159832,sourceOrigin:'licensed-oem'};
describe('Private CAD offline STEP provenance handshake',()=>{
  it('accepts only a matching, bounded, uncommissioned OpenCascade source sidecar',()=>{
    const result=validateOfflineCadEvidence(evidence,expected);
    expect(result.glbSha256).toBe(glbSha);
    expect(result.engineerApproved).toBe(false);
    expect(result.sourceAssemblyHierarchyPreserved).toBe(true);
  });
  it('refuses false licensing, fabricated engineer approval, digest mismatch and misleading mesh counts',()=>{
    for(const mutation of [
      {sourceOrigin:'original-training'},
      {glbSha256:'f'.repeat(64)},
      {sourceSha256:'not-a-sha'},
      {engineerApproved:true},
      {sourceAssemblyHierarchyPreserved:false},
      {additionalPartsInferred:true},
      {sourceMeshCount:0},
      {glbByteLength:7},
      {outputUnits:'millimeters'},
      {converter:'Unknown vendor'},
      {sourceFormat:'exe'},
    ]) {
      expect(()=>validateOfflineCadEvidence({...evidence,...mutation},expected),JSON.stringify(mutation)).toThrow();
    }
  });
  it('does not let untrusted manifest extras become authoritative audit fields',()=>{
    const x=validateOfflineCadEvidence({...evidence,actor:'admin',isVerified:true,
      sourceSecret:'do not persist this'},expected);
    expect('actor' in x).toBe(false);
    expect('isVerified' in x).toBe(false);
    expect('sourceSecret' in x).toBe(false);
  });
  it('enforces the sidecar as an optional per-GLB upload field, not a public file',()=>{
    const uploader=readFileSync('src/components/digital-twin/PrivateCadUploader.tsx','utf8');
    const upload=readFileSync('src/app/api/smart-anatomy/models/route.ts','utf8');
    expect(uploader).toContain("form.set('sourceManifest', sourceManifest)");
    expect(upload).toContain("validateOfflineCadEvidence(evidence, {");
    expect(upload).toContain("sourceManifest.size > 32 * 1024");
    expect(upload).toContain("conversionEvidence,");
    expect(upload).toContain("isActive: false,");
    expect(upload).toContain("await assertPrivateCadStorageReady(root)");
    expect(upload).toContain("canAccessPlantStrict(scope, asset.plantId)");
  });
});
