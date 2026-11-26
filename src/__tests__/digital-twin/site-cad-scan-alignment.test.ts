import {describe,it,expect} from 'vitest';
import * as THREE from 'three';
import {solveCadToScanAlignment} from '@/lib/smart-anatomy/cad-scan-alignment';

const cad=[
  {x:0,y:0,z:0},{x:2,y:0,z:0},
  {x:0,y:3,z:0},{x:1,y:1,z:2},
];
const toScan=(p:{x:number;y:number;z:number})=>({
  x:-p.y+2,y:p.x-1,z:p.z+3,
});
const pairs=cad.map((point,i)=>({
  label:'Measured physical reference '+String(i+1),
  cad:point,scan:toScan(point),
}));

describe('source-grounded CAD → LiDAR scan rigid registration',()=>{
  it('maps real measured OEM CAD landmarks to scanned installed machine geometry without scale distortion',()=>{
    const result=solveCadToScanAlignment(pairs);
    expect(result.solution.landmarkCount).toBe(4);
    expect(result.solution.autoCertified).toBe(false);
    expect(result.solution.rmsErrorMetres).toBe(0);
    expect(result.solution.maxRelativeDistanceError).toBe(0);
    const q=new THREE.Quaternion(...result.solution.rotation);
    for(const pair of pairs){
      const moved=new THREE.Vector3(pair.cad.x,pair.cad.y,pair.cad.z)
        .applyQuaternion(q).add(new THREE.Vector3(
          result.solution.translation.x,result.solution.translation.y,result.solution.translation.z,
        ));
      expect(moved.distanceTo(new THREE.Vector3(pair.scan.x,pair.scan.y,pair.scan.z)))
        .toBeLessThan(1e-8);
    }
  });
  it('rejects three collinear reference points even if apparent positions align',()=>{
    const source=[
      {x:0,y:0,z:0},{x:1,y:0,z:0},{x:2,y:0,z:0},
    ];
    expect(()=>solveCadToScanAlignment(source.map((p,i)=>({
      label:'Collinear reference '+i,cad:p,scan:p,
    })))).toThrow(/collinear/);
  });
  it('refuses to silently fit wrong physical scale units',()=>{
    expect(()=>solveCadToScanAlignment(pairs.map(item=>({
      ...item,scan:{x:item.scan.x*1000,y:item.scan.y*1000,z:item.scan.z*1000},
    })))).toThrow();
    expect(()=>solveCadToScanAlignment(pairs.map(item=>({
      ...item,scan:{x:item.scan.x*1.05,y:item.scan.y*1.05,z:item.scan.z*1.05},
    })))).toThrow(/dimensions disagree/);
  });
  it('rejects imprecise/misidentified landmarks rather than displaying an apparently accurate overlay',()=>{
    const incorrect=pairs.map(p=>({...p,scan:{...p.scan}}));
    incorrect[3].scan.x+=0.3;
    expect(()=>solveCadToScanAlignment(incorrect)).toThrow(/dimensions disagree|residual/);
  });
  it('requires true 3D metre coordinates, unique physical descriptions, and bounded count',()=>{
    expect(()=>solveCadToScanAlignment([])).toThrow(/3 to 8/);
    expect(()=>solveCadToScanAlignment(pairs.slice(0,2))).toThrow(/3 to 8/);
    expect(()=>solveCadToScanAlignment([...pairs,...pairs,...pairs])).toThrow(/3 to 8/);
    expect(()=>solveCadToScanAlignment(pairs.map(p=>({...p,label:'Duplicate landmark'}))))
      .toThrow(/uniquely identified/);
    expect(()=>solveCadToScanAlignment(pairs.map((p,i)=>i===0?{
      ...p,scan:{...p.scan,x:Infinity},
    }:p))).toThrow(/finite/);
    expect(()=>solveCadToScanAlignment(pairs.map((p,i)=>i===0?{
      ...p,cad:{...p.cad,x:501},
    }:p))).toThrow(/finite/);
  });
  it('rejects mirrored 4-point 3D geometry that a photorealistic view alone could conceal',()=>{
    const reflected=pairs.map(p=>({
      ...p,scan:{x:-p.cad.x,y:p.cad.y,z:p.cad.z},
    }));
    expect(()=>solveCadToScanAlignment(reflected)).toThrow(/residual/);
  });
});
