// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { auditedGlbMeshPaths } from '@/lib/smart-anatomy/mesh-source-paths';

const files=['original-centrifugal-pump.glb','original-conveyor-gearbox.glb'];

async function threeMeshPaths(file:Uint8Array):Promise<Set<string>> {
  const copied=new ArrayBuffer(file.byteLength);
  new Uint8Array(copied).set(file);
  const scene=await new Promise<import('three').Group>((resolve,reject)=>
    new GLTFLoader().parse(copied,'',gltf=>resolve(gltf.scene),reject));
  const results=new Set<string>();
  const walk=(object:import('three').Object3D,path:string):void=>{
    for(const child of object.children){
      const key=(child.name || child.type).replaceAll('/','%2F');
      const sourcePath=path?path+'/'+key:key;
      if((child as import('three').Mesh).isMesh)results.add(sourcePath);
      walk(child,sourcePath);
    }
  };
  walk(scene,'');
  return results;
}

describe('authoritative imported CAD mesh source paths',()=>{
  it.each(files)('matches real GLTFLoader source ancestry for %s',async name=>{
    const bytes=readFileSync('public/smart-anatomy-demos/'+name);
    const expected=await threeMeshPaths(bytes);
    const computed=auditedGlbMeshPaths(bytes);
    expect(computed.size).toBe(expected.size);
    expect([...computed].sort()).toEqual([...expected].sort());
  });

  it('refuses invalid binary input before extracting allegedly approved part paths',()=>{
    expect(()=>auditedGlbMeshPaths(Buffer.from('fake-cad'))).toThrow();
  });
});
