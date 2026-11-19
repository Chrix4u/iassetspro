import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { buildAnatomyExplosion } from '@/components/digital-twin/anatomyExplosion';

type Node = {name?:string;mesh?:number;children?:number[];extras?:Record<string,unknown>};

function inspectGlb(name:string) {
  const bytes=readFileSync(join(process.cwd(),'public','smart-anatomy-demos',name));
  expect(bytes.toString('ascii',0,4)).toBe('glTF');
  expect(bytes.readUInt32LE(4)).toBe(2);
  expect(bytes.readUInt32LE(8)).toBe(bytes.length);
  const length=bytes.readUInt32LE(12);
  expect(bytes.toString('ascii',16,20)).toBe('JSON');
  const json=JSON.parse(bytes.subarray(20,20+length).toString('utf8')) as {
    nodes:Node[]; meshes:object[]; scenes:{nodes:number[]}[];
  };
  return json;
}

async function parseRealModel(name:string) {
  const bytes=readFileSync(join(process.cwd(),'public','smart-anatomy-demos',name));
  // Copy Buffer bytes into this test realm's native ArrayBuffer. Node Buffers
  // may be backed by another JS realm and GLTFLoader checks instanceof.
  const bytesArray=new ArrayBuffer(bytes.length);
  new Uint8Array(bytesArray).set(bytes);
  return new Promise<import('three').Group>((resolve,reject)=>{
    new GLTFLoader().parse(bytesArray,'',gltf=>resolve(gltf.scene),reject);
  });
}

describe('original illustrative Smart Anatomy fixtures',()=>{
  it('provides a centrifugal pump with genuine independent component meshes and ancestry',()=>{
    const glb=inspectGlb('original-centrifugal-pump.glb');
    expect(glb.meshes.length).toBeGreaterThanOrEqual(20);
    const names=glb.nodes.map(n=>n.name);
    expect(names).toContain('Volute Casing Assembly');
    expect(names).toContain('Impeller Hub');
    expect(names).toContain('Mechanical Seal');
    expect(names).toContain('Suction Nozzle');
    expect(names).toContain('Bearing');
    expect(glb.nodes[0].extras?.manufacturerApproved).toBe(false);
    expect(glb.nodes.filter(n=>n.children?.length).length).toBeGreaterThanOrEqual(5);
  });

  it('provides separate gearbox gear and bearing components, without OEM claims',()=>{
    const glb=inspectGlb('original-conveyor-gearbox.glb');
    expect(glb.meshes.length).toBeGreaterThanOrEqual(15);
    const names=glb.nodes.map(n=>n.name);
    expect(names).toContain('Input Shaft Assembly');
    expect(names).toContain('Input Pinion');
    expect(names).toContain('Output Gear');
    expect(names.filter(name=>name==='Bearing').length).toBeGreaterThanOrEqual(2);
    expect(glb.nodes[0].extras?.manufacturerApproved).toBe(false);
  });

  it('loads each actual GLB with Three.js and derives independent, reversible geometry-based explosion offsets',async()=>{
    for(const name of ['original-centrifugal-pump.glb','original-conveyor-gearbox.glb']){
      const scene=await parseRealModel(name);
      const geometry=buildAnatomyExplosion(scene,[]);
      expect(geometry.length).toBeGreaterThanOrEqual(15);
      const originalPositions=geometry.map(item=>item.mesh.position.clone());
      expect(geometry.every(item=>item.offset.toArray().every(Number.isFinite))).toBe(true);
      for(const item of geometry){
        item.mesh.position.copy(item.original).addScaledVector(item.offset,1);
      }
      expect(geometry.some((item,index)=>!item.mesh.position.equals(originalPositions[index]))).toBe(true);
      for(const item of geometry)item.mesh.position.copy(item.original);
      expect(geometry.every((item,index)=>item.mesh.position.equals(originalPositions[index]))).toBe(true);
    }
  });

  it('keeps demonstrations isolated from installed asset and work-order records',()=>{
    const source=readFileSync('src/components/digital-twin/MachineVisualExplorer.tsx','utf8');
    expect(source).toContain('smart-anatomy-original-concept-demo');
    expect(source).toContain('/smart-anatomy-demos/original-centrifugal-pump.glb');
    expect(source).toContain('/smart-anatomy-demos/original-conveyor-gearbox.glb');
    expect(source).toContain('not linked to {asset.assetTag} or maintenance records');
    expect(readFileSync('public/smart-anatomy-demos/README.md','utf8')).toContain('not OEM');
  });
});
