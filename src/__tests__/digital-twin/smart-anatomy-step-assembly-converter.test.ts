import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { convertCadImportToGlb, type CadImport } from '@/lib/smart-anatomy/offline-step-converter';
import { inspectSelfContainedGlb } from '@/lib/smart-anatomy/validate-glb';
import { auditedGlbMeshPaths } from '@/lib/smart-anatomy/mesh-source-paths';

const source: CadImport = {
  success: true,
  root: {name:'Industrial OEM assembly', meshes: [], children:[
    {name:'Drive housing', meshes:[0], children:[
      {name:'Bearing B',meshes:[1],children:[]},
    ]},
  ]},
  meshes:[
    {name:'housing',color:[0.1,0.5,0.8],attributes:{
      position:{array:[0,0,0, 1,0,0, 0,1,0]},
      normal:{array:[0,0,1, 0,0,1, 0,0,1]},
    },index:{array:[0,1,2]}},
    {name:'bearing',attributes:{position:{array:[0,0,1,1,0,1,0,1,1]}},index:{array:[0,1,2]}},
  ],
};

function extractJson(glb: Buffer) {
  const n = glb.readUInt32LE(12);
  return JSON.parse(glb.subarray(20,20+n).toString('utf8'));
}

describe('Offline real CAD assembly -> private GLB handoff',()=>{
  it('retains source assembly, real individual meshes, source triangle count and GLB integrity',()=>{
    const result = convertCadImportToGlb(source);
    expect(result.meshCount).toBe(2);
    expect(result.instanceCount).toBe(2);
    expect(result.triangleCount).toBe(2);
    expect(result.glb.subarray(0,4).toString()).toBe('glTF');
    expect(inspectSelfContainedGlb(result.glb).meshCount).toBe(2);
    expect(auditedGlbMeshPaths(result.glb).size).toBe(2);
    const json = extractJson(result.glb);
    expect(json.nodes.map((node:{name:string})=>node.name)).toEqual([
      'Industrial OEM assembly','Drive housing','Bearing B',
    ]);
    expect(json.asset.extras.engineerVerified).toBe(false);
    expect(json.asset.extras.sourceHierarchyPreserved).toBe(true);
    expect(json.meshes).toHaveLength(2);
  });

  it('scales unitless BREP millimetres to actual glTF metres with strict limits',()=>{
    const raw=convertCadImportToGlb(source);
    const mm=convertCadImportToGlb(source,0.001);
    const rawPositions=extractJson(raw.glb).accessors.find((a:{min?:number[]})=>a.min);
    const converted=extractJson(mm.glb).accessors.find((a:{min?:number[]})=>a.min);
    expect(rawPositions.max[0]).toBe(1);
    expect(converted.max[0]).toBeCloseTo(0.001);
    expect(()=>convertCadImportToGlb(source,0)).toThrow(/scale/);
    expect(()=>convertCadImportToGlb(source,NaN)).toThrow(/scale/);
  });
  it('never invents a hidden part and preserves repeated-color source surfaces as visual-only nodes',()=>{
    const copied: CadImport = {
      ...source,
      root:{name:'Original machine',meshes:[],children:[
        {name:'OEM supplied housing',meshes:[0,1],children:[]},
      ]},
    };
    const result=convertCadImportToGlb(copied);
    const json=extractJson(result.glb);
    expect(json.nodes.map((node:{name:string})=>node.name)).toEqual([
      'Original machine','OEM supplied housing',
      'OEM supplied housing · CAD surface 01','OEM supplied housing · CAD surface 02',
    ]);
    expect(result.instanceCount).toBe(2);
    expect(auditedGlbMeshPaths(result.glb).size).toBe(2);
  });

  it('rejects missing geometry, nonfinite vertices, stale triangle indices and fabricated children',()=>{
    expect(()=>convertCadImportToGlb({...source,success:false})).toThrow();
    expect(()=>convertCadImportToGlb({...source,meshes:[]})).toThrow();
    const invalid={...source,meshes:source.meshes.map(m=>({...m}))};
    invalid.meshes[0]={...invalid.meshes[0],index:{array:[0,1,200]}};
    expect(()=>convertCadImportToGlb(invalid)).toThrow(/invalid vertex/);
    const nan: CadImport={...source,meshes:[
      {...source.meshes[0],attributes:{position:{array:[0,0,NaN,1,0,0,0,1,0]}}},
      source.meshes[1],
    ]};
    expect(()=>convertCadImportToGlb(nan)).toThrow(/numeric/);
    const orphan:CadImport={...source,root:{name:'CAD',meshes:[0],children:[]}};
    expect(()=>convertCadImportToGlb(orphan)).toThrow(/unreferenced/);
    const cycle:CadImport={...source,root:{name:'cycle',meshes:[],children:[]}};
    cycle.root.children.push(cycle.root);
    expect(()=>convertCadImportToGlb(cycle)).toThrow(/cyclic/);
  });

  it('imports an actual OpenCascade STEP fixture, preserving real assembly parts and geometry',async()=>{
    // This file comes directly from the pinned LGPL OpenCascade importer npm
    // package, never from an actual customer or OEM machine.
    const require=createRequire(import.meta.url);
    const packageRoot=join(process.cwd(),'node_modules','occt-import-js');
    const file=join(packageRoot,'test','testfiles','cax-if','as1_pe_203.stp');
    expect(existsSync(file)).toBe(true);
    const initialize=require('occt-import-js') as ()=>Promise<{
      ReadStepFile(input:Uint8Array,params:object):CadImport;
    }>;
    const occt=await initialize();
    const imported=occt.ReadStepFile(readFileSync(file),{linearUnit:'meter'});
    expect(imported.success).toBe(true);
    const result=convertCadImportToGlb(imported);
    expect(result.meshCount).toBe(18);
    expect(result.instanceCount).toBe(18);
    expect(result.triangleCount).toBeGreaterThan(100);
    expect(inspectSelfContainedGlb(result.glb).meshCount).toBe(18);
    expect(auditedGlbMeshPaths(result.glb).size).toBe(18);
    const json=extractJson(result.glb);
    expect(json.nodes.some((node:{name:string})=>node.name==='AS1_PE_ASM')).toBe(true);
    // Exported assembly must include independent geometry nodes for interactive
    // inspection; it must not collapse to a single decorative mesh.
    expect(json.nodes.filter((node:{mesh?:number})=>Number.isInteger(node.mesh))).toHaveLength(18);
  },30_000);
});
