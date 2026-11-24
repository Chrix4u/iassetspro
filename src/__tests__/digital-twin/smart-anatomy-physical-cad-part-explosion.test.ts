import {describe, expect, it} from 'vitest';
import * as THREE from 'three';
import {buildAnatomyExplosion} from '@/components/digital-twin/anatomyExplosion';
import {convertCadImportToGlb} from '@/lib/smart-anatomy/offline-step-converter';
import {buildImportedNodePaths, cloneImportedAnatomyMesh} from '@/components/digital-twin/anatomyModelMesh';
import {countImportedSourceGroups} from '@/components/digital-twin/anatomyBindings';

function surface(name: string, x: number, isCadFace = true) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.8,0.4,0.2),new THREE.MeshBasicMaterial());
  mesh.name = name;
  mesh.position.set(x,0,0);
  if (isCadFace) mesh.userData.iAssetsCadSurface = true;
  return mesh;
}
function physicalPartAssembly() {
  const root = new THREE.Group();
  const part = new THREE.Group();
  part.name = 'Genuine CAD part #1';
  root.add(part);
  const surfaceOne=surface('Machined body · CAD surface 01',-0.4);
  const surfaceTwo=surface('Machined body · CAD surface 02',0.4);
  part.add(surfaceOne,surfaceTwo);
  const distinct=surface('Actual second part',7,false);
  root.add(distinct);
  return {root,part,surfaceOne,surfaceTwo,distinct};
}

