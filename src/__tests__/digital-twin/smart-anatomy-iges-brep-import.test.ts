import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { convertCadImportToGlb, type CadImport } from '@/lib/smart-anatomy/offline-step-converter';
import { inspectSelfContainedGlb } from '@/lib/smart-anatomy/validate-glb';
import { auditedGlbMeshPaths } from '@/lib/smart-anatomy/mesh-source-paths';

const root = join(process.cwd(), 'node_modules', 'occt-import-js', 'test', 'testfiles');

describe('Real IGES and BREP offline CAD ingestion', () => {
  it.each([
    { source: join(root, 'cube-10x10mm', 'Cube 10x10.igs'), format: 'IGES', expectedMeshes: 1 },
    { source: join(root, 'cax-if-brep', 'as1_pe_203.brep'), format: 'BREP', expectedMeshes: 18 },
  ])('$format fixture retains only source geometry and passes private GLB validation', async ({source,format,expectedMeshes}) => {
    const require = createRequire(import.meta.url);
    const start = require('occt-import-js') as () => Promise<{
      ReadIgesFile(data: Uint8Array, params: object): CadImport;
      ReadBrepFile(data: Uint8Array, params: object): CadImport;
    }>;
    const importer = await start();
    const raw = readFileSync(source);
    const imported = format === 'IGES'
      ? importer.ReadIgesFile(raw, {linearUnit: 'meter'})
      : importer.ReadBrepFile(raw, {linearUnit: 'meter'});
    expect(imported.success).toBe(true);
    const result = convertCadImportToGlb(imported);
    expect(result.meshCount).toBe(expectedMeshes);
    expect(result.instanceCount).toBe(expectedMeshes);
    expect(result.triangleCount).toBeGreaterThan(0);
    expect(inspectSelfContainedGlb(result.glb).meshCount).toBe(expectedMeshes);
    expect(auditedGlbMeshPaths(result.glb).size).toBe(expectedMeshes);
  }, 30_000);
});
