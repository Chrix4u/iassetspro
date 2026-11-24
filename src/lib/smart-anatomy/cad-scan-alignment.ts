import * as THREE from 'three';

/**
 * Engineer-controlled CAD-to-as-built registration.
 * Maps AUTHENTIC OEM CAD model-local metres into the surveyed site-scan
 * model-local metre coordinate system. It does not synthesize OEM geometry.
 * Landmark pairs must be observed and documented on BOTH real sources.
 */
export type AlignmentPoint = {x:number;y:number;z:number};
export type AlignmentLandmark = {
  label:string;
  cad:AlignmentPoint;
  scan:AlignmentPoint;
};
export type CadScanAlignmentSolution = {
  translation:AlignmentPoint;
  /** glTF/Three quaternion xyzw, mapping CAD vectors to scan vectors. */
  rotation:[number,number,number,number];
  rmsErrorMetres:number;
  maxErrorMetres:number;
  maxRelativeDistanceError:number;
  baselineMetres:number;
  landmarkCount:number;
  autoCertified:false;
};

const toVec=(p:AlignmentPoint)=>new THREE.Vector3(p.x,p.y,p.z);
const jsonPoint=(v:THREE.Vector3):AlignmentPoint=>({
  x:Number(v.x.toFixed(8)),y:Number(v.y.toFixed(8)),z:Number(v.z.toFixed(8)),
});

function normalizedBasis(a:THREE.Vector3,b:THREE.Vector3,c:THREE.Vector3):THREE.Matrix4 {
  const x=b.clone().sub(a);
  const axis=c.clone().sub(a);
  if(x.length()<0.10||axis.length()<0.10)throw Error('Landmarks are too close together');
  x.normalize();
  const z=new THREE.Vector3().crossVectors(x,axis);
  if(z.length()<0.10)throw Error('Landmarks must be physically separated and noncollinear');
  z.normalize();
  const y=new THREE.Vector3().crossVectors(z,x).normalize();
  return new THREE.Matrix4().makeBasis(x,y,z);
}

function distance(a:THREE.Vector3,b:THREE.Vector3){return a.distanceTo(b);}
function validatedLandmark(value:unknown,i:number):AlignmentLandmark {
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid landmark');
  const entry=value as Record<string,unknown>;
  const label=String(entry.label||'').trim();
  if(label.length<5||label.length>140||/[\x00-\x1f\x7f]/.test(label)){
    throw Error('Describe each physical correspondence on the CAD and scan');
  }
  const validatePoint=(candidate:unknown):AlignmentPoint=>{
    if(!candidate||typeof candidate!=='object'||Array.isArray(candidate))throw Error('Invalid 3D landmark');
    const p=candidate as Record<string,unknown>;
    const fields=[p.x,p.y,p.z];
    if(fields.some(x=>typeof x!=='number'||!Number.isFinite(x)||Math.abs(x)>500)){
      throw Error('3D landmarks must be finite model-local coordinates in metres');
    }
    return {x:p.x as number,y:p.y as number,z:p.z as number};
  };
  return {label,scan:validatePoint(entry.scan),cad:validatePoint(entry.cad)};
}

/** No scale fitting is allowed: both actual source geometries must already be
 * in metres. Mismatches in physical dimensions stop registration.
 *
 * This is a rigid landmark-frame solution, with centroid translation and
 * independent residual verification; not a best-effort photo-name match.
 */
export function solveCadToScanAlignment(input:unknown):{
  landmarks:AlignmentLandmark[];solution:CadScanAlignmentSolution;
} {
  if(!Array.isArray(input)||input.length<3||input.length>8){
    throw Error('Provide 3 to 8 independently identified CAD-to-scan physical landmark pairs');
  }
  const landmarks=input.map(validatedLandmark);
  const labels=new Set(landmarks.map(p=>p.label.toLowerCase()));
  if(labels.size!==landmarks.length)throw Error('Each physical landmark must be uniquely identified');
  const from=landmarks.map(point=>toVec(point.cad));
  const to=landmarks.map(point=>toVec(point.scan));
  let best:[number,number,number]=[0,1,2];
  let largestArea=0;
  for(let i=0;i<from.length;i++)for(let j=i+1;j<from.length;j++){
    for(let k=j+1;k<from.length;k++){
      const area=new THREE.Vector3().crossVectors(
        from[j].clone().sub(from[i]),from[k].clone().sub(from[i]),
      ).lengthSq();
      if(area>largestArea){largestArea=area;best=[i,j,k];}
    }
  }
  if(largestArea<0.0004)throw Error('Physical landmarks are collinear or too close to align');

  const [i,j,k]=best;
  const cadBasis=normalizedBasis(from[i],from[j],from[k]);
  const scanBasis=normalizedBasis(to[i],to[j],to[k]);
  const transform=scanBasis.clone().multiply(cadBasis.clone().invert());
  const quaternion=new THREE.Quaternion().setFromRotationMatrix(transform).normalize();

  // A registration is rigid: DO NOT compensate for erroneous scan units with
  // an arbitrary similarity scale or distort the manufacturer's CAD drawing.
  let baseline=0,maxRelative=0;
  for(let a=0;a<from.length;a++)for(let b=a+1;b<from.length;b++){
    const sourceDistance=distance(from[a],from[b]);
    const targetDistance=distance(to[a],to[b]);
    if(sourceDistance<0.10||targetDistance<0.10){
      throw Error('Physical reference points are too close for reliable registration');
    }
    baseline=Math.max(baseline,sourceDistance,targetDistance);
    const delta=Math.abs(sourceDistance-targetDistance);
    const relative=delta/sourceDistance;
    maxRelative=Math.max(maxRelative,relative);
    if(delta>0.04&&relative>0.025){
      throw Error('Scan and CAD physical dimensions disagree; check source units or landmark identity');
    }
  }
  const cadCentroid=new THREE.Vector3();
  const scanCentroid=new THREE.Vector3();
  for(let t=0;t<from.length;t++){
    cadCentroid.add(from[t]);scanCentroid.add(to[t]);
  }
  cadCentroid.divideScalar(from.length);
  scanCentroid.divideScalar(from.length);
  const offset=scanCentroid.sub(cadCentroid.clone().applyQuaternion(quaternion));

  let sumSquare=0,maxResidual=0;
  for(let t=0;t<from.length;t++){
    const actual=from[t].clone().applyQuaternion(quaternion).add(offset);
    const residual=actual.distanceTo(to[t]);
    sumSquare+=residual*residual;
    maxResidual=Math.max(maxResidual,residual);
  }
  const rms=Math.sqrt(sumSquare/from.length);
  const allowedRms=Math.min(0.12,Math.max(0.02,baseline*0.0075));
  if(!Number.isFinite(rms)||rms>allowedRms||maxResidual>allowedRms*2.5){
    throw Error('Physical CAD/scan landmark residual exceeds engineering acceptance tolerance');
  }
  if(offset.toArray().some(v=>!Number.isFinite(v)||Math.abs(v)>500)){
    throw Error('Rigid registration translation exceeds accepted model bounds');
  }
  return {landmarks,solution:{
    translation:jsonPoint(offset),
    rotation:[quaternion.x,quaternion.y,quaternion.z,quaternion.w].map(v=>Number(v.toFixed(10))) as [number,number,number,number],
    rmsErrorMetres:Number(rms.toFixed(6)),
    maxErrorMetres:Number(maxResidual.toFixed(6)),
    maxRelativeDistanceError:Number(maxRelative.toFixed(6)),
    baselineMetres:Number(baseline.toFixed(6)),
    landmarkCount:landmarks.length,
    autoCertified:false,
  }};
}
