/**
 * ORIGINAL conceptual CAD training fixtures, not manufacturer engineering.
 * Geometry is made of actual independent meshes with consistent node ancestry.
 * No live assets, maintenance data or work orders are created by this generator.
 * Run: node scripts/smart-anatomy/generate-original-demo-models.mjs
 */
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// GLTFExporter binary serialization uses the browser FileReader interface.
globalThis.FileReader ??= class {
  result = null;
  onloadend = null;
  onerror = null;
  async readAsArrayBuffer(blob) {
    try { this.result=await blob.arrayBuffer(); this.onloadend?.({target:this}); }
    catch(error) { this.onerror?.(error); }
  }
  async readAsDataURL(blob) {
    try {
      this.result='data:'+(blob.type || 'application/octet-stream')+';base64,'+
        Buffer.from(await blob.arrayBuffer()).toString('base64');
      this.onloadend?.({target:this});
    } catch(error) { this.onerror?.(error); }
  }
};

const palette={
  casing:0x307a94, dark:0x253c51, silver:0xaab9c1, steel:0x657a88,
  copper:0xb87944, bearing:0xd3b45f, motor:0x31546d, hub:0x4a97a7,
  gear:0xb6a06b, clear:0x7ba8b8, base:0x394759,
};
const mat=(color,alpha=1)=>new THREE.MeshStandardMaterial({
  color, metalness:0.62, roughness:0.37,
  ...(alpha<1?{transparent:true,opacity:alpha,depthWrite:false}:{}),
});
const materials=Object.fromEntries(Object.entries(palette).map(([k,v])=>[k,mat(v)]));
materials.window=mat(palette.clear,0.22);

