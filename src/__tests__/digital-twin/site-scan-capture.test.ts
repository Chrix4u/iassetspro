import {describe,it,expect} from 'vitest';
import {
  validateSiteScanCapture, validatedScanPoint, scanCaptureFromAudit,
} from '@/lib/smart-anatomy/site-scan';

const capture={
  method:'photogrammetry',
  capturedAt:'2026-11-23',
  device:'Site-owned calibrated camera',
  sourceUnit:'cm',
  metreScaleReference:'Measured external drum 1.250 m; exported scan 1.249 m',
  metresConfirmed:true,visibleSurfacesOnly:true,
};
const today=new Date('2026-11-24T01:00:00Z');

describe('actual as-built site-scan provenance validation',()=>{
  it('requires traceable real capture details and confirmed glTF metre units',()=>{
    const result=validateSiteScanCapture(capture,today);
    expect(result).toMatchObject({
      method:'photogrammetry',geometryUnits:'m',sourceUnit:'cm',
      sourceVerifiedAgainstPhysicalMachine:false,visibleSurfacesOnly:true,
    });
  });
  it.each(['lidar','structured-light','hybrid'])('accepts %s with measured scale',method=>{
    expect(validateSiteScanCapture({...capture,method},today).method).toBe(method);
  });
  it('refuses undocumented or future scan evidence',()=>{
    expect(()=>validateSiteScanCapture({...capture,capturedAt:'2027-02-02'},today)).toThrow();
    expect(()=>validateSiteScanCapture({...capture,capturedAt:'2026-02-30'},today)).toThrow();
    expect(()=>validateSiteScanCapture({...capture,device:''},today)).toThrow();
    expect(()=>validateSiteScanCapture({...capture,sourceUnit:'parsec'},today)).toThrow();
    expect(()=>validateSiteScanCapture({...capture,metreScaleReference:'unknown'},today)).toThrow();
    expect(()=>validateSiteScanCapture({...capture,metresConfirmed:false},today)).toThrow();
    expect(()=>validateSiteScanCapture({...capture,visibleSurfacesOnly:false},today)).toThrow();
  });
  it('never accepts invisible OEM structure as a claim from LiDAR or photos',()=>{
    const good=validateSiteScanCapture(capture,today);
    expect(good.sourceVerifiedAgainstPhysicalMachine).toBe(false);
    expect(good.visibleSurfacesOnly).toBe(true);
  });
  it('validates the original imported model coordinate system rather than a screen pixel',()=>{
    expect(validatedScanPoint({x:1.234567,y:-3,z:0})).toEqual({x:1.23457,y:-3,z:0});
    for(const value of [
      null,[],{x:0,y:0},{x:'1',y:0,z:0},
      {x:Infinity,y:0,z:0},{x:501,y:0,z:0},{x:0,y:NaN,z:0},
    ])expect(()=>validatedScanPoint(value)).toThrow();
  });
  it('will not mistake an OEM GLB provenance audit for site-owned scan evidence',()=>{
    const reviewed=validateSiteScanCapture(capture,today);
    expect(scanCaptureFromAudit(JSON.stringify({
      sourceOrigin:'site-owned-scan',scanCapture:reviewed,
    }))).toMatchObject({geometryUnits:'m',visibleSurfacesOnly:true});
    expect(scanCaptureFromAudit(JSON.stringify({
      sourceOrigin:'licensed-oem',scanCapture:reviewed,
    }))).toBeNull();
    expect(scanCaptureFromAudit(JSON.stringify({
      sourceOrigin:'site-owned-scan',scanCapture:{...reviewed,geometryUnits:'mm'},
    }))).toBeNull();
    expect(scanCaptureFromAudit('not json')).toBeNull();
  });
});