describe('OEM source product grouping in real exploded CAD',()=>{
  it('refuses to explode one genuine part merely because it has several tessellated faces',()=>{
    const {part}=physicalPartAssembly();
    const root=new THREE.Group();root.add(part);
    expect(buildAnatomyExplosion(root,[])).toEqual([]);
  });
  it('keeps the source part geometry together and separates the actual second part',()=>{
    const {root,surfaceOne,surfaceTwo,distinct}=physicalPartAssembly();
    const plan=buildAnatomyExplosion(root,[]);
    expect(plan).toHaveLength(3);
    expect(plan[0].mesh).toBe(surfaceOne);
    expect(plan[1].mesh).toBe(surfaceTwo);
    expect(plan[2].mesh).toBe(distinct);
    expect(plan[0].offset.distanceTo(plan[1].offset)).toBeLessThan(1e-9);
    expect(plan[0].offset.length()).toBeGreaterThan(0);
    expect(plan[2].offset.length()).toBeGreaterThan(0);
    expect(plan[0].offset.x).toBeLessThan(0);
    expect(plan[2].offset.x).toBeGreaterThan(0);
    expect(surfaceOne.position.x).toBe(-0.4);
    expect(surfaceTwo.position.x).toBe(0.4);
  });
  it('fails closed if two engineers specified inconsistent exploded offsets for the same part',()=>{
    const {root,surfaceOne,surfaceTwo}=physicalPartAssembly();
    const plans=buildAnatomyExplosion(root,[
      {meshName:surfaceOne.name,assetId:'pump-1',assetName:'Pump',componentId:'first-face',explodeOffset:[2,0,0]},
      {meshName:surfaceTwo.name,assetId:'pump-1',assetName:'Pump',componentId:'second-face',explodeOffset:[0,2,0]},
    ]);
    expect(plans).toEqual([]);
  });
  it('applies an engineer-approved part offset to ALL surfaces of that genuine part',()=>{
    const {root,surfaceOne}=physicalPartAssembly();
    const plans=buildAnatomyExplosion(root,[
      {meshName:surfaceOne.name,assetId:'pump-1',assetName:'Pump',componentId:'verified-genuine-part',explodeOffset:[0,3,0]},
    ]);
    expect(plans[0].offset.toArray()).toEqual([0,3,0]);
    expect(plans[1].offset.toArray()).toEqual([0,3,0]);
  });
  it('preserves source face metadata through offline GLB export without fabricating parts',()=>{
    const triangle=(x:number)=>({
      attributes:{position:{array:[x,0,0,x+1,0,0,x,1,0]}},
      index:{array:[0,1,2]},
    });
    const result=convertCadImportToGlb({
      success:true,
      root:{name:'Actual source part',meshes:[0,1],children:[]},
      meshes:[triangle(0),triangle(2)],
    });
    expect(result.meshCount).toBe(2);
    expect(result.instanceCount).toBe(2);
    const bytes=result.glb;
    const jsonLength=bytes.readUInt32LE(12);
    const gltf=JSON.parse(bytes.subarray(20,20+jsonLength).toString('utf8')) as {
      nodes:Array<{name:string;extras?:{iAssetsCadSurface?:boolean;iAssetsCadParentNode?:number}}>;
    };
    const faces=gltf.nodes.filter(node=>node.extras?.iAssetsCadSurface===true);
    expect(faces).toHaveLength(2);
    expect(faces.every(face=>face.extras?.iAssetsCadParentNode===0)).toBe(true);
    expect(faces.map(face=>face.name)).toEqual([
      'Actual source part · CAD surface 01','Actual source part · CAD surface 02',
    ]);
  });
  it('uses original source-node paths after the interactive renderer flattens part hierarchy',()=>{
    const {surfaceOne,surfaceTwo,distinct}=physicalPartAssembly();
    const flattened=new THREE.Group();
    // Production ModelLoader clones source meshes and bakes their world
    // transform into the flat rendered node. Parent identity is lost here.
    for(const face of [surfaceOne,surfaceTwo,distinct]){
      const copy=face.clone(false);
      copy.userData.__iAssetsSourceNodePath=face===distinct
        ? 'Machine/Housing/Second part'
        : 'Machine/Machined body/'+face.name;
      flattened.add(copy);
    }
    const planned=buildAnatomyExplosion(flattened,[]);
    expect(planned).toHaveLength(3);
    expect(planned[0].mesh.parent).toBe(flattened);
    expect(planned[1].mesh.parent).toBe(flattened);
    expect(planned[0].offset.distanceTo(planned[1].offset)).toBeLessThan(1e-9);
    expect(planned[0].offset.distanceTo(planned[2].offset)).toBeGreaterThan(0);
  });

  it('round-trips genuine source part ancestry through GLTFLoader and flattened rendered clones',async()=>{
    const tri=(x:number)=>({
      attributes:{position:{array:[x,0,0,x+0.4,0,0,x,0.5,0]}},
      index:{array:[0,1,2]},
    });
    const exported=convertCadImportToGlb({
      success:true,
      root:{name:'Machine',meshes:[],children:[
        {name:'Actual machined part A',meshes:[0,1],children:[]},
        {name:'Actual part B',meshes:[2],children:[]},
      ]},
      meshes:[tri(-2),tri(-1),tri(4)],
    });
    const {GLTFLoader}=await import('three/examples/jsm/loaders/GLTFLoader.js');
    const scene=await new Promise<THREE.Group>((resolve,reject)=>{
      // GLTFLoader must receive an actual realm-local ArrayBuffer, not a
      // Node Buffer backing store which may fail instanceof ArrayBuffer.
      const payload=new ArrayBuffer(exported.glb.byteLength);
      new Uint8Array(payload).set(exported.glb);
      new GLTFLoader().parse(payload,'',gltf=>resolve(gltf.scene),reject);
    });
    scene.updateWorldMatrix(true,true);
    const sourcePaths=buildImportedNodePaths(scene);
    const rendered=new THREE.Group();
    scene.traverse(node=>{
      if(!(node as THREE.Mesh).isMesh)return;
      const source=node as THREE.Mesh;
      const clone=cloneImportedAnatomyMesh(source,scene,sourcePaths.get(source),true);
      rendered.add(clone);
    });
    expect(rendered.children).toHaveLength(3);
    expect(countImportedSourceGroups(rendered.children.map(mesh=>({
      id:mesh.uuid,
      path:String(mesh.userData.__iAssetsSourceNodePath),
      meshName:mesh.name,selectionKey:mesh.name,
      componentId:null,assetId:null,verified:false,
      isCadSurface:mesh.userData.iAssetsCadSurface===true,
    })))).toBe(2);
    const surfaces=rendered.children.filter(mesh=>mesh.userData.iAssetsCadSurface===true);
    expect(surfaces).toHaveLength(2);
    expect(surfaces[0].userData.__iAssetsSourceNodePath)
      .toContain('Actual_machined_part_A/');
    expect(surfaces[1].userData.__iAssetsSourceNodePath)
      .toContain('Actual_machined_part_A/');
    const plan=buildAnatomyExplosion(rendered,[]);
    expect(plan).toHaveLength(3);
    const p0=plan.find(p=>p.mesh===surfaces[0])!;
    const p1=plan.find(p=>p.mesh===surfaces[1])!;
    expect(p0.offset.distanceTo(p1.offset)).toBeLessThan(1e-9);
  });

  it('does not group unrelated glTF meshes just because they share a parent',()=>{
    const root=new THREE.Group();
    root.add(surface('Bearing',-2,false),surface('Shaft',2,false));
    const plan=buildAnatomyExplosion(root,[]);
    expect(plan).toHaveLength(2);
    expect(plan[0].offset.distanceTo(plan[1].offset)).toBeGreaterThan(0);
  });
});
