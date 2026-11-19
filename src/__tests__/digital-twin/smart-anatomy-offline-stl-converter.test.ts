// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { convertStlToGlb, MAX_OFFLINE_STL_TRIANGLES } from '@/lib/smart-anatomy/offline-stl-converter';
import { inspectSelfContainedGlb, MAX_PRIVATE_CAD_UPLOAD_BYTES } from '@/lib/smart-anatomy/validate-glb';
import { auditedGlbMeshPaths } from '@/lib/smart-anatomy/mesh-source-paths';

const sourceBinary = ({solidHeader=false,nan=false,degenerate=false}={}) => {
  const bytes = new Uint8Array(84+50);
  const view = new DataView(bytes.buffer);
  if (solidHeader) bytes.set(new TextEncoder().encode('solid source scan'));
  view.setUint32(80, 1, true);
  const points = [[0,0,0],[1000,0,0],[0,1000,0]];
  if (degenerate) points[2] = [0,0,0];
  for (let i=0;i<3;i++) for (let j=0;j<3;j++) {
    view.setFloat32(96+i*12+j*4,nan && i===2 && j===1?NaN:points[i][j],true);
  }
  return bytes;
};
const sourceAscii = (z='0') => new TextEncoder().encode(
  'solid scanned-part\nfacet normal 0 0 1\n outer loop\n' +
  'vertex 0 0 0\nvertex 1 0 0\nvertex 0 1 '+z+'\nendloop\nendfacet\nendsolid scanned-part\n');

describe('bounded offline STL to inspection-only GLB converter',()=>{
  it('reads binary geometry even if the 80-byte header starts with solid',()=>{
    const converted=convertStlToGlb(sourceBinary({solidHeader:true}),'mm');
    expect(converted.sourceFormat).toBe('binary-stl');
    expect(converted.triangles).toBe(1);
    expect(converted.sourceHasPartHierarchy).toBe(false);
    expect(inspectSelfContainedGlb(converted.glb)).toEqual({
      meshCount:1,nodeCount:1,vertexCount:3,
    });
    expect(auditedGlbMeshPaths(converted.glb))
      .toEqual(new Set(['STL_Geometry_unverified_single_solid']));
    expect(converted.glb.byteLength).toBeLessThan(MAX_PRIVATE_CAD_UPLOAD_BYTES);
  });

  it('produces real Three.js mesh vertex coordinates in glTF meters',async()=>{
    const output=convertStlToGlb(sourceBinary(),'mm');
    const buffer=new ArrayBuffer(output.glb.byteLength);
    new Uint8Array(buffer).set(output.glb);
    const scene=await new Promise<import('three').Group>((resolve,reject)=>
      new GLTFLoader().parse(buffer,'',gltf=>resolve(gltf.scene),reject));
    const mesh=scene.getObjectByName('STL_Geometry_unverified_single_solid') as import('three').Mesh;
    expect(mesh?.isMesh).toBe(true);
    const positions=(mesh.geometry as import('three').BufferGeometry).getAttribute('position');
    expect(positions.count).toBe(3);
    expect(positions.getX(1)).toBeCloseTo(1);
    expect(positions.getY(2)).toBeCloseTo(1);
    const normals=mesh.geometry.getAttribute('normal');
    expect(normals.getZ(0)).toBeCloseTo(1);
  });

  it('parses canonical ASCII STL and enforces explicit unit conversion',()=>{
    const result=convertStlToGlb(sourceAscii(),'cm');
    expect(result.sourceFormat).toBe('ascii-stl');
    expect(result.triangles).toBe(1);
    expect(result.glb.byteLength).toBeGreaterThan(100);
    expect(()=>convertStlToGlb(sourceAscii(),'yard' as 'mm')).toThrow('explicit known source unit');
  });

  it('rejects nonfinite, degenerate, truncated and maliciously oversized geometry',()=>{
    expect(()=>convertStlToGlb(sourceBinary({nan:true}),'mm')).toThrow('non-finite');
    expect(()=>convertStlToGlb(sourceBinary({degenerate:true}),'mm')).toThrow('degenerate');
    expect(()=>convertStlToGlb(sourceBinary().slice(0,-1),'mm')).toThrow('Invalid STL');
    expect(()=>convertStlToGlb(new Uint8Array(MAX_PRIVATE_CAD_UPLOAD_BYTES+1),'mm')).toThrow('25 MB');
    expect(MAX_OFFLINE_STL_TRIANGLES).toBeLessThan(500_000);
  });

  it('rejects malformed ASCII facets and fake multipart metadata',()=>{
    expect(()=>convertStlToGlb(sourceAscii('NaN'),'m')).toThrow('malformed ASCII triangle');
    const incomplete=new TextEncoder().encode('solid example\nfacet normal 0 0 1\nendsolid example');
    expect(()=>convertStlToGlb(incomplete,'mm')).toThrow('outer loop');
    expect(()=>convertStlToGlb(new TextEncoder().encode('not STL'),'mm')).toThrow('20 bytes');
  });
});
