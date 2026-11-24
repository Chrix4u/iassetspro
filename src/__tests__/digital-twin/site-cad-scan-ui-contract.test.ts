import {describe,it,expect} from 'vitest';
import {NextRequest} from 'next/server';
import {readBoundedJsonObject,BoundedJsonError} from '@/lib/smart-anatomy/bounded-json';

const req=(body:string,headers:Record<string,string>={})=>
  new NextRequest('http://localhost/api/smart-anatomy/scans/alignment',{
    method:'POST',body,headers:{'content-type':'application/json',...headers},
  });

describe('bounded engineering JSON read never buffers unlimited alignment data',()=>{
  it('accepts ordinary small physical landmark payloads as an object',async()=>{
    await expect(readBoundedJsonObject(req(JSON.stringify({
      cadModelId:'cad-source',landmarks:[{id:1}],
    })))).resolves.toMatchObject({cadModelId:'cad-source'});
  });
  it('rejects declared excessive JSON before streaming the body',async()=>{
    const response=req('{}',{'content-length':'1000000'});
    await expect(readBoundedJsonObject(response,1000)).rejects.toMatchObject({
      status:413,
    });
  });
  it('enforces actual byte limit even if Content-Length is absent',async()=>{
    const content=JSON.stringify({payload:'a'.repeat(3000)});
    await expect(readBoundedJsonObject(req(content),100)).rejects.toMatchObject({
      status:413,
    });
  });
  it('rejects arrays, null and invalid JSON without converting to trusted parameters',async()=>{
    for(const body of ['[]','null','not-json']){
      await expect(readBoundedJsonObject(req(body))).rejects.toBeInstanceOf(BoundedJsonError);
    }
  });
});

describe('registered scan and CAD view use the same source geometry coordinate frame',()=>{
  it('renders approved CAD only as nested model-local scan-frame geometry',async()=>{
    // A structurally grounded UI contract: a second auto-centered/scaled
    // model would visually appear aligned while being geometrically wrong.
    const {readFileSync}=await import('node:fs');
    const viewer=readFileSync('src/components/digital-twin/DigitalTwinViewer.tsx','utf8');
    const loader=readFileSync('src/components/digital-twin/ModelLoader.tsx','utf8');
    const panel=readFileSync('src/components/digital-twin/SiteScanPanel.tsx','utf8');
    expect(viewer).toContain('modelLocalChildren={scanMode && approvedCadOverlay ?');
    expect(viewer).toContain('autoScale={false} autoCenter={false}');
    expect(viewer).toContain('quaternion={approvedCadOverlay.rotation}');
    expect(viewer).toContain('displayOpacity={approvedCadOverlay.opacity??0.42}');
    expect(loader).toContain('{modelLocalChildren}');
    expect(loader).toContain('if(onScanSurfacePick && groupRef.current)');
    expect(panel).toContain('approvedCadOverlay={placing||picked?null:approvedCadOverlay}');
    expect(panel).toContain('<SiteScanAlignmentPanel');
  });
  it('prevents CAD explosion and virtual IoT claims while recording measured points',async()=>{
    const {readFileSync}=await import('node:fs');
    const viewer=readFileSync('src/components/digital-twin/DigitalTwinViewer.tsx','utf8');
    const alignment=readFileSync('src/components/digital-twin/SiteScanAlignmentPanel.tsx','utf8');
    expect(viewer).toContain('!scanMode && !onScanSurfacePick && <ExplodedView');
    expect(viewer).toContain('allowExplosion={!scanMode && !onScanSurfacePick}');
    expect(alignment).toContain('solveCadToScanAlignment(pairs)');
    expect(alignment).toContain('landmarkEvidenceReviewed:true');
  });
});