function assembly(parent,name){
  const node=new THREE.Group();node.name=name;parent.add(node);return node;
}
function mesh(parent,name,geometry,material,position=[0,0,0],rotation=[0,0,0]){
  const result=new THREE.Mesh(geometry,material);
  result.name=name;result.position.set(...position);result.rotation.set(...rotation);
  result.castShadow=true;result.receiveShadow=true;parent.add(result);return result;
}
function box(parent,name,dims,material,at){
  return mesh(parent,name,new THREE.BoxGeometry(...dims),material,at);
}
function cyl(parent,name,r1,r2,length,material,at,axis='y',segments=40){
  const rotation=axis==='z'?[Math.PI/2,0,0]:axis==='x'?[0,0,Math.PI/2]:[0,0,0];
  return mesh(parent,name,new THREE.CylinderGeometry(r1,r2,length,segments),material,at,rotation);
}
function ring(parent,name,r,tube,material,at,axis='z'){
  return mesh(parent,name,new THREE.TorusGeometry(r,tube,16,64),material,at,
    axis==='y'?[Math.PI/2,0,0]:axis==='x'?[0,Math.PI/2,0]:[0,0,0]);
}
function baseScene(label,description){
  const root=assembly(new THREE.Scene(),label);
  // Keep source and limitations embedded in the GLB for inspectors.
  root.userData={
    provenance:'Lightworld Technologies Ltd. — internally generated conceptual training geometry',
    sourceType:'original-illustrative',
    manufacturerApproved:false,
    physicalMaintenanceInstructions:false,
    limitation:description,
  };
  return root;
}
function pumpModel(){
  const root=baseScene('Centrifugal Pump — Original Illustrative Anatomy',
    'This is not an OEM drawing, as-built geometry, or safe mechanical disassembly sequence.');
  const foundation=assembly(root,'Baseplate and Supports');
  box(foundation,'Skid Baseplate',[5.8,.24,5.0],materials.base,[0,-1.45,0.4]);
  for(const x of [-2.0,2.1]){
    box(foundation,'Foot',[.32,.52,2.6],materials.steel,[x,-1.06,.45]);
  }
  const housing=assembly(root,'Volute Casing Assembly');
  ring(housing,'Spiral Volute Outline',1.03,.32,materials.casing,[-.9,0,0]);
  cyl(housing,'Backplate',1.09,1.09,.16,materials.dark,[-.9,0,.23],'z');
  cyl(housing,'Inspection Cover',.96,.96,.08,materials.window,[-.9,0,-.29],'z');
  const inlet=assembly(housing,'Suction Nozzle');
  cyl(inlet,'Suction Passage',.36,.36,.93,materials.casing,[-.9,0,-1.08],'z');
  ring(inlet,'Suction Flange',.48,.10,materials.silver,[-.9,0,-1.58]);
  const outlet=assembly(housing,'Discharge Nozzle');
  cyl(outlet,'Discharge Neck',.32,.32,.88,materials.casing,[-.02,1.38,0]);
  ring(outlet,'Discharge Flange',.43,.10,materials.silver,[-.02,1.82,0],'y');
  const hydraulic=assembly(root,'Hydraulic Rotor Assembly');
  cyl(hydraulic,'Impeller Hub',.70,.70,.16,materials.hub,[-.9,0,-.04],'z');
  cyl(hydraulic,'Impeller Eye',.31,.31,.34,materials.silver,[-.9,0,-.13],'z');
  for(let k=0;k<7;k++){
    const a=k*2*Math.PI/7;
    const blade=box(hydraulic,'Impeller Vane '+(k+1),[.49,.15,.17],materials.copper,
      [-.9+Math.cos(a)*.43,Math.sin(a)*.43,-.19]);
    blade.rotation.z=a+Math.PI/3;
  }
  const shaft=assembly(root,'Drive Shaft Assembly');
  cyl(shaft,'Pump Shaft',.15,.15,3.45,materials.silver,[-.9,0,1.53],'z');
  cyl(shaft,'Mechanical Seal',.27,.27,.38,materials.copper,[-.9,0,.46],'z');
  const br=assembly(root,'Bearing Pedestal');
  box(br,'Pedestal',[.84,.9,1.15],materials.dark,[-.9,-.8,1.13]);
  ring(br,'Bearing',.27,.07,materials.bearing,[-.9,0,.83]);
  ring(br,'Bearing',.27,.07,materials.bearing,[-.9,0,1.53]);
  const drive=assembly(root,'Electric Motor Assembly');
  cyl(drive,'Motor Stator Shell',.68,.68,1.4,materials.motor,[-.9,0,2.85],'z');
  cyl(drive,'Motor Rotor',.40,.40,1.18,materials.copper,[-.9,0,2.85],'z');
  cyl(drive,'Rear Fan Guard',.72,.72,.16,materials.steel,[-.9,0,3.63],'z');
  box(drive,'Terminal Box',[.8,.33,.63],materials.dark,[-.9,.74,2.87]);
  const coupling=assembly(root,'Coupling Assembly');
  cyl(coupling,'Pump-side Coupling',.36,.36,.3,materials.steel,[-.9,0,2.04],'z');
  cyl(coupling,'Motor-side Coupling',.36,.36,.3,materials.copper,[-.9,0,2.38],'z');
  return root.parent;
}

function spurGear(parent,name,radius,teeth,thickness,material,at){
  const shape=new THREE.Shape();
  // Original teaching geometry, not manufacturing-grade tooth profile.
  for(let i=0;i<teeth*4;i++){
    const angle=i/(teeth*4)*Math.PI*2;
    const toothStep=i%4;
    const radiusAt=radius+(toothStep===1||toothStep===2?.10:0);
    const x=Math.cos(angle)*radiusAt,y=Math.sin(angle)*radiusAt;
    if(i===0)shape.moveTo(x,y);else shape.lineTo(x,y);
  }
  shape.closePath();
  const geometry=new THREE.ExtrudeGeometry(shape,{
    depth:thickness,bevelEnabled:true,bevelThickness:.027,bevelSize:.027,bevelSegments:1,
    curveSegments:3,steps:1,
  });
  geometry.translate(0,0,-thickness/2);
  return mesh(parent,name,geometry,material,at);
}
function gearboxModel(){
  const root=baseScene('Conveyor Gearbox — Original Illustrative Anatomy',
    'Concept only. Gear tooth forms are illustrative and must not be used for manufacturing or physical maintenance.');
  const frame=assembly(root,'Gearbox Housing');
  box(frame,'Cast Housing Base',[4.9,.28,3.0],materials.dark,[0,-1.55,0]);
  for(const x of [-2.32,2.32]){
    box(frame,'Bearing Support Rib',[.20,2.7,3.0],materials.casing,[x,-.10,0]);
  }
  box(frame,'Rear Housing Plate',[4.65,2.7,.16],materials.casing,[0,-.1,-1.22]);
  box(frame,'Removable Inspection Cover',[4.75,2.75,.09],materials.window,[0,-.1,1.20]);
  const input=assembly(root,'Input Shaft Assembly');
  cyl(input,'Input Shaft',.18,.18,3.9,materials.silver,[-1.05,0,0],'z');
  spurGear(input,'Input Pinion',.64,17,.47,materials.gear,[-1.05,0,0]);
  ring(input,'Bearing',.29,.08,materials.bearing,[-1.05,0,-1.10]);
  ring(input,'Bearing',.29,.08,materials.bearing,[-1.05,0,1.10]);
  const output=assembly(root,'Output Shaft Assembly');
  cyl(output,'Output Shaft',.23,.23,4.25,materials.silver,[.99,0,0],'z');
  spurGear(output,'Output Gear',1.31,37,.49,materials.copper,[.99,0,0]);
  ring(output,'Bearing',.37,.08,materials.bearing,[.99,0,-1.10]);
  ring(output,'Bearing',.37,.08,materials.bearing,[.99,0,1.10]);
  const ancillary=assembly(root,'Service and Lubrication');
  cyl(ancillary,'Oil Fill Cap',.19,.19,.24,materials.bearing,[1.8,1.36,.4]);
  cyl(ancillary,'Breather',.13,.13,.37,materials.steel,[-.15,1.45,.2]);
  box(ancillary,'Oil Sight Window',[.5,.42,.08],materials.window,[1.7,-.78,1.27]);
  const feet=assembly(root,'Mounting Feet');
  for(const x of [-1.9,1.9]){
    for(const z of [-1.05,1.05]){
      box(feet,'Mounting Foot',[.65,.32,.52],materials.steel,[x,-1.72,z]);
    }
  }
  return root.parent;
}

async function exportScene(scene,path){
  const exporter=new GLTFExporter();
  const arrayBuffer=await new Promise((resolve,reject)=>{
    exporter.parse(scene,resolve,reject,{binary:true,trs:true,onlyVisible:true});
  });
  const binary=Buffer.from(arrayBuffer);
  if(binary.toString('ascii',0,4)!=='glTF')throw new Error('Invalid GLB header');
  await writeFile(path,binary);
  console.log(path, binary.length+' bytes');
}

const target=join(process.cwd(),'public/smart-anatomy-demos');
await mkdir(target,{recursive:true});
await exportScene(pumpModel(),join(target,'original-centrifugal-pump.glb'));
await exportScene(gearboxModel(),join(target,'original-conveyor-gearbox.glb'));
await writeFile(join(target,'README.md'),`# Smart Anatomy conceptual demo models

These two models are **original illustrative 3D teaching geometry** generated by Lightworld Technologies Ltd. for viewer testing. They are **not OEM engineering drawings, manufacturer-validated equipment models, real plant assets, certified BOMs, or safe disassembly instructions**. They contain genuine independently selectable glTF mesh nodes and named assemblies for testing 3D navigation, explosion, selection and provenance.

Generate locally: \`node scripts/smart-anatomy/generate-original-demo-models.mjs\`.

Do not seed these models as production equipment, attach fabricated machine serial numbers, or link them to live PM/work orders.
`);
